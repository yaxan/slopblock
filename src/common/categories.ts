import type { RuleCategory, RuleCategoryId } from "./types";

export const RULE_CATEGORIES: RuleCategory[] = [
  {
    id: "known-vendor",
    label: "Known vendors",
    description: "Amazon, Temu, AliExpress, IKEA, big-box retail, and resale-source mentions.",
    defaultEnabled: true
  },
  {
    id: "dropship-phrasing",
    label: "Dropship phrasing",
    description: "Catalog-commerce wording like multiple colors, order now, wholesale, or warehouse stock.",
    defaultEnabled: true
  },
  {
    id: "store-business",
    label: "Stores and dealers",
    description: "Sponsored cards, showrooms, outlets, dealers, financing, inventory language, and business calls to action.",
    defaultEnabled: true
  },
  {
    id: "bait-pricing",
    label: "Bait pricing",
    description: "$1/$123/free/contact-price games, deposits, each pricing, and price-in-description tricks.",
    defaultEnabled: true
  },
  {
    id: "external-redirect",
    label: "External redirects",
    description: "URLs, short links, off-platform ordering, social handles, and WhatsApp/Telegram redirects.",
    defaultEnabled: true
  },
  {
    id: "keyword-stuffing",
    label: "Keyword stuffing",
    description: "SEO-like brand piles, repeated terms, and unrelated category spam.",
    defaultEnabled: true
  },
  {
    id: "not-for-sale",
    label: "Not for sale",
    description: "Wanted, ISO, WTB, trade-only, swap, barter, sold, pending, and reserved posts.",
    defaultEnabled: true
  },
  {
    id: "service-spam",
    label: "Service spam",
    description: "Moving, hauling, cleaning, installation, rentals, real estate, job/opportunity, MLM, and contractor ads.",
    defaultEnabled: true
  },
  {
    id: "scam-pressure",
    label: "Scams and payment pressure",
    description: "Deposit-first language, payment app pressure, investment/loan schemes, shipping-only pushes, and hold-fee language.",
    defaultEnabled: true
  },
  {
    id: "counterfeit",
    label: "Counterfeits",
    description: "Replica, knockoff, fake, superclone, UA, designer-dupe, and suspicious luxury-goods language.",
    defaultEnabled: true
  },
  {
    id: "duplicate-flood",
    label: "Duplicate floods",
    description: "Repeated distinct listing-title flooding in feeds/search, excluding seller-profile counts.",
    defaultEnabled: true
  },
  {
    id: "catalog-copy",
    label: "Catalog copy",
    description: "Reference-photo disclaimers, generic retail copy, SKU-heavy titles, and spec spam.",
    defaultEnabled: true
  },
  {
    id: "missing-human",
    label: "Missing human context",
    description: "Commercial-looking listings with no condition, pickup, ownership, defect, or use details.",
    defaultEnabled: true
  },
  {
    id: "gem-positive",
    label: "Gem-positive signals",
    description: "Estate sale, moving sale, vintage, solid wood, pickup-only, repair, and human condition details.",
    defaultEnabled: true
  },
  {
    id: "custom-rules",
    label: "Your custom rules",
    description: "User-added local block terms, vendor terms, and allowlist terms.",
    defaultEnabled: true
  }
];

export function defaultEnabledCategories(): Record<RuleCategoryId, boolean> {
  return Object.fromEntries(RULE_CATEGORIES.map((category) => [category.id, category.defaultEnabled])) as Record<
    RuleCategoryId,
    boolean
  >;
}
