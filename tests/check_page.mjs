// Load the page, fail on console errors or HTTP errors, and save docs/screenshot.png.
// usage: node tests/check_page.mjs [url]   (default: http://127.0.0.1:8123/)
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8123/";
const browser = await chromium.launch();
const problems = [];
async function visit(viewport, hash, shot, opts = {}) {
  const page = await browser.newPage({ viewport, ...opts });
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e}`));
  page.on("response", r => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.goto(url + hash, { waitUntil: "networkidle" });
  await page.waitForTimeout(3200);
  if (shot) await page.screenshot({ path: shot });
  await page.close();
}
await visit({ width: 1200, height: 900 }, "#unit=winter&method=radial&center=sapporo&lang=en", "docs/screenshot.png");
await visit({ width: 1200, height: 900 }, "#unit=summer&method=mds&center=obihiro&lang=ja");
await visit({ width: 390, height: 844 }, "#unit=winter&method=mds&center=sapporo&lang=ja", null, { reducedMotion: "reduce", isMobile: true, hasTouch: true });
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("ok: no console errors, no 4xx/5xx responses");
