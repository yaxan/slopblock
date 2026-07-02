import test from "node:test";
import assert from "node:assert/strict";
import { parseDecisionExportResponse } from "../src/common/decisionExport";

test("parseDecisionExportResponse accepts well-formed content diagnostics", () => {
  const parsed = parseDecisionExportResponse({
    ok: true,
    stats: { scanned: 2, hidden: 1, dimmed: 0, labeled: 0 },
    showHidden: false,
    decisions: [
      {
        title: "Temu lamp",
        priceText: "$12",
        action: "hide",
        score: 90,
        visibleTextExcerpt: "Temu lamp warehouse stock",
        matches: [
          {
            ruleId: "vendor-temu",
            category: "known-vendor",
            weight: 42,
            reason: "Temu/source mention",
            confidence: "high",
            sample: "Temu"
          }
        ]
      }
    ]
  });

  assert.equal(parsed?.ok, true);
  assert.equal(parsed?.stats.hidden, 1);
  assert.equal(parsed?.decisions[0]?.matches[0]?.ruleId, "vendor-temu");
});

test("parseDecisionExportResponse rejects incomplete or malformed responses", () => {
  assert.equal(parseDecisionExportResponse(undefined), undefined);
  assert.equal(parseDecisionExportResponse({ ok: true, decisions: [] }), undefined);
  assert.equal(
    parseDecisionExportResponse({
      ok: true,
      stats: { scanned: 1, hidden: 0, dimmed: 0, labeled: 0 },
      showHidden: false,
      decisions: [
        {
          title: "Bad response",
          priceText: "$1",
          action: "hide",
          score: 50,
          visibleTextExcerpt: "Bad response",
          matches: [{ ruleId: "x", category: "not-a-category", weight: 1, reason: "x", confidence: "high" }]
        }
      ]
    }),
    undefined
  );
});
