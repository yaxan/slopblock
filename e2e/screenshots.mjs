// Captures UI screenshots for visual review: popup, options, and the
// on-page marketplace experience (pill, badges, dimming) in light + dark.
// Usage: node e2e/screenshots.mjs [outDir]
import { chromium } from "playwright";
import { createHash, generateKeyPairSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderGridSection, renderMarketplacePage } from "./fixture.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = process.argv[2] ?? join(ROOT, ".tmp-tests", "screens");
const WORK = join(tmpdir(), `slopblock-shots-${process.pid}`);

const CARDS = [
  { id: "9001", title: "IKEA Kallax 4x4 shelf white", price: "$60", location: "Toronto, ON" },
  { id: "9007", title: "ISO free couch for student apartment", price: "$1", location: "Toronto, ON" },
  { id: "9002", title: "Amazon Echo Dot 4th gen", price: "$25", location: "Toronto, ON" },
  { id: "9008", title: "SOLD - dining table oak", price: "$150", location: "Toronto, ON" },
  { id: "9003", title: "2015 Honda Civic LX", price: "CA$9,500", oldPrice: "CA$11,000", location: "Toronto, ON" },
  { id: "9009", title: "Outdoor sofa set clearance", price: "$399", location: "", sponsoredLine: true },
  { id: "7001", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7002", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7003", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7004", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7005", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "9004", title: "Free couch pickup today", price: "Free", location: "Scarborough, ON" }
];

function prepareExtension() {
  const target = join(WORK, "extension");
  cpSync(join(ROOT, "dist"), target, { recursive: true });
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const der = publicKey.export({ type: "spki", format: "der" });
  const manifest = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8"));
  manifest.key = der.toString("base64");
  writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest, null, 2));
  const hash = createHash("sha256").update(der).digest("hex").slice(0, 32);
  const id = [...hash].map((ch) => String.fromCharCode(97 + Number.parseInt(ch, 16))).join("");
  return { dir: target, id };
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(ROOT, "dist", "manifest.json"))) {
  throw new Error("run npm run build first");
}

const extension = prepareExtension();

for (const scheme of ["light", "dark"]) {
  const context = await chromium.launchPersistentContext(join(WORK, `profile-${scheme}`), {
    headless: true,
    channel: "chromium",
    colorScheme: scheme,
    viewport: { width: 1440, height: 900 },
    ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      `--disable-extensions-except=${extension.dir}`,
      `--load-extension=${extension.dir}`,
      "--test-type"
    ]
  });

  await context.route("https://www.facebook.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/img/")) {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      await route.fulfill({ status: 200, contentType: "image/png", body: png });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: renderMarketplacePage([renderGridSection(CARDS, { heading: "Today's picks" })])
    });
  });

  const page = await context.newPage();
  await page.goto("https://www.facebook.com/marketplace/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".slopblock-toolbar", { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `page-filtered-${scheme}.png`) });

  await page.click('[data-slopblock-action="toggle-panel"]');
  await page.click('[data-slopblock-action="toggle-hidden"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `page-show-hidden-${scheme}.png`) });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 760 });
  await popup.goto(`chrome-extension://${extension.id}/popup.html`);
  await popup.waitForSelector("#quickRuleToggles .quick-toggle");
  await page.bringToFront();
  await popup.click("#refreshSummary");
  await popup.waitForTimeout(600);
  await popup.screenshot({ path: join(OUT, `popup-${scheme}.png`), fullPage: true });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extension.id}/options.html`);
  await options.waitForSelector("#quickRuleToggles .quick-toggle");
  await options.fill("#testTitle", "Brand new sectional - multiple colors");
  await options.fill("#testPrice", "$1");
  await options.fill("#testText", "Order now, ships from warehouse. Real price $899.");
  await options.click("#runRuleTest");
  await options.waitForTimeout(400);
  await options.screenshot({ path: join(OUT, `options-${scheme}.png`), fullPage: true });

  await context.close();
}

rmSync(WORK, { recursive: true, force: true });
console.log(`screenshots written to ${OUT}`);
