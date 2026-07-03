import { normalizeSettings, ruleEnabled } from "./settings";
import type { SlopBlockSettings } from "./types";

export type QuickRuleToggle = {
  id: string;
  label: string;
  description: string;
  ruleIds: string[];
  /**
   * "vendor" toggles offer three modes (Off / Filter / Hide all) because
   * people genuinely disagree about wanting these listings at all;
   * "binary" toggles are plain on/off filters.
   */
  kind: "vendor" | "binary";
};

export type QuickToggleMode = "off" | "filter" | "block";

export const QUICK_RULE_TOGGLES: QuickRuleToggle[] = [
  {
    id: "dropship-sources",
    kind: "vendor",
    label: "Amazon/Temu-sourced items",
    description:
      "Filter catches listings sourced from Amazon, Temu, AliExpress, SHEIN and similar. Hide all removes anything that mentions those marketplaces.",
    ruleIds: [
      "vendor-amazon",
      "vendor-temu",
      "vendor-aliexpress",
      "vendor-alibaba",
      "vendor-wish",
      "vendor-shein",
      "vendor-dhgate",
      "vendor-banggood",
      "vendor-tiktok-shop",
      "vendor-shopify"
    ]
  },
  {
    id: "ikea",
    kind: "vendor",
    label: "IKEA items",
    description:
      "Filter catches resellers flipping new IKEA stock — normal used IKEA furniture stays visible. Hide all removes anything that mentions IKEA.",
    ruleIds: ["vendor-ikea"]
  },
  {
    id: "liquidation",
    kind: "vendor",
    label: "Liquidation & pallet sales",
    description:
      "Filter treats liquidation/pallet wording as a slop signal. Hide all removes those listings entirely; Off keeps them if you like these deals.",
    ruleIds: ["store-liquidation-outlet"]
  },
  {
    id: "sponsored-cards",
    kind: "binary",
    label: "Sponsored ads",
    description: "Hides Marketplace cards marked Sponsored. Listings merely containing the word are unaffected.",
    ruleIds: ["store-sponsored-card"]
  },
  {
    id: "catalog-copy",
    kind: "binary",
    label: "Stock-photo & catalog copy",
    description: "Stock-photo disclaimers (“not actual item”), SKU/spec boilerplate, and generic retail product copy.",
    ruleIds: ["catalog-reference-photo", "catalog-generic-copy", "catalog-sku-heavy", "catalog-spec-boilerplate"]
  },
  {
    id: "duplicate-flood",
    kind: "binary",
    label: "Repeated listings",
    description: "Collapses repeat posts of the same listing — the first copy always stays visible.",
    ruleIds: ["duplicate-flood-dynamic"]
  },
  {
    id: "not-for-sale",
    kind: "binary",
    label: "Not-for-sale posts",
    description: "Wanted/ISO requests, trade-only posts, and listings marked sold or pending.",
    ruleIds: [
      "not-for-sale-title-request",
      "not-for-sale-request-language",
      "not-for-sale-trade-only",
      "not-for-sale-unavailable"
    ]
  },
  {
    id: "opportunity-scams",
    kind: "binary",
    label: "Job & money-making pitches",
    description: "Work-from-home, task/MLM, trading-signal, investment, and loan pitches.",
    ruleIds: ["service-job-opportunity", "service-income-hype", "service-task-mlm", "scam-financial-opportunity"]
  },
  {
    id: "weak-commercial",
    kind: "binary",
    label: "Vague commercial listings",
    description: "Store-style wording with no condition or ownership details. Dims rather than hides.",
    ruleIds: ["store-sales-language", "missing-human-context"]
  }
];

export function quickToggleMode(settings: SlopBlockSettings, toggle: QuickRuleToggle): QuickToggleMode | "partial" {
  if (toggle.kind === "vendor" && settings.quickToggleBlockAll.includes(toggle.id)) {
    return "block";
  }

  const enabledCount = toggle.ruleIds.filter((ruleId) => ruleEnabled(settings, ruleId)).length;
  if (enabledCount === 0) {
    return "off";
  }

  if (enabledCount === toggle.ruleIds.length) {
    return "filter";
  }

  return "partial";
}

export function setQuickToggleMode(
  settings: SlopBlockSettings,
  toggle: QuickRuleToggle,
  mode: QuickToggleMode
): SlopBlockSettings {
  const toggleRuleIds = new Set(toggle.ruleIds);
  const disabledRuleIds =
    mode === "off"
      ? [...settings.disabledRuleIds, ...toggle.ruleIds]
      : settings.disabledRuleIds.filter((ruleId) => !toggleRuleIds.has(ruleId));
  const quickToggleBlockAll =
    mode === "block"
      ? [...settings.quickToggleBlockAll, toggle.id]
      : settings.quickToggleBlockAll.filter((toggleId) => toggleId !== toggle.id);

  return normalizeSettings({
    ...settings,
    disabledRuleIds,
    quickToggleBlockAll
  });
}

export function controlRuleIdForMatch(ruleId: string | undefined): string | undefined {
  if (!ruleId) {
    return undefined;
  }

  // Hide-all verdicts come from an explicit user setting; they are managed
  // through the quick-filter control, not a rule toggle.
  if (ruleId.startsWith("block-all-")) {
    return undefined;
  }

  if (ruleId.startsWith("bait-price-")) {
    return "bait-price-dynamic";
  }

  if (ruleId.startsWith("duplicate-flood-")) {
    return "duplicate-flood-dynamic";
  }

  return ruleId;
}
