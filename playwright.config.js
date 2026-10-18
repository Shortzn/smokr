// End-to-End-Tests: npx playwright test
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  // Service Worker sind aus, damit Umleitungen (Kartenteile, Turnstile) in allen Browsern greifen.
  // Die Offline- und Update-Tests schalten sie gezielt ein.
  use: { baseURL: "http://127.0.0.1:4181", trace: "retain-on-failure", locale: "de-AT", timezoneId: "Asia/Tokyo", serviceWorkers: "block" },
  webServer: {
    command: "node tests/tools/serve.js 4181",
    url: "http://127.0.0.1:4181/index.html",
    reuseExistingServer: false,
  },
  projects: [
    { name: "iphone-15-webkit", use: { ...devices["iPhone 15"] } },
    { name: "iphone-se-webkit", use: { ...devices["iPhone SE"] } },
    { name: "iphone-15-pro-max-webkit", use: { ...devices["iPhone 15 Pro Max"] } },
    { name: "iphone-landscape-webkit", use: { ...devices["iPhone 15 landscape"] } },
    { name: "pixel-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
  ],
});
