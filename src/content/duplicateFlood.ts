import { fingerprintText, normalizeText } from "../common/scoring";
import type { DuplicateInfo, ListingSnapshot } from "../common/types";

/**
 * Duplicate-flood analysis.
 *
 * Design goals, in order:
 * 1. Never hide every copy of anything: the first occurrence of a repeated
 *    listing is always kept visible, only repeats beyond it are collapsible.
 * 2. Same title alone is NOT a flood. Search results legitimately contain many
 *    distinct sellers using identical titles ("iPhone 12 128GB"), so repeats
 *    only collapse when the price also matches (or every copy is bait-priced),
 *    which is how real repost floods actually look.
 * 3. Generic short titles ("free couch") never collapse; a flood fingerprint
 *    needs at least three distinctive words.
 *
 * Tiers (all require distinct Marketplace item IDs/URLs — cloned DOM nodes of
 * the same listing count once):
 * - exact: same title + same price + same location, 4+ distinct listings.
 * - bait:  same title + same location, 4+ distinct listings all priced at
 *          $5 or less (or Free) — price-rotating bait floods.
 * - mass:  same title + same price across any locations, 6+ distinct listings
 *          — location-rotating repost floods.
 */

const EXACT_TIER_MIN = 4;
const BAIT_TIER_MIN = 4;
const MASS_TIER_MIN = 6;
const MIN_DISTINCTIVE_WORDS = 3;

const GENERIC_FINGERPRINT_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "free",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "used",
  "with"
]);

type ListingOccurrence = {
  snapshotIndexes: number[];
  titleFingerprint: string;
  price: string;
  location: string;
  isBaitPrice: boolean;
};

export function analyzeDuplicateFlood(snapshots: ListingSnapshot[], baseUrl = "https://www.facebook.com/"): DuplicateInfo[] {
  const infos: DuplicateInfo[] = snapshots.map(() => ({ groupSize: 1, ordinal: 0, tier: null }));
  const occurrencesByIdentity = new Map<string, ListingOccurrence>();
  const identityOrder: string[] = [];

  for (const [index, snapshot] of snapshots.entries()) {
    const titleFingerprint = duplicateFloodFingerprint(snapshot);
    if (!titleFingerprint) {
      continue;
    }

    const identity = listingIdentity(snapshot, index, baseUrl);
    const existing = occurrencesByIdentity.get(identity);
    if (existing) {
      existing.snapshotIndexes.push(index);
      continue;
    }

    occurrencesByIdentity.set(identity, {
      snapshotIndexes: [index],
      titleFingerprint,
      price: normalizePrice(snapshot.priceText),
      location: normalizeText(snapshot.locationText).toLowerCase(),
      isBaitPrice: isBaitPrice(snapshot.priceText)
    });
    identityOrder.push(identity);
  }

  const byTitle = new Map<string, ListingOccurrence[]>();
  for (const identity of identityOrder) {
    const occurrence = occurrencesByIdentity.get(identity);
    if (!occurrence) {
      continue;
    }

    const group = byTitle.get(occurrence.titleFingerprint) ?? [];
    group.push(occurrence);
    byTitle.set(occurrence.titleFingerprint, group);
  }

  for (const group of byTitle.values()) {
    if (group.length < Math.min(EXACT_TIER_MIN, BAIT_TIER_MIN, MASS_TIER_MIN)) {
      continue;
    }

    applyTier(
      infos,
      group.filter((occurrence) => occurrence.price !== ""),
      (occurrence) => `${occurrence.price}|${occurrence.location}`,
      EXACT_TIER_MIN,
      "exact"
    );
    applyTier(
      infos,
      group.filter((occurrence) => occurrence.isBaitPrice),
      (occurrence) => occurrence.location,
      BAIT_TIER_MIN,
      "bait"
    );
    applyTier(
      infos,
      group.filter((occurrence) => occurrence.price !== ""),
      (occurrence) => occurrence.price,
      MASS_TIER_MIN,
      "mass"
    );
  }

  return infos;
}

function applyTier(
  infos: DuplicateInfo[],
  occurrences: ListingOccurrence[],
  keyFor: (occurrence: ListingOccurrence) => string,
  minGroupSize: number,
  tier: NonNullable<DuplicateInfo["tier"]>
): void {
  const subgroups = new Map<string, ListingOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = keyFor(occurrence);
    const subgroup = subgroups.get(key) ?? [];
    subgroup.push(occurrence);
    subgroups.set(key, subgroup);
  }

  for (const subgroup of subgroups.values()) {
    if (subgroup.length < minGroupSize) {
      continue;
    }

    for (const [ordinal, occurrence] of subgroup.entries()) {
      for (const snapshotIndex of occurrence.snapshotIndexes) {
        const info = infos[snapshotIndex];
        if (!info) {
          continue;
        }

        // Strongest applicable tier wins; earlier ordinal wins within a tie so
        // the first occurrence is never marked collapsible by a later tier.
        if (info.tier === null || subgroup.length > info.groupSize) {
          info.groupSize = subgroup.length;
          info.tier = tier;
          info.ordinal = ordinal;
        } else if (ordinal < info.ordinal) {
          info.ordinal = ordinal;
        }
      }
    }
  }
}

export function duplicateFloodFingerprint(snapshot: ListingSnapshot): string {
  const fingerprint = fingerprintText(snapshot.title || snapshot.visibleText);
  const distinctiveWords = fingerprint
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !GENERIC_FINGERPRINT_WORDS.has(word));

  if (fingerprint.length < 12 || distinctiveWords.length < MIN_DISTINCTIVE_WORDS) {
    return "";
  }

  return fingerprint;
}

function normalizePrice(priceText: string): string {
  const text = normalizeText(priceText).toLowerCase();
  if (!text) {
    return "";
  }

  if (/\bfree\b/.test(text)) {
    return "free";
  }

  const amount = text.match(/(\d[\d,]*(?:\.\d{1,2})?)/)?.[1];
  return amount ? amount.replace(/,/g, "") : text;
}

function isBaitPrice(priceText: string): boolean {
  const normalized = normalizePrice(priceText);
  if (normalized === "free") {
    return true;
  }

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) && amount <= 5;
}

function listingIdentity(snapshot: ListingSnapshot, index: number, baseUrl: string): string {
  if (snapshot.idHint) {
    return `item:${snapshot.idHint}`;
  }

  const itemUrl = normalizedMarketplaceItemUrl(snapshot.url ?? "", baseUrl);
  if (itemUrl) {
    return `url:${itemUrl}`;
  }

  const fallback = [
    fingerprintText(snapshot.title),
    normalizeText(snapshot.priceText),
    normalizeText(snapshot.locationText),
    fingerprintText(snapshot.visibleText).slice(0, 120)
  ]
    .filter(Boolean)
    .join("|");

  return fallback ? `text:${fallback}` : `unknown:${index}`;
}

function normalizedMarketplaceItemUrl(rawUrl: string, baseUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    const itemMatch = parsed.pathname.match(/\/marketplace\/(?:shops\/)?item\/([^/]+)/);
    return itemMatch?.[0];
  } catch {
    return undefined;
  }
}
