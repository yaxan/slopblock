import { RULE_CATEGORIES, defaultEnabledCategories } from "./categories";
import type { Aggressiveness, FilterMode, RuleCategoryId, SlopBlockSettings } from "./types";

export const STORAGE_KEY = "slopblock.settings.v1";

export const DEFAULT_SETTINGS: SlopBlockSettings = {
  enabled: true,
  aggressiveness: "balanced",
  filterMode: "hide",
  showReasons: true,
  deepScan: true,
  // Gem-hunting default: IKEA/flat-pack is noise regardless of condition.
  // One tap in the popup switches it to Filter (slop-only) or Off.
  quickToggleBlockAll: ["ikea"],
  defaultsVersion: 2,
  imageChecks: true,
  enabledCategories: defaultEnabledCategories(),
  disabledRuleIds: [],
  customBlockTerms: [],
  customVendorTerms: [],
  customAllowTerms: [],
  customAllowItemIds: []
};

const AGGRESSIVENESS_VALUES = new Set<Aggressiveness>(["relaxed", "balanced", "strict"]);
const FILTER_MODE_VALUES = new Set<FilterMode>(["hide", "dim", "label"]);

export function normalizeSettings(input: unknown): SlopBlockSettings {
  const value = isRecord(input) ? input : {};
  const enabledCategories = defaultEnabledCategories();
  const storedCategories = isRecord(value.enabledCategories) ? value.enabledCategories : {};

  for (const category of RULE_CATEGORIES) {
    const storedValue = storedCategories[category.id];
    if (typeof storedValue === "boolean") {
      enabledCategories[category.id] = storedValue;
    }
  }

  const aggressiveness = AGGRESSIVENESS_VALUES.has(value.aggressiveness as Aggressiveness)
    ? (value.aggressiveness as Aggressiveness)
    : DEFAULT_SETTINGS.aggressiveness;

  const filterMode = FILTER_MODE_VALUES.has(value.filterMode as FilterMode)
    ? (value.filterMode as FilterMode)
    : DEFAULT_SETTINGS.filterMode;

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    aggressiveness,
    filterMode,
    showReasons: typeof value.showReasons === "boolean" ? value.showReasons : DEFAULT_SETTINGS.showReasons,
    deepScan: typeof value.deepScan === "boolean" ? value.deepScan : DEFAULT_SETTINGS.deepScan,
    enabledCategories,
    disabledRuleIds: normalizeTermList(value.disabledRuleIds),
    quickToggleBlockAll: migrateQuickToggleBlockAll(value),
    defaultsVersion: DEFAULT_SETTINGS.defaultsVersion,
    imageChecks: typeof value.imageChecks === "boolean" ? value.imageChecks : DEFAULT_SETTINGS.imageChecks,
    customBlockTerms: normalizeTermList(value.customBlockTerms),
    customVendorTerms: normalizeTermList(value.customVendorTerms),
    customAllowTerms: normalizeTermList(value.customAllowTerms),
    customAllowItemIds: normalizeTermList(value.customAllowItemIds)
  };
}

export function normalizeTermList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return Array.from(
    new Set(
      input
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function parseTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );
}

export function serializeTerms(terms: string[]): string {
  return normalizeTermList(terms).join("\n");
}

export function categoryEnabled(settings: SlopBlockSettings, categoryId: RuleCategoryId): boolean {
  return settings.enabledCategories[categoryId] !== false;
}

export function ruleEnabled(settings: SlopBlockSettings, ruleId: string): boolean {
  return !settings.disabledRuleIds.includes(ruleId);
}

/**
 * Settings saved before defaultsVersion 2 predate the gem-hunting default
 * (IKEA = Hide all). Adopt the new default for those saves unless the user
 * had explicitly configured hide-alls; saves made at v2+ are respected as-is
 * (setting IKEA back to Filter sticks).
 */
function migrateQuickToggleBlockAll(value: Record<string, unknown>): string[] {
  const stored = normalizeTermList(value.quickToggleBlockAll);
  const storedVersion = typeof value.defaultsVersion === "number" ? value.defaultsVersion : 0;
  if (storedVersion >= DEFAULT_SETTINGS.defaultsVersion || stored.length > 0) {
    return stored;
  }

  return [...DEFAULT_SETTINGS.quickToggleBlockAll];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
