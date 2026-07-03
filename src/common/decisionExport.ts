import { RULE_CATEGORIES } from "./categories";
import type { ContentDecision, ContentStats, FilterAction, RuleMatch } from "./types";

export type DeepScanDebug = {
  fetched: number;
  parsedFromJson: number;
  parsedFromDom: number;
  noData: number;
  errors: number;
  pending: number;
  requested: number;
  completed: number;
  backoffMsRemaining: number;
  lastFailures: Array<{ itemId: string; kind: string }>;
};

export type DecisionExportResponse = {
  ok: true;
  stats: ContentStats;
  showHidden: boolean;
  decisions: ContentDecision[];
  /** Deep-scan health counters, for the copyable debug report. */
  deepScan?: DeepScanDebug;
};

const FILTER_ACTIONS = new Set<FilterAction>(["allow", "label", "dim", "hide"]);
const RULE_CATEGORY_IDS = new Set<string>(RULE_CATEGORIES.map((category) => category.id));
const CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);

export function parseDecisionExportResponse(input: unknown): DecisionExportResponse | undefined {
  if (!isRecord(input) || input.ok !== true || typeof input.showHidden !== "boolean") {
    return undefined;
  }

  if (!isContentStats(input.stats) || !Array.isArray(input.decisions)) {
    return undefined;
  }

  if (!input.decisions.every(isContentDecision)) {
    return undefined;
  }

  const response: DecisionExportResponse = {
    ok: true,
    stats: input.stats,
    showHidden: input.showHidden,
    decisions: input.decisions
  };

  const deepScan = parseDeepScanDebug(input.deepScan);
  if (deepScan) {
    response.deepScan = deepScan;
  }

  return response;
}

function parseDeepScanDebug(input: unknown): DeepScanDebug | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const numbers = ["fetched", "parsedFromJson", "parsedFromDom", "noData", "errors", "pending", "requested", "completed", "backoffMsRemaining"] as const;
  for (const key of numbers) {
    if (!isNonNegativeInteger(input[key])) {
      return undefined;
    }
  }

  if (!Array.isArray(input.lastFailures)) {
    return undefined;
  }

  const lastFailures: Array<{ itemId: string; kind: string }> = [];
  for (const failure of input.lastFailures) {
    if (!isRecord(failure) || typeof failure.itemId !== "string" || typeof failure.kind !== "string") {
      return undefined;
    }
    lastFailures.push({ itemId: failure.itemId, kind: failure.kind });
  }

  return {
    fetched: input.fetched as number,
    parsedFromJson: input.parsedFromJson as number,
    parsedFromDom: input.parsedFromDom as number,
    noData: input.noData as number,
    errors: input.errors as number,
    pending: input.pending as number,
    requested: input.requested as number,
    completed: input.completed as number,
    backoffMsRemaining: input.backoffMsRemaining as number,
    lastFailures
  };
}

function isContentStats(input: unknown): input is ContentStats {
  return (
    isRecord(input) &&
    isNonNegativeInteger(input.scanned) &&
    isNonNegativeInteger(input.hidden) &&
    isNonNegativeInteger(input.dimmed) &&
    isNonNegativeInteger(input.labeled)
  );
}

function isContentDecision(input: unknown): input is ContentDecision {
  if (!isRecord(input)) {
    return false;
  }

  if (
    typeof input.title !== "string" ||
    typeof input.priceText !== "string" ||
    typeof input.visibleTextExcerpt !== "string" ||
    typeof input.score !== "number" ||
    !Number.isFinite(input.score) ||
    !FILTER_ACTIONS.has(input.action as FilterAction) ||
    !Array.isArray(input.matches)
  ) {
    return false;
  }

  if (input.idHint !== undefined && typeof input.idHint !== "string") {
    return false;
  }

  if (input.url !== undefined && typeof input.url !== "string") {
    return false;
  }

  return input.matches.every(isRuleMatch);
}

function isRuleMatch(input: unknown): input is RuleMatch {
  return (
    isRecord(input) &&
    typeof input.ruleId === "string" &&
    typeof input.reason === "string" &&
    typeof input.weight === "number" &&
    Number.isFinite(input.weight) &&
    RULE_CATEGORY_IDS.has(input.category as string) &&
    CONFIDENCE_VALUES.has(input.confidence as string) &&
    (input.sample === undefined || typeof input.sample === "string")
  );
}

function isNonNegativeInteger(input: unknown): input is number {
  return typeof input === "number" && Number.isInteger(input) && input >= 0;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
