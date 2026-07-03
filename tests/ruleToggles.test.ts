import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_RULE_TOGGLES,
  controlRuleIdForMatch,
  quickToggleMode,
  setQuickToggleMode
} from "../src/common/ruleToggles";
import { DEFAULT_RULES } from "../src/common/defaultRules";
import { scoreListing } from "../src/common/scoring";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/common/settings";

const KNOWN_RULE_IDS = new Set(DEFAULT_RULES.map((rule) => rule.id));
const DYNAMIC_IDS = new Set([
  "bait-price-dynamic",
  "keyword-stuffing-detected",
  "counterfeit-luxury-underpriced",
  "counterfeit-authenticity-dodge",
  "duplicate-flood-dynamic",
  "store-sponsored-card",
  "missing-human-context",
  "vendor-retail-combo"
]);

test("every quick toggle references real rule ids", () => {
  for (const toggle of QUICK_RULE_TOGGLES) {
    for (const ruleId of toggle.ruleIds) {
      assert.ok(KNOWN_RULE_IDS.has(ruleId) || DYNAMIC_IDS.has(ruleId), `${toggle.id} -> ${ruleId}`);
    }
  }
});

test("tri-state modes round-trip: off, filter, block", () => {
  const ikea = QUICK_RULE_TOGGLES.find((toggle) => toggle.id === "ikea");
  assert.ok(ikea);
  assert.equal(ikea?.kind, "vendor");

  // Gem-hunting default: IKEA ships in Hide all.
  assert.equal(quickToggleMode(DEFAULT_SETTINGS, ikea!), "block");

  const off = setQuickToggleMode(DEFAULT_SETTINGS, ikea!, "off");
  assert.equal(quickToggleMode(off, ikea!), "off");
  assert.ok(off.disabledRuleIds.includes("vendor-ikea"));

  const block = setQuickToggleMode(off, ikea!, "block");
  assert.equal(quickToggleMode(block, ikea!), "block");
  assert.ok(!block.disabledRuleIds.includes("vendor-ikea"), "block re-enables the member rules");
  assert.ok(block.quickToggleBlockAll.includes("ikea"));

  const filter = setQuickToggleMode(block, ikea!, "filter");
  assert.equal(quickToggleMode(filter, ikea!), "filter");
  assert.deepEqual(filter.quickToggleBlockAll, []);
});

test("hide-all mode hides every listing matching the vendor pattern", () => {
  const ikea = QUICK_RULE_TOGGLES.find((toggle) => toggle.id === "ikea")!;
  const blockSettings = DEFAULT_SETTINGS; // block is now the shipped default

  const listing = {
    idHint: "1",
    title: "IKEA MALM 6 drawer dresser",
    priceText: "$80",
    locationText: "Toronto, ON",
    visibleText: "$80\nIKEA MALM 6 drawer dresser\nToronto, ON"
  };

  const filterResult = scoreListing(listing, setQuickToggleMode(DEFAULT_SETTINGS, ikea, "filter"), {});
  assert.equal(filterResult.action, "allow", "used IKEA stays visible once the user picks Filter");

  const blockedResult = scoreListing(listing, blockSettings, {});
  assert.equal(blockedResult.action, "hide");
  assert.ok(blockedResult.matches.some((match) => match.ruleId === "block-all-ikea"));

  const nonIkea = scoreListing(
    { idHint: "2", title: "Solid oak dresser", priceText: "$90", locationText: "Toronto, ON", visibleText: "Solid oak dresser" },
    blockSettings,
    {}
  );
  assert.equal(nonIkea.action, "allow", "hide-all only affects matching listings");
});

test("hide-all respects the user allowlist", () => {
  const ikea = QUICK_RULE_TOGGLES.find((toggle) => toggle.id === "ikea")!;
  const settings = normalizeSettings({
    ...setQuickToggleMode(DEFAULT_SETTINGS, ikea, "block"),
    customAllowItemIds: ["999"]
  });

  const result = scoreListing(
    { idHint: "999", title: "IKEA Kallax shelf", priceText: "$40", locationText: "Toronto, ON", visibleText: "IKEA Kallax shelf" },
    settings,
    {}
  );
  assert.equal(result.action, "allow");
});

test("amazon product names are exempt even from hide-all (they are products, not sources)", () => {
  const sources = QUICK_RULE_TOGGLES.find((toggle) => toggle.id === "dropship-sources")!;
  const settings = setQuickToggleMode(DEFAULT_SETTINGS, sources, "block");

  const echo = scoreListing(
    { idHint: "3", title: "Amazon Echo Dot 4th gen", priceText: "$25", locationText: "Toronto, ON", visibleText: "Amazon Echo Dot 4th gen" },
    settings,
    {}
  );
  assert.equal(echo.action, "allow");

  const sourced = scoreListing(
    { idHint: "4", title: "Sectional couch - Amazon return", priceText: "$200", locationText: "Toronto, ON", visibleText: "Sectional couch - Amazon return" },
    settings,
    {}
  );
  assert.equal(sourced.action, "hide");
});

test("block-all verdicts have no rule-level control (managed via the quick filter)", () => {
  assert.equal(controlRuleIdForMatch("block-all-ikea"), undefined);
  assert.equal(controlRuleIdForMatch("duplicate-flood-repeat"), "duplicate-flood-dynamic");
  assert.equal(controlRuleIdForMatch("bait-price-gamed"), "bait-price-dynamic");
  assert.equal(controlRuleIdForMatch("vendor-temu"), "vendor-temu");
});

test("unknown ids in quickToggleBlockAll are ignored safely", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, quickToggleBlockAll: ["nonexistent-toggle"] });
  const result = scoreListing(
    { idHint: "5", title: "IKEA Billy bookcase", priceText: "$25", locationText: "Toronto, ON", visibleText: "IKEA Billy bookcase" },
    settings,
    {}
  );
  assert.equal(result.action, "allow");
});
