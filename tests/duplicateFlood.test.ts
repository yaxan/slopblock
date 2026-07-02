import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDuplicateFlood, duplicateFloodFingerprint } from "../src/content/duplicateFlood";
import type { ListingSnapshot } from "../src/common/types";

test("cloned DOM cards of one listing never mark repeats", () => {
  const clones = Array.from({ length: 8 }, () =>
    listing({
      idHint: "111",
      url: "https://www.facebook.com/marketplace/item/111/?ref=search",
      title: "Brand new accent chair walnut",
      priceText: "$60",
      locationText: "Toronto, ON"
    })
  );

  const infos = analyzeDuplicateFlood(clones);
  assert.ok(infos.every((info) => info.tier === null && info.ordinal === 0));
});

test("same title at different prices never collapses (search results)", () => {
  const snapshots = Array.from({ length: 10 }, (_, index) =>
    listing({
      idHint: `id-${index}`,
      title: "iPhone 12 128GB unlocked",
      priceText: `$${200 + index * 10}`,
      locationText: "Toronto, ON"
    })
  );

  const infos = analyzeDuplicateFlood(snapshots);
  assert.ok(infos.every((info) => info.tier === null));
});

test("identical title+price+location across 4+ distinct ids collapses repeats only", () => {
  const snapshots = Array.from({ length: 5 }, (_, index) =>
    listing({
      idHint: `id-${index}`,
      title: "Sectional sofa couch grey fabric",
      priceText: "$199",
      locationText: "Toronto, ON"
    })
  );

  const infos = analyzeDuplicateFlood(snapshots);
  assert.equal(infos[0]?.tier, "exact");
  assert.equal(infos[0]?.ordinal, 0);
  assert.ok(infos.slice(1).every((info) => info.tier === "exact" && info.ordinal > 0));
  assert.ok(infos.every((info) => info.groupSize === 5));
});

test("three identical listings stay below the collapse threshold", () => {
  const snapshots = Array.from({ length: 3 }, (_, index) =>
    listing({
      idHint: `id-${index}`,
      title: "Sectional sofa couch grey fabric",
      priceText: "$199",
      locationText: "Toronto, ON"
    })
  );

  const infos = analyzeDuplicateFlood(snapshots);
  assert.ok(infos.every((info) => info.tier === null));
});

test("bait-priced repeats collapse even when prices rotate", () => {
  const snapshots = Array.from({ length: 6 }, (_, index) =>
    listing({
      idHint: `id-${index}`,
      title: "Modern luxury sofa set sale",
      priceText: ["$1", "$2", "Free"][index % 3] ?? "$1",
      locationText: "Toronto, ON"
    })
  );

  const infos = analyzeDuplicateFlood(snapshots);
  assert.equal(infos[0]?.ordinal, 0);
  assert.ok(infos.slice(1).every((info) => info.tier !== null && info.ordinal > 0));
});

test("same title+price across rotating locations collapses at 6+", () => {
  const snapshots = Array.from({ length: 6 }, (_, index) =>
    listing({
      idHint: `id-${index}`,
      title: "Ergonomic gaming chair racing style",
      priceText: "$149",
      locationText: `Suburb ${index}, ON`
    })
  );

  const infos = analyzeDuplicateFlood(snapshots);
  assert.equal(infos[0]?.ordinal, 0);
  assert.ok(infos.slice(1).every((info) => info.tier === "mass" && info.ordinal > 0));
});

test("generic short titles never build flood fingerprints", () => {
  assert.equal(duplicateFloodFingerprint(listing({ title: "Dresser" })), "");
  assert.equal(duplicateFloodFingerprint(listing({ title: "Free couch" })), "");
  assert.notEqual(duplicateFloodFingerprint(listing({ title: "Solid oak dresser with mirror" })), "");
});

test("marketplace item URLs are normalized so tracking params do not split identities", () => {
  const snapshots = [
    listing({ url: "https://www.facebook.com/marketplace/item/333/?ref=search", title: "Vintage brass floor lamp", priceText: "$40", locationText: "Toronto, ON" }),
    listing({ url: "https://www.facebook.com/marketplace/item/333/?ref=marketplace_profile", title: "Vintage brass floor lamp", priceText: "$40", locationText: "Toronto, ON" }),
    listing({ url: "https://www.facebook.com/marketplace/item/444/?ref=search", title: "Vintage brass floor lamp", priceText: "$40", locationText: "Toronto, ON" }),
    listing({ url: "https://www.facebook.com/marketplace/item/555/?ref=search", title: "Vintage brass floor lamp", priceText: "$40", locationText: "Toronto, ON" }),
    listing({ url: "https://www.facebook.com/marketplace/item/666/?ref=search", title: "Vintage brass floor lamp", priceText: "$40", locationText: "Toronto, ON" })
  ];

  const infos = analyzeDuplicateFlood(snapshots);
  // 333 counted once: 4 distinct identities -> exact tier collapse, clones share ordinal 0.
  assert.equal(infos[0]?.ordinal, 0);
  assert.equal(infos[1]?.ordinal, 0);
  assert.ok(infos.slice(2).every((info) => info.ordinal > 0 && info.tier === "exact"));
  assert.equal(infos[0]?.groupSize, 4);
});

function listing(overrides: Partial<ListingSnapshot>): ListingSnapshot {
  return {
    url: "",
    title: "",
    priceText: "",
    locationText: "",
    visibleText: [overrides.priceText, overrides.title, overrides.locationText].filter(Boolean).join("\n"),
    ...overrides
  };
}
