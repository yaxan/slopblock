import type { ContentDecision, ContentStats, RuleCategoryId } from "./types";
import { allowTermFromTitle } from "./allowTerms";
import { controlRuleIdForMatch } from "./ruleToggles";

export type RuleSummary = {
  ruleId: string;
  controlRuleId: string;
  reason: string;
  category: RuleCategoryId;
  count: number;
  totalWeight: number;
};

export type HiddenExample = {
  idHint?: string;
  allowTerm?: string;
  title: string;
  priceText: string;
  score: number;
  reasons: string[];
  url?: string;
};

export type PageDecisionSummary = {
  scanned: number;
  allowed: number;
  hidden: number;
  dimmed: number;
  labeled: number;
  topRules: RuleSummary[];
  hiddenExamples: HiddenExample[];
};

export function summarizeContentDecisions(
  decisions: ContentDecision[],
  stats?: Partial<ContentStats>
): PageDecisionSummary {
  const actionCounts = {
    allowed: decisions.filter((decision) => decision.action === "allow").length,
    hidden: decisions.filter((decision) => decision.action === "hide").length,
    dimmed: decisions.filter((decision) => decision.action === "dim").length,
    labeled: decisions.filter((decision) => decision.action === "label").length
  };

  return {
    scanned: stats?.scanned ?? decisions.length,
    allowed: actionCounts.allowed,
    hidden: stats?.hidden ?? actionCounts.hidden,
    dimmed: stats?.dimmed ?? actionCounts.dimmed,
    labeled: stats?.labeled ?? actionCounts.labeled,
    topRules: summarizeTopRules(decisions),
    hiddenExamples: summarizeHiddenExamples(decisions)
  };
}

function summarizeTopRules(decisions: ContentDecision[]): RuleSummary[] {
  const summaries = new Map<string, RuleSummary>();

  for (const decision of decisions) {
    if (decision.action === "allow") {
      continue;
    }

    for (const match of decision.matches) {
      if (match.weight <= 0) {
        continue;
      }

      const existing = summaries.get(match.ruleId);
      if (existing) {
        existing.count += 1;
        existing.totalWeight += match.weight;
        continue;
      }

      summaries.set(match.ruleId, {
        ruleId: match.ruleId,
        controlRuleId: controlRuleIdForMatch(match.ruleId) ?? match.ruleId,
        reason: match.reason,
        category: match.category,
        count: 1,
        totalWeight: match.weight
      });
    }
  }

  return Array.from(summaries.values())
    .sort((left, right) => right.count - left.count || right.totalWeight - left.totalWeight)
    .slice(0, 5);
}

function summarizeHiddenExamples(decisions: ContentDecision[]): HiddenExample[] {
  return decisions
    .filter((decision) => decision.action === "hide")
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((decision) => {
      const reasons = decision.matches
        .filter((match) => match.weight > 0)
        .slice(0, 3)
        .map((match) => match.reason);

      const title = decision.title || "[untitled listing]";
      const example: HiddenExample = {
        title,
        priceText: decision.priceText,
        score: decision.score,
        reasons
      };

      if (decision.idHint) {
        example.idHint = decision.idHint;
      } else {
        const allowTerm = allowTermFromTitle(decision.title);
        if (allowTerm) {
          example.allowTerm = allowTerm;
        }
      }

      if (decision.url) {
        example.url = decision.url;
      }

      return example;
    });
}
