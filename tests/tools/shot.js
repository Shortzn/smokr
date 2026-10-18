// Schnelle Screenshots mit echter Karte: node tests/tools/shot.js <name> [device] [js-before-shot]
const { webkit, chromium, devices } = require("@playwright/test");
(async () => {
  const [name = "shot", dev = "iPhone 15", script = ""] = process.argv.slice(2);
  const engine = dev.startsWith("Desktop Chrome") || dev.startsWith("Pixel") ? chromium : webkit;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[dev], geolocation: { latitude: 35.6905, longitude: 139.7003 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://localhost:4180/");
  await page.waitForFunction(() => window.__smokr && window.__smokr.mapReady && window.__smokr.state.spots.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  if (script) { await page.evaluate(script); await page.waitForTimeout(1800); }
  await page.screenshot({ path: `test-results/${name}.png` });
  console.log(JSON.stringify({ errors }));
  await browser.close();
})();
