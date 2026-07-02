import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  expandSeeMore,
  extractDetailSnapshot,
  extractItemIdFromUrl,
  extractOutboundLinks,
  findDetailContainer,
  isItemDetailUrl
} from "../src/content/detail";
import { scoreListing } from "../src/common/scoring";
import { DEFAULT_SETTINGS } from "../src/common/settings";

const ITEM_URL = "https://www.facebook.com/marketplace/item/2147792605766266/?ref=search&referral_code=null";

function detailDom(descriptionHtml: string, extras = ""): { document: Document; window: Window } {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div role="navigation" aria-label="Marketplace sidebar"></div>
      <div role="main">
        <div class="info-column">
          <div class="listing-panel">
            <h1>Ayanna 6 Drawer Rattan Storage Dresser &amp; Night Stands</h1>
            <div><span aria-label="$125">$125</span></div>
            <div><span>Listed a day ago in San Mateo, CA</span></div>
            <div><span>Condition</span><span>New</span></div>
            <div class="description">${descriptionHtml}</div>
          </div>
        </div>
        <div class="related">
          <h2>Similar listings</h2>
          <a href="/marketplace/item/111/?ref=related">Related dresser</a>
          <a href="/marketplace/item/222/?ref=related">Related nightstand</a>
        </div>
        <div class="rail">
          <span><h2><a href="/ads/about/?entry_product=ad_preferences">Sponsored</a></h2></span>
          <a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fads.example.com%2Fpromo">Ad</a>
        </div>
        ${extras}
      </div>
    </body></html>`,
    { url: ITEM_URL }
  );
  return { document: dom.window.document, window: dom.window as unknown as Window };
}

test("item URLs are recognized including np/ and shops/ variants", () => {
  assert.equal(extractItemIdFromUrl(ITEM_URL), "2147792605766266");
  assert.equal(extractItemIdFromUrl("https://www.facebook.com/marketplace/np/item/42/"), "42");
  assert.equal(extractItemIdFromUrl("https://www.facebook.com/marketplace/shops/item/77/"), "77");
  assert.ok(isItemDetailUrl(ITEM_URL));
  assert.ok(!isItemDetailUrl("https://www.facebook.com/marketplace/category/furniture"));
});

test("detail container is scoped to the listing and excludes related items and ad rail", () => {
  const { document } = detailDom("<span>Simple description.</span>");
  const container = findDetailContainer(document);
  assert.ok(container);
  assert.match(container?.textContent ?? "", /Ayanna 6 Drawer/);
  assert.ok(!container?.querySelector('a[href*="/marketplace/item/"]'), "must not include related listings");
  assert.ok(!/Similar listings/.test(container?.textContent ?? ""), "must not include related section text");
  assert.ok(!/Sponsored/.test(container?.textContent ?? ""), "must not include the ad rail");
});

test("outbound links are read from hrefs and l.facebook.com redirects are unwrapped", () => {
  const { document } = detailDom(
    `<span>Stylish dresser.</span>
     <a href="https://l.facebook.com/l.php?u=${encodeURIComponent(
       "https://www.wayfair.com/furniture/pdp/bay-isle-home-ayanna-6-drawer-rattan-storage-dresser-byil6879.html?piid=89164407"
     )}&h=AT0abc">wayfair.com/furniture/pdp/bay-isle-…</a>
     <a href="https://www.wayfair.com/furniture/pdp/beachcrest-home-kunkle-w011178059.html?piid=1188330327">wayfair.com/…</a>
     <a href="/marketplace/profile/123/">Seller</a>`
  );
  const container = findDetailContainer(document);
  assert.ok(container);
  const links = extractOutboundLinks(container as HTMLElement);
  assert.equal(links.length, 2);
  assert.ok(links.every((link) => link.startsWith("https://www.wayfair.com/furniture/pdp/")));
});

test("the reported Wayfair dropship listing is caught by the detail snapshot even with truncated link text", () => {
  const { document } = detailDom(
    `<span>Stylish dresser has 6 drawers with rattan fronts. Light wood finish and gold handles.</span>
     <span>Nightstands with charging stations included!</span>
     <span>All in perfect condition!</span>
     <a href="https://l.facebook.com/l.php?u=${encodeURIComponent(
       "https://www.wayfair.com/furniture/pdp/bay-isle-home-ayanna-6-drawer-rattan-storage-dresser-byil6879.html?piid=89164407"
     )}">wayfair.com/furniture/pdp/bay-…</a>`
  );
  const container = findDetailContainer(document);
  assert.ok(container);
  const snapshot = extractDetailSnapshot(container as HTMLElement, ITEM_URL);

  assert.equal(snapshot.idHint, "2147792605766266");
  assert.equal(snapshot.title, "Ayanna 6 Drawer Rattan Storage Dresser & Night Stands");
  assert.equal(snapshot.priceText, "$125");
  assert.match(snapshot.locationText, /San Mateo, CA/);
  assert.match(snapshot.visibleText, /wayfair\.com\/furniture\/pdp\//);

  const result = scoreListing(snapshot, DEFAULT_SETTINGS, {});
  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.ruleId === "external-retailer-product-link"));
  assert.ok(result.matches.some((match) => match.ruleId === "vendor-wayfair"));
});

test("see-more toggles are expanded exactly once", () => {
  const { document } = detailDom(
    `<span>Short teaser…</span><div role="button">See more</div>`
  );
  const container = findDetailContainer(document) as HTMLElement;
  let clicks = 0;
  container.querySelector<HTMLElement>('[role="button"]')?.addEventListener("click", () => {
    clicks += 1;
  });

  assert.equal(expandSeeMore(container), true);
  assert.equal(expandSeeMore(container), false, "second pass must not re-click");
  assert.equal(clicks, 1);
});

test("a legit detail page with human context stays allowed", () => {
  const { document } = detailDom(
    `<span>Owned for 3 years, gently used, no stains, from a smoke free home. Pickup only, we are moving.</span>`
  );
  const container = findDetailContainer(document) as HTMLElement;
  const snapshot = extractDetailSnapshot(container, ITEM_URL);
  const result = scoreListing(snapshot, DEFAULT_SETTINGS, {});
  assert.equal(result.action, "allow");
});

test("structured Condition New counts as retail context, not human context", () => {
  const retailResult = scoreListing(
    {
      title: "Rattan dresser",
      priceText: "$125",
      locationText: "San Mateo, CA",
      visibleText: "Rattan dresser $125 Condition New Stylish dresser, gold handles. wayfair.com order link"
    },
    DEFAULT_SETTINGS,
    {}
  );
  assert.ok(
    retailResult.matches.some((match) => match.ruleId === "missing-human-context"),
    "Condition New must not suppress the missing-human heuristic"
  );
  assert.ok(retailResult.matches.some((match) => match.ruleId === "vendor-retail-combo"));

  const usedResult = scoreListing(
    {
      title: "Rattan dresser",
      priceText: "$125",
      locationText: "San Mateo, CA",
      visibleText: "Rattan dresser $125 Condition Used - Good Some scratches, pickup only."
    },
    DEFAULT_SETTINGS,
    {}
  );
  assert.ok(!usedResult.matches.some((match) => match.ruleId === "missing-human-context"));
  assert.equal(usedResult.action, "allow");
});
