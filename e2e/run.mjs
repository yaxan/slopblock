// End-to-end test: loads the built extension into real Chrome and fulfills
// https://www.facebook.com/marketplace requests with a high-fidelity fixture
// via Playwright request interception (no network, no real Facebook), then
// verifies hiding, collapsing, badges, toolbar, settings sync, popup, and
// options behavior in the live browser.
//
// Usage: npm run e2e  (builds first)   |   node e2e/run.mjs --headed
import { chromium } from "playwright";
import { createHash, generateKeyPairSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogBmp, floodBmp, noiseBmp, renderCell, renderGridSection, renderItemDetailPage, renderMarketplacePage } from "./fixture.mjs";

const HEADED = process.argv.includes("--headed");
const ROOT = new URL("..", import.meta.url).pathname;
const WORK = join(tmpdir(), `slopblock-e2e-${process.pid}`);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------- fixture scenario ----------

const FEED_CARDS = [
  // Deep-scan targets: cards look innocent; evidence lives in the description.
  { id: "2147792605766266", title: "Ayanna 6 Drawer Rattan Storage Dresser & Night Stands", price: "$125", location: "San Mateo, CA" },
  { id: "6001", title: "Solid oak dresser - moving sale", price: "$180", location: "San Mateo, CA" },
  { id: "4400", title: "2014 RAM 1500 crew cab 4x4", price: "$13,995", location: "San Jose, CA" },
  { id: "9001", title: "IKEA Kallax 4x4 shelf white", price: "$60", location: "Toronto, ON" },
  { id: "9002", title: "Amazon Echo Dot 4th gen", price: "$25", location: "Toronto, ON", justListed: true },
  { id: "9003", title: "2015 Honda Civic LX", price: "CA$9,500", oldPrice: "CA$11,000", location: "Toronto, ON", extra: "142K km" },
  { id: "9004", title: "Free couch pickup today", price: "Free", location: "Scarborough, ON" },
  { id: "9005", title: "Solid wood dresser vintage", price: "$120", location: "Toronto, ON", np: true },
  { id: "9006", title: "", price: "$45", location: "Toronto, ON", emptyTitle: true, ariaLabel: false },
  { id: "9007", title: "ISO free couch for student apartment", price: "$1", location: "Toronto, ON" },
  { id: "9008", title: "SOLD - dining table oak", price: "$150", location: "Toronto, ON" },
  { id: "9009", title: "Outdoor sofa set clearance", price: "$399", location: "", sponsoredLine: true },
  { id: "ad-1", title: "Luxury watches 90% off", price: "$29", adCell: true, adUrl: "https://replicawatch.example/deals" },
  // duplicate flood: same title+price+location, 5 distinct ids
  { id: "7001", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7002", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7003", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7004", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7005", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  // search-style same-title different prices: must all stay
  { id: "8001", title: "iPhone 12 128GB unlocked", price: "$250", location: "Toronto, ON" },
  { id: "8002", title: "iPhone 12 128GB unlocked", price: "$280", location: "Mississauga, ON" },
  { id: "8003", title: "iPhone 12 128GB unlocked", price: "$310", location: "Toronto, ON" },
  { id: "8004", title: "iPhone 12 128GB unlocked", price: "$199", location: "Brampton, ON" },
  // Catalog-photo card: innocent-ish text, retailer-style white-background photo
  { id: "3101", title: "IKEA MALM dresser Brand New in box", price: "$95", location: "Toronto, ON", image: "catalog.bmp" },
  // Image flood: same photo reused, prices AND locations rotated (defeats text tiers)
  { id: "3201", title: "Modern Velvet Accent Chair Teal", price: "$120", location: "Toronto, ON", image: "flood.bmp" },
  { id: "3202", title: "Modern Velvet Accent Chair Teal", price: "$95", location: "Vaughan, ON", image: "flood.bmp" },
  { id: "3203", title: "Modern Velvet Accent Chair Teal", price: "$140", location: "Oshawa, ON", image: "flood.bmp" },
  { id: "3204", title: "Modern Velvet Accent Chair Teal", price: "$110", location: "Milton, ON", image: "flood.bmp" },
  { id: "v-1", virtualized: true }
];

const SCROLL_CARDS = [
  { id: "7006", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "7007", title: "Ergonomic Gaming Chair Racing Style", price: "$149", location: "Toronto, ON" },
  { id: "9101", title: "Peloton bike works perfectly", price: "$400", location: "Toronto, ON" },
  { id: "9102", title: "Graco 4Ever car seat", price: "$50", location: "Ajax, ON" }
];

function feedHtml() {
  return renderMarketplacePage([renderGridSection(FEED_CARDS, { heading: "Today's picks" })]);
}

// ---------- infra ----------

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const WAYFAIR_LINKS = [
  "https://www.wayfair.com/furniture/pdp/bay-isle-home-ayanna-6-drawer-rattan-storage-dresser-byil6879.html?piid=89164407%2C113652794%2C119021716",
  "https://www.wayfair.com/furniture/pdp/beachcrest-home-kunkle-manufactured-wood-rattan-nightstand-with-charging-station-w011178059.html?piid=1188330327"
];

const RELATED_CARDS = [
  { id: "5001", title: "Rattan tallboy dresser solid wood", price: "$140", location: "San Jose, CA" },
  { id: "5002", title: "ISO rattan nightstand pair", price: "$1", location: "San Mateo, CA" }
];

function detailHtml(pathname) {
  if (pathname.includes("/item/2147792605766266")) {
    // The user-reported Wayfair dropship listing, links behind "See more".
    return renderItemDetailPage(
      {
        title: "Ayanna 6 Drawer Rattan Storage Dresser & Night Stands",
        price: "$125",
        location: "San Mateo, CA",
        condition: "New",
        description: [
          "Stylish dresser has 6 drawers with rattan fronts. Light wood finish and gold handles.",
          "Nightstands with charging stations included!",
          "All in perfect condition!"
        ],
        links: WAYFAIR_LINKS
      },
      { related: RELATED_CARDS, truncated: true }
    );
  }

  if (pathname.includes("/item/4400")) {
    // Server-rendered dealer listing WITHOUT the embedded JSON payload —
    // exercises the DOM-parser fallback (the reported vehicle-style case).
    return renderItemDetailPage(
      {
        title: "2014 RAM 1500 crew cab 4x4",
        price: "$13,995",
        location: "San Jose, CA",
        condition: "Used",
        description: [
          "Clean unit, runs great. Price plus tax, title, license and doc fee.",
          "Financing available, everyone approved, bad credit ok. Visit our showroom today."
        ],
        links: []
      },
      { related: RELATED_CARDS, embedJson: false }
    );
  }

  if (pathname.includes("/item/6001")) {
    return renderItemDetailPage(
      {
        title: "Solid oak dresser - moving sale",
        price: "$180",
        location: "San Mateo, CA",
        condition: "Used - Good",
        description: [
          "Owned for 6 years, gently used. Some scratches on the top, drawers slide fine.",
          "Pickup only, we are moving at the end of the month."
        ],
        links: []
      },
      { related: RELATED_CARDS }
    );
  }

  return null;
}

async function installRoutes(context) {
  await context.route("https://www.facebook.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/img/")) {
      const name = url.pathname.slice(5);
      if (name === "catalog.bmp") {
        await route.fulfill({ status: 200, contentType: "image/bmp", body: catalogBmp() });
      } else if (name === "flood.bmp") {
        await route.fulfill({ status: 200, contentType: "image/bmp", body: floodBmp() });
      } else if (name.endsWith(".bmp")) {
        await route.fulfill({ status: 200, contentType: "image/bmp", body: noiseBmp(name) });
      } else {
        await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX });
      }
      return;
    }

    const detail = /\/marketplace\/(?:np\/)?item\//.test(url.pathname) ? detailHtml(url.pathname) : null;
    if (detail) {
      // Simulate realistic per-listing fetch latency so the concurrency test
      // is meaningful (serial x N would blow the timing budget).
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: detail });
      return;
    }

    if (url.pathname.startsWith("/marketplace")) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: feedHtml() });
      return;
    }

    await route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
  });
}

function prepareExtension() {
  const source = join(ROOT, "dist");
  if (!existsSync(join(source, "manifest.json"))) {
    throw new Error("dist/ missing — run npm run build first");
  }

  const target = join(WORK, "extension");
  cpSync(source, target, { recursive: true });

  // Pin the extension ID by injecting a key into the TEST COPY only.
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const der = publicKey.export({ type: "spki", format: "der" });
  const manifest = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8"));
  manifest.key = der.toString("base64");
  writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest, null, 2));

  const hash = createHash("sha256").update(der).digest("hex").slice(0, 32);
  const extensionId = [...hash].map((ch) => String.fromCharCode(97 + Number.parseInt(ch, 16))).join("");
  return { dir: target, id: extensionId };
}

async function cardStates(page) {
  return page.evaluate(() => {
    const states = {};
    for (const card of document.querySelectorAll("[data-slopblock-processed]")) {
      const anchor =
        (card.matches("a[href]") ? card : null) ??
        card.querySelector('a[href*="/marketplace/"]') ??
        card.querySelector("a[href]");
      const idMatch = anchor?.getAttribute("href")?.match(/\/marketplace\/(?:np\/)?item\/([^/?#]+)/);
      const key = idMatch?.[1] ?? (anchor?.href?.includes("l.facebook.com") ? "ad-1" : "unknown");
      states[key] = {
        action: card.getAttribute("data-slopblock-processed"),
        displayNone: getComputedStyle(card).display === "none",
        hasBadge: card.querySelector(":scope > .slopblock-badge") !== null
      };
    }
    return states;
  });
}

async function waitForScan(page, minScanned) {
  try {
    await page.waitForFunction(
      (min) => {
        const stat = document.querySelector('[data-slopblock-stat="scanned"]');
        return stat && Number(stat.textContent) >= min;
      },
      minScanned,
      { timeout: 20000 }
    );
  } catch (error) {
    const debug = await page.evaluate(() => ({
      scanned: document.querySelector('[data-slopblock-stat="scanned"]')?.textContent,
      processed: Array.from(document.querySelectorAll("[data-slopblock-processed]")).map((el) => {
        const ids = Array.from(el.querySelectorAll('a[href*="/marketplace/"]')).map(
          (a) => a.getAttribute("href")?.match(/item\/([^/?#]+)/)?.[1] ?? "?"
        );
        return `${el.tagName}:${ids.join("+") || "none"}:${el.getAttribute("data-slopblock-processed")}`;
      })
    }));
    console.log(`  waitForScan(${minScanned}) timeout — ${JSON.stringify(debug, null, 1)}`);
    throw error;
  }
}

// ---------- main ----------

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const extension = prepareExtension();
console.log(`extension id: ${extension.id}`);

const context = await chromium.launchPersistentContext(join(WORK, "profile"), {
  headless: !HEADED,
  channel: "chromium",
  viewport: { width: 1440, height: 1000 },
  ignoreHTTPSErrors: true,
  ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    `--disable-extensions-except=${extension.dir}`,
    `--load-extension=${extension.dir}`,
    "--test-type"
  ]
});

await installRoutes(context);

try {
  const page = await context.newPage();

  console.log("\n== feed scan ==");
  await page.goto("https://www.facebook.com/marketplace/", { waitUntil: "domcontentloaded" });
  try {
    await waitForScan(page, 27);
  } catch (error) {
    const debug = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      cards: document.querySelectorAll('a[href*="/marketplace/item/"]').length,
      toolbar: document.querySelector(".slopblock-toolbar") !== null,
      processed: document.querySelectorAll("[data-slopblock-processed]").length
    }));
    console.log("DEBUG:", JSON.stringify(debug));
    throw error;
  }
  await page.waitForTimeout(400);
  let states = await cardStates(page);

  check("legit IKEA card stays visible", states["9001"]?.action === "allow" && !states["9001"]?.displayNone);
  check("legit Amazon Echo card stays visible", states["9002"]?.action === "allow");
  check("strikethrough-price car card stays visible", states["9003"]?.action === "allow");
  check("free couch card stays visible", states["9004"]?.action === "allow");
  check("np/item URL variant is scanned and stays visible", states["9005"]?.action === "allow");
  check("empty-title card stays visible", states["9006"]?.action === "allow");
  check("ISO post is hidden", states["9007"]?.action === "hide" && states["9007"]?.displayNone, JSON.stringify(states["9007"]));
  check("SOLD post is hidden", states["9008"]?.action === "hide" && states["9008"]?.displayNone);
  check("sponsored organic-style card is hidden", states["9009"]?.action === "hide");
  check("external sponsored ad cell is hidden", states["ad-1"]?.action === "hide" && states["ad-1"]?.displayNone, JSON.stringify(states["ad-1"]));

  const floodStates = ["7001", "7002", "7003", "7004", "7005"].map((id) => states[id]);
  check(
    "flood: first occurrence stays visible",
    floodStates[0]?.action === "allow" && !floodStates[0]?.displayNone,
    JSON.stringify(floodStates[0])
  );
  check(
    "flood: repeats are hidden",
    floodStates.slice(1).every((state) => state?.action === "hide" && state?.displayNone),
    JSON.stringify(floodStates)
  );
  check(
    "search-style same-title different-price cards all stay visible",
    ["8001", "8002", "8003", "8004"].every((id) => states[id]?.action === "allow" && !states[id]?.displayNone)
  );

  const toolbarStats = await page.evaluate(() => ({
    scanned: Number(document.querySelector('[data-slopblock-stat="scanned"]')?.textContent),
    hidden: Number(document.querySelector('[data-slopblock-stat="hidden"]')?.textContent)
  }));
  check("toolbar reports scans", toolbarStats.scanned >= 19, JSON.stringify(toolbarStats));
  check("toolbar reports hidden count", toolbarStats.hidden >= 8, JSON.stringify(toolbarStats));

  console.log("\n== local photo analysis ==");
  await page.waitForFunction(
    () => document.querySelector('[data-slopblock-item-id="3101"]')?.getAttribute("data-slopblock-processed") === "hide",
    undefined,
    { timeout: 15000 }
  );
  states = await cardStates(page);
  check(
    "catalog-style stock photo pushes vendor+retail card into hide",
    states["3101"]?.action === "hide" && states["3101"]?.displayNone,
    JSON.stringify(states["3101"])
  );
  await page.waitForFunction(
    () => document.querySelector('[data-slopblock-item-id="3204"]')?.getAttribute("data-slopblock-processed") === "hide",
    undefined,
    { timeout: 15000 }
  );
  states = await cardStates(page);
  check(
    "image flood collapses despite rotated prices AND locations",
    states["3202"]?.action === "hide" && states["3203"]?.action === "hide" && states["3204"]?.action === "hide",
    JSON.stringify([states["3202"], states["3203"], states["3204"]])
  );
  check("first copy of the image flood stays visible", states["3201"]?.action === "allow", JSON.stringify(states["3201"]));
  check(
    "same-title different-photo search results are untouched by image analysis",
    ["8001", "8002", "8003", "8004"].every((id) => states[id]?.action === "allow")
  );

  console.log("\n== infinite scroll append ==");
  const scrollHtml = renderGridSection(SCROLL_CARDS, { heading: "More listings" });
  await page.evaluate((html) => {
    document.getElementById("grid-sections")?.insertAdjacentHTML("beforeend", html);
  }, scrollHtml);
  await waitForScan(page, 31);
  await page.waitForTimeout(400);
  states = await cardStates(page);
  check("appended legit cards stay visible", states["9101"]?.action === "allow" && states["9102"]?.action === "allow");
  check(
    "appended flood repeats are hidden",
    states["7006"]?.action === "hide" && states["7007"]?.action === "hide",
    JSON.stringify([states["7006"], states["7007"]])
  );
  check("original first flood card still visible after append", states["7001"]?.action === "allow");

  console.log("\n== show hidden + badges + allow item ==");
  await page.click('[data-slopblock-action="toggle-panel"]');
  await page.click('[data-slopblock-action="toggle-hidden"]');
  await page.waitForTimeout(600);
  states = await cardStates(page);
  check("show-hidden previews hidden cards", states["9007"]?.displayNone === false, JSON.stringify(states["9007"]));
  check("badges appear on previewed cards", states["9007"]?.hasBadge === true);

  const allowClicked = await page.evaluate(() => {
    for (const card of document.querySelectorAll('[data-slopblock-processed="hide"]')) {
      const anchor = card.querySelector('a[href*="/marketplace/item/9007"]');
      if (!anchor) {
        continue;
      }
      const button = Array.from(card.querySelectorAll(".slopblock-badge button")).find((b) =>
        /show anyway/i.test(b.textContent ?? "")
      );
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  });
  check("show-anyway button exists on badge", allowClicked);
  const lensInfo = await page.evaluate(() => {
    const button = document.querySelector("[data-slopblock-lens]");
    return { present: button !== null, title: button?.getAttribute("title") ?? "" };
  });
  check("reverse-image-search button appears on badges (user-initiated Lens)", lensInfo.present, JSON.stringify(lensInfo));
  await page.waitForTimeout(700);
  states = await cardStates(page);
  check("allowed item becomes visible", states["9007"]?.action === "allow", JSON.stringify(states["9007"]));

  console.log("\n== deep scan from the feed ==");
  // Collapse the preview state again so hides are real display:none hides.
  await page.click('[data-slopblock-action="toggle-hidden"]');
  await page.waitForTimeout(400);

  await page.waitForFunction(
    () => {
      const card = document.querySelector('[data-slopblock-item-id="2147792605766266"]');
      return card?.getAttribute("data-slopblock-processed") === "hide";
    },
    undefined,
    { timeout: 25000 }
  );
  states = await cardStates(page);
  check(
    "deep scan hides the Wayfair dropship card from the feed without clicking in",
    states["2147792605766266"]?.action === "hide" && states["2147792605766266"]?.displayNone,
    JSON.stringify(states["2147792605766266"])
  );
  check("deep scan leaves the legit moving-sale card visible", states["6001"]?.action === "allow", JSON.stringify(states["6001"]));

  const deepPopup = await context.newPage();
  await deepPopup.goto(`chrome-extension://${extension.id}/popup.html`);
  await deepPopup.waitForSelector("#deepScan");
  check("deep scan toggle is on by default", await deepPopup.isChecked("#deepScan"));
  await deepPopup.uncheck("#deepScan");
  await page.bringToFront();
  await page.waitForTimeout(900);
  states = await cardStates(page);
  check(
    "turning deep scan off restores the card (card text alone is innocent)",
    states["2147792605766266"]?.action === "allow",
    JSON.stringify(states["2147792605766266"])
  );
  await deepPopup.check("#deepScan");
  await page.waitForTimeout(900);
  states = await cardStates(page);
  check("turning deep scan back on re-hides it from cache", states["2147792605766266"]?.action === "hide");
  await deepPopup.close();

  // Server-rendered dealer listing (no embedded JSON) must still be caught
  // from the feed via the DOM-parser fallback.
  await page.waitForFunction(
    () => document.querySelector('[data-slopblock-item-id="4400"]')?.getAttribute("data-slopblock-processed") === "hide",
    undefined,
    { timeout: 25000 }
  );
  states = await cardStates(page);
  check(
    "deep scan catches a server-rendered dealer listing via the DOM fallback",
    states["4400"]?.action === "hide" && states["4400"]?.displayNone,
    JSON.stringify(states["4400"])
  );

  const deepHealth = await context.newPage();
  await deepHealth.goto(`chrome-extension://${extension.id}/popup.html`);
  await deepHealth.waitForSelector("#pageSummary");
  await page.bringToFront();
  await deepHealth.click("#refreshSummary");
  await deepHealth.waitForTimeout(700);
  const healthText = await deepHealth.textContent("#pageSummary");
  check("popup surfaces deep-scan health (read N of M listings)", /Deep scan: read \d+ of \d+/.test(healthText ?? ""), (healthText ?? "").slice(0, 160));
  await deepHealth.close();

  // Concurrency: a fresh page with several deep-scan targets should finish
  // fetching well under the old serial time (~1.1s/listing). Route latency
  // below simulates a realistic per-page fetch cost.
  const timedPage = await context.newPage();
  const started = Date.now();
  await timedPage.goto("https://www.facebook.com/marketplace/?probe=timed", { waitUntil: "domcontentloaded" });
  await timedPage.waitForFunction(
    () => document.querySelector('[data-slopblock-item-id="4400"]')?.getAttribute("data-slopblock-processed") === "hide" &&
          document.querySelector('[data-slopblock-item-id="2147792605766266"]')?.getAttribute("data-slopblock-processed") === "hide",
    undefined,
    { timeout: 20000 }
  );
  const elapsed = Date.now() - started;
  check(`deep scan vets multiple listings concurrently (took ${elapsed}ms, serial would be ~2000ms+)`, elapsed < 4000, `${elapsed}ms`);
  await timedPage.close();

  console.log("\n== vendor hide-all (IKEA) ==");
  const ikeaPopup = await context.newPage();
  await ikeaPopup.goto(`chrome-extension://${extension.id}/popup.html`);
  await ikeaPopup.waitForSelector('[data-quick-toggle-id="ikea"] button[data-mode="block"]');
  const ikeaDefault = await ikeaPopup.evaluate(() => {
    const row = document.querySelector('[data-quick-toggle-id="ikea"]');
    return row?.querySelector("button.is-active")?.getAttribute("data-mode");
  });
  check("IKEA quick filter defaults to Filter (used IKEA stays visible)", ikeaDefault === "filter", String(ikeaDefault));

  await ikeaPopup.click('[data-quick-toggle-id="ikea"] button[data-mode="block"]');
  await page.bringToFront();
  await page.waitForTimeout(900);
  states = await cardStates(page);
  check(
    "Hide all removes the legit IKEA listing too (explicit user choice)",
    states["9001"]?.action === "hide" && states["9001"]?.displayNone,
    JSON.stringify(states["9001"])
  );
  const ikeaReason = await page.evaluate(() => {
    const card = document.querySelector('[data-slopblock-item-id="9001"]');
    const decision = card?.getAttribute("data-slopblock-processed");
    return decision;
  });
  check("hide-all verdict recorded on the card", ikeaReason === "hide");

  await ikeaPopup.bringToFront();
  await ikeaPopup.click('[data-quick-toggle-id="ikea"] button[data-mode="filter"]');
  await page.bringToFront();
  await page.waitForTimeout(900);
  states = await cardStates(page);
  check("back to Filter restores the used IKEA listing", states["9001"]?.action === "allow", JSON.stringify(states["9001"]));
  await ikeaPopup.close();

  console.log("\n== item detail pages ==");
  const detailPage = await context.newPage();
  await detailPage.goto("https://www.facebook.com/marketplace/item/2147792605766266/?ref=search", {
    waitUntil: "domcontentloaded"
  });
  await detailPage.waitForSelector(".slopblock-detail-banner", { timeout: 20000 });
  await detailPage.waitForTimeout(500);
  const banner = await detailPage.evaluate(() => {
    const node = document.querySelector(".slopblock-detail-banner");
    return {
      tone: node?.getAttribute("data-tone"),
      text: node?.textContent ?? "",
      seeMoreGone: document.getElementById("see-more-toggle") === null,
      insideInfo: node?.closest(".info") !== null
    };
  });
  check("dropship detail page shows a strong banner", banner.tone === "hide", JSON.stringify(banner));
  check("banner cites the retailer catalog link", /retailer catalog\/product link/i.test(banner.text), banner.text.slice(0, 140));
  check("see-more description was expanded for scanning", banner.seeMoreGone);
  check("banner does not blame the ad rail", !/sponsored marketplace ad/i.test(banner.text), banner.text.slice(0, 140));

  const relatedStates = await cardStates(detailPage);
  check("related-items grid still filters on detail pages", relatedStates["5002"]?.action === "hide", JSON.stringify(relatedStates["5002"]));
  check("legit related card stays visible", relatedStates["5001"]?.action === "allow");

  await detailPage.evaluate(() => {
    const button = Array.from(document.querySelectorAll(".slopblock-detail-banner button")).find((b) =>
      /flag this item/i.test(b.textContent ?? "")
    );
    button?.click();
  });
  await detailPage.waitForTimeout(700);
  const bannerAfterAllow = await detailPage.evaluate(() => document.querySelector(".slopblock-detail-banner") !== null);
  check("allowing from the banner clears it", bannerAfterAllow === false);

  const legitDetail = await context.newPage();
  await legitDetail.goto("https://www.facebook.com/marketplace/item/6001/", { waitUntil: "domcontentloaded" });
  await legitDetail.waitForSelector(".slopblock-toolbar", { timeout: 20000 });
  await legitDetail.waitForTimeout(800);
  const legitBanner = await legitDetail.evaluate(() => document.querySelector(".slopblock-detail-banner") !== null);
  check("legit detail page shows no banner", legitBanner === false);
  await legitDetail.close();
  await detailPage.close();

  console.log("\n== popup ==");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extension.id}/popup.html`);
  await popup.waitForSelector("#enabled");
  check("popup renders master toggle", await popup.isChecked("#enabled"));
  const summaryText = await popup.textContent("#pageSummary");
  check("popup summary handles non-marketplace tab", /marketplace tab/i.test(summaryText ?? ""), summaryText ?? "");

  // With the marketplace tab active, the popup summary should populate.
  await page.bringToFront();
  await popup.click("#refreshSummary");
  await popup.waitForTimeout(600);
  const populated = await popup.evaluate(() => ({
    stats: Array.from(document.querySelectorAll(".stat")).map((node) => node.textContent?.replace(/\s+/g, " ").trim()),
    topRules: document.querySelectorAll(".summary-list li").length,
    hasAllowButton: document.querySelector("[data-allow-item-id]") !== null
  }));
  check("popup summary populates from marketplace tab", populated.stats.some((s) => /hidden/i.test(s ?? "")), JSON.stringify(populated.stats));
  check("popup summary lists top triggers and hidden examples", populated.topRules >= 2, String(populated.topRules));
  check("popup summary offers allow-item actions", populated.hasAllowButton);

  await popup.uncheck("#enabled");
  await page.bringToFront();
  await page.waitForTimeout(800);
  states = await cardStates(page);
  check("disabling via popup restores all cards", Object.values(states).every((state) => state.action === "allow"));
  await popup.bringToFront();
  await popup.check("#enabled");
  await page.waitForTimeout(800);
  states = await cardStates(page);
  check("re-enabling via popup hides spam again", states["9008"]?.action === "hide", JSON.stringify(states["9008"]));
  await popup.close();

  console.log("\n== options ==");
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extension.id}/options.html`);
  await options.waitForSelector("#customAllowItemIds");
  const allowIds = await options.inputValue("#customAllowItemIds");
  check("allowed item id from badge shows in options", allowIds.includes("9007"), allowIds);

  await options.fill("#testTitle", "Brand new sectional");
  await options.fill("#testPrice", "$1");
  await options.fill(
    "#testText",
    "Brand new sectional, multiple colors available. Order now, ships from warehouse. Real price $899."
  );
  await options.click("#runRuleTest");
  const testResult = await options.textContent("#testResult");
  check("rule tester reports HIDE with matched rules", /HIDE/i.test(testResult ?? "") && /dropship/i.test(testResult ?? ""), (testResult ?? "").slice(0, 120));

  await options.close();
} finally {
  await context.close();
  rmSync(WORK, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed${failures.length ? `: ${failures.join(" | ")}` : ""}`);
process.exit(failed > 0 ? 1 : 0);
