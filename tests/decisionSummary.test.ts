import test from "node:test";
import assert from "node:assert/strict";
import { summarizeContentDecisions } from "../src/common/decisionSummary";
import type { ContentDecision } from "../src/common/types";

test("summarizeContentDecisions ranks top positive rules and hidden examples", () => {
  const summary = summarizeContentDecisions(
    [
      decision("hide", 96, "Warehouse couch", "store-sales-language", "commercial sales language", 30),
      decision("hide", 88, "Temu lamp", "vendor-temu", "Temu/source mention", 42),
      decision("dim", 44, "Mattress", "store-sales-language", "commercial sales language", 30),
      decision("allow", 0, "Solid wood dresser", "gem-condition-details", "real condition details", -20)
    ],
    { scanned: 4, hidden: 2, dimmed: 1, labeled: 0 }
  );

  assert.equal(summary.scanned, 4);
  assert.equal(summary.hidden, 2);
  assert.equal(summary.dimmed, 1);
  assert.equal(summary.labeled, 0);
  assert.equal(summary.allowed, 1);
  assert.equal(summary.topRules[0]?.ruleId, "store-sales-language");
  assert.equal(summary.topRules[0]?.controlRuleId, "store-sales-language");
  assert.equal(summary.topRules[0]?.count, 2);
  assert.deepEqual(
    summary.hiddenExamples.map((example) => example.title),
    ["Warehouse couch", "Temu lamp"]
  );
});

test("summarizeContentDecisions exposes controllable dynamic rules and item IDs", () => {
  const summary = summarizeContentDecisions([
    {
      ...decision("hide", 90, "Sectional sofa", "bait-price-gamed", "bait/display price mismatch", 50),
      idHint: "2289171978176208",
      url: "https://www.facebook.com/marketplace/item/2289171978176208/"
    }
  ]);

  assert.equal(summary.topRules[0]?.ruleId, "bait-price-gamed");
  assert.equal(summary.topRules[0]?.controlRuleId, "bait-price-dynamic");
  assert.equal(summary.hiddenExamples[0]?.idHint, "2289171978176208");
});

test("summarizeContentDecisions exposes title allow term only when item ID is missing", () => {
  const summary = summarizeContentDecisions([
    decision("hide", 82, "  IKEA Kallax shelf with bins  ", "vendor-ikea", "IKEA/source mention", 36),
    decision("hide", 80, "Chair", "store-sales-language", "commercial sales language", 30),
    {
      ...decision("hide", 90, "Sectional sofa", "bait-price-gamed", "bait/display price mismatch", 50),
      idHint: "123"
    }
  ]);

  assert.equal(summary.hiddenExamples[0]?.idHint, "123");
  assert.equal(summary.hiddenExamples[0]?.allowTerm, undefined);
  assert.equal(summary.hiddenExamples[1]?.allowTerm, "IKEA Kallax shelf with bins");
  assert.equal(summary.hiddenExamples[2]?.allowTerm, undefined);
});

test("summarizeContentDecisions ignores allow-only positive and negative matches in top rules", () => {
  const summary = summarizeContentDecisions([
    decision("allow", 10, "Used IKEA shelf", "vendor-ikea", "IKEA/source mention", 36),
    decision("hide", 78, "Amazon shelf", "gem-condition-details", "real condition details", -20),
    decision("hide", 78, "Amazon shelf", "vendor-amazon", "Amazon/source mention", 38)
  ]);

  assert.deepEqual(
    summary.topRules.map((rule) => rule.ruleId),
    ["vendor-amazon"]
  );
});

function decision(
  action: ContentDecision["action"],
  score: number,
  title: string,
  ruleId: string,
  reason: string,
  weight: number
): ContentDecision {
  return {
    title,
    priceText: "$123",
    action,
    score,
    visibleTextExcerpt: title,
    matches: [
      {
        ruleId,
        category: weight > 0 && ruleId.startsWith("vendor-") ? "known-vendor" : "store-business",
        weight,
        reason,
        confidence: "medium"
      }
    ]
  };
}
