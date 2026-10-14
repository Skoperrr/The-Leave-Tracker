// Local browser QA only. Requires Node 22+ and installed Chrome or Edge.
// Start Vite first. Captures the served page, including labelled dashboard fixtures.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const browserPath = [
  process.env.KOPANO_BROWSER_EXE,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => path && existsSync(path));
if (!browserPath)
  throw new Error("Set KOPANO_BROWSER_EXE to an installed Chromium browser.");
const themes = process.argv[2] === "themes";
const dashboard = themes || process.argv[2] === "dashboard";
const route = dashboard ? "/preview/dashboard" : "/sign-in";
const screenshotName = themes ? "theme" : dashboard ? "dashboard" : "sign-in";
const readyExpression = dashboard
  ? 'Boolean(document.querySelector(".preview-banner") && document.querySelector(".balance-number"))'
  : 'Boolean(document.querySelector("#email") && document.querySelector("#password"))';
const url = `http://127.0.0.1:5173${route}`;
if (!(await fetch(url)).ok)
  throw new Error("Start npm run dev before capturing screenshots.");
const profile = resolve(root, ".preview", "qa-browser-" + process.pid);
const output = resolve(root, "screenshots");
await mkdir(profile, { recursive: true });
await mkdir(output, { recursive: true });
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = (await readFile(resolve(profile, "DevToolsActivePort"), "utf8"))
        .split("\n")[0]
        .trim();
      if (port) break;
    } catch {
      /* Browser is starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!port)
    throw new Error("The browser did not expose its local debugging port.");
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const target = targets.find((target) => target.type === "page");
  if (!target) throw new Error("No browser page found.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown")
      exceptions.push(message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  const evidence = [];
  const viewports = [
    { name: "desktop", width: 1440, height: 1000, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ];
  const views = themes
    ? ["dlab", "field", "stride"].flatMap((theme) =>
        viewports.map((view) => ({
          ...view,
          theme,
          name: `${theme}-${view.name}`,
        })),
      )
    : viewports;
  for (const view of views) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: view.width,
      height: view.height,
      deviceScaleFactor: 1,
      mobile: view.mobile,
    });
    await send("Page.navigate", { url });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send("Runtime.evaluate", {
        expression: readyExpression,
        returnByValue: true,
      });
      if (result.result.value) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("The requested preview did not render.");
    if (themes) {
      await send("Runtime.evaluate", {
        expression: `(() => { const select = document.querySelector('#preview-organisation'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'preview-${view.theme}'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
      });
    }
    await send("Runtime.evaluate", {
      expression:
        "Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))])",
      awaitPromise: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const result = await send("Runtime.evaluate", {
      expression:
        '({ viewportWidth: innerWidth, contentWidth: document.documentElement.scrollWidth, formVisible: Boolean(document.querySelector("#email")), dashboardVisible: Boolean(document.querySelector(".balance-number")), sampleDataLabel: document.body.innerText.includes("Read-only preview"), configurationRequired: document.body.innerText.includes("Authentication is not configured") })',
      returnByValue: true,
    });
    const dimensions = result.result.value;
    if (themes) {
      const branding = await send("Runtime.evaluate", {
        expression: `({ theme: document.querySelector('.app-shell').dataset.theme, logoLoaded: [...document.querySelectorAll('.institution-brand img')].every(img => img.complete && img.naturalWidth > 0), icons: document.querySelectorAll('.main-nav .nav-icon').length, sidebarColour: getComputedStyle(document.querySelector('.sidebar')).backgroundColor })`,
        returnByValue: true,
      });
      Object.assign(dimensions, branding.result.value);
      if (
        dimensions.theme !== view.theme ||
        !dimensions.logoLoaded ||
        dimensions.icons !== 4
      )
        throw new Error("Theme branding did not render correctly.");
    }
    if (
      dimensions.viewportWidth !== view.width ||
      dimensions.contentWidth > view.width
    )
      throw new Error(
        `Horizontal overflow or incorrect viewport: ${JSON.stringify(dimensions)}`,
      );
    const metrics = await send("Page.getLayoutMetrics");
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: view.width,
        height: Math.max(view.height, metrics.cssContentSize.height),
        scale: 1,
      },
    });
    await writeFile(
      resolve(output, `${screenshotName}-${view.name}.png`),
      Buffer.from(screenshot.data, "base64"),
    );
    evidence.push({ view: view.name, ...dimensions });
  }
  if (exceptions.length)
    throw new Error(`Browser exceptions: ${exceptions.join(", ")}`);
  await writeFile(
    resolve(
      output,
      themes
        ? "theme-verification.json"
        : dashboard
          ? "dashboard-verification.json"
          : "verification.json",
    ),
    JSON.stringify(
      {
        route,
        views: evidence,
        browserExceptions: exceptions.length,
        note: "Live backend flows require configured Supabase credentials and the Express API.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(evidence));
  await send("Browser.close");
} finally {
  socket?.close();
  browser.kill();
}
