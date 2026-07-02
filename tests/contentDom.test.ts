import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  extractCleanText,
  extractItemId,
  extractListingSnapshot,
  isMarketplaceSellerProfileContext
} from "../src/content/dom";

test("extractCleanText ignores SlopBlock-owned badge and toolbar text", () => {
  const document = dom(`
    <main>
      <div id="card">
        <div class="slopblock-badge">SlopBlock 90: Amazon + bait price</div>
        <a href="https://www.facebook.com/marketplace/item/123/">IKEA Kallax shelf</a>
        <span>$35</span>
        <span>Used for 3 years, scratches, pickup only.</span>
      </div>
      <div class="slopblock-toolbar">Hidden 12</div>
    </main>
  `);
  const card = requiredElement<HTMLElement>(document, "#card");
  const result = extractCleanText(card);

  assert.match(result.visibleText, /IKEA Kallax shelf/);
  assert.match(result.visibleText, /\$35/);
  assert.doesNotMatch(result.visibleText, /SlopBlock/);
  assert.doesNotMatch(result.visibleText, /bait price/);
});

test("extractListingSnapshot extracts stable marketplace fields", () => {
  const document = dom(`
    <div id="card">
      <a aria-label="Facebook Marketplace: Vintage dresser" href="https://www.facebook.com/marketplace/item/2289171978176208/?ref=marketplace_profile">
        Vintage dresser
      </a>
      <span>$120</span>
      <span>Listed by Alex</span>
      <span>12 mi away</span>
      <span>Used for years, scratches on top, pickup only.</span>
      <div class="slopblock-badge">SlopBlock 70: duplicate flood</div>
    </div>
  `);
  const card = requiredElement<HTMLElement>(document, "#card");
  const anchor = requiredElement<HTMLAnchorElement>(document, "a");
  const snapshot = extractListingSnapshot(card, anchor);

  assert.equal(snapshot.idHint, "2289171978176208");
  assert.equal(snapshot.title, "Vintage dresser");
  assert.equal(snapshot.priceText, "$120");
  assert.equal(snapshot.locationText, "12 mi away");
  assert.equal(snapshot.sellerText, "Listed by Alex");
  assert.doesNotMatch(snapshot.visibleText, /duplicate flood/);
});

test("extractListingSnapshot ignores generic seller UI text", () => {
  const document = dom(`
    <div id="card">
      <a href="https://www.facebook.com/marketplace/item/456/">Accent lamp</a>
      <span>$45</span>
      <span>Seller information</span>
      <span>View seller profile</span>
      <span>Available today.</span>
    </div>
  `);
  const card = requiredElement<HTMLElement>(document, "#card");
  const anchor = requiredElement<HTMLAnchorElement>(document, "a");
  const snapshot = extractListingSnapshot(card, anchor);

  assert.equal(snapshot.sellerText, undefined);
});

test("extractListingSnapshot preserves standalone sponsored line without using it as the title", () => {
  const document = dom(`
    <div id="card">
      <span>Sponsored</span>
      <a href="https://www.facebook.com/marketplace/item/789/">Outdoor sofa set</a>
      <span>$399</span>
      <span>Shop now</span>
    </div>
  `);
  const card = requiredElement<HTMLElement>(document, "#card");
  const anchor = requiredElement<HTMLAnchorElement>(document, "a");
  const snapshot = extractListingSnapshot(card, anchor);

  assert.equal(snapshot.title, "Outdoor sofa set");
  assert.deepEqual(snapshot.textLines, ["Sponsored", "Outdoor sofa set", "$399", "Shop now"]);
});

test("seller profile context is detected from profile path or ref param", () => {
  assert.equal(isMarketplaceSellerProfileContext("https://www.facebook.com/marketplace/profile/123456"), true);
  assert.equal(
    isMarketplaceSellerProfileContext(
      "https://www.facebook.com/marketplace/item/2289171978176208/?ref=marketplace_profile&referral_code=undefined"
    ),
    true
  );
  assert.equal(isMarketplaceSellerProfileContext("https://www.facebook.com/marketplace/category/furniture"), false);
});

test("extractItemId supports normal and shop marketplace item URLs", () => {
  assert.equal(extractItemId("https://www.facebook.com/marketplace/item/12345/?ref=search"), "12345");
  assert.equal(extractItemId("https://www.facebook.com/marketplace/shops/item/67890/"), "67890");
});

function dom(html: string): Document {
  return new JSDOM(html, { url: "https://www.facebook.com/marketplace/" }).window.document;
}

function requiredElement<T extends Element>(document: Document, selector: string): T {
  const element = document.querySelector<T>(selector);
  assert.ok(element, `Missing ${selector}`);
  return element;
}
