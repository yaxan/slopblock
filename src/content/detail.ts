import { normalizeText } from "../common/scoring";
import type { ListingSnapshot } from "../common/types";
import { SLOPBLOCK_SELECTOR, extractCleanText } from "./dom";

/**
 * Item detail pages (/marketplace/item/<id>) are where the real evidence
 * lives — descriptions with catalog links, order language, scam scripts —
 * but they contain no card anchors, so the card scanner never sees them.
 * This module extracts the primary listing from a detail page or dialog.
 */

export function extractItemIdFromUrl(url: string): string | undefined {
  try {
    return new URL(url).pathname.match(/\/marketplace\/(?:shops\/|np\/)?item\/([^/?#]+)/)?.[1];
  } catch {
    return url.match(/\/marketplace\/(?:shops\/|np\/)?item\/([^/?#]+)/)?.[1];
  }
}

/**
 * Find the main listing info container: anchored at the page's item title
 * (last h1 on Marketplace item views), climbed outward while the container
 * stays free of other listings' anchors and ad units, so related-items
 * grids and the right-rail Sponsored box never bleed into the score.
 */
export function findDetailContainer(root: Document | HTMLElement): HTMLElement | null {
  // Node 9 = Document; avoid `instanceof Document`, which needs a DOM global.
  const isDocument = root.nodeType === 9;
  const documentRef = isDocument ? (root as Document) : (root as HTMLElement).ownerDocument;
  const scope =
    documentRef?.querySelector<HTMLElement>('div[role="dialog"]') ??
    (isDocument ? (root as Document).querySelector<HTMLElement>('div[role="main"]') : (root as HTMLElement));
  if (!scope) {
    return null;
  }

  const headings = Array.from(scope.querySelectorAll<HTMLElement>("h1"));
  const title = headings[headings.length - 1];
  if (!title) {
    return null;
  }

  let node: HTMLElement | null = title;
  let candidate: HTMLElement = title;

  for (let depth = 0; node && node !== scope.parentElement && depth < 10; depth += 1) {
    const containsOtherListings = node.querySelector(
      'a[href*="/marketplace/item/"], a[href*="/marketplace/shops/item/"], a[href*="/marketplace/np/item/"]'
    );
    const containsAdUnit = node.querySelector('a[href*="/ads/about"]');
    if (containsOtherListings || containsAdUnit) {
      break;
    }

    candidate = node;
    if (node === scope) {
      break;
    }

    node = node.parentElement;
  }

  return candidate;
}

/**
 * Facebook truncates descriptions behind a "See more" toggle whose hidden
 * text is NOT in the DOM until expanded. Expanding is a local, read-only
 * UI action (it reveals text the seller published); without it the most
 * incriminating part of a listing can be invisible to scanning.
 */
export function expandSeeMore(container: HTMLElement): boolean {
  if (container.getAttribute("data-slopblock-expanded") === "true") {
    return false;
  }

  const buttons = Array.from(container.querySelectorAll<HTMLElement>('[role="button"]'));
  const seeMore = buttons.find((button) => /^see\s+more$/i.test(normalizeText(button.textContent ?? "")));
  if (!seeMore) {
    return false;
  }

  container.setAttribute("data-slopblock-expanded", "true");
  seeMore.click();
  return true;
}

/**
 * Outbound links are the strongest dropship evidence, but Facebook wraps
 * them in l.facebook.com redirects and often truncates the visible text
 * ("wayfair.com/furniture/pdp/bay-isle-…"), so read the hrefs and decode
 * the redirect target instead of trusting display text.
 */
export function extractOutboundLinks(container: HTMLElement): string[] {
  const links = new Set<string>();

  for (const anchor of Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) {
      continue;
    }

    try {
      const parsed = new URL(href);
      if (/(?:^|\.)facebook\.com$/i.test(parsed.hostname) || /(?:^|\.)fbcdn\.net$/i.test(parsed.hostname)) {
        const wrapped = parsed.pathname === "/l.php" ? parsed.searchParams.get("u") : null;
        if (wrapped && /^https?:\/\//i.test(wrapped)) {
          links.add(wrapped);
        }
        continue;
      }

      links.add(href);
    } catch {
      // Ignore unparseable hrefs.
    }
  }

  return Array.from(links);
}

export function extractDetailSnapshot(container: HTMLElement, url: string): ListingSnapshot {
  const { lines } = extractCleanText(container);
  const headings = Array.from(container.querySelectorAll<HTMLElement>("h1"));
  const title = normalizeText(headings[headings.length - 1]?.textContent ?? "") || lines[0] || "";

  const priceText =
    lines.find((line) => /^(?:free$|(?:ca|us|au)?\$\s*[0-9]|£\s*[0-9]|€\s*[0-9])/i.test(line)) ?? "";
  const locationLine = lines.find((line) => /^listed\b.+\bin\b/i.test(line)) ?? "";
  const locationText = locationLine.match(/\bin\s+(.{2,60})$/i)?.[1] ?? "";

  const outboundLinks = extractOutboundLinks(container);
  const allLines = [...lines, ...outboundLinks];

  const snapshot: ListingSnapshot = {
    url,
    title,
    priceText,
    locationText: normalizeText(locationText),
    visibleText: normalizeText(allLines.join("\n")),
    textLines: allLines
  };

  const idHint = extractItemIdFromUrl(url);
  if (idHint) {
    snapshot.idHint = idHint;
  }

  return snapshot;
}

export function isItemDetailUrl(url: string): boolean {
  return extractItemIdFromUrl(url) !== undefined;
}

export { SLOPBLOCK_SELECTOR };
