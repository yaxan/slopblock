import { allowTermFromTitle } from "../common/allowTerms";
import { fingerprintText, scoreListing } from "../common/scoring";
import { controlRuleIdForMatch } from "../common/ruleToggles";
import { STORAGE_KEY, normalizeSettings } from "../common/settings";
import { loadSettings, saveSettings } from "../common/storage";
import { toContentDecision } from "./diagnostics";
import { createDeepScanner } from "./deepScan";
import { createImageScanner } from "./imageScan";
import { analyzeDuplicateFlood } from "./duplicateFlood";
import { expandSeeMore, extractDetailSnapshot, findDetailContainer, isItemDetailUrl } from "./detail";
import {
  SLOPBLOCK_SELECTOR,
  extractCleanText,
  extractItemId,
  extractListingSnapshot,
  isMarketplaceSellerProfileContext
} from "./dom";
import type {
  ContentMessage,
  ContentStats,
  ListingSnapshot,
  ScoreContext,
  ScoreResult,
  SlopBlockSettings
} from "../common/types";

const PROCESSED_ATTR = "data-slopblock-processed";
const ORIGINAL_DISPLAY_ATTR = "data-slopblock-original-display";
const ORIGINAL_POSITION_ATTR = "data-slopblock-original-position";

let settings: SlopBlockSettings | null = null;
let showHidden = false;
let scanTimer: number | undefined;
let stats: ContentStats = { scanned: 0, hidden: 0, dimmed: 0, labeled: 0 };
let lastDecisions: ReturnType<typeof toContentDecision>[] = [];
const deepScanner = createDeepScanner(() => scheduleScan(0));
const imageScanner = createImageScanner(() => scheduleScan(0));

void init();

async function init(): Promise<void> {
  settings = await loadSettings();
  createToolbar();
  scheduleScan();
  observeMarketplace();
  installRuntimeListeners();
  installDeepScanTriggers();
}

function installDeepScanTriggers(): void {
  let scrollTimer: number | undefined;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer !== undefined) {
        return;
      }

      scrollTimer = window.setTimeout(() => {
        scrollTimer = undefined;
        queueDeepScans();
      }, 800);
    },
    { passive: true }
  );
}

/**
 * Queue background description scans for cards near the viewport that the
 * card text alone could not condemn. Viewport-first keeps request volume
 * proportional to what the user actually looks at.
 */
function queueDeepScans(): void {
  if (!settings?.enabled || !settings.deepScan) {
    return;
  }

  const viewportHeight = window.innerHeight;
  const lookahead = viewportHeight * 2;
  const nearViewport = new Set<string>();

  for (const card of Array.from(document.querySelectorAll<HTMLElement>(`[${PROCESSED_ATTR}]`))) {
    const itemId = card.dataset.slopblockItemId;
    if (!itemId || deepScanner.has(itemId)) {
      continue;
    }

    if (card.getAttribute(PROCESSED_ATTR) === "hide") {
      continue;
    }

    const rect = card.getBoundingClientRect();
    if (rect.bottom < -lookahead || rect.top > viewportHeight + lookahead) {
      continue;
    }

    nearViewport.add(itemId);
    // Cards actually on screen are what the user might click next: fetch
    // those before the look-ahead ring so their verdicts land first.
    const onScreen = rect.bottom > 0 && rect.top < viewportHeight;
    deepScanner.request(itemId, onScreen);
  }

  // Fast scrolling queues cards that are now far behind; drop the ones no
  // longer near the viewport so fetches keep pace with what's on screen.
  deepScanner.prune((itemId) => nearViewport.has(itemId));
}

function observeMarketplace(): void {
  const observer = new MutationObserver((mutations) => {
    if (mutations.every(isSlopBlockMutation)) {
      return;
    }

    scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function installRuntimeListeners(): void {
  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    if (message.type === "SLOPBLOCK_RESCAN") {
      scheduleScan(0);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "SLOPBLOCK_SET_SHOW_HIDDEN") {
      showHidden = message.showHidden;
      scheduleScan(0);
      sendResponse({ ok: true, showHidden });
      return false;
    }

    if (message.type === "SLOPBLOCK_GET_STATS") {
      sendResponse({ ok: true, stats, showHidden });
      return false;
    }

    if (message.type === "SLOPBLOCK_EXPORT_DECISIONS") {
      sendResponse({ ok: true, stats, showHidden, decisions: lastDecisions, deepScan: deepScanner.stats() });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }

    settings = normalizeSettings(changes[STORAGE_KEY].newValue);
    scheduleScan(0);
  });
}

function scheduleScan(delay = 180): void {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => rescanMarketplace(), delay);
}

function rescanMarketplace(): void {
  if (!settings) {
    return;
  }

  const isSellerProfileContext = isMarketplaceSellerProfileContext(window.location.href);
  const cards = collectListingCards();
  const snapshots = cards.map(({ card, anchor }) => ({ card, snapshot: extractListingSnapshot(card, anchor) }));

  const imageChecksOn = settings.imageChecks;
  const imageAnalyses = snapshots.map(({ snapshot }) => {
    if (!imageChecksOn || !snapshot.imageUrl) {
      return undefined;
    }

    imageScanner.request(snapshot.imageUrl);
    const analysis = imageScanner.get(snapshot.imageUrl);
    if (analysis) {
      snapshot.imageHash = analysis.hash;
    }
    return analysis;
  });

  const duplicateInfos = isSellerProfileContext ? [] : analyzeDuplicateFlood(snapshots.map(({ snapshot }) => snapshot));

  stats = { scanned: snapshots.length, hidden: 0, dimmed: 0, labeled: 0 };
  lastDecisions = [];

  for (const [index, { card, snapshot }] of snapshots.entries()) {
    const context: ScoreContext = { isSellerProfileContext };
    const duplicate = duplicateInfos[index];
    if (duplicate) {
      context.duplicate = duplicate;
    }
    if (imageAnalyses[index]?.catalogStyle) {
      context.imageCatalogStyle = true;
    }

    if (snapshot.idHint) {
      card.dataset.slopblockItemId = snapshot.idHint;
    }

    let result = scoreListing(snapshot, settings, context);
    let decisionSnapshot = snapshot;

    // Merge in the background description scan: the deep snapshot is the
    // same listing with its full seller-written text, so the stronger
    // verdict wins. Cheap card evidence (flood context) still applies.
    const deepSnapshot = settings.deepScan && snapshot.idHint ? deepScanner.getSnapshot(snapshot.idHint) : undefined;
    if (deepSnapshot) {
      const deepResult = scoreListing(deepSnapshot, settings, context);
      if (deepResult.score > result.score) {
        result = deepResult;
        decisionSnapshot = { ...deepSnapshot };
        const bestUrl = snapshot.url ?? deepSnapshot.url;
        if (bestUrl !== undefined) {
          decisionSnapshot.url = bestUrl;
        }
      }
    }

    lastDecisions.push(toContentDecision(decisionSnapshot, result));
    applyScore(card, result, snapshot);
  }

  scanItemDetail();
  updateToolbar();
  queueDeepScans();
}

/**
 * The main listing on /marketplace/item/<id> pages carries the description —
 * where catalog links, order language, and scam scripts actually live — but
 * contains no card anchors, so the card scan never sees it. Score it
 * separately and show an inline verdict banner (a page the user deliberately
 * opened is annotated, never removed).
 */
function scanItemDetail(): void {
  if (!settings || !isItemDetailUrl(window.location.href)) {
    return;
  }

  const container = findDetailContainer(document);
  if (!container) {
    return;
  }

  // Reveal "See more" description text first; the resulting DOM mutation
  // re-triggers a scan that will read the full description.
  if (expandSeeMore(container)) {
    return;
  }

  const snapshot = extractDetailSnapshot(container, window.location.href);
  if (!snapshot.title && !snapshot.visibleText) {
    return;
  }

  // Remember what we saw: if this listing shows up again in a feed, its
  // card can be judged on the full text without another fetch.
  if (snapshot.idHint) {
    deepScanner.setSnapshot(snapshot.idHint, snapshot);
  }

  const detailContext: ScoreContext = {};
  if (settings.imageChecks && snapshot.imageUrl) {
    imageScanner.request(snapshot.imageUrl);
    const analysis = imageScanner.get(snapshot.imageUrl);
    if (analysis) {
      snapshot.imageHash = analysis.hash;
      if (analysis.catalogStyle) {
        detailContext.imageCatalogStyle = true;
      }
    }
  }

  const result = scoreListing(snapshot, settings, detailContext);
  lastDecisions.push(toContentDecision(snapshot, result));
  stats.scanned += 1;
  if (result.action !== "allow") {
    // The banner annotates rather than hides, so it counts as labeled.
    stats.labeled += 1;
  }

  applyDetailVerdict(container, result, snapshot);
}

function applyDetailVerdict(container: HTMLElement, result: ScoreResult, snapshot: ListingSnapshot): void {
  const signature = scoreSignature(result, snapshot);
  const existing = container.querySelector<HTMLElement>(":scope > .slopblock-detail-banner");

  if (result.action === "allow") {
    existing?.remove();
    return;
  }

  if (existing?.dataset.slopblockSignature === signature) {
    return;
  }

  existing?.remove();

  const banner = document.createElement("div");
  banner.className = "slopblock-detail-banner";
  banner.dataset.slopblockSignature = signature;
  banner.dataset.tone = result.action;

  const positiveMatches = result.matches.filter((match) => match.weight > 0);
  const topMatch = positiveMatches[0];
  const reasons = positiveMatches
    .slice(0, 3)
    .map((match) => match.reason)
    .join(" · ");
  const verdictText =
    result.action === "hide"
      ? "This listing looks like marketplace slop"
      : result.action === "dim"
        ? "This listing looks commercial or suspicious"
        : "This listing has mild slop signals";

  const summary = document.createElement("div");
  summary.className = "slopblock-detail-banner-summary";
  const heading = document.createElement("strong");
  heading.textContent = `SlopBlock — ${verdictText}`;
  const detail = document.createElement("span");
  detail.textContent = reasons || result.action;
  summary.title = `Score ${result.score} · ${positiveMatches.map((match) => match.ruleId).join(", ")}`;
  summary.append(heading, detail);
  banner.append(summary);

  const actions = document.createElement("div");
  actions.className = "slopblock-detail-banner-actions";

  if (snapshot.idHint || allowTermFromTitle(snapshot.title)) {
    const allowButton = document.createElement("button");
    allowButton.type = "button";
    allowButton.textContent = "Don't flag this item";
    allowButton.title = "Remove this warning and always show this listing";
    allowButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void allowListing(snapshot);
    });
    actions.append(allowButton);
  }

  const topRuleId = controlRuleIdForMatch(topMatch?.ruleId);
  if (topRuleId && topMatch) {
    const disableRuleButton = document.createElement("button");
    disableRuleButton.type = "button";
    disableRuleButton.dataset.variant = "quiet";
    disableRuleButton.textContent = "Turn off this rule";
    disableRuleButton.title = `Stop filtering for "${topMatch.reason}" everywhere (${topRuleId})`;
    disableRuleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void disableRule(topRuleId);
    });
    actions.append(disableRuleButton);
  }

  appendLensButton(actions, snapshot);

  banner.append(actions);
  container.prepend(banner);
}

const ITEM_ANCHOR_SELECTOR =
  'a[href*="/marketplace/item/"], a[href*="/marketplace/shops/item/"], a[href*="/marketplace/np/item/"]';

function collectListingCards(): Array<{ card: HTMLElement; anchor: HTMLAnchorElement }> {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>(ITEM_ANCHOR_SELECTOR));
  const seen = new Set<HTMLElement>();
  const cards: Array<{ card: HTMLElement; anchor: HTMLAnchorElement }> = [];

  for (const anchor of anchors) {
    const card = findCardContainer(anchor);
    if (!card || seen.has(card) || card.closest(".slopblock-toolbar")) {
      continue;
    }

    seen.add(card);
    cards.push({ card, anchor });
  }

  for (const { card, anchor } of collectSponsoredAdCells(seen)) {
    seen.add(card);
    cards.push({ card, anchor });
  }

  return cards;
}

/**
 * Sponsored Marketplace cells often link to l.facebook.com or an advertiser
 * site instead of /marketplace/item/, so the item-anchor scan never sees
 * them. Find them via their ad-disclosure link plus a standalone
 * "Sponsored" text line.
 */
function collectSponsoredAdCells(alreadySeen: Set<HTMLElement>): Array<{ card: HTMLElement; anchor: HTMLAnchorElement }> {
  const adAnchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/ads/about"], a[href*="l.facebook.com/l.php"], a[href^="https://l.facebook.com"]'
    )
  );
  const cells: Array<{ card: HTMLElement; anchor: HTMLAnchorElement }> = [];
  const seen = new Set<HTMLElement>(alreadySeen);

  for (const anchor of adAnchors) {
    const cell = findSponsoredCell(anchor);
    if (!cell || seen.has(cell) || cell.closest(".slopblock-toolbar")) {
      continue;
    }

    seen.add(cell);
    cells.push({ card: cell, anchor });
  }

  return cells;
}

function findSponsoredCell(anchor: HTMLAnchorElement): HTMLElement | null {
  // Once processed (possibly display:none with a zero rect), keep the same cell.
  const processedAncestor = anchor.closest<HTMLElement>(`[${PROCESSED_ATTR}]`);
  if (processedAncestor) {
    return processedAncestor;
  }

  let node: HTMLElement | null = anchor;
  let candidate: HTMLElement | null = null;

  // Climb to the outermost element that still contains only this ad unit
  // (a standalone Sponsored line, no organic item links) so the whole grid
  // cell hides instead of leaving an empty shell. Never climb across page
  // chrome or a detail listing (which owns the page h1) — on item pages the
  // right-rail ad box has no item-anchor neighbors to stop the walk, and an
  // unbounded climb would swallow the entire page.
  for (let depth = 0; node && node !== document.body && depth < 9; depth += 1) {
    if (node.matches('[role="main"], [role="dialog"], main') || node.querySelector("h1")) {
      break;
    }

    const { visibleText, lines } = extractCleanText(node);
    if (visibleText.length > 1400 || node.querySelector(ITEM_ANCHOR_SELECTOR) !== null) {
      break;
    }

    const hasSponsoredLine = lines.some((line) => /^sponsored$/i.test(line.trim()));
    if (hasSponsoredLine) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 90 && rect.height >= 70 && visibleText.length >= 8) {
        candidate = node;
      }
    }

    node = node.parentElement;
  }

  return candidate;
}

/**
 * Backstop for finder bugs and future Facebook layout changes: never apply
 * destructive visual state to page chrome. If a "card" turns out to span the
 * main/dialog region or a page heading, fail open (leave it visible) rather
 * than blank the page.
 */
function isSafeToAlter(card: HTMLElement): boolean {
  return (
    !card.matches('body, main, [role="main"], [role="dialog"], [role="navigation"], [role="banner"]') &&
    card.querySelector("h1") === null &&
    card.querySelector(".slopblock-toolbar") === null
  );
}

function findCardContainer(anchor: HTMLAnchorElement): HTMLElement | null {
  const processedAncestor = anchor.closest<HTMLElement>(`[${PROCESSED_ATTR}]`);
  if (processedAncestor) {
    return processedAncestor;
  }

  let node: HTMLElement | null = anchor;
  let candidate: HTMLElement | null = anchor;

  for (let depth = 0; node && node !== document.body && depth < 9; depth += 1) {
    // A card never spans page/dialog chrome or a detail listing (which owns
    // the page h1). Without this stop, hiding one card in a sparse grid
    // (e.g. two related items on a detail page) could hide the whole page.
    if (node.matches('[role="main"], [role="dialog"], main') || node.querySelector("h1")) {
      break;
    }

    const text = extractCleanText(node).visibleText;
    const anchors = Array.from(node.querySelectorAll<HTMLAnchorElement>(ITEM_ANCHOR_SELECTOR));
    const distinctListings = new Set(
      anchors.map((itemAnchor) => extractItemId(itemAnchor.getAttribute("href") ?? "") ?? itemAnchor.getAttribute("href"))
    );
    const rect = node.getBoundingClientRect();
    // Exactly ONE distinct listing inside: duplicate anchors to the same item
    // (image + title) are fine, a sibling listing means we've climbed too far.
    const isPlausibleCard =
      anchors.length >= 1 &&
      distinctListings.size === 1 &&
      text.length >= 8 &&
      text.length <= 1200 &&
      rect.width >= 90 &&
      rect.height >= 70;

    if (isPlausibleCard) {
      candidate = node;
    }

    if (distinctListings.size > 1 || anchors.length > 3 || text.length > 1400) {
      break;
    }

    node = node.parentElement;
  }

  return candidate;
}

function applyScore(card: HTMLElement, result: ScoreResult, snapshot: ListingSnapshot): void {
  rememberOriginalStyles(card);
  const signature = scoreSignature(result, snapshot);
  const signatureChanged = card.dataset.slopblockSignature !== signature;

  if (signatureChanged) {
    clearCardState(card);
  }

  card.setAttribute(PROCESSED_ATTR, result.action);
  card.dataset.slopblockScore = String(result.score);
  card.dataset.slopblockSignature = signature;

  applyVisualState(card, result);

  if (result.action === "allow") {
    removeBadge(card);
    return;
  }

  countResult(result.action);

  if (result.action === "hide" && !showHidden) {
    removeBadge(card);
    return;
  }

  if (settings?.showReasons && (signatureChanged || !card.querySelector(":scope > .slopblock-badge"))) {
    removeBadge(card);
    addBadge(card, result, snapshot);
  } else if (!settings?.showReasons) {
    removeBadge(card);
  }
}

function rememberOriginalStyles(card: HTMLElement): void {
  if (!card.hasAttribute(ORIGINAL_DISPLAY_ATTR)) {
    card.setAttribute(ORIGINAL_DISPLAY_ATTR, card.style.display);
  }

  if (!card.hasAttribute(ORIGINAL_POSITION_ATTR)) {
    card.setAttribute(ORIGINAL_POSITION_ATTR, card.style.position);
  }
}

function restoreDisplay(card: HTMLElement): void {
  card.style.display = card.getAttribute(ORIGINAL_DISPLAY_ATTR) ?? "";
}

function clearCardState(card: HTMLElement): void {
  restoreDisplay(card);
  card.classList.remove("slopblock-dim", "slopblock-label", "slopblock-hidden-preview");
  removeBadge(card);
}

function applyVisualState(card: HTMLElement, result: ScoreResult): void {
  restoreDisplay(card);
  card.classList.remove("slopblock-dim", "slopblock-label", "slopblock-hidden-preview");

  if (result.action !== "allow" && !isSafeToAlter(card)) {
    return;
  }

  if (result.action === "hide") {
    if (showHidden) {
      ensurePositioned(card);
      card.classList.add("slopblock-hidden-preview");
    } else {
      card.style.display = "none";
    }
    return;
  }

  if (result.action === "dim") {
    ensurePositioned(card);
    card.classList.add("slopblock-dim");
    return;
  }

  if (result.action === "label") {
    card.classList.add("slopblock-label");
  }
}

/** The fade overlay and badge are absolutely positioned inside the card. */
function ensurePositioned(card: HTMLElement): void {
  const originalPosition = card.getAttribute(ORIGINAL_POSITION_ATTR) ?? card.style.position;
  if (!originalPosition || originalPosition === "static") {
    card.style.position = "relative";
  }
}

function countResult(action: ScoreResult["action"]): void {
  if (action === "hide") {
    stats.hidden += 1;
  } else if (action === "dim") {
    stats.dimmed += 1;
  } else if (action === "label") {
    stats.labeled += 1;
  }
}

function scoreSignature(result: ScoreResult, snapshot: ListingSnapshot): string {
  const reasons = result.matches
    .filter((match) => match.weight > 0)
    .slice(0, 4)
    .map((match) => `${match.ruleId}:${match.weight}`)
    .join(",");
  const listingIdentity = snapshot.idHint ?? fingerprintText(snapshot.title || snapshot.visibleText).slice(0, 80);

  return [listingIdentity, result.action, result.score, showHidden, settings?.showReasons === true, reasons].join("|");
}

function addBadge(card: HTMLElement, result: ScoreResult, snapshot: ListingSnapshot): void {
  ensurePositioned(card);

  const badge = document.createElement("div");
  badge.className = "slopblock-badge";
  const positiveMatches = result.matches.filter((match) => match.weight > 0);
  const topMatch = positiveMatches[0];
  const reasons = positiveMatches
    .slice(0, 3)
    .map((match) => match.reason)
    .join(" + ");
  const summary = document.createElement("div");
  summary.className = "slopblock-badge-summary";
  summary.textContent = `SlopBlock: ${reasons || result.action}`;
  badge.title = `Score ${result.score} · ${positiveMatches.map((match) => match.ruleId).join(", ")}`;
  badge.append(summary);

  const topRuleId = controlRuleIdForMatch(topMatch?.ruleId);
  const titleAllowTerm = allowTermFromTitle(snapshot.title);
  if (topRuleId || snapshot.idHint || titleAllowTerm) {
    const actions = document.createElement("div");
    actions.className = "slopblock-badge-actions";

    if (snapshot.idHint || titleAllowTerm) {
      const allowButton = document.createElement("button");
      allowButton.type = "button";
      allowButton.textContent = "Show anyway";
      allowButton.title = snapshot.idHint
        ? "Always show this exact listing"
        : `Always show listings titled "${titleAllowTerm}"`;
      allowButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void allowListing(snapshot);
      });
      actions.append(allowButton);
    }

    if (topRuleId && topMatch) {
      const disableRuleButton = document.createElement("button");
      disableRuleButton.type = "button";
      disableRuleButton.textContent = "Turn off this rule";
      disableRuleButton.title = `Stop filtering for "${topMatch.reason}" everywhere (${topRuleId})`;
      disableRuleButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void disableRule(topRuleId);
      });
      actions.append(disableRuleButton);
    }

    appendLensButton(actions, snapshot);

    badge.append(actions);
  }

  card.prepend(badge);
}

/**
 * User-initiated reverse image search: opens Google Lens with the listing
 * photo URL in a new tab. Nothing happens unless the user clicks — SlopBlock
 * itself never sends anything to third parties.
 */
function appendLensButton(actions: HTMLElement, snapshot: ListingSnapshot): void {
  const imageUrl = snapshot.imageUrl;
  if (!imageUrl) {
    return;
  }

  const lensButton = document.createElement("button");
  lensButton.type = "button";
  lensButton.dataset.variant = "quiet";
  lensButton.dataset.slopblockLens = "true";
  lensButton.textContent = "Find photo online";
  lensButton.title = "Reverse-search this listing's photo with Google Lens (opens a new tab; only happens when you click)";
  lensButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`, "_blank", "noopener");
  });
  actions.append(lensButton);
}

function removeBadge(card: HTMLElement): void {
  card.querySelectorAll(":scope > .slopblock-badge").forEach((badge) => badge.remove());
  const originalPosition = card.getAttribute(ORIGINAL_POSITION_ATTR);
  const stillNeedsPosition =
    card.classList.contains("slopblock-dim") || card.classList.contains("slopblock-hidden-preview");
  if (originalPosition !== null && !stillNeedsPosition) {
    card.style.position = originalPosition;
  }
}

async function allowListing(snapshot: ListingSnapshot): Promise<void> {
  if (!settings) {
    return;
  }

  const itemId = snapshot.idHint;
  const titleTerm = allowTermFromTitle(snapshot.title);
  if (!itemId && !titleTerm) {
    return;
  }

  settings = normalizeSettings({
    ...settings,
    customAllowItemIds: itemId ? [...settings.customAllowItemIds, itemId] : settings.customAllowItemIds,
    customAllowTerms: itemId ? settings.customAllowTerms : [...settings.customAllowTerms, titleTerm]
  });
  await saveSettings(settings);
  scheduleScan(0);
}

async function disableRule(ruleId: string): Promise<void> {
  if (!settings) {
    return;
  }

  settings = normalizeSettings({
    ...settings,
    disabledRuleIds: [...settings.disabledRuleIds, ruleId]
  });
  await saveSettings(settings);
  scheduleScan(0);
}

function createToolbar(): void {
  if (document.querySelector(".slopblock-toolbar")) {
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "slopblock-toolbar";
  toolbar.dataset.collapsed = "true";
  toolbar.innerHTML = `
    <button type="button" class="slopblock-pill" data-slopblock-action="toggle-panel" title="SlopBlock — click for details">
      <span class="slopblock-pill-mark"></span>
      <span class="slopblock-pill-text"><span data-slopblock-stat="filtered">0</span> filtered</span>
    </button>
    <div class="slopblock-panel">
      <div class="slopblock-toolbar-row"><span>Scanned</span><span data-slopblock-stat="scanned">0</span></div>
      <div class="slopblock-toolbar-row"><span>Hidden</span><span data-slopblock-stat="hidden">0</span></div>
      <div class="slopblock-toolbar-row"><span>Dimmed</span><span data-slopblock-stat="dimmed">0</span></div>
      <div class="slopblock-toolbar-row"><span>Labeled</span><span data-slopblock-stat="labeled">0</span></div>
      <div class="slopblock-toolbar-actions">
        <button type="button" data-slopblock-action="toggle-hidden">Show hidden</button>
        <button type="button" data-slopblock-action="rescan" data-variant="quiet">Rescan</button>
      </div>
      <div class="slopblock-toolbar-hint">Details &amp; controls in the SlopBlock popup</div>
    </div>
  `;

  toolbar.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-slopblock-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.slopblockAction;
    if (action === "toggle-panel") {
      toolbar.dataset.collapsed = toolbar.dataset.collapsed === "true" ? "false" : "true";
    }

    if (action === "toggle-hidden") {
      showHidden = !showHidden;
      button.textContent = showHidden ? "Hide again" : "Show hidden";
      scheduleScan(0);
    }

    if (action === "rescan") {
      scheduleScan(0);
    }
  });

  document.documentElement.append(toolbar);
}

function updateToolbar(): void {
  const toolbar = document.querySelector<HTMLElement>(".slopblock-toolbar");
  if (!toolbar) {
    return;
  }

  // Nothing scanned (e.g. item detail pages) -> keep the pill out of the way.
  toolbar.style.display = stats.scanned > 0 ? "" : "none";

  const filtered = stats.hidden + stats.dimmed + stats.labeled;
  const entries: Record<string, number> = { ...stats, filtered };
  for (const [key, value] of Object.entries(entries)) {
    const node = toolbar.querySelector(`[data-slopblock-stat="${key}"]`);
    if (node) {
      node.textContent = String(value);
    }
  }

  toolbar.dataset.active = filtered > 0 ? "true" : "false";

  // Deep-scan progress is monotonic (done / requested), so it fills forward
  // instead of bouncing with the live queue depth.
  const deepStats = settings?.deepScan ? deepScanner.stats() : null;
  const pending = deepStats?.pending ?? 0;
  toolbar.dataset.scanning = pending > 0 ? "true" : "false";
  const pillText = toolbar.querySelector<HTMLElement>(".slopblock-pill-text");
  if (pillText) {
    pillText.textContent =
      deepStats && pending > 0
        ? `${filtered} filtered · checking ${deepStats.completed}/${deepStats.requested}`
        : `${filtered} filtered`;
  }

  const toggleButton = toolbar.querySelector<HTMLButtonElement>('[data-slopblock-action="toggle-hidden"]');
  if (toggleButton) {
    toggleButton.textContent = showHidden ? "Hide again" : "Show hidden";
  }

  // Keep re-scanning while fetches are in flight so their verdicts land even
  // if the user stops scrolling and the page stops mutating. During a backoff
  // window the queue is idle, so let the fetch loop resume on its own.
  if (pending > 0 && (deepStats?.backoffMsRemaining ?? 0) === 0) {
    scheduleDeepScanPoll();
  }
}

let deepScanPollTimer: number | undefined;

function scheduleDeepScanPoll(): void {
  if (deepScanPollTimer !== undefined) {
    return;
  }

  deepScanPollTimer = window.setTimeout(() => {
    deepScanPollTimer = undefined;
    scheduleScan(0);
  }, 700);
}

function isSlopBlockMutation(mutation: MutationRecord): boolean {
  if (isSlopBlockNode(mutation.target)) {
    return true;
  }

  const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
  return changedNodes.length > 0 && changedNodes.every(isSlopBlockNode);
}

function isSlopBlockNode(node: Node): boolean {
  if (node instanceof Element) {
    return node.matches(SLOPBLOCK_SELECTOR) || node.closest(SLOPBLOCK_SELECTOR) !== null;
  }

  return node.parentElement?.closest(SLOPBLOCK_SELECTOR) !== null;
}
