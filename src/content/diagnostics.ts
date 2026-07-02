import { normalizeText } from "../common/scoring";
import type { ContentDecision, ListingSnapshot, RuleMatch, ScoreResult } from "../common/types";

export function toContentDecision(snapshot: ListingSnapshot, result: ScoreResult): ContentDecision {
  const decision: ContentDecision = {
    title: snapshot.title,
    priceText: snapshot.priceText,
    action: result.action,
    score: result.score,
    visibleTextExcerpt: redactDiagnosticText(snapshot.visibleText).slice(0, 260),
    matches: redactRuleMatches(result.matches)
  };

  if (snapshot.idHint) {
    decision.idHint = snapshot.idHint;
  }

  const url = diagnosticItemUrl(snapshot);
  if (url) {
    decision.url = url;
  }

  return decision;
}

export function diagnosticItemUrl(snapshot: ListingSnapshot): string | undefined {
  if (snapshot.idHint) {
    return `https://www.facebook.com/marketplace/item/${snapshot.idHint}/`;
  }

  if (!snapshot.url) {
    return undefined;
  }

  try {
    const parsed = new URL(snapshot.url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function redactDiagnosticText(text: string): string {
  return normalizeText(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4})\b/g, "[phone]");
}

function redactRuleMatches(matches: RuleMatch[]): RuleMatch[] {
  return matches.map((match) => {
    if (match.sample === undefined) {
      return match;
    }

    return {
      ...match,
      sample: redactDiagnosticText(match.sample).slice(0, 160)
    };
  });
}
