import test from "node:test";
import assert from "node:assert/strict";
import {
  SAME_IMAGE_DISTANCE,
  dhashFromPixels,
  hammingDistance,
  isCatalogStylePixels,
  type PixelGrid
} from "../src/content/imageScan";
import { analyzeDuplicateFlood } from "../src/content/duplicateFlood";
import type { ListingSnapshot } from "../src/common/types";

function grid(width: number, height: number, pixelAt: (x: number, y: number) => [number, number, number]): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

test("catalog-style detection: product on pure white is flagged", () => {
  const catalog = grid(24, 24, (x, y) => {
    const inSubject = x >= 8 && x < 16 && y >= 8 && y < 16;
    return inSubject ? [140, 90, 60] : [255, 255, 255];
  });
  assert.equal(isCatalogStylePixels(catalog), true);
});

test("catalog-style detection: real-world photos and blank frames are not flagged", () => {
  const roomPhoto = grid(24, 24, (x, y) => [80 + ((x * 13 + y * 7) % 90), 70 + ((x * 5) % 60), 60 + ((y * 11) % 50)]);
  assert.equal(isCatalogStylePixels(roomPhoto), false, "busy room photo");

  const blank = grid(24, 24, () => [255, 255, 255]);
  assert.equal(isCatalogStylePixels(blank), false, "all-white placeholder has no subject");

  const whiteWall = grid(24, 24, (x, y) => (y > 20 ? [180, 150, 120] : [252, 250, 248]));
  assert.equal(isCatalogStylePixels(whiteWall), false, "item photographed against a wall with floor visible at bottom edge");
});

test("dhash is stable for identical images and differs for different ones", () => {
  const imageA = grid(9, 8, (x, y) => [x * 25, x * 25, x * 25]);
  const imageACopy = grid(9, 8, (x, y) => [x * 25, x * 25, x * 25]);
  const imageB = grid(9, 8, (x, y) => [(8 - x) * 25, (8 - x) * 25, (8 - x) * 25]);

  const hashA = dhashFromPixels(imageA);
  assert.equal(hashA.length, 16);
  assert.equal(hashA, dhashFromPixels(imageACopy));
  assert.ok(hammingDistance(hashA, dhashFromPixels(imageB)) > SAME_IMAGE_DISTANCE);
});

test("hamming distance counts bit differences", () => {
  assert.equal(hammingDistance("00", "00"), 0);
  assert.equal(hammingDistance("0f", "00"), 4);
  assert.equal(hammingDistance("ff", "00"), 8);
  assert.equal(hammingDistance("ab", "abc"), Number.POSITIVE_INFINITY);
});

function listing(index: number, price: string, location: string, imageHash?: string): ListingSnapshot {
  const snapshot: ListingSnapshot = {
    idHint: `id-${index}`,
    title: "Modern Velvet Accent Chair Teal",
    priceText: price,
    locationText: location,
    visibleText: `${price}\nModern Velvet Accent Chair Teal\n${location}`
  };
  if (imageHash) {
    snapshot.imageHash = imageHash;
  }
  return snapshot;
}

test("image tier collapses floods that rotate BOTH price and location", () => {
  const sameHash = "a1b2c3d4e5f60718";
  const snapshots = [
    listing(0, "$120", "Toronto, ON", sameHash),
    listing(1, "$95", "Vaughan, ON", sameHash),
    listing(2, "$140", "Oshawa, ON", sameHash),
    listing(3, "$110", "Milton, ON", sameHash)
  ];

  const infos = analyzeDuplicateFlood(snapshots);
  assert.equal(infos[0]?.tier, "image");
  assert.equal(infos[0]?.ordinal, 0, "first stays visible");
  assert.ok(infos.slice(1).every((info) => info.tier === "image" && info.ordinal > 0));
});

test("image tier tolerates small hash drift from re-encoding", () => {
  const base = "a1b2c3d4e5f60718";
  const drifted = "a1b2c3d4e5f60719"; // 1 bit off
  const snapshots = [
    listing(0, "$120", "Toronto, ON", base),
    listing(1, "$95", "Vaughan, ON", drifted),
    listing(2, "$140", "Oshawa, ON", base),
    listing(3, "$110", "Milton, ON", drifted)
  ];

  const infos = analyzeDuplicateFlood(snapshots);
  assert.ok(infos.slice(1).every((info) => info.tier === "image" && info.ordinal > 0));
});

test("different photos with the same title never collapse via the image tier", () => {
  const snapshots = [
    listing(0, "$120", "Toronto, ON", "0000000000000000"),
    listing(1, "$95", "Vaughan, ON", "ffffffffffffffff"),
    listing(2, "$140", "Oshawa, ON", "00ff00ff00ff00ff"),
    listing(3, "$110", "Milton, ON", "f0f0f0f0f0f0f0f0")
  ];

  const infos = analyzeDuplicateFlood(snapshots);
  assert.ok(infos.every((info) => info.tier === null));
});

test("unanalyzed images (no hash) are simply excluded from the image tier", () => {
  const sameHash = "a1b2c3d4e5f60718";
  const snapshots = [
    listing(0, "$120", "Toronto, ON", sameHash),
    listing(1, "$95", "Vaughan, ON"),
    listing(2, "$140", "Oshawa, ON", sameHash),
    listing(3, "$110", "Milton, ON", sameHash)
  ];

  const infos = analyzeDuplicateFlood(snapshots);
  assert.ok(infos.every((info) => info.tier === null), "only 3 hashed copies -> below the 4 threshold");
});
