import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("diagnostics analyzer summarizes copied decision JSON", () => {
  const result = spawnSync(process.execPath, ["scripts/analyze-diagnostics.mjs", "tests/fixtures/diagnostics.sample.json"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Action Counts/);
  assert.match(result.stdout, /hide: 2/);
  assert.match(result.stdout, /Top Rules/);
  assert.match(result.stdout, /vendor-temu/);
  assert.match(result.stdout, /Likely False-Positive Candidates/);
  assert.match(result.stdout, /Used IKEA chair/);
});
