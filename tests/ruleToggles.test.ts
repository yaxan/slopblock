import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/common/settings";
import {
  QUICK_RULE_TOGGLES,
  controlRuleIdForMatch,
  quickRuleToggleState,
  setQuickRuleToggleEnabled
} from "../src/common/ruleToggles";

test("quick rule toggles disable and re-enable all mapped rule IDs", () => {
  const toggle = requiredToggle("weak-commercial");
  const disabled = setQuickRuleToggleEnabled(DEFAULT_SETTINGS, toggle, false);

  assert.equal(quickRuleToggleState(disabled, toggle), "off");
  assert.ok(disabled.disabledRuleIds.includes("store-sales-language"));
  assert.ok(disabled.disabledRuleIds.includes("missing-human-context"));

  const enabled = setQuickRuleToggleEnabled(disabled, toggle, true);
  assert.equal(quickRuleToggleState(enabled, toggle), "on");
  assert.ok(!enabled.disabledRuleIds.includes("store-sales-language"));
  assert.ok(!enabled.disabledRuleIds.includes("missing-human-context"));
});

test("dropship source quick toggle controls core source rules without disabling IKEA", () => {
  const toggle = requiredToggle("dropship-sources");
  const disabled = setQuickRuleToggleEnabled(DEFAULT_SETTINGS, toggle, false);

  assert.equal(quickRuleToggleState(disabled, toggle), "off");
  assert.ok(disabled.disabledRuleIds.includes("vendor-amazon"));
  assert.ok(disabled.disabledRuleIds.includes("vendor-temu"));
  assert.ok(disabled.disabledRuleIds.includes("vendor-aliexpress"));
  assert.ok(disabled.disabledRuleIds.includes("vendor-shein"));
  assert.ok(!disabled.disabledRuleIds.includes("vendor-ikea"));

  const enabled = setQuickRuleToggleEnabled(disabled, toggle, true);
  assert.equal(quickRuleToggleState(enabled, toggle), "on");
  assert.ok(!enabled.disabledRuleIds.includes("vendor-amazon"));
  assert.ok(!enabled.disabledRuleIds.includes("vendor-temu"));
  assert.ok(!enabled.disabledRuleIds.includes("vendor-ikea"));
});

test("not-for-sale quick toggle controls wanted trade and unavailable rules", () => {
  const toggle = requiredToggle("not-for-sale");
  const disabled = setQuickRuleToggleEnabled(DEFAULT_SETTINGS, toggle, false);

  assert.equal(quickRuleToggleState(disabled, toggle), "off");
  assert.ok(disabled.disabledRuleIds.includes("not-for-sale-title-request"));
  assert.ok(disabled.disabledRuleIds.includes("not-for-sale-request-language"));
  assert.ok(disabled.disabledRuleIds.includes("not-for-sale-trade-only"));
  assert.ok(disabled.disabledRuleIds.includes("not-for-sale-unavailable"));
});

test("sponsored and catalog quick toggles control noisy ad and stock-copy rules", () => {
  const sponsoredToggle = requiredToggle("sponsored-cards");
  const catalogToggle = requiredToggle("catalog-copy");
  const disabledSponsored = setQuickRuleToggleEnabled(DEFAULT_SETTINGS, sponsoredToggle, false);
  const disabledCatalog = setQuickRuleToggleEnabled(DEFAULT_SETTINGS, catalogToggle, false);

  assert.equal(quickRuleToggleState(disabledSponsored, sponsoredToggle), "off");
  assert.ok(disabledSponsored.disabledRuleIds.includes("store-sponsored-card"));
  assert.ok(!disabledSponsored.disabledRuleIds.includes("store-sales-language"));

  assert.equal(quickRuleToggleState(disabledCatalog, catalogToggle), "off");
  assert.ok(disabledCatalog.disabledRuleIds.includes("catalog-reference-photo"));
  assert.ok(disabledCatalog.disabledRuleIds.includes("catalog-generic-copy"));
  assert.ok(disabledCatalog.disabledRuleIds.includes("catalog-spec-heavy"));
  assert.ok(!disabledCatalog.disabledRuleIds.includes("dropship-variants"));
});

test("opportunity scam quick toggle controls job task and financial scheme rules", () => {
  const toggle = requiredToggle("opportunity-scams");
  const disabled = setQuickRuleToggleEnabled(DEFAULT_SETTINGS, toggle, false);

  assert.equal(quickRuleToggleState(disabled, toggle), "off");
  assert.ok(disabled.disabledRuleIds.includes("service-job-opportunity"));
  assert.ok(disabled.disabledRuleIds.includes("service-task-mlm"));
  assert.ok(disabled.disabledRuleIds.includes("scam-financial-opportunity"));
  assert.ok(!disabled.disabledRuleIds.includes("scam-deposit"));
  assert.ok(!disabled.disabledRuleIds.includes("service-moving-hauling"));

  const enabled = setQuickRuleToggleEnabled(disabled, toggle, true);
  assert.equal(quickRuleToggleState(enabled, toggle), "on");
  assert.ok(!enabled.disabledRuleIds.includes("service-job-opportunity"));
  assert.ok(!enabled.disabledRuleIds.includes("service-task-mlm"));
  assert.ok(!enabled.disabledRuleIds.includes("scam-financial-opportunity"));
});

test("quick rule toggles report partial state for partially disabled composite toggles", () => {
  const toggle = requiredToggle("weak-commercial");
  const settings = {
    ...DEFAULT_SETTINGS,
    disabledRuleIds: ["missing-human-context"]
  };

  assert.equal(quickRuleToggleState(settings, toggle), "partial");
});

test("controlRuleIdForMatch maps dynamic match IDs to user-toggleable rule IDs", () => {
  assert.equal(controlRuleIdForMatch("bait-price-gamed"), "bait-price-dynamic");
  assert.equal(controlRuleIdForMatch("duplicate-flood-heavy"), "duplicate-flood-dynamic");
  assert.equal(controlRuleIdForMatch("vendor-ikea"), "vendor-ikea");
  assert.equal(controlRuleIdForMatch(undefined), undefined);
});

function requiredToggle(id: string) {
  const toggle = QUICK_RULE_TOGGLES.find((candidate) => candidate.id === id);
  assert.ok(toggle, `Missing toggle ${id}`);
  return toggle;
}
