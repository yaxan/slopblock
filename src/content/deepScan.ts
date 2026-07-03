import type { ListingSnapshot } from "../common/types";
import { extractDetailSnapshot, findDetailContainer } from "./detail";

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

// Concurrency is the whole point: a serial ~1/second crawl took ~25s to vet a
// page, which defeats a time-saving tool. Facebook serves over HTTP/2, which
// multiplexes many requests over ONE connection — so the classic "6 connections
// per host" limit doesn't apply, and 10 concurrent stream fetches read as a
// single busy connection (exactly what FB's own app does), not a swarm. Safety
// comes from a rolling-window rate cap + adaptive backoff, not from crawling.
const MAX_CONCURRENT = 14;
const DISPATCH_STAGGER_MS = 5;
const RATE_WINDOW_MS = 60_000;
// Adaptive rate (AIMD): run fast while Facebook is happy, back off hard the
// moment it isn't. Start at the base, add a step for every clean interval,
// halve on any 429/503.
const RATE_BASE_PER_MIN = 120;
const RATE_MAX_PER_MIN = 360;
const RATE_MIN_PER_MIN = 60;
const RATE_STEP_PER_MIN = 40;
const RATE_RAISE_INTERVAL_MS = 15_000;
const ERROR_BACKOFF_MS = 45_000;
const RATE_LIMIT_BACKOFF_MS = 90_000;
const NO_DATA_TTL_MS = 30 * 60 * 1000;
const VERDICT_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = {
  snapshot: ListingSnapshot | null;
  fetchedAt: number;
};

export type DeepScanFailure = { itemId: string; kind: string };

export type DeepScanStats = {
  fetched: number;
  parsedFromJson: number;
  parsedFromDom: number;
  noData: number;
  errors: number;
  pending: number;
  /** Requested this page view — reset when the page/search changes. */
  requested: number;
  /** Completed this page view — reset when the page/search changes. */
  completed: number;
  /** Current adaptive fetch budget (per minute). */
  targetRatePerMin: number;
  backoffMsRemaining: number;
  lastFailures: DeepScanFailure[];
};

export type DeepScanner = {
  /**
   * Queue a listing for background scanning (deduped; respects caps).
   * priority items (currently on-screen) jump ahead of look-ahead ones so
   * the card the user is about to click resolves first.
   */
  request(itemId: string, priority?: boolean): void;
  /** Full listing snapshot if a deep scan (or detail visit) captured one. */
  getSnapshot(itemId: string): ListingSnapshot | undefined;
  /** Record a snapshot observed directly (e.g. from a detail-page visit). */
  setSnapshot(itemId: string, snapshot: ListingSnapshot): void;
  /** True if this listing has been scanned (even if no data was found). */
  has(itemId: string): boolean;
  /**
   * Start a fresh progress window (new page/search). Keeps the verdict cache
   * — revisited listings stay instant — but re-bases the requested/completed
   * counters so progress reflects the current page view.
   */
  resetPageCounters(): void;
  /**
   * Drop still-queued (not-yet-started) listings that no longer pass the
   * predicate — e.g. cards scrolled far off-screen — so the rate budget and
   * concurrency go to what the user is actually looking at.
   */
  prune(shouldKeep: (itemId: string) => boolean): void;
  /** Local counters for the debug report — which fetches parsed, and how failures split. */
  stats(): DeepScanStats;
};

export function createDeepScanner(onVerdict: (itemId: string) => void): DeepScanner {
  const cache = new Map<string, CacheEntry>();
  const queue: string[] = [];
  const queued = new Set<string>();
  const recentFetchTimes: number[] = [];
  let requestedTotal = 0;
  let completedTotal = 0;
  let targetRatePerMin = RATE_BASE_PER_MIN;
  let lastRateRaiseAt = Date.now();
  let errorsSinceRaise = 0;
  let fetchCount = 0;
  let parsedFromJson = 0;
  let parsedFromDom = 0;
  let noDataCount = 0;
  let errorCount = 0;
  let activeFetches = 0;
  let retryTimer: number | undefined;
  let consecutiveErrors = 0;
  let backoffUntil = 0;
  const lastFailures: DeepScanFailure[] = [];

  function recordFailure(itemId: string, kind: string): void {
    lastFailures.push({ itemId, kind });
    if (lastFailures.length > 10) {
      lastFailures.shift();
    }
  }

  function withinRateLimit(): boolean {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    while (recentFetchTimes.length > 0 && (recentFetchTimes[0] ?? 0) < cutoff) {
      recentFetchTimes.shift();
    }
    return recentFetchTimes.length < targetRatePerMin;
  }

  /** Additive increase: every clean interval earns a faster budget. */
  function maybeRaiseRate(): void {
    const now = Date.now();
    if (now - lastRateRaiseAt < RATE_RAISE_INTERVAL_MS) {
      return;
    }
    if (errorsSinceRaise === 0 && now >= backoffUntil) {
      targetRatePerMin = Math.min(RATE_MAX_PER_MIN, targetRatePerMin + RATE_STEP_PER_MIN);
    }
    errorsSinceRaise = 0;
    lastRateRaiseAt = now;
  }

  function scheduleRetry(delay: number): void {
    if (retryTimer !== undefined) {
      return;
    }
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      pump();
    }, delay);
  }

  /** Fill the concurrency budget from the queue, staggered slightly. */
  function pump(): void {
    if (queue.length === 0) {
      return;
    }

    if (document.hidden || Date.now() < backoffUntil) {
      scheduleRetry(2000);
      return;
    }

    if (!withinRateLimit()) {
      scheduleRetry(1000);
      return;
    }

    if (activeFetches >= MAX_CONCURRENT) {
      return; // a completion will re-pump
    }

    const itemId = queue.shift();
    if (itemId === undefined) {
      return;
    }
    queued.delete(itemId);

    if (isFresh(cache.get(itemId))) {
      pump();
      return;
    }

    activeFetches += 1;
    fetchCount += 1;
    recentFetchTimes.push(Date.now());
    void runFetch(itemId).finally(() => {
      activeFetches -= 1;
      completedTotal += 1;
      pump();
    });

    // Dispatch the next one after a small stagger so a burst isn't perfectly
    // synchronized, while still keeping up to MAX_CONCURRENT in flight.
    if (queue.length > 0 && activeFetches < MAX_CONCURRENT) {
      window.setTimeout(pump, DISPATCH_STAGGER_MS);
    }
  }

  async function runFetch(itemId: string): Promise<void> {
    try {
      const response = await fetch(`https://www.facebook.com/marketplace/item/${encodeURIComponent(itemId)}/`, {
        credentials: "same-origin",
        headers: { accept: "text/html" }
      });

      if (response.status === 429 || response.status === 503) {
        registerError(itemId, `rate-${response.status}`, RATE_LIMIT_BACKOFF_MS);
        return;
      }

      if (!response.ok) {
        registerError(itemId, `http-${response.status}`, ERROR_BACKOFF_MS);
        return;
      }

      const html = await response.text();
      if (looksLikeLoginWall(html, response.url)) {
        registerError(itemId, "login-wall", ERROR_BACKOFF_MS);
        return;
      }

      consecutiveErrors = 0;
      maybeRaiseRate();
      let snapshot = extractListingFromHtml(html, itemId);
      if (snapshot) {
        parsedFromJson += 1;
      } else {
        // Some listing types (notably vehicles/dealer pages) ship
        // server-rendered DOM instead of the embedded JSON payload.
        // Fall back to the same extractor the detail-page scan uses.
        snapshot = extractListingViaDom(html, itemId, (raw) => new DOMParser().parseFromString(raw, "text/html"));
        if (snapshot) {
          parsedFromDom += 1;
        }
      }

      if (!snapshot) {
        noDataCount += 1;
        recordFailure(itemId, "no-listing-data");
      }
      cache.set(itemId, { snapshot, fetchedAt: Date.now() });
      if (snapshot) {
        onVerdict(itemId);
      }
    } catch {
      registerError(itemId, "network", ERROR_BACKOFF_MS);
    }
  }

  function registerError(itemId: string, kind: string, backoffMs: number): void {
    consecutiveErrors += 1;
    errorCount += 1;
    errorsSinceRaise += 1;
    recordFailure(itemId, kind);
    // Short error TTL so transient throttling retries soon.
    cache.set(itemId, { snapshot: null, fetchedAt: Date.now() - NO_DATA_TTL_MS + 60_000 });
    // Multiplicative decrease on rate-limit signals: halve the budget.
    if (kind.startsWith("rate-")) {
      targetRatePerMin = Math.max(RATE_MIN_PER_MIN, Math.floor(targetRatePerMin / 2));
    }
    // A rate-limit signal or a run of errors pauses all fetching.
    if (backoffMs >= RATE_LIMIT_BACKOFF_MS || consecutiveErrors >= 4) {
      backoffUntil = Date.now() + backoffMs;
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
    request(itemId: string, priority = false): void {
      if (!itemId || isFresh(cache.get(itemId))) {
        return;
      }

      if (queued.has(itemId)) {
        // Already waiting — promote it to the front if it just entered view.
        if (priority) {
          const at = queue.indexOf(itemId);
          if (at > 0) {
            queue.splice(at, 1);
            queue.unshift(itemId);
          }
        }
        return;
      }

      queued.add(itemId);
      requestedTotal += 1;
      if (priority) {
        queue.unshift(itemId);
      } else {
        queue.push(itemId);
      }
      pump();
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

    resetPageCounters(): void {
      requestedTotal = queue.length + activeFetches;
      completedTotal = 0;
    },

    prune(shouldKeep: (itemId: string) => boolean): void {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const itemId = queue[index];
        if (itemId !== undefined && !shouldKeep(itemId)) {
          queue.splice(index, 1);
          queued.delete(itemId);
          // Un-request it so the progress denominator stays honest; a scroll
          // back into view will re-queue and re-count it.
          requestedTotal = Math.max(completedTotal, requestedTotal - 1);
        }
      }
    },

    stats(): DeepScanStats {
      return {
        fetched: fetchCount,
        parsedFromJson,
        parsedFromDom,
        noData: noDataCount,
        errors: errorCount,
        pending: queue.length + activeFetches,
        requested: requestedTotal,
        completed: completedTotal,
        targetRatePerMin,
        backoffMsRemaining: Math.max(0, backoffUntil - Date.now()),
        lastFailures: [...lastFailures]
      };
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

/** Facebook's logged-out/checkpoint shells instead of the listing page. */
export function looksLikeLoginWall(html: string, responseUrl: string): boolean {
  if (/\/(?:login|checkpoint)\b/.test(responseUrl)) {
    return true;
  }

  return /id="loginform"|name="login"|data-testid="royal_login_form"/i.test(html) && !/marketplace_listing_title/.test(html);
}

/**
 * DOM fallback for server-rendered listing pages that lack the embedded
 * JSON payload: parse the fetched HTML and reuse the exact extractor the
 * detail-page scan uses on the live page.
 */
export function extractListingViaDom(
  html: string,
  itemId: string,
  parse: (html: string) => Document
): ListingSnapshot | null {
  try {
    const doc = parse(html);
    const container = findDetailContainer(doc);
    if (!container) {
      return null;
    }

    const snapshot = extractDetailSnapshot(container, `https://www.facebook.com/marketplace/item/${itemId}/`);
    if (!snapshot.title || snapshot.visibleText.length < 12) {
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}
