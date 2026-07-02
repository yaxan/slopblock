import { normalizeText } from "./scoring";

const GENERIC_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "free",
  "new",
  "obo",
  "of",
  "or",
  "the",
  "used",
  "with"
]);

export function allowTermFromTitle(title: string): string | undefined {
  const term = normalizeText(title).slice(0, 90).trim();
  if (!term) {
    return undefined;
  }

  const meaningfulWords = term
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g)
    ?.filter((word) => !GENERIC_TITLE_WORDS.has(word));

  if (!meaningfulWords || meaningfulWords.length < 2) {
    return undefined;
  }

  return term;
}
