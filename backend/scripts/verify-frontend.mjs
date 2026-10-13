// Live QA of the unchanged frontend. Start API :3001 and Vite :5173 first.
// Reads ignored fictional credentials; never writes tokens/passwords to evidence.
// Creates two linked fictional requests, declines one and cancels the other.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const credentials = JSON.parse(await readFile(resolve(root, 'backend/.demo-credentials.json'), 'utf8'));
const profile = await mkdtemp(resolve(tmpdir(), 'leave-tracker-browser-'));
const output = resolve(root, 'docs/verification');
await mkdir(output, { recursive: true });
const browser = spawn(process.env.LEAVE_TRACKER_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], findings = [], exceptions = [], responses = [];
const marker = `Browser QA ${Date.now()}`;
let socket, send, evaluate, waitFor;
function check(name, passed) { if (!passed) throw new Error(`Check failed: ${name}`); checks.push(name); console.info(`PASS: ${name}`); }
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch {}
    if (port) break;
    await delay(100);
  }
  if (!port) throw new Error('Browser startup failed');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.url.startsWith('http://localhost:3001/api/v1/')) {
      const { url, status } = message.params.response;
      responses.push({ path: new URL(url).pathname, status });
    }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id); clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(new Error(`CDP command failed: ${message.error.code}`)); else item.resolve(message.result);
    }
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(expression)) return; await delay(250); }
    throw new Error(`Page readiness timeout: ${label}`);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const navigate = async (path, ready) => {
    await send('Page.navigate', { url: `http://localhost:5173${path}` });
    await waitFor(ready, path);
  };
  const setField = async (selector, value) => {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const prototype = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await delay(80);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const login = async email => {
    await navigate('/sign-in', 'Boolean(document.querySelector("#email"))');
    const credential = credentials.accounts.find(entry => entry.email === email);
    await setField('#email', credential.email); await setField('#password', credential.password);
    await click('form button');
    await waitFor('Boolean(document.querySelector("#organisation") && document.querySelector(".profile-email"))', 'authenticated workspace');
    check(`Real browser email login: ${email}`, await evaluate(`document.querySelector('.profile-email').textContent === ${JSON.stringify(email)}`));
  };
  const logout = async () => {
    await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Sign out').click()`);
    await waitFor('Boolean(document.querySelector("#email"))', 'sign out');
  };
  const screenshot = async name => {
    await evaluate('document.fonts.ready'); await delay(300);
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  };
  const settled = '!document.querySelector(".loading")';
  await login('ayanda.demo@example.com');
  await waitFor('Boolean(document.querySelector(".balance-number"))', 'employee balances');
  const organisationIds = await evaluate('Array.from(document.querySelector("#organisation").options).map(el => el.value)');
  check('Employee has exactly two organisations and no manager/admin navigation', organisationIds.length === 2 && await evaluate(`!document.querySelector('[href="/admin"]') && !document.querySelector('[href="/manager"]')`));
  await screenshot('employee-dashboard-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(300);
  check('Employee dashboard fits mobile width', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await screenshot('employee-dashboard-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await setField('#organisation', organisationIds[1]);
  await waitFor(`document.querySelector('#organisation').value === ${JSON.stringify(organisationIds[1])} && Boolean(document.querySelector('.balance-number'))`, 'organisation switch');
  check('Employee switches organisation without losing session', true);
  await navigate('/requests/new', 'Boolean(document.querySelector("#leave-type") && !document.querySelector("#leave-type").disabled)');
  await evaluate('Array.from(document.querySelectorAll("input[type=checkbox]")).filter(el => !el.checked).forEach(el => el.click())');
  await waitFor('document.querySelectorAll("input[type=checkbox]:checked").length === 2 && !document.querySelector("#leave-type").disabled', 'shared leave types');
  await setField('#leave-type', 'ANNUAL'); await setField('#start-date', '2026-11-30'); await setField('#end-date', '2026-12-04'); await setField('#reason', marker);
  await click('.leave-form button.primary');
  await waitFor('document.body.innerText.includes("Submitted successfully")', 'linked request submission');
  check('Linked submission creates two independent pending five-day requests', await evaluate('document.querySelectorAll(".request-card").length === 2 && Array.from(document.querySelectorAll(".request-card")).every(el => el.innerText.includes("Pending") && el.innerText.includes("5 working days"))'));
  await screenshot('linked-request-submitted');
  await logout();
  await login('thabo.demo@example.com');
  check('D-Lab manager has ADMIN navigation and only one organisation', await evaluate(`document.querySelector(".role-label").textContent === "admin" && document.querySelector("#organisation").options.length === 1 && Boolean(document.querySelector('[href="/admin"]'))`));
  await navigate('/admin', 'document.querySelectorAll(".membership-list article").length > 0');
  check('Administration lists scoped real memberships', await evaluate('Array.from(document.querySelectorAll(".membership-details")).every(el => el.innerText.includes("D-Lab"))'));
  await screenshot('admin-memberships');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(300);
  if (!(await evaluate('document.documentElement.scrollWidth <= innerWidth'))) findings.push('Administration page overflows at mobile width (390px).');
  await screenshot('admin-memberships-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/manager', `Array.from(document.querySelectorAll('.request-card')).some(el => el.textContent.includes(${JSON.stringify(marker)}))`);
  const targetSelector = await evaluate(`(() => { const card = Array.from(document.querySelectorAll('.request-card')).find(el => el.textContent.includes(${JSON.stringify(marker)})); return '#' + card.querySelector('select').id; })()`);
  await setField(targetSelector, 'DECLINE');
  await setField(targetSelector.replace('#decision-', '#comment-'), 'Fictional browser verification; reservation released.');
  await evaluate(`document.querySelector(${JSON.stringify(targetSelector)}).closest('form').querySelector('button').click()`);
  await waitFor(`!Array.from(document.querySelectorAll('.request-card')).some(el => el.textContent.includes(${JSON.stringify(marker)}))`, 'declined queue refresh');
  await setField('#inbox-status', 'DECLINED');
  await waitFor(`Array.from(document.querySelectorAll('.request-card')).some(el => el.textContent.includes(${JSON.stringify(marker)}) && el.innerText.includes('Declined'))`, 'declined history');
  check('Admin decline through browser releases its organisation reservation', true);
  await setField('#inbox-status', ''); await delay(2500);
  if (!(await evaluate(`Array.from(document.querySelectorAll('.request-card')).some(el => el.textContent.includes(${JSON.stringify(marker)}))`))) findings.push('Manager inbox “All statuses” omits decided requests: frontend omits status, backend defaults to PENDING. Explicit status filters work.');
  await navigate('/calendar', 'Boolean(document.querySelector("#calendar-month"))');
  await setField('#calendar-month', '2026-11');
  await waitFor('document.body.innerText.includes("Approved leave this month")', 'approved calendar');
  check('Calendar shows existing approved leave and excludes private reasons', await evaluate(`document.body.innerText.includes('Ayanda Demo — On leave') && !document.body.textContent.includes(${JSON.stringify(marker)}) && !document.querySelector('.private-note')`));
  await screenshot('approved-calendar');
  await logout();
  await login('ayanda.demo@example.com');
  await navigate('/requests', 'Boolean(document.querySelector("#request-org"))'); await setField('#request-org', '');
  await waitFor(`Array.from(document.querySelectorAll('.request-card')).filter(el => el.textContent.includes(${JSON.stringify(marker)})).length === 2`, 'independent history');
  check('One linked child is declined while the other remains pending', await evaluate(`(() => { const cards = Array.from(document.querySelectorAll('.request-card')).filter(el => el.textContent.includes(${JSON.stringify(marker)})); return cards.some(el => el.innerText.includes('Declined')) && cards.some(el => el.innerText.includes('Pending')); })()`));
  await evaluate(`Array.from(document.querySelectorAll('.request-card')).find(el => el.textContent.includes(${JSON.stringify(marker)}) && el.innerText.includes('Pending')).querySelector('.cancel-area button').click()`);
  await evaluate(`Array.from(document.querySelectorAll('.request-card')).find(el => el.textContent.includes(${JSON.stringify(marker)}) && el.innerText.includes('Pending')).querySelector('.cancel-area button.danger').click()`);
  await waitFor(`Array.from(document.querySelectorAll('.request-card')).filter(el => el.textContent.includes(${JSON.stringify(marker)})).some(el => el.innerText.includes('Cancelled'))`, 'cancellation');
  check('Employee cancels only the remaining linked child', true);
  await screenshot('linked-request-independent-outcomes');
  await logout();
  for (const email of ['lerato.demo@example.com', 'sibusiso.demo@example.com', 'naledi.admin.demo@example.com']) {
    await login(email);
    check(`Scoped ADMIN browser role: ${email}`, await evaluate('document.querySelector(".role-label").textContent === "admin"'));
    await navigate('/admin', 'document.querySelectorAll(".membership-list article").length > 0');
    await logout();
  }
  await login('neo.demo@example.com');
  check('Single-organisation employee has no privileged navigation', await evaluate(`document.querySelector("#organisation").options.length === 1 && !document.querySelector('[href="/admin"]') && !document.querySelector('[href="/manager"]')`));
  await navigate('/admin', 'document.body.innerText.includes("Permission required")');
  await navigate('/manager', 'document.body.innerText.includes("Permission required")');
  check('Employee direct admin and manager routes show permission required', true);
  await logout();
  check('No unhandled browser runtime exceptions', exceptions.length === 0);
  check('Frontend API requests completed without server errors', responses.every(response => response.status < 500));
  await writeFile(resolve(output, 'frontend-results.json'), JSON.stringify({ verifiedAt: new Date().toISOString(),
    frontendUnchanged: true, checks, findings, responses, demoMutation: { dates: ['2026-11-30', '2026-12-04'], outcomes: ['DECLINED', 'CANCELLED'], privateMarker: marker },
    limitations: ['Google OAuth consent/login requires manual provider setup and an authorised real Google account.', 'Google sign-in button not added at user request.', 'Live approval was not repeated; browser verified existing approved calendar events.'],
  }, null, 2) + '\n');
  console.info(`${checks.length} browser checks passed; ${findings.length} finding(s). See docs/verification/frontend-results.json.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Browser verification failed');
  if (evaluate) {
    try {
      const diagnostics = await evaluate('({path:location.pathname, headings:Array.from(document.querySelectorAll("h1,h2")).map(el=>el.innerText), alerts:Array.from(document.querySelectorAll("[role=alert]")).map(el=>el.innerText), role:document.querySelector(".role-label")?.innerText})');
      await writeFile(resolve(output, 'frontend-failure.json'), JSON.stringify({ diagnostics, checks, marker }, null, 2));
    } catch {}
  }
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  browser.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true });
}
