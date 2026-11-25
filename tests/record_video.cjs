// Record a short walkthrough of the page.
// usage: node tests/record_video.cjs [url] [square|wide]
//   square: docs/elastic-hokkaido.mp4 (1080x1080), wide: docs/elastic-hokkaido-wide.mp4 (1920x1080)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const url = process.argv[2] || "https://shinyanakashima.github.io/30daymapchallenge-2026day25-elastic-hokkaido/";
const wide = process.argv[3] === "wide";
const [W, H] = wide ? [1920, 1080] : [1080, 1080];
const out = wide ? "docs/elastic-hokkaido-wide.mp4" : "docs/elastic-hokkaido.mp4";
(async () => {
  const dir = "build/video";
  fs.rmSync(dir, { recursive: true, force: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const p = await ctx.newPage();
  const wait = ms => p.waitForTimeout(ms);
  const slide = async (from, to, ms) => {
    const steps = Math.round(ms / 33);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await p.evaluate(v => { const m = document.getElementById("morph"); m.value = v; m.dispatchEvent(new Event("input")); }, from + (to - from) * e);
      await wait(33);
    }
  };
  await p.goto(url + "#unit=summer&method=radial&center=sapporo&lang=en&s=0");
  await wait(2500);                       // normal map
  await slide(0, 1, 2200); await wait(2000);  // summer time map from Sapporo
  await p.click('#unit button[data-v="winter"]'); await wait(3200);
  await p.click('#method button[data-v="mds"]'); await wait(3200);
  await p.click('#center button[data-v="obihiro"]'); await p.click('#method button[data-v="radial"]'); await wait(3200);
  await p.click('#center button[data-v="sapporo"]'); await wait(2500);
  await slide(1, 2, 2600); await wait(3000);  // the line
  await slide(2, 1, 1800); await wait(800);
  await p.click('#far li:first-child button'); await wait(3500);
  const v = p.video();
  await ctx.close(); await b.close();
  const webm = await v.path();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.2", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-r", "30", "-movflags", "+faststart", out]);
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(1), "MB");
})();
