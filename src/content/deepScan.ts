import type { ListingSnapshot } from "../common/types";

/**
 * Deep scan: feed cards only show price/title/location, so listings whose
 * evidence lives in the description (retailer catalog links, order language,
 * scam scripts) look innocent until opened. Deep scan fetches the listing
 * page from facebook.com in the background — the same request the browser
 * makes when the user clicks the card — and extracts the seller-written
 * fields from the page's embedded JSON so the card can be scored on its
 * full content while browsing.
 *
 * Constraints, in order:
 * 1. Gentle: one fetch at a time, spaced with jitter, viewport-first, hard
 *    per-page cap, backs off on errors, pauses when the tab is hidden.
 * 2. Local: same-origin GET with the user's existing session; nothing is
 *    sent anywhere else; verdicts live in memory only (no listing history).
 * 3. Honest: extraction only reads listing fields (title, price,
 *    description, sold state); if they can't be found, the card is left
 *    alone rather than scored against page chrome.
 */

const FETCH_SPACING_MS = 1100;
const FETCH_JITTER_MS = 500;
const MAX_FETCHES_PER_PAGE = 80;
const ERROR_BACKOFF_MS = 5 * 60 * 1000;
const NO_DATA_TTL_MS = 30 * 60 * 1000;
const VERDICT_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = {
  snapshot: ListingSnapshot | null;
  fetchedAt: number;
};

export type DeepScanner = {
  /** Queue a listing for background scanning (deduped; respects caps). */
  request(itemId: string): void;
  /** Full listing snapshot if a deep scan (or detail visit) captured one. */
  getSnapshot(itemId: string): ListingSnapshot | undefined;
  /** Record a snapshot observed directly (e.g. from a detail-page visit). */
  setSnapshot(itemId: string, snapshot: ListingSnapshot): void;
  /** True if this listing has been scanned (even if no data was found). */
  has(itemId: string): boolean;
  stats(): { fetched: number; pending: number };
};

export function createDeepScanner(onVerdict: (itemId: string) => void): DeepScanner {
  const cache = new Map<string, CacheEntry>();
  const queue: string[] = [];
  const queued = new Set<string>();
  let fetchCount = 0;
  let timer: number | undefined;
  let consecutiveErrors = 0;
  let backoffUntil = 0;

  function schedule(): void {
    if (timer !== undefined || queue.length === 0) {
      return;
    }

    const delay = FETCH_SPACING_MS + Math.random() * FETCH_JITTER_MS;
    timer = window.setTimeout(() => {
      timer = undefined;
      void processNext();
    }, delay);
  }

  async function processNext(): Promise<void> {
    if (document.hidden || Date.now() < backoffUntil) {
      // Try again later without consuming the queue.
      timer = window.setTimeout(() => {
        timer = undefined;
        void processNext();
      }, 4000);
      return;
    }

    const itemId = queue.shift();
    if (itemId === undefined) {
      return;
    }
    queued.delete(itemId);

    if (!isFresh(cache.get(itemId)) && fetchCount < MAX_FETCHES_PER_PAGE) {
      fetchCount += 1;
      try {
        const response = await fetch(`https://www.facebook.com/marketplace/item/${encodeURIComponent(itemId)}/`, {
          credentials: "same-origin",
          headers: { accept: "text/html" }
        });

        if (response.ok) {
          consecutiveErrors = 0;
          const html = await response.text();
          const snapshot = extractListingFromHtml(html, itemId);
          cache.set(itemId, { snapshot, fetchedAt: Date.now() });
          if (snapshot) {
            onVerdict(itemId);
          }
        } else {
          registerError(itemId);
        }
      } catch {
        registerError(itemId);
      }
    }

    schedule();
  }

  function registerError(itemId: string): void {
    consecutiveErrors += 1;
    cache.set(itemId, { snapshot: null, fetchedAt: Date.now() });
    if (consecutiveErrors >= 2) {
      backoffUntil = Date.now() + ERROR_BACKOFF_MS;
    }
  }

  function isFresh(entry: CacheEntry | undefined): boolean {
    if (!entry) {
      return false;
    }

    const ttl = entry.snapshot ? VERDICT_TTL_MS : NO_DATA_TTL_MS;
    return Date.now() - entry.fetchedAt < ttl;
  }

  return {
    request(itemId: string): void {
      if (!itemId || queued.has(itemId) || isFresh(cache.get(itemId)) || fetchCount >= MAX_FETCHES_PER_PAGE) {
        return;
      }

      queued.add(itemId);
      queue.push(itemId);
      schedule();
    },

    getSnapshot(itemId: string): ListingSnapshot | undefined {
      const entry = cache.get(itemId);
      return entry && isFresh(entry) && entry.snapshot ? entry.snapshot : undefined;
    },

    setSnapshot(itemId: string, snapshot: ListingSnapshot): void {
      cache.set(itemId, { snapshot, fetchedAt: Date.now() });
    },

    has(itemId: string): boolean {
      return isFresh(cache.get(itemId));
    },

    stats(): { fetched: number; pending: number } {
      return { fetched: fetchCount, pending: queue.length };
    }
  };
}

/**
 * Marketplace item pages embed the listing as JSON
 * (`__typename: "MarketplaceProductItem"` payloads — see
 * eval/raw/fb-dom-notes.md §7.3). Only seller-written listing fields are
 * read; page chrome is never scored.
 */
export function extractListingFromHtml(html: string, itemId: string): ListingSnapshot | null {
  const title = extractJsonString(html, /"marketplace_listing_title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const description =
    extractJsonString(html, /"redacted_description"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/) ??
    extractJsonString(html, /"listing_description"\s*:\s*\{?\s*"?text"?\s*:?\s*"((?:\\.|[^"\\])*)"/);
  const price =
    extractJsonString(html, /"formatted_amount"\s*:\s*"((?:\\.|[^"\\])*)"/) ??
    extractJsonString(html, /"formatted_price"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/);

  if (!title || (!description && !price)) {
    return null;
  }

  const isSold = /"is_sold"\s*:\s*true/.test(html);
  const isPending = /"is_pending"\s*:\s*true/.test(html);
  const priceText = [price ?? "", isSold ? "sold" : "", isPending ? "pending" : ""].filter(Boolean).join(" · ");

  const lines = [priceText, title, ...(description ? description.split(/\r?\n/) : [])].filter(Boolean);

  return {
    idHint: itemId,
    url: `https://www.facebook.com/marketplace/item/${itemId}/`,
    title,
    priceText,
    locationText: "",
    visibleText: lines.join("\n"),
    textLines: lines
  };
}

function extractJsonString(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const decoded: unknown = JSON.parse(`"${match[1]}"`);
    return typeof decoded === "string" && decoded.trim() ? decoded.trim() : undefined;
  } catch {
    return undefined;
  }
}
