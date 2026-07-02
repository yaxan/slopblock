import test from "node:test";
import assert from "node:assert/strict";
import { allowTermFromTitle } from "../src/common/allowTerms";

test("allowTermFromTitle keeps distinctive listing titles", () => {
  assert.equal(allowTermFromTitle("  IKEA Kallax shelf with bins  "), "IKEA Kallax shelf with bins");
  assert.equal(allowTermFromTitle("Amazon Echo Dot"), "Amazon Echo Dot");
});

test("allowTermFromTitle rejects broad generic title fallbacks", () => {
  assert.equal(allowTermFromTitle("Chair"), undefined);
  assert.equal(allowTermFromTitle("Used desk"), undefined);
  assert.equal(allowTermFromTitle("Free"), undefined);
});
