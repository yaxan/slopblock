import { normalizeText } from "../common/scoring";
import type { ListingSnapshot } from "../common/types";

export const SLOPBLOCK_SELECTOR = ".slopblock-badge, .slopblock-toolbar";

export function extractCleanText(root: HTMLElement): { visibleText: string; lines: string[] } {
  const lines: string[] = [];
  const view = root.ownerDocument.defaultView ?? window;
  const walker = root.ownerDocument.createTreeWalker(root, view.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SLOPBLOCK_SELECTOR)) {
        return view.NodeFilter.FILTER_REJECT;
      }

      const text = normalizeText(node.textContent ?? "");
      if (!text) {
        return view.NodeFilter.FILTER_REJECT;
      }

      return view.NodeFilter.FILTER_ACCEPT;
    }
  });

  let node = walker.nextNode();
  while (node) {
    const text = normalizeText(node.textContent ?? "");
    if (text && lines[lines.length - 1] !== text) {
      lines.push(text);
    }

    node = walker.nextNode();
  }

  return {
    visibleText: normalizeText(lines.join("\n")),
    lines
  };
}

export function extractListingSnapshot(card: HTMLElement, anchor: HTMLAnchorElement): ListingSnapshot {
  const { visibleText, lines } = extractCleanText(card);
  const priceText = lines.find((line) => /^(?:free|contact|(?:ca|us|au)?\$\s*[0-9]|£\s*[0-9]|€\s*[0-9])/i.test(line)) ?? "";
  const locationText =
    lines.find((line) => /\b(?:mi|km)\s+away\b/i.test(line)) ??
    lines.find((line) => /^[A-Za-zÀ-ÿ' .-]{2,40},\s*[A-Z]{2}$/.test(line)) ??
    "";
  const title =
    cleanTitle(anchor.getAttribute("aria-label") ?? "", locationText) ||
    lines.find(
      (line) =>
        line !== priceText && line !== locationText && !/^(?:sponsored|just\s+listed|listed|ships?|location)/i.test(line)
    ) ||
    visibleText.slice(0, 120);
  const sellerText = extractSellerText(lines);

  const snapshot: ListingSnapshot = {
    url: anchor.href,
    title,
    priceText,
    locationText,
    visibleText,
    textLines: lines
  };

  const idHint = extractItemId(anchor.href);
  if (idHint) {
    snapshot.idHint = idHint;
  }

  if (sellerText) {
    snapshot.sellerText = sellerText;
  }

  return snapshot;
}

export function extractItemId(url: string): string | undefined {
  return url.match(/\/marketplace\/(?:shops\/|np\/)?item\/([^/?#]+)/)?.[1];
}

export function isMarketplaceSellerProfileContext(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes("/marketplace/profile/") || parsed.searchParams.get("ref") === "marketplace_profile";
  } catch {
    return url.includes("/marketplace/profile/") || url.includes("ref=marketplace_profile");
  }
}

function cleanTitle(title: string, locationText: string): string {
  let cleaned = normalizeText(
    title
      .replace(/\bFacebook\b/gi, "")
      .replace(/\bMarketplace\b:?\s*/gi, "")
      .replace(/^[:\-\s]+/, "")
  );

  // Card aria-labels look like "{title} in {location}". Strip the location so
  // titles stay comparable across cities (duplicate detection relies on this).
  const location = normalizeText(locationText).replace(/\s*[·|]\s*\d+\s*(?:mi|km)\s+away$/i, "");
  if (location) {
    const suffix = ` in ${location}`;
    if (cleaned.toLowerCase().endsWith(suffix.toLowerCase())) {
      cleaned = cleaned.slice(0, -suffix.length).trimEnd();
    }
  }

  return cleaned;
}

function extractSellerText(lines: string[]): string | undefined {
  for (const line of lines) {
    const text = normalizeText(line);
    if (!text || text.length > 120) {
      continue;
    }

    const matchedSellerLine =
      /\b(?:listed|sold)\s+by\s+\S.{1,}/i.test(text) ||
      /^(?:seller|dealer|store|shop)\s*:?\s+\S.{1,}/i.test(text);
    if (!matchedSellerLine) {
      continue;
    }

    if (/\b(?:seller\s+(?:information|details)|view\s+(?:seller\s+)?profile|seller\s+ratings?)\b/i.test(text)) {
      continue;
    }

    return text;
  }

  return undefined;
}
