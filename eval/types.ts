export type CorpusLabel = "legit" | "slop" | "borderline";

export type CorpusEntry = {
  /** Stable id, e.g. "cl-fuo-003" or "hw-legit-012". */
  id: string;
  label: CorpusLabel;
  /** Freeform kind: furniture, electronics, dropship, scam-deposit, counterfeit, dealer, ... */
  kind: string;
  /** URL the text came from, or "handwritten" for curated edge cases. */
  source: string;
  title: string;
  price?: string;
  location?: string;
  /** Listing description. Only visible in detail view, not on feed cards. */
  body?: string;
  note?: string;
  /**
   * Marks entries that are legitimate listings but hidden/dimmed by the
   * gem-hunting DEFAULTS (a taste choice, not a spam verdict). The gate
   * asserts they ARE actioned under defaults and stay fully visible under
   * the permissive profile.
   */
  vendorTaste?: "ikea" | "new-in-box";
};
