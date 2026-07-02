import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticItemUrl, redactDiagnosticText, toContentDecision } from "../src/content/diagnostics";

test("diagnosticItemUrl strips query params and normalizes known item IDs", () => {
  assert.equal(
    diagnosticItemUrl({
      idHint: "12345",
      url: "https://www.facebook.com/marketplace/item/12345/?ref=marketplace_profile",
      title: "Chair",
      priceText: "$10",
      locationText: "",
      visibleText: "Chair"
    }),
    "https://www.facebook.com/marketplace/item/12345/"
  );
  assert.equal(
    diagnosticItemUrl({
      url: "https://www.facebook.com/marketplace/item/999/?ref=search&tracking=abc#frag",
      title: "Chair",
      priceText: "$10",
      locationText: "",
      visibleText: "Chair"
    }),
    "https://www.facebook.com/marketplace/item/999/"
  );
});

test("redactDiagnosticText removes common direct contact details", () => {
  const redacted = redactDiagnosticText("Text 415-555-0134 or email seller@example.com for pickup.");

  assert.match(redacted, /\[phone\]/);
  assert.match(redacted, /\[email\]/);
  assert.doesNotMatch(redacted, /415-555-0134/);
  assert.doesNotMatch(redacted, /seller@example.com/);
});

test("toContentDecision exports bounded redacted diagnostics", () => {
  const decision = toContentDecision(
    {
      idHint: "222",
      url: "https://www.facebook.com/marketplace/item/222/?ref=search",
      title: "Lamp",
      priceText: "$20",
      locationText: "",
      visibleText: `Lamp available. Call 415-555-0134. ${"x".repeat(400)}`
    },
    {
      action: "hide",
      score: 42,
      matches: [
        {
          ruleId: "external-phone-number",
          category: "external-redirect",
          weight: 32,
          reason: "phone-number redirect",
          confidence: "medium",
          sample: `Text 415-555-0134 or email seller@example.com ${"x".repeat(300)}`
        }
      ]
    }
  );

  assert.equal(decision.url, "https://www.facebook.com/marketplace/item/222/");
  assert.equal(decision.visibleTextExcerpt.length, 260);
  assert.match(decision.visibleTextExcerpt, /\[phone\]/);
  assert.equal(decision.matches[0]?.sample?.length, 160);
  assert.match(decision.matches[0]?.sample ?? "", /\[phone\]/);
  assert.match(decision.matches[0]?.sample ?? "", /\[email\]/);
  assert.doesNotMatch(decision.matches[0]?.sample ?? "", /415-555-0134/);
  assert.doesNotMatch(decision.matches[0]?.sample ?? "", /seller@example.com/);
});
