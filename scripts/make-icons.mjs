// Regenerates extension icons from the brand mark (struck square) so the
// toolbar icon matches the in-product identity. Renders per-size SVGs in
// headless Chromium and screenshots them with transparency.
//
// Usage: node scripts/make-icons.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "icons");

// Paper chip + ink square + overhanging orange strike. Proportions are
// re-tuned per size so strokes land on clean pixels at 16px.
function markSvg(size) {
  const spec = {
    // overhang is capped so the square linecap never clips at the canvas edge
    16: { inset: 2, stroke: 2, strike: 2.6, overhang: 1, corner: 0 },
    48: { inset: 6, stroke: 5, strike: 7, overhang: 3, corner: 0 },
    128: { inset: 16, stroke: 13, strike: 18, overhang: 8, corner: 0 }
  }[size];

  const a = spec.inset + spec.stroke / 2; // square edge (stroke centered)
  const b = size - a;
  const o = spec.overhang;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${a}" y="${a}" width="${b - a}" height="${b - a}" fill="#f4f2ec" stroke="#221f1a" stroke-width="${spec.stroke}"/>
  <line x1="${spec.inset - o}" y1="${size - spec.inset + o}" x2="${size - spec.inset + o}" y2="${spec.inset - o}" stroke="#c14a14" stroke-width="${spec.strike}" stroke-linecap="square"/>
</svg>`;
}

const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });

for (const size of [16, 48, 128]) {
  const svg = markSvg(size);
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent"><div id="m" style="width:${size}px;height:${size}px">${svg}</div></body>`
  );
  const element = page.locator("#m");
  const png = await element.screenshot({ omitBackground: true });
  writeFileSync(join(OUT, `icon-${size}.png`), png);
  console.log(`icon-${size}.png (${png.length} bytes)`);
}

// Keep the vector source in sync (not shipped; stripped from dist at build).
writeFileSync(join(OUT, "slopblock.svg"), markSvg(128));
console.log("slopblock.svg updated");

await browser.close();
