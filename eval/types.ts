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
};
