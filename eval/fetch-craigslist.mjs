// Fetches REAL Craigslist listings (public pages) to build a false-positive
// eval corpus for SlopBlock. Craigslist sellers are the same population as
// Facebook Marketplace sellers, so their organic listing text is ideal
// real-world "legit" data. Titles/prices/locations come from the public
// search API; bodies come from rendering the real posting pages.
//
// Usage: node eval/fetch-craigslist.mjs
// Writes eval/raw/craigslist-<city>-<cat>.json
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = new URL("./raw/", import.meta.url).pathname;

const TARGETS = [
  { city: "toronto", cat: "fuo", label: "furniture-by-owner", take: 14 },
  { city: "toronto", cat: "elo", label: "electronics-by-owner", take: 12 },
  { city: "toronto", cat: "cto", label: "cars-by-owner", take: 10 },
  { city: "toronto", cat: "zip", label: "free-stuff", take: 8 },
  { city: "chicago", cat: "fuo", label: "furniture-by-owner", take: 10 },
  { city: "chicago", cat: "appo", label: "appliances-by-owner", take: 8 },
  { city: "seattle", cat: "elo", label: "electronics-by-owner", take: 10 },
  { city: "seattle", cat: "bao", label: "baby-kids-by-owner", take: 6 },
  { city: "austin", cat: "tlo", label: "tools-by-owner", take: 6 },
  { city: "austin", cat: "sgo", label: "sporting-by-owner", take: 6 }
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 900 }
});
context.setDefaultTimeout(25000);
mkdirSync(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const page = await context.newPage();
  const searchUrl = `https://${target.city}.craigslist.org/search/${target.cat}#search=1~gallery~0~0`;
  const rows = [];
  try {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href*="/view/d/"], a[href*="/d/"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const links = await page.$$eval('a[href*="/view/d/"], a[href*="/d/"]', (anchors) =>
      Array.from(
        new Set(
          anchors
            .map((a) => a.href.split("#")[0])
            .filter((href) => /\/view\/d\/[^/]+\/[A-Za-z0-9]+$/.test(href) || /\/d\/.+\/\d{9,}\.html/.test(href))
        )
      )
    );
    console.log(`${target.city}/${target.cat}: ${links.length} listing links`);

    for (const link of links.slice(0, target.take)) {
      try {
        await page.goto(link, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('#titletextonly, .postingtitletext, h1, [class*="posting-title"]', { timeout: 12000 });
        await page.waitForTimeout(800);
        const row = await page.evaluate(() => {
          const clean = (text) => (text ?? "").replace(/\s+/g, " ").trim();
          const pick = (...selectors) => {
            for (const selector of selectors) {
              const node = document.querySelector(selector);
              if (node?.textContent?.trim()) {
                return node;
              }
            }
            return null;
          };
          const bodyNode = pick("#postingbody", '[class*="posting-body"]', 'section[class*="body"]');
          bodyNode?.querySelector(".print-information")?.remove();
          bodyNode?.querySelector(".print-qrcode-container")?.remove();
          return {
            title: clean(pick("#titletextonly", '[class*="posting-title"] .label', "h1")?.textContent),
            price: clean(pick(".price", '[class*="price"]')?.textContent),
            location: clean(
              pick(".postingtitletext small", '[class*="area"], [class*="location"]')?.textContent?.replace(/[()]/g, "") ?? ""
            ),
            body: clean(bodyNode?.textContent?.replace(/QR Code Link to This Post/g, "")).slice(0, 900)
          };
        });
        if (row.title) {
          rows.push({ source: link, category: target.label, ...row });
        }
      } catch (error) {
        console.log(`  skip ${link}: ${String(error).slice(0, 80)}`);
      }
      await page.waitForTimeout(400 + Math.random() * 500);
    }
  } catch (error) {
    console.log(`FAILED ${target.city}/${target.cat}: ${String(error).slice(0, 120)}`);
  }

  const outFile = `${OUT_DIR}craigslist-${target.city}-${target.cat}.json`;
  writeFileSync(outFile, JSON.stringify(rows, null, 2));
  console.log(`  wrote ${rows.length} -> ${outFile}`);
  await page.close();
}

await browser.close();
console.log("done");
