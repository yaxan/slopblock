export type RuleCategoryId =
  | "known-vendor"
  | "dropship-phrasing"
  | "store-business"
  | "bait-pricing"
  | "external-redirect"
  | "keyword-stuffing"
  | "not-for-sale"
  | "service-spam"
  | "scam-pressure"
  | "counterfeit"
  | "duplicate-flood"
  | "catalog-copy"
  | "missing-human"
  | "gem-positive"
  | "custom-rules";

export type Confidence = "low" | "medium" | "high";
export type ListingField = "title" | "priceText" | "locationText" | "sellerText" | "visibleText" | "allText";
export type FilterAction = "allow" | "label" | "dim" | "hide";
export type Aggressiveness = "relaxed" | "balanced" | "strict";
export type FilterMode = "hide" | "dim" | "label";

export type RuleCategory = {
  id: RuleCategoryId;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export type ListingSnapshot = {
  idHint?: string;
  url?: string;
  title: string;
  priceText: string;
  locationText: string;
  sellerText?: string;
  visibleText: string;
  textLines?: string[];
  /** Card/hero photo URL, used for local-only image analysis. */
  imageUrl?: string;
  /** Perceptual hash of the photo, when analyzed (local dHash). */
  imageHash?: string;
};

export type DuplicateInfo = {
  /** Distinct listings (unique item IDs/URLs) sharing this listing's flood identity. */
  groupSize: number;
  /** 0 = first occurrence in the scan (always kept visible), 1+ = collapsible repeat. */
  ordinal: number;
  tier: "exact" | "bait" | "mass" | "image" | null;
};

export type ScoreContext = {
  duplicate?: DuplicateInfo;
  isSellerProfileContext?: boolean;
  /** Local image analysis found a retailer-catalog-style photo. */
  imageCatalogStyle?: boolean;
};

export type RuleDefinition = {
  id: string;
  category: RuleCategoryId;
  reason: string;
  weight: number;
  confidence: Confidence;
  fields: ListingField[];
  pattern: RegExp;
};

export type RuleControlDefinition = Pick<RuleDefinition, "id" | "category" | "reason" | "weight" | "confidence"> & {
  description: string;
  patternSummary?: string;
};

export type RuleMatch = {
  ruleId: string;
  category: RuleCategoryId;
  weight: number;
  reason: string;
  confidence: Confidence;
  sample?: string;
};

export type ScoreResult = {
  score: number;
  action: FilterAction;
  matches: RuleMatch[];
};

export type SlopBlockSettings = {
  enabled: boolean;
  aggressiveness: Aggressiveness;
  filterMode: FilterMode;
  showReasons: boolean;
  /** Background-fetch listing pages to score descriptions from the feed. */
  deepScan: boolean;
  /** Quick-filter toggle ids set to "Hide all" (any pattern match hides). */
  quickToggleBlockAll: string[];
  /** Bumped when shipped defaults change; lets old saves adopt new defaults once. */
  defaultsVersion: number;
  /** Analyze listing photos on-device (catalog-style + duplicate detection). */
  imageChecks: boolean;
  enabledCategories: Record<RuleCategoryId, boolean>;
  disabledRuleIds: string[];
  customBlockTerms: string[];
  customVendorTerms: string[];
  customAllowTerms: string[];
  customAllowItemIds: string[];
};

export type ContentStats = {
  scanned: number;
  hidden: number;
  dimmed: number;
  labeled: number;
};

export type ContentDecision = {
  title: string;
  priceText: string;
  idHint?: string;
  url?: string;
  action: FilterAction;
  score: number;
  visibleTextExcerpt: string;
  matches: RuleMatch[];
};

export type ContentMessage =
  | { type: "SLOPBLOCK_RESCAN" }
  | { type: "SLOPBLOCK_SET_SHOW_HIDDEN"; showHidden: boolean }
  | { type: "SLOPBLOCK_GET_STATS" }
  | { type: "SLOPBLOCK_EXPORT_DECISIONS" };
