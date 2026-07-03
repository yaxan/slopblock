import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { scoreListing } from "../src/common/scoring";
import { DEFAULT_SETTINGS } from "../src/common/settings";
import { extractItemId, extractListingSnapshot } from "../src/content/dom";
import type { ListingSnapshot } from "../src/common/types";

/**
 * Performance budget for the per-scan hot path. A rescan runs on every
 * Marketplace DOM mutation and scroll, so it must stay well under one frame
 * (~16ms) for a typical page. This benchmark measures the two costs that
 * dominate — scoring and DOM extraction — and fails if a 40-card scan
 * regresses past the budget.
 *
 * Note: jsdom's DOM is pure JS and materially slower than a browser's native
 * engine, so the DOM-extraction figure here is a pessimistic upper bound —
 * real-world scans are faster. This is a regression tripwire, not a spec.
 */

const CARD_BUDGET = 40;
const SCAN_BUDGET_MS = 20;

function loadSnapshots(): ListingSnapshot[] {
  const dir = join(process.cwd(), "eval", "corpus");
  const entries: Array<Record<string, string>> = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    entries.push(...(JSON.parse(readFileSync(join(dir, file), "utf8")) as Array<Record<string, string>>));
  }

  return entries.map((entry) => {
    const lines = [entry.price, entry.title, entry.location, ...(entry.body ? entry.body.split(/\r?\n/) : [])].filter(
      Boolean
    ) as string[];
    const snapshot: ListingSnapshot = {
      title: entry.title ?? "",
      priceText: entry.price ?? "",
      locationText: entry.location ?? "",
      visibleText: lines.join("\n"),
      textLines: lines
    };
    if (entry.id) {
      snapshot.idHint = entry.id;
    }
    return snapshot;
  });
}

function benchScoring(): number {
  const snapshots = loadSnapshots();
  const build = (): ListingSnapshot[] =>
    snapshots.map((snapshot) => {
      const copy: ListingSnapshot = { ...snapshot };
      if (snapshot.textLines) {
        copy.textLines = [...snapshot.textLines];
      }
      return copy;
    });

  for (let warm = 0; warm < 3; warm += 1) {
    for (const snapshot of build()) {
      scoreListing(snapshot, DEFAULT_SETTINGS, {});
    }
  }

  const iterations = 200;
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    for (const snapshot of build()) {
      scoreListing(snapshot, DEFAULT_SETTINGS, {});
    }
  }
  const perCallMs = (performance.now() - start) / (iterations * snapshots.length);
  return perCallMs * CARD_BUDGET;
}

function findCardContainer(anchor: HTMLAnchorElement): HTMLElement {
  let node: HTMLElement | null = anchor;
  let candidate: HTMLElement = anchor;
  for (let depth = 0; node && depth < 9; depth += 1) {
    const length = node.textContent?.length ?? 0;
    const anchors = node.querySelectorAll('a[href*="/marketplace/item/"]');
    const distinct = new Set(
      Array.from(anchors, (item) => extractItemId(item.getAttribute("href") ?? "") ?? item.getAttribute("href"))
    );
    if (anchors.length >= 1 && distinct.size === 1 && length >= 8 && length <= 1400) {
      candidate = node;
    }
    if (distinct.size > 1 || length > 1600) {
      break;
    }
    node = node.parentElement;
  }
  return candidate;
}

function benchDomExtraction(): number {
  const cardHtml = (i: number): string =>
    `<div class="cell"><div><span><div><div>
      <a href="/marketplace/item/${1000 + i}/?ref=search" aria-label="Item ${i} in Toronto, ON">
        <div><div><img src="/img/${i}.png" alt="Item ${i} in Toronto, ON"></div>
        <div><div><span dir="auto">$${50 + i}</span></div>
        <div><span dir="auto">Solid wood dresser number ${i} good condition pickup only</span></div>
        <div><span dir="auto">Toronto, ON</span></div></div></div>
      </a></div></div></span></div></div>`;
  const grid = Array.from({ length: CARD_BUDGET }, (_, i) => cardHtml(i)).join("\n");
  const dom = new JSDOM(`<!doctype html><body><div role="main"><div class="grid">${grid}</div></div></body>`);
  (globalThis as Record<string, unknown>).window = dom.window;
  dom.window.Element.prototype.getBoundingClientRect = () =>
    ({ width: 250, height: 320, top: 0, left: 0, right: 250, bottom: 320, x: 0, y: 0, toJSON() {} }) as DOMRect;

  const anchors = Array.from(dom.window.document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]'));
  const run = () => {
    for (const anchor of anchors) {
      extractListingSnapshot(findCardContainer(anchor), anchor);
    }
  };

  for (let warm = 0; warm < 5; warm += 1) {
    run();
  }

  const iterations = 100;
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    run();
  }
  return (performance.now() - start) / iterations;
}

const scoringMs = benchScoring();
const domMs = benchDomExtraction();
const total = scoringMs + domMs;

console.log(`Per-scan hot path for a ${CARD_BUDGET}-card page:`);
console.log(`  scoring:        ${scoringMs.toFixed(2)}ms`);
console.log(`  DOM extraction: ${domMs.toFixed(2)}ms`);
console.log(`  total:          ${total.toFixed(2)}ms  (budget ${SCAN_BUDGET_MS}ms)`);

if (total > SCAN_BUDGET_MS) {
  console.error(`\nBENCH FAILED: ${total.toFixed(2)}ms exceeds the ${SCAN_BUDGET_MS}ms per-scan budget.`);
  process.exit(1);
}
console.log("\nWithin budget.");
