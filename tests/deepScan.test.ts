import test from "node:test";
import assert from "node:assert/strict";
import { extractListingFromHtml } from "../src/content/deepScan";
import { scoreListing } from "../src/common/scoring";
import { DEFAULT_SETTINGS } from "../src/common/settings";

const WAYFAIR_DESC =
  "Stylish dresser has 6 drawers with rattan fronts. Light wood finish and gold handles.\\n\\nNightstands with charging stations included!\\n\\nAll in perfect condition!\\n\\nhttps:\\/\\/www.wayfair.com\\/furniture\\/pdp\\/bay-isle-home-ayanna-6-drawer-rattan-storage-dresser-byil6879.html?piid=89164407";

function itemPageHtml(fields: string): string {
  return `<!DOCTYPE html><html><head><title>Marketplace</title></head><body>
    <script type="application/json" data-sjs>{"require":[["x",null,null,[{"__bbox":{"result":{"data":{"viewer":{"marketplace_product_details_page":{"target":{"__typename":"MarketplaceProductItem",${fields}}}}}}}}]]]}</script>
    <div id="mount"></div></body></html>`;
}

test("deep scan extracts listing fields from embedded item-page JSON", () => {
  const html = itemPageHtml(
    `"id":"2147792605766266","marketplace_listing_title":"Ayanna 6 Drawer Rattan Storage Dresser & Night Stands","redacted_description":{"text":"${WAYFAIR_DESC}"},"formatted_amount":"$125","is_sold":false,"is_pending":false`
  );

  const snapshot = extractListingFromHtml(html, "2147792605766266");
  assert.ok(snapshot);
  assert.equal(snapshot?.title, "Ayanna 6 Drawer Rattan Storage Dresser & Night Stands");
  assert.equal(snapshot?.priceText, "$125");
  assert.match(snapshot?.visibleText ?? "", /wayfair\.com\/furniture\/pdp\//);

  const result = scoreListing(snapshot!, DEFAULT_SETTINGS, {});
  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.ruleId === "external-retailer-product-link"));
});

test("deep scan marks sold listings so the unavailable rule fires from the feed", () => {
  const html = itemPageHtml(
    `"marketplace_listing_title":"Oak dining table","redacted_description":{"text":"Solid oak, pickup only."},"formatted_amount":"$150","is_sold":true`
  );

  const snapshot = extractListingFromHtml(html, "42");
  assert.ok(snapshot);
  assert.match(snapshot?.priceText ?? "", /sold/);
  const result = scoreListing(snapshot!, DEFAULT_SETTINGS, {});
  assert.ok(result.matches.some((match) => match.ruleId === "not-for-sale-unavailable"));
});

test("deep scan returns null when listing fields are missing (login walls, feed HTML)", () => {
  assert.equal(extractListingFromHtml("<html><body>Log in to continue</body></html>", "1"), null);
  assert.equal(extractListingFromHtml(itemPageHtml(`"unrelated":"x"`), "1"), null);
});

test("deep scan keeps legit descriptions allowed", () => {
  const html = itemPageHtml(
    `"marketplace_listing_title":"Solid oak dresser - moving sale","redacted_description":{"text":"Owned for 6 years, gently used. Some scratches on the top. Pickup only, we are moving."},"formatted_amount":"$180"`
  );

  const snapshot = extractListingFromHtml(html, "6001");
  assert.ok(snapshot);
  const result = scoreListing(snapshot!, DEFAULT_SETTINGS, {});
  assert.equal(result.action, "allow");
});

test("unicode escapes in embedded JSON are decoded", () => {
  const html = itemPageHtml(
    `"marketplace_listing_title":"Caf\\u00e9 table","redacted_description":{"text":"Small caf\\u00e9 table \\u2014 pickup only, good condition."},"formatted_amount":"$40"`
  );

  const snapshot = extractListingFromHtml(html, "7");
  assert.equal(snapshot?.title, "Café table");
  assert.match(snapshot?.visibleText ?? "", /—/);
});

import { JSDOM } from "jsdom";
import { extractListingViaDom, looksLikeLoginWall } from "../src/content/deepScan";

test("DOM fallback extracts listings from server-rendered pages without embedded JSON", () => {
  const ssrHtml = `<!doctype html><html><body>
    <div role="banner"><h1 style="position:absolute;left:-9999px">Facebook</h1></div>
    <div role="main">
      <div class="right"><div class="info">
        <h1>2014 RAM 1500 crew cab</h1>
        <div><span aria-label="$13,995">$13,995</span></div>
        <div><span>Listed 2 days ago in San Jose, CA</span></div>
        <div><span>Condition</span> <span>Used</span></div>
        <div class="description"><span>Clean unit! Price plus tax, title, license and doc fee. Financing available, everyone approved, visit our showroom today.</span></div>
      </div></div>
    </div>
  </body></html>`;

  const snapshot = extractListingViaDom(ssrHtml, "777", (html) => new JSDOM(html).window.document);
  assert.ok(snapshot);
  assert.equal(snapshot?.title, "2014 RAM 1500 crew cab");
  assert.equal(snapshot?.idHint, "777");
  assert.match(snapshot?.visibleText ?? "", /doc fee/i);

  const result = scoreListing(snapshot!, DEFAULT_SETTINGS, {});
  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.ruleId === "store-auto-dealer-fees"));
  assert.ok(result.matches.some((match) => match.ruleId === "store-auto-dealer-financing"));
});

test("DOM fallback returns null on shells with no listing content", () => {
  const shell = `<!doctype html><html><body><div id="splash">Loading…</div></body></html>`;
  assert.equal(extractListingViaDom(shell, "1", (html) => new JSDOM(html).window.document), null);
});

test("login walls are recognized as retryable failures, not listing data", () => {
  assert.equal(looksLikeLoginWall("<form id=\"loginform\">…</form>", "https://www.facebook.com/marketplace/item/1/"), true);
  assert.equal(looksLikeLoginWall("<html>…</html>", "https://www.facebook.com/login/?next=x"), true);
  assert.equal(
    looksLikeLoginWall('{"marketplace_listing_title":"Chair"} <form name="login">', "https://www.facebook.com/marketplace/item/1/"),
    false,
    "a page WITH listing data is not a login wall even if a login form exists in the footer"
  );
});
