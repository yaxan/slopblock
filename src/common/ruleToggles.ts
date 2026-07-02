import { normalizeSettings, ruleEnabled } from "./settings";
import type { SlopBlockSettings } from "./types";

export type QuickRuleToggle = {
  id: string;
  label: string;
  description: string;
  ruleIds: string[];
};

export type QuickRuleToggleState = "on" | "off" | "partial";

export const QUICK_RULE_TOGGLES: QuickRuleToggle[] = [
  {
    id: "dropship-sources",
    label: "Block Amazon/Temu sources",
    description: "Controls common dropship marketplace/source names while keeping IKEA separate.",
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
    label: "Block IKEA mentions",
    description: "Turn off if used IKEA furniture is usually worth seeing.",
    ruleIds: ["vendor-ikea"]
  },
  {
    id: "liquidation",
    label: "Block liquidation/outlets",
    description: "Turn off if local outlet or liquidation listings are useful to you.",
    ruleIds: ["store-liquidation-outlet"]
  },
  {
    id: "sponsored-cards",
    label: "Block sponsored cards",
    description: "Controls Marketplace cards with a standalone Sponsored marker.",
    ruleIds: ["store-sponsored-card"]
  },
  {
    id: "catalog-copy",
    label: "Block stock/catalog copy",
    description: "Controls stock-photo disclaimers, SKU/spec-heavy text, and generic retail product copy.",
    ruleIds: ["catalog-reference-photo", "catalog-generic-copy", "catalog-spec-heavy"]
  },
  {
    id: "duplicate-flood",
    label: "Block repeated listing floods",
    description: "Turn off if repeated cards are causing false positives in your area.",
    ruleIds: ["duplicate-flood-dynamic"]
  },
  {
    id: "not-for-sale",
    label: "Block not-for-sale posts",
    description: "Controls ISO, WTB, wanted, trade-only, sold, pending, reserved, swap, and barter listings.",
    ruleIds: [
      "not-for-sale-title-request",
      "not-for-sale-request-language",
      "not-for-sale-trade-only",
      "not-for-sale-unavailable"
    ]
  },
  {
    id: "opportunity-scams",
    label: "Block job/loan scams",
    description: "Controls work-from-home, task/MLM, trading-signal, investment, and loan scheme pitches.",
    ruleIds: ["service-job-opportunity", "service-task-mlm", "scam-financial-opportunity"]
  },
  {
    id: "weak-commercial",
    label: "Block weak commercial text",
    description: "Controls commercial sales language and missing condition-detail heuristics.",
    ruleIds: ["store-sales-language", "missing-human-context"]
  }
];

export function quickRuleToggleState(settings: SlopBlockSettings, toggle: QuickRuleToggle): QuickRuleToggleState {
  const enabledCount = toggle.ruleIds.filter((ruleId) => ruleEnabled(settings, ruleId)).length;
  if (enabledCount === 0) {
    return "off";
  }

  if (enabledCount === toggle.ruleIds.length) {
    return "on";
  }

  return "partial";
}

export function setQuickRuleToggleEnabled(
  settings: SlopBlockSettings,
  toggle: QuickRuleToggle,
  enabled: boolean
): SlopBlockSettings {
  const toggleRuleIds = new Set(toggle.ruleIds);
  const disabledRuleIds = enabled
    ? settings.disabledRuleIds.filter((ruleId) => !toggleRuleIds.has(ruleId))
    : [...settings.disabledRuleIds, ...toggle.ruleIds];

  return normalizeSettings({
    ...settings,
    disabledRuleIds
  });
}

export function controlRuleIdForMatch(ruleId: string | undefined): string | undefined {
  if (!ruleId) {
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
