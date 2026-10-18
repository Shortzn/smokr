// Screenshots mehrerer Zustände: node tests/tools/views.js
const { webkit, chromium, devices } = require("@playwright/test");
async function run(engine, dev, name, steps) {
  const b = await engine.launch();
  const ctx = await b.newContext(typeof dev === "string" ? { ...devices[dev] } : dev);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://localhost:4180/");
  await p.waitForFunction(() => window.__smokr?.mapReady && window.__smokr.state.spots.length, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  await steps(p);
  await p.screenshot({ path: `test-results/${name}.png` });
  console.log(name, JSON.stringify(errs));
  await b.close();
}
(async () => {
  await run(webkit, "iPhone 15", "search", async (p) => { await p.click("#search-btn"); await p.keyboard.type("shinjuku"); await p.waitForTimeout(800); });
  await run(webkit, "iPhone 15", "filters", async (p) => { await p.click("#filter-btn"); await p.waitForTimeout(600); });
  await run(webkit, "iPhone 15", "collapsed", async (p) => { await p.click("#grab"); await p.click("#grab"); await p.click("#grab"); await p.waitForTimeout(700); });
  await run(webkit, "iPhone 15", "citymenu", async (p) => { await p.click("#city-btn"); await p.waitForTimeout(400); });
  await run(chromium, { viewport: { width: 1440, height: 900 } }, "desktop", async (p) => { await p.locator("#list .row").first().click(); await p.waitForTimeout(1200); });
  await run(webkit, "iPhone 15 landscape", "landscape", async () => {});
  await run(webkit, "iPhone SE", "se", async () => {});
})();
