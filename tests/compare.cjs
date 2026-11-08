// Render each unit/method as a tile and save docs/compare.png (needs a local server on :8123).
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const tiles = [
  ["km", "radial", "sapporo", 1, "km (normal map)"],
  ["summer", "radial", "sapporo", 1, "Summer · radial · Sapporo"],
  ["summer", "radial", "obihiro", 1, "Summer · radial · Obihiro"],
  ["summer", "mds", "sapporo", 1, "Summer · all pairs (MDS)"],
  ["summer", "radial", "sapporo", 2, "Summer · line from Sapporo"],
  ["winter", "radial", "sapporo", 1, "Winter · radial · Sapporo"],
  ["winter", "radial", "obihiro", 1, "Winter · radial · Obihiro"],
  ["winter", "mds", "sapporo", 1, "Winter · all pairs (MDS)"],
];
(async () => {
  const b = await chromium.launch();
  const files = [];
  for (const [i, [u, m, c, s, t]] of tiles.entries()) {
    const p = await b.newPage({ viewport: { width: 520, height: 900 }, reducedMotion: "reduce" });
    await p.goto(`http://127.0.0.1:8123/#unit=${u}&method=${m}&center=${c}&lang=en&s=${s}`);
    await p.waitForTimeout(800);
    await p.evaluate(t => { document.getElementById("stagecap").textContent = t; document.getElementById("legend").style.display = "none"; }, t);
    const f = `build/tile${i}.png`; await p.locator(".stage").screenshot({ path: f }); files.push(f);
    await p.close();
  }
  await b.close();
  execFileSync("python3", ["-c", `
import sys; from PIL import Image
ims=[Image.open(f) for f in sys.argv[1:]]; w,h=ims[0].size
out=Image.new('RGB',(w*4,h*2),'white')
for i,im in enumerate(ims): out.paste(im,((i%4)*w,(i//4)*h))
out.save('docs/compare.png')`, ...files]);
  console.log("docs/compare.png");
})();
