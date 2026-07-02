import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const optionsHtml = readFileSync(new URL("../public/options.html", import.meta.url), "utf8");

test("options page renders shared quick-toggle mount instead of hard-coded fast buttons", () => {
  assert.match(optionsHtml, /id="quickRuleToggles"/);
  assert.doesNotMatch(optionsHtml, /id="keepDropshipSources"/);
  assert.doesNotMatch(optionsHtml, /id="blockOpportunityScams"/);
  assert.match(optionsHtml, /Quick filters/);
  assert.doesNotMatch(optionsHtml, /id="save"/);
});
