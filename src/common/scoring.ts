import { DEFAULT_RULES } from "./defaultRules";
import { QUICK_RULE_TOGGLES } from "./ruleToggles";
import { DEFAULT_SETTINGS, categoryEnabled, normalizeSettings, ruleEnabled } from "./settings";
import type {
  FilterAction,
  ListingField,
  ListingSnapshot,
  RuleMatch,
  ScoreContext,
  ScoreResult,
  SlopBlockSettings
} from "./types";

const THRESHOLDS = {
  relaxed: { label: 28, dim: 48, hide: 86 },
  balanced: { label: 20, dim: 34, hide: 72 },
  strict: { label: 18, dim: 26, hide: 58 }
} as const;

// Human condition context. Deliberately does NOT include the bare word
// "condition": Marketplace detail pages render a structured "Condition"
// metadata row on every listing, so the bare word would suppress the
// commercial heuristics site-wide. Only qualified forms count as human.
const CONDITION_WORDS =
  /\b(?:used|owned|gently\s+used|pre[-\s]?owned|like\s+new|(?:good|great|excellent|fair|poor|mint|decent|rough|working)\s+condition|condition\s*:?\s*(?:is\s+)?(?:good|great|excellent|fair|poor|decent|used|like\s+new)|no\s+stains?|as[-\s]?is|needs\s+tlc|scratch|scratches|dent|dents|wear|worn|scuffs?|works|broken|repair|pickup|pick\s+up|smoke[-\s]?free|pet[-\s]?free|measurements?|dimensions?|moving|estate|garage\s+sale|private\s+sale|one\s+owner|clean\s+(?:title|carfax)|no\s+accidents?|well[-\s]maintained|selling\s+because)\b/i;

// "Condition New" is the structured-metadata form of "brand new" and is
// retail context, not human context ("Condition Like New" is excluded).
const RETAIL_STYLE_WORDS =
  /\b(?:brand\s+new|new\s+in\s+box|sealed|inventory|stock|order|wholesale|warehouse|showroom|tax|financing|condition\s*:?\s*(?:brand\s+)?new\b)/i;

const VENDOR_BRANDS =
  /\b(?:amazon|temu|aliexpress|alibaba|wish|shein|wayfair|walmart|target|ikea|costco|home\s*depot|lowe'?s|overstock|dhgate|ashley|west\s+elm|pottery\s+barn|crate\s*&?\s*barrel|cb2|restoration\s+hardware|rh)\b/gi;

const CATEGORY_NOUNS =
  /\b(?:sofa|couch|sectional|loveseat|recliner|chair|chairs|table|desk|dresser|nightstand|bookshelf|mattress|bed|bedroom|dining|wardrobe|cabinet|hutch|bench|ottoman|futon|daybed|iphone|samsung|galaxy|pixel|macbook|laptop|tablet|ipad|monitor|tv|television|console|playstation|xbox|nintendo|stroller|crib|bassinet|treadmill|elliptical|dumbbells?|weights|bike|bicycle|scooter|drill|saw|mower|trimmer|generator|washer|dryer|fridge|refrigerator|freezer|stove|oven|microwave|dishwasher)\b/g;

const LUXURY_BRANDS =
  /\b(?:louis\s+vuitton|lv|gucci|chanel|prada|dior|herm[eè]s|rolex|cartier|balenciaga|ysl|saint\s+laurent|goyard|bottega|celine|fendi)\b/gi;

const HYPE_BRANDS = /\b(?:air\s+jordan|jordan\s+\d|nike\s+dunk|yeezy|moncler|canada\s+goose|off[-\s]white|supreme)\b/gi;

const LUXURY_ITEM_WORDS =
  /\b(?:bag|bags|purse|wallet|watch|watches|sneaker|sneakers|shoes|sunglasses|belt|jacket|coat|hoodie)\b/i;

const STRONG_AUTHENTICITY_WORDS =
  /\b(?:authenticated\s+by|certificate\s+of\s+authenticity|receipt\s+included|original\s+receipt|proof\s+of\s+purchase|comes\s+with\s+(?:box\s+and\s+receipt|original\s+receipt|receipt|papers)|box\s+and\s+papers|full\s+set)\b/i;

const AUTHENTICITY_DODGE_WORDS =
  /\b(?:authenticity\s+(?:not\s+guaranteed|unknown)|looks\s+(?:real|authentic)|can'?t\s+(?:verify|prove)\s+(?:it'?s\s+)?(?:real|authentic)|i\s+don'?t\s+know\s+if\s+(?:it'?s\s+)?real|no\s+questions\s+about\s+authenticity)\b/i;

export function scoreListing(
  listing: ListingSnapshot,
  rawSettings: Partial<SlopBlockSettings> = DEFAULT_SETTINGS,
  context: ScoreContext = {}
): ScoreResult {
  const settings = normalizeSettings(rawSettings);
  if (!settings.enabled) {
    return { score: 0, action: "allow", matches: [] };
  }

  const matches: RuleMatch[] = [];
  // Build the searchable text once. The rule loop and helpers all read the
  // same field combinations (almost always "allText"), so without this the
  // full listing string was re-joined and re-normalized ~70× per card.
  const text = buildTextIndex(listing);

  for (const rule of DEFAULT_RULES) {
    if (!isRuleActive(settings, rule.category, rule.id)) {
      continue;
    }

    const haystack = text.forFields(rule.fields);
    const sample = firstMatch(haystack, rule.pattern);
    if (!sample) {
      continue;
    }

    matches.push({
      ruleId: rule.id,
      category: rule.category,
      weight: rule.weight,
      reason: rule.reason,
      confidence: rule.confidence,
      sample
    });
  }

  addBaitPricingMatch(listing, text, settings, matches);
  addKeywordStuffingMatch(listing, text, settings, matches);
  addCounterfeitRiskMatch(listing, text, settings, matches);
  addDuplicateFloodMatch(context, settings, matches);
  addSponsoredAdMatch(listing, settings, matches);
  addMissingHumanContextMatch(text, settings, matches);
  addCatalogPhotoMatch(context, settings, matches);
  addVendorRetailComboMatch(text, settings, matches);
  addVendorBlockAllMatches(text, settings, matches);
  addCustomRuleMatches(text, settings, matches);

  const allowlistHit = addAllowlistMatch(listing, text, settings, matches);
  const adjustedMatches = adjustMatchesForContext(dropGemsForDefinitiveSignals(matches), context);
  const rawScore = adjustedMatches.reduce((sum, match) => sum + match.weight, 0);
  const cappedScore = allowlistHit ? Math.min(rawScore, THRESHOLDS[settings.aggressiveness].label - 1) : rawScore;
  const score = Math.max(0, Math.round(cappedScore));

  return {
    score,
    action: actionForScore(score, settings),
    matches: adjustedMatches.sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
  };
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Per-scoring-call text cache. `all`/`allLower` are the whole-listing string
 * (by far the most-read field set); `forFields` memoizes any other
 * combination the rules ask for. Built once per scoreListing call so the
 * ~70 rule/helper reads don't each rebuild and re-normalize the string.
 */
type TextIndex = {
  all: string;
  allLower: string;
  forFields(fields: ListingField[]): string;
};

function buildTextIndex(listing: ListingSnapshot): TextIndex {
  const cache = new Map<string, string>();
  const all = fieldText(listing, ["allText"]);
  cache.set("allText", all);

  return {
    all,
    allLower: all.toLowerCase(),
    forFields(fields: ListingField[]): string {
      const key = fields.join(",");
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const value = fieldText(listing, fields);
      cache.set(key, value);
      return value;
    }
  };
}

export function fingerprintText(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/\$[\d,.]+/g, "")
    .replace(/\b(?:brand\s+new|new|sealed|available|delivery|pickup|firm|obo|must\s+go)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function addBaitPricingMatch(
  listing: ListingSnapshot,
  text: TextIndex,
  settings: SlopBlockSettings,
  matches: RuleMatch[]
): void {
  if (!isRuleActive(settings, "bait-pricing", "bait-price-dynamic")) {
    return;
  }

  const displayedPrice = parseDisplayedPrice(listing.priceText);
  const allText = text.all;
  const amounts = parseDollarAmounts(allText);
  // "each", "starting at", and similar wording is everyday legit phrasing
  // ("$15 each or $50 for all") and intentionally does NOT count as bait.
  const hasPriceDisclosure =
    /\b(?:actual|real|regular|full)\s+price\b/i.test(allText) ||
    /\b(?:prices?\s+in\s+(?:description|desc)|read\s+(?:the\s+)?description\s+(?:for\s+)?price|description\s+has\s+(?:the\s+)?price|deposit|down\s+payment|per\s+month|monthly|not\s+(?:the\s+)?actual\s+price|message\s+(?:me\s+)?(?:for\s+)?price|dm\s+(?:me\s+)?(?:for\s+)?price|ask\s+for\s+price|price\s+varies|listed\s+(?:at\s+\$?\d+\s+)?for\s+(?:visibility|the\s+algorithm|search))\b/i.test(
      allText
    );

  if (displayedPrice === null) {
    if (/\b(?:free|contact\s+for\s+price|message\s+for\s+price|ask\s+for\s+price)\b/i.test(listing.priceText)) {
      matches.push({
        ruleId: "bait-price-hidden",
        category: "bait-pricing",
        weight: 40,
        reason: "hidden/contact price",
        confidence: "high",
        sample: listing.priceText
      });
    }
    return;
  }

  // $12/$999/$9,999 are real everyday prices; only placeholder-looking numbers count.
  const suspiciousNumber = displayedPrice <= 5 || [123, 1234, 12345, 1111, 9999].includes(Math.round(displayedPrice));
  const higherAmount = amounts.some((amount) => amount > Math.max(25, displayedPrice * 2) && amount !== displayedPrice);

  if (suspiciousNumber && (hasPriceDisclosure || higherAmount)) {
    matches.push({
      ruleId: "bait-price-gamed",
      category: "bait-pricing",
      weight: higherAmount ? 74 : 38,
      reason: "bait/display price mismatch",
      confidence: higherAmount ? "high" : "medium",
      sample: listing.priceText
    });
    return;
  }

  // Garage/estate/moving sales legitimately use a placeholder price with
  // "message me for prices" for multi-item posts.
  const isMultiItemHumanSale = /\b(?:estate\s+sale|moving\s+sale|garage\s+sale|yard\s+sale|downsizing)\b/i.test(allText);

  if (hasPriceDisclosure && displayedPrice < 50 && !isMultiItemHumanSale) {
    matches.push({
      ruleId: "bait-price-disclosure",
      category: "bait-pricing",
      weight: 30,
      reason: "price disclosed elsewhere",
      confidence: "medium",
      sample: listing.priceText
    });
  }
}

function addKeywordStuffingMatch(
  listing: ListingSnapshot,
  text: TextIndex,
  settings: SlopBlockSettings,
  matches: RuleMatch[]
): void {
  if (!isRuleActive(settings, "keyword-stuffing", "keyword-stuffing-detected")) {
    return;
  }

  const title = listing.title || listing.visibleText;
  const allText = text.allLower;
  const vendorMentions = new Set(Array.from(allText.matchAll(VENDOR_BRANDS), (match) => match[0].toLowerCase()));
  const words = normalizeText(title.toLowerCase()).split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const repetitionRatio = words.length >= 12 ? 1 - uniqueWords.size / words.length : 0;

  // Long comma lists are normal in legit moving/estate/lot bundle titles.
  const separatorCount = (title.match(/[,|/•]/g) ?? []).length;
  const isHumanBundle = /\b(?:moving|garage|estate|yard)\s+sale\b|\bdownsizing\b|\blot\b|\bbundle\b/i.test(allText);
  const separatorStuffing = separatorCount >= 9 && words.length >= 10 && !isHumanBundle;

  // SEO titles that pile up unrelated category nouns without punctuation
  // ("sofa couch sectional loveseat recliner ... queen king dresser").
  const categoryNouns = new Set(Array.from(title.toLowerCase().matchAll(CATEGORY_NOUNS), (match) => match[0]));
  const categoryPileup = categoryNouns.size >= 5 && words.length >= 8 && !isHumanBundle;

  if (vendorMentions.size >= 4 || separatorStuffing || categoryPileup || repetitionRatio > 0.38) {
    const blatant = vendorMentions.size >= 4 || categoryNouns.size >= 6;
    matches.push({
      ruleId: "keyword-stuffing-detected",
      category: "keyword-stuffing",
      weight: blatant ? 36 : 26,
      reason: "keyword stuffing",
      confidence: blatant ? "high" : "medium",
      sample: title.slice(0, 90)
    });
  }
}

function addCounterfeitRiskMatch(
  listing: ListingSnapshot,
  text: TextIndex,
  settings: SlopBlockSettings,
  matches: RuleMatch[]
): void {
  if (!isRuleActive(settings, "counterfeit", "counterfeit-luxury-underpriced")) {
    return;
  }

  const allText = text.all;
  const luxuryBrands = new Set(Array.from(allText.matchAll(LUXURY_BRANDS), (match) => match[0].toLowerCase()));
  const hypeBrands = new Set(Array.from(allText.matchAll(HYPE_BRANDS), (match) => match[0].toLowerCase()));
  const brandCount = luxuryBrands.size + hypeBrands.size;
  if (brandCount === 0) {
    return;
  }

  // Dodging authenticity questions only means something on branded goods.
  if (AUTHENTICITY_DODGE_WORDS.test(allText)) {
    matches.push({
      ruleId: "counterfeit-authenticity-dodge",
      category: "counterfeit",
      weight: 30,
      reason: "authenticity dodge on branded item",
      confidence: "medium",
      sample: allText.match(AUTHENTICITY_DODGE_WORDS)?.[0] ?? ""
    });
  }

  if (STRONG_AUTHENTICITY_WORDS.test(allText)) {
    return;
  }

  const displayedPrice = parseDisplayedPrice(listing.priceText);
  const hasLuxuryItem = LUXURY_ITEM_WORDS.test(allText);
  const brandStack = brandCount >= 3;
  // Cheap USED hype gear (worn Jordans for $60) is everywhere and legit;
  // "brand new" cheap hype gear or cheap luxury-house goods is the fake tell.
  const looksNew = /\b(?:brand\s+new|new\s+in\s+box|deadstock|ds\b|never\s+worn|sealed)\b/i.test(allText);
  const suspiciousLuxuryPrice =
    luxuryBrands.size > 0 && displayedPrice !== null && displayedPrice > 0 && displayedPrice < (brandStack ? 300 : 120);
  const suspiciousHypePrice =
    hypeBrands.size > 0 && looksNew && displayedPrice !== null && displayedPrice > 0 && displayedPrice < 130;

  if ((hasLuxuryItem && (suspiciousLuxuryPrice || suspiciousHypePrice)) || brandStack) {
    matches.push({
      ruleId: "counterfeit-luxury-underpriced",
      category: "counterfeit",
      weight: brandStack ? 34 : 28,
      reason: brandStack ? "stacked luxury brands" : "suspicious price for branded item",
      confidence: "medium",
      sample: Array.from(new Set([...luxuryBrands, ...hypeBrands])).slice(0, 4).join(", ")
    });
  }
}

function addDuplicateFloodMatch(
  context: ScoreContext,
  settings: SlopBlockSettings,
  matches: RuleMatch[]
): void {
  if (!isRuleActive(settings, "duplicate-flood", "duplicate-flood-dynamic")) {
    return;
  }

  const duplicate = context.duplicate;
  if (!duplicate?.tier || duplicate.ordinal === 0) {
    // The first occurrence of a repeated listing always stays visible.
    return;
  }

  matches.push({
    ruleId: "duplicate-flood-repeat",
    category: "duplicate-flood",
    weight: 80,
    reason: `repeat of a visible listing (${duplicate.ordinal + 1} of ${duplicate.groupSize} identical)`,
    confidence: "high"
  });
}

/**
 * Retailer catalog photos (product on pure white) are how Amazon/Wayfair
 * copy-pastes look. Context-band weight: it never acts alone — real people
 * occasionally reuse the official photo for a genuinely used item — but it
 * stacks with vendor/retail evidence and feeds the vendor-retail combo via
 * its catalog-copy category.
 */
function addCatalogPhotoMatch(context: ScoreContext, settings: SlopBlockSettings, matches: RuleMatch[]): void {
  if (!context.imageCatalogStyle || !isRuleActive(settings, "catalog-copy", "image-catalog-photo")) {
    return;
  }

  matches.push({
    ruleId: "image-catalog-photo",
    category: "catalog-copy",
    weight: 18,
    reason: "retailer-style stock photo",
    confidence: "medium"
  });
}

function addVendorRetailComboMatch(text: TextIndex, settings: SlopBlockSettings, matches: RuleMatch[]): void {
  if (!isRuleActive(settings, "known-vendor", "vendor-retail-combo")) {
    return;
  }

  const vendorMatch = matches.find((match) => match.category === "known-vendor" && match.weight > 0);
  if (!vendorMatch) {
    return;
  }

  const allText = text.all;
  const hasRetailContext =
    matches.some(
      (match) => (match.category === "dropship-phrasing" || match.category === "catalog-copy") && match.weight > 0
    ) || (RETAIL_STYLE_WORDS.test(allText) && !CONDITION_WORDS.test(allText));

  if (!hasRetailContext) {
    return;
  }

  const comboMatch: RuleMatch = {
    ruleId: "vendor-retail-combo",
    category: "known-vendor",
    weight: 26,
    reason: "vendor source + retail-style wording",
    confidence: "medium"
  };
  if (vendorMatch.sample !== undefined) {
    comboMatch.sample = vendorMatch.sample;
  }
  matches.push(comboMatch);
}

/**
 * A definitive signal (sold/wanted posts, scam scripts, sponsored ads, flood
 * repeats) is not rescued by condition-word gems: "good condition" does not
 * make a SOLD post buyable. User allowlists still cap the score afterwards.
 */
function dropGemsForDefinitiveSignals(matches: RuleMatch[]): RuleMatch[] {
  const hasDefinitiveSignal = matches.some((match) => match.weight >= 70);
  if (!hasDefinitiveSignal) {
    return matches;
  }

  return matches.filter((match) => match.category !== "gem-positive");
}

function adjustMatchesForContext(matches: RuleMatch[], context: ScoreContext): RuleMatch[] {
  if (!context.isSellerProfileContext) {
    return matches;
  }

  const profileNoisyRuleIds = new Set(["duplicate-flood-repeat", "store-sales-language", "missing-human-context"]);

  return matches.filter((match) => !profileNoisyRuleIds.has(match.ruleId));
}

function addSponsoredAdMatch(
  listing: ListingSnapshot,
  settings: SlopBlockSettings,
  matches: RuleMatch[]
): void {
  if (!isRuleActive(settings, "store-business", "store-sponsored-card")) {
    return;
  }

  const lines = listing.textLines?.length ? listing.textLines : listing.visibleText.split(/\r?\n/);
  const sponsoredLine = lines.map(normalizeText).find((line) => /^sponsored(?:\s*[·\-|]\s*(?:ad|paid|listing))?$/i.test(line));
  if (!sponsoredLine) {
    return;
  }

  matches.push({
    ruleId: "store-sponsored-card",
    category: "store-business",
    weight: 74,
    reason: "sponsored marketplace ad",
    confidence: "high",
    sample: sponsoredLine
  });
}

function addMissingHumanContextMatch(text: TextIndex, settings: SlopBlockSettings, matches: RuleMatch[]): void {
  if (!isRuleActive(settings, "missing-human", "missing-human-context")) {
    return;
  }

  const allText = text.all;
  if (!RETAIL_STYLE_WORDS.test(allText) || CONDITION_WORDS.test(allText)) {
    return;
  }

  matches.push({
    ruleId: "missing-human-context",
    category: "missing-human",
    weight: 14,
    reason: "commercial text without condition detail",
    confidence: "low",
    sample: allText.slice(0, 90)
  });
}

const RULES_BY_ID = new Map(DEFAULT_RULES.map((rule) => [rule.id, rule]));

/**
 * "Hide all" quick-filter mode: the user explicitly chose to remove every
 * listing matching a vendor group's patterns (e.g. anything mentioning
 * IKEA), not just slop-looking ones. Applies regardless of individual rule
 * toggles; allowlists still rescue specific items.
 */
function addVendorBlockAllMatches(text: TextIndex, settings: SlopBlockSettings, matches: RuleMatch[]): void {
  if (settings.quickToggleBlockAll.length === 0 || !categoryEnabled(settings, "custom-rules")) {
    return;
  }

  for (const toggle of QUICK_RULE_TOGGLES) {
    if (toggle.kind !== "vendor" || !settings.quickToggleBlockAll.includes(toggle.id)) {
      continue;
    }

    for (const ruleId of toggle.ruleIds) {
      const rule = RULES_BY_ID.get(ruleId);
      if (!rule) {
        continue;
      }

      const sample = firstMatch(text.forFields(rule.fields), rule.pattern);
      if (!sample) {
        continue;
      }

      matches.push({
        ruleId: `block-all-${toggle.id}`,
        category: "custom-rules",
        weight: 96,
        reason: `your “${toggle.label}: Hide all” setting`,
        confidence: "high",
        sample
      });
      break;
    }
  }
}

function addCustomRuleMatches(text: TextIndex, settings: SlopBlockSettings, matches: RuleMatch[]): void {
  if (!categoryEnabled(settings, "custom-rules")) {
    return;
  }

  const allText = text.allLower;

  for (const term of settings.customBlockTerms) {
    if (customTermMatches(allText, term)) {
      matches.push({
        ruleId: "custom-block-term",
        category: "custom-rules",
        weight: 96,
        reason: `custom block: ${term}`,
        confidence: "high",
        sample: term
      });
    }
  }

  for (const term of settings.customVendorTerms) {
    if (customTermMatches(allText, term)) {
      matches.push({
        ruleId: "custom-vendor-term",
        category: "custom-rules",
        weight: 38,
        reason: `custom vendor: ${term}`,
        confidence: "high",
        sample: term
      });
    }
  }
}

function addAllowlistMatch(
  listing: ListingSnapshot,
  text: TextIndex,
  settings: SlopBlockSettings,
  matches: RuleMatch[]
): boolean {
  if (!categoryEnabled(settings, "custom-rules")) {
    return false;
  }

  if (listing.idHint && settings.customAllowItemIds.includes(listing.idHint)) {
    matches.push({
      ruleId: "custom-allow-item",
      category: "custom-rules",
      weight: -120,
      reason: `allow item: ${listing.idHint}`,
      confidence: "high",
      sample: listing.idHint
    });

    return true;
  }

  const allText = text.allLower;
  const term = settings.customAllowTerms.find((candidate) => customTermMatches(allText, candidate));
  if (!term) {
    return false;
  }

  matches.push({
    ruleId: "custom-allow-term",
    category: "custom-rules",
    weight: -80,
    reason: `allowlist: ${term}`,
    confidence: "high",
    sample: term
  });

  return true;
}

function customTermMatches(text: string, term: string): boolean {
  const normalizedTerm = normalizeText(term).toLowerCase();
  if (!normalizedTerm) {
    return false;
  }

  const phrasePattern = normalizedTerm.split(/\s+/).map(escapeRegExp).join("[\\s._/-]+");
  const leftBoundary = /^[a-z0-9]/i.test(normalizedTerm) ? "(?:^|[^a-z0-9])" : "";
  const rightBoundary = /[a-z0-9]$/i.test(normalizedTerm) ? "(?=$|[^a-z0-9])" : "";
  return new RegExp(`${leftBoundary}${phrasePattern}${rightBoundary}`, "i").test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Action ladder: low scores annotate, medium scores dim (still visible),
 * and only high-confidence scores fully hide. "dim" mode caps the strongest
 * action at dim; "label" mode never alters visibility.
 */
function actionForScore(score: number, settings: SlopBlockSettings): FilterAction {
  const thresholds = THRESHOLDS[settings.aggressiveness];
  if (score < thresholds.label) {
    return "allow";
  }

  if (settings.filterMode === "label" || score < thresholds.dim) {
    return "label";
  }

  if (settings.filterMode === "dim" || score < thresholds.hide) {
    return "dim";
  }

  return "hide";
}

function fieldText(listing: ListingSnapshot, fields: ListingField[]): string {
  const values = fields.flatMap((field) => {
    if (field === "allText") {
      return [listing.title, listing.priceText, listing.locationText, listing.sellerText ?? "", listing.visibleText];
    }

    return [listing[field] ?? ""];
  });

  return normalizeText(values.filter(Boolean).join(" "));
}

function isRuleActive(settings: SlopBlockSettings, categoryId: RuleMatch["category"], ruleId: string): boolean {
  return categoryEnabled(settings, categoryId) && ruleEnabled(settings, ruleId);
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[0];
}

function parseDisplayedPrice(text: string): number | null {
  if (/\bfree\b/i.test(text)) {
    return 0;
  }

  const [amount] = parseDollarAmounts(text);
  return amount ?? null;
}

function parseDollarAmounts(text: string): number[] {
  return Array.from(text.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g), (match) =>
    Number.parseFloat((match[1] ?? "").replace(/,/g, ""))
  ).filter((amount) => Number.isFinite(amount));
}
