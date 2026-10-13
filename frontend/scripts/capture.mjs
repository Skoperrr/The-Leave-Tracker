// Local browser QA only. Requires Node 22+ and installed Chrome or Edge.
// Start Vite first. Credentials and application data are never mocked here.
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
const url = "http://127.0.0.1:5173/sign-in";
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
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  const evidence = [];
  for (const view of [
    { name: "desktop", width: 1440, height: 1000, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
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
        expression:
          'Boolean(document.querySelector("#email") && document.querySelector("#password"))',
        returnByValue: true,
      });
      if (result.result.value) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("The sign-in form did not render.");
    await send("Runtime.evaluate", {
      expression:
        "Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))])",
      awaitPromise: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const result = await send("Runtime.evaluate", {
      expression:
        '({ viewportWidth: innerWidth, contentWidth: document.documentElement.scrollWidth, formVisible: Boolean(document.querySelector("#email")), configurationRequired: document.body.innerText.includes("Authentication is not configured") })',
      returnByValue: true,
    });
    const dimensions = result.result.value;
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
      resolve(output, `sign-in-${view.name}.png`),
      Buffer.from(screenshot.data, "base64"),
    );
    evidence.push({ view: view.name, ...dimensions });
  }
  if (exceptions.length)
    throw new Error(`Browser exceptions: ${exceptions.join(", ")}`);
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(
      {
        route: "/sign-in",
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
