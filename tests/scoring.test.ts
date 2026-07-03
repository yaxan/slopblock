import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/common/settings";

// The gem-hunting DEFAULTS hide IKEA (Hide all) and dim brand-new titles.
// Tests probing individual rule behavior relax those taste defaults.
const FILTER_MODE_SETTINGS = normalizeSettings({
  ...DEFAULT_SETTINGS,
  quickToggleBlockAll: [],
  disabledRuleIds: ["new-in-box-title"]
});
import { scoreListing } from "../src/common/scoring";
import type { ListingSnapshot } from "../src/common/types";

test("hides obvious dropship vendor listing", () => {
  const result = scoreListing(
    listing({
      title: "Brand new cloud couch Amazon find",
      priceText: "$123",
      visibleText:
        "Brand new cloud couch Amazon find available in multiple colors. Order now, ships from warehouse. Real price starts at $699."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.category === "known-vendor"));
  assert.ok(result.matches.some((match) => match.category === "dropship-phrasing"));
  assert.ok(result.matches.some((match) => match.category === "bait-pricing"));
});

test("allows real used item with human condition details", () => {
  const result = scoreListing(
    listing({
      title: "Solid wood dresser",
      priceText: "$80",
      visibleText: "Solid wood dresser, owned for 8 years. Some scratches on top. Pickup only because we are moving."
    })
  );

  assert.equal(result.action, "allow");
  assert.equal(result.score, 0);
});

test("flags one dollar price with actual price in text", () => {
  const result = scoreListing(
    listing({
      title: "Sectional sofa",
      priceText: "$1",
      visibleText: "$1 Sectional sofa. Not actual price. Message for price. Real price $450."
    })
  );

  assert.ok(result.score >= 50);
  assert.ok(result.matches.some((match) => match.ruleId === "bait-price-gamed"));
});

test("filters store and service listings without explicit vendor names", () => {
  const result = scoreListing(
    listing({
      title: "New mattresses available",
      priceText: "$99",
      visibleText:
        "Warehouse sale. New inventory in stock. Financing available, tax extra, delivery available. Visit our showroom."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.category === "store-business"));
});

test("flags external redirect and off-platform ordering", () => {
  const result = scoreListing(
    listing({
      title: "Dining set",
      priceText: "$250",
      visibleText: "Dining set. Order through www.example-store.com or WhatsApp for delivery."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.category === "external-redirect"));
});

test("hides wanted ISO and trade-only posts", () => {
  const isoResult = scoreListing(
    listing({
      title: "ISO vintage dresser",
      priceText: "$0",
      visibleText: "ISO vintage dresser. Looking to buy this week."
    })
  );
  const requestResult = scoreListing(
    listing({
      title: "Vintage dresser",
      priceText: "$1",
      visibleText: "Does anyone have a vintage dresser for sale? WTB and can pick up today."
    })
  );
  const tradeResult = scoreListing(
    listing({
      title: "Road bike",
      priceText: "$250",
      visibleText: "Road bike in good condition. Trade only for gaming laptop."
    })
  );

  assert.equal(isoResult.action, "hide");
  assert.ok(isoResult.matches.some((match) => match.ruleId === "not-for-sale-title-request"));
  assert.equal(requestResult.action, "hide");
  assert.ok(requestResult.matches.some((match) => match.ruleId === "not-for-sale-request-language"));
  assert.equal(tradeResult.action, "hide");
  assert.ok(tradeResult.matches.some((match) => match.ruleId === "not-for-sale-trade-only"));
});

test("normal pickup preference is not treated as a wanted post", () => {
  const result = scoreListing(
    listing({
      title: "Solid wood dresser",
      priceText: "$80",
      visibleText: "Solid wood dresser in good condition. Looking for quick pickup tonight."
    })
  );

  assert.equal(result.action, "allow");
  assert.ok(!result.matches.some((match) => match.category === "not-for-sale"));
});

test("hides sold pending and reserved unavailable listings", () => {
  const soldResult = scoreListing(
    listing({
      title: "SOLD - IKEA dresser",
      priceText: "$50",
      visibleText: "SOLD - IKEA dresser. Good condition, pickup only."
    })
  );
  const pendingResult = scoreListing(
    listing({
      title: "Solid wood dresser",
      priceText: "Pending",
      visibleText: "Solid wood dresser. Pending pickup."
    })
  );
  const reservedResult = scoreListing(
    listing({
      title: "Reserved vintage lamp",
      priceText: "$30",
      visibleText: "Reserved vintage lamp."
    })
  );

  assert.equal(soldResult.action, "hide");
  assert.ok(soldResult.matches.some((match) => match.ruleId === "not-for-sale-unavailable"));
  assert.equal(pendingResult.action, "hide");
  assert.ok(pendingResult.matches.some((match) => match.ruleId === "not-for-sale-unavailable"));
  assert.equal(reservedResult.action, "hide");
  assert.ok(reservedResult.matches.some((match) => match.ruleId === "not-for-sale-unavailable"));
});

test("sold separately in description is not treated as unavailable", () => {
  const result = scoreListing(
    listing({
      title: "Dining chairs",
      priceText: "$40",
      visibleText: "Dining chairs in good condition. Can be sold separately or as a set."
    })
  );

  assert.equal(result.action, "allow");
  assert.ok(!result.matches.some((match) => match.ruleId === "not-for-sale-unavailable"));
});

test("the first occurrence of a repeated listing is never penalized", () => {
  const firstResult = scoreListing(
    listing({
      title: "Brand new accent chair walnut",
      priceText: "$60",
      visibleText: "Brand new accent chair walnut."
    }),
    DEFAULT_SETTINGS,
    { duplicate: { groupSize: 9, ordinal: 0, tier: "exact" } }
  );
  const repeatResult = scoreListing(
    listing({
      title: "Brand new accent chair walnut",
      priceText: "$60",
      visibleText: "Brand new accent chair walnut."
    }),
    DEFAULT_SETTINGS,
    { duplicate: { groupSize: 9, ordinal: 3, tier: "exact" } }
  );

  assert.ok(!firstResult.matches.some((match) => match.category === "duplicate-flood"));
  assert.ok(repeatResult.matches.some((match) => match.ruleId === "duplicate-flood-repeat"));
  assert.equal(repeatResult.action, "hide");
});

test("seller profile pages ignore duplicate flood evidence", () => {
  const result = scoreListing(
    listing({
      title: "Vintage accent chair walnut",
      priceText: "$60",
      visibleText: "Vintage accent chair walnut."
    }),
    DEFAULT_SETTINGS,
    {
      duplicate: { groupSize: 20, ordinal: 5, tier: "exact" },
      isSellerProfileContext: true
    }
  );

  assert.equal(result.action, "allow");
  assert.ok(!result.matches.some((match) => match.category === "duplicate-flood"));
});

test("profile pages ignore commercial shorthand without condition detail", () => {
  const fixture = listing({
    title: "Accent chair",
    priceText: "$45",
    sellerText: "Listed by Morgan",
    visibleText: "Accent chair in stock. New shipment, warranty available, weekly specials."
  });
  const feedResult = scoreListing(fixture);
  const profileResult = scoreListing(fixture, DEFAULT_SETTINGS, {
    isSellerProfileContext: true
  });

  assert.equal(feedResult.action, "dim");
  assert.ok(feedResult.matches.some((match) => match.ruleId === "store-sales-language"));
  assert.ok(feedResult.matches.some((match) => match.ruleId === "missing-human-context"));
  assert.equal(profileResult.action, "allow");
  assert.ok(!profileResult.matches.some((match) => match.ruleId === "store-sales-language"));
  assert.ok(!profileResult.matches.some((match) => match.ruleId === "missing-human-context"));
});

test("delivery available alone does not hide sparse individual listings", () => {
  const result = scoreListing(
    listing({
      title: "Accent chair",
      priceText: "$45",
      sellerText: "Listed by Morgan",
      visibleText: "Accent chair available today. Delivery available."
    })
  );

  assert.equal(result.action, "allow");
  assert.ok(!result.matches.some((match) => match.ruleId === "store-sales-language"));
  assert.ok(!result.matches.some((match) => match.ruleId === "missing-human-context"));
});

test("commercial inventory language dims store-style listings", () => {
  const result = scoreListing(
    listing({
      title: "Accent chair",
      priceText: "$45",
      visibleText: "Accent chair in stock. New shipment, warranty available, weekly specials."
    })
  );

  assert.equal(result.action, "dim");
  assert.ok(result.matches.some((match) => match.ruleId === "store-sales-language"));
  assert.ok(result.matches.some((match) => match.ruleId === "missing-human-context"));
});

test("standalone sponsored marketplace line is hidden without matching normal title text", () => {
  const sponsoredResult = scoreListing(
    listing({
      title: "Outdoor sofa set",
      priceText: "$399",
      visibleText: "Sponsored Outdoor sofa set $399 Shop now",
      textLines: ["Sponsored", "Outdoor sofa set", "$399", "Shop now"]
    })
  );
  const titleResult = scoreListing(
    listing({
      title: "Sponsored ad shelf",
      priceText: "$20",
      visibleText: "Sponsored ad shelf. Used for office display, good condition, pickup only."
    })
  );

  assert.equal(sponsoredResult.action, "hide");
  assert.ok(sponsoredResult.matches.some((match) => match.ruleId === "store-sponsored-card"));
  assert.equal(titleResult.action, "allow");
  assert.ok(!titleResult.matches.some((match) => match.ruleId === "store-sponsored-card"));
});

test("auto dealer financing and fee language is hidden", () => {
  const financingResult = scoreListing(
    listing({
      title: "2014 Toyota Camry",
      priceText: "$999",
      visibleText:
        "$999 down payment required. Buy here pay here, bad credit approved, drive today. Plus tax title and license."
    })
  );
  const feeResult = scoreListing(
    listing({
      title: "2018 Honda Accord",
      priceText: "$1,499",
      visibleText: "$1499 cash down, WAC. DMV fees and dealer fee extra."
    })
  );

  assert.equal(financingResult.action, "hide");
  assert.ok(financingResult.matches.some((match) => match.ruleId === "store-auto-dealer-financing"));
  assert.ok(financingResult.matches.some((match) => match.ruleId === "store-auto-dealer-fees"));
  assert.equal(feeResult.action, "hide");
  assert.ok(feeResult.matches.some((match) => match.ruleId === "store-auto-dealer-financing"));
  assert.ok(feeResult.matches.some((match) => match.ruleId === "store-auto-dealer-fees"));
});

test("private car listing title and registration details are not dealer spam", () => {
  const result = scoreListing(
    listing({
      title: "2008 Toyota Corolla",
      priceText: "$3,200",
      visibleText: "2008 Toyota Corolla. Clean title, smog done, registration paid, used daily. Pickup only."
    })
  );

  assert.equal(result.action, "allow");
  assert.ok(!result.matches.some((match) => match.ruleId === "store-auto-dealer-financing"));
  assert.ok(!result.matches.some((match) => match.ruleId === "store-auto-dealer-fees"));
});

test("job opportunity and task income pitches are hidden without blocking home-office goods", () => {
  const opportunityResult = scoreListing(
    listing({
      title: "Work from home opportunity",
      priceText: "$1",
      visibleText:
        "Work from home opportunity. Make money online from home, be your own boss, set your own schedule. No experience required."
    })
  );
  const taskResult = scoreListing(
    listing({
      title: "Online product reviews",
      priceText: "$1",
      visibleText: "Product boosting and app optimization. Join our team, paid daily, commission based."
    })
  );
  const deskResult = scoreListing(
    listing({
      title: "Standing desk",
      priceText: "$120",
      visibleText: "Standing desk from my home office. Used for remote work, good condition, pickup only."
    })
  );

  assert.equal(opportunityResult.action, "hide");
  assert.ok(opportunityResult.matches.some((match) => match.ruleId === "service-job-opportunity"));
  assert.equal(taskResult.action, "hide");
  assert.ok(taskResult.matches.some((match) => match.ruleId === "service-task-mlm"));
  assert.equal(deskResult.action, "allow");
  assert.ok(!deskResult.matches.some((match) => match.ruleId === "service-job-opportunity"));
  assert.ok(!deskResult.matches.some((match) => match.ruleId === "service-task-mlm"));
});

test("financial opportunity spam is hidden without blocking normal crypto hardware", () => {
  const loanResult = scoreListing(
    listing({
      title: "Personal loans available",
      priceText: "$1",
      visibleText: "Personal loans available. Guaranteed approval, no credit check loans. Processing fee required."
    })
  );
  const tradingResult = scoreListing(
    listing({
      title: "Forex trading signals",
      priceText: "$1",
      visibleText: "Forex trading signals and crypto mentorship. Guaranteed profits from our investment opportunity."
    })
  );
  const miningRigResult = scoreListing(
    listing({
      title: "Bitcoin mining rig",
      priceText: "$300",
      visibleText: "Bitcoin mining rig. Used for 2 years, fan is loud, pickup only."
    })
  );

  assert.equal(loanResult.action, "hide");
  assert.ok(loanResult.matches.some((match) => match.ruleId === "scam-financial-opportunity"));
  assert.equal(tradingResult.action, "hide");
  assert.ok(tradingResult.matches.some((match) => match.ruleId === "scam-financial-opportunity"));
  assert.equal(miningRigResult.action, "allow");
  assert.ok(!miningRigResult.matches.some((match) => match.ruleId === "scam-financial-opportunity"));
});

test("non-flood context never triggers repeated listing flood", () => {
  const result = scoreListing(
    listing({
      title: "Accent lamp brass vintage",
      priceText: "$45",
      visibleText: "Accent lamp brass vintage."
    }),
    DEFAULT_SETTINGS,
    { duplicate: { groupSize: 1, ordinal: 0, tier: null } }
  );

  assert.ok(!result.matches.some((match) => match.category === "duplicate-flood"));
});

test("disabled category stops affecting score", () => {
  const result = scoreListing(
    listing({
      title: "Amazon find shelf",
      priceText: "$40",
      visibleText: "Amazon find shelf."
    }),
    {
      ...DEFAULT_SETTINGS,
      enabledCategories: {
        ...DEFAULT_SETTINGS.enabledCategories,
        "known-vendor": false
      }
    }
  );

  assert.equal(result.action, "allow");
});

test("allowlist caps a false positive below action threshold", () => {
  const result = scoreListing(
    listing({
      title: "IKEA dresser solid wood",
      priceText: "$100",
      visibleText: "IKEA dresser solid wood. Used for years, scratches, pickup only."
    }),
    {
      ...DEFAULT_SETTINGS,
      customAllowTerms: ["IKEA dresser"]
    }
  );

  assert.equal(result.action, "allow");
  assert.ok(result.matches.some((match) => match.reason === "allowlist: IKEA dresser"));
});

test("item allowlist caps one listing without allowing generic future titles", () => {
  const allowedResult = scoreListing(
    listing({
      idHint: "2289171978176208",
      title: "Accent chair",
      priceText: "$45",
      visibleText: "Accent chair in stock. New shipment, warranty available, weekly specials."
    }),
    {
      ...DEFAULT_SETTINGS,
      customAllowItemIds: ["2289171978176208"]
    }
  );
  const otherResult = scoreListing(
    listing({
      idHint: "999",
      title: "Accent chair",
      priceText: "$45",
      visibleText: "Accent chair in stock. New shipment, warranty available, weekly specials."
    }),
    {
      ...DEFAULT_SETTINGS,
      customAllowItemIds: ["2289171978176208"]
    }
  );

  assert.equal(allowedResult.action, "allow");
  assert.ok(allowedResult.matches.some((match) => match.ruleId === "custom-allow-item"));
  assert.equal(otherResult.action, "dim");
});

test("custom terms match whole words and phrases instead of arbitrary substrings", () => {
  const substringResult = scoreListing(
    listing({
      title: "Shadow box shelf",
      priceText: "$20",
      visibleText: "Shadow box shelf. Used, pickup only."
    }),
    {
      ...DEFAULT_SETTINGS,
      customBlockTerms: ["ad"]
    }
  );
  const wordResult = scoreListing(
    listing({
      title: "Sponsored ad shelf",
      priceText: "$20",
      visibleText: "Sponsored ad shelf. Used, pickup only."
    }),
    {
      ...DEFAULT_SETTINGS,
      customBlockTerms: ["ad"]
    }
  );
  const phraseResult = scoreListing(
    listing({
      title: "Acme Outlet sofa",
      priceText: "$80",
      visibleText: "Acme-Outlet sofa. Brand new, delivery available."
    }),
    {
      ...DEFAULT_SETTINGS,
      customVendorTerms: ["acme outlet"]
    }
  );

  assert.equal(substringResult.action, "allow");
  assert.ok(!substringResult.matches.some((match) => match.ruleId === "custom-block-term"));
  assert.equal(wordResult.action, "hide");
  assert.ok(wordResult.matches.some((match) => match.ruleId === "custom-block-term"));
  assert.ok(phraseResult.matches.some((match) => match.ruleId === "custom-vendor-term"));
});

test("custom allow terms do not rescue substring-only matches", () => {
  const result = scoreListing(
    listing({
      title: "Shadow warehouse chair",
      priceText: "$123",
      visibleText: "Shadow warehouse chair. Not actual price. Read description for price. Actual price $350."
    }),
    {
      ...DEFAULT_SETTINGS,
      customAllowTerms: ["ad"]
    }
  );

  assert.equal(result.action, "hide");
  assert.ok(!result.matches.some((match) => match.ruleId === "custom-allow-term"));
});

test("custom allow terms can recover custom block false positives", () => {
  const result = scoreListing(
    listing({
      title: "Sponsored ad shelf",
      priceText: "$20",
      visibleText: "Sponsored ad shelf. Used, pickup only."
    }),
    {
      ...DEFAULT_SETTINGS,
      customBlockTerms: ["ad"],
      customAllowTerms: ["sponsored ad shelf"]
    }
  );

  assert.equal(result.action, "allow");
  assert.ok(result.matches.some((match) => match.ruleId === "custom-block-term"));
  assert.ok(result.matches.some((match) => match.ruleId === "custom-allow-term"));
});

test("gem-hunting default hides any IKEA mention outright", () => {
  const result = scoreListing(
    listing({
      title: "IKEA Kallax shelf",
      priceText: "$40",
      visibleText: "IKEA Kallax shelf. Used, some scratches, pickup only."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.ruleId === "block-all-ikea"));
});

test("in Filter mode, vendor mentions with retail wording dim instead of hiding", () => {
  const result = scoreListing(
    listing({
      title: "IKEA Kallax shelf",
      priceText: "$40",
      visibleText: "IKEA Kallax shelf. Brand new. Delivery available."
    }),
    FILTER_MODE_SETTINGS
  );

  assert.equal(result.action, "dim");
  assert.ok(result.matches.some((match) => match.ruleId === "vendor-ikea"));
  assert.ok(result.matches.some((match) => match.ruleId === "vendor-retail-combo"));
});

test("dim mode keeps medium-confidence slop visible but dimmed", () => {
  const result = scoreListing(
    listing({
      title: "IKEA Kallax shelf",
      priceText: "$40",
      visibleText: "IKEA Kallax shelf. Brand new. Delivery available."
    }),
    {
      ...DEFAULT_SETTINGS,
      filterMode: "dim"
    }
  );

  assert.equal(result.action, "dim");
});

test("individual vendor rules can be disabled without disabling all vendors", () => {
  const ikeaResult = scoreListing(
    listing({
      title: "IKEA Kallax shelf",
      priceText: "$40",
      visibleText: "IKEA Kallax shelf."
    }),
    {
      ...FILTER_MODE_SETTINGS,
      disabledRuleIds: [...FILTER_MODE_SETTINGS.disabledRuleIds, "vendor-ikea"]
    }
  );
  const temuResult = scoreListing(
    listing({
      title: "Temu accent chair",
      priceText: "$40",
      visibleText: "Temu accent chair. Brand new, order now, warehouse stock."
    }),
    {
      ...FILTER_MODE_SETTINGS,
      disabledRuleIds: [...FILTER_MODE_SETTINGS.disabledRuleIds, "vendor-ikea"]
    }
  );

  assert.ok(!ikeaResult.matches.some((match) => match.ruleId === "vendor-ikea"));
  assert.equal(ikeaResult.action, "allow");
  assert.equal(temuResult.action, "hide");
  assert.ok(temuResult.matches.some((match) => match.ruleId === "vendor-temu"));
});

test("liquidation/outlet rule can be disabled independently", () => {
  const enabledResult = scoreListing(
    listing({
      title: "Open box warehouse liquidation sofa",
      priceText: "$250",
      visibleText: "Open box warehouse liquidation sofa from outlet sale."
    })
  );
  const disabledResult = scoreListing(
    listing({
      title: "Open box warehouse liquidation sofa",
      priceText: "$250",
      visibleText: "Open box warehouse liquidation sofa from outlet sale."
    }),
    {
      ...DEFAULT_SETTINGS,
      disabledRuleIds: ["store-liquidation-outlet"]
    }
  );

  assert.ok(enabledResult.matches.some((match) => match.ruleId === "store-liquidation-outlet"));
  assert.equal(disabledResult.action, "allow");
});

test("dynamic bait-price rule can be disabled independently", () => {
  const enabledResult = scoreListing(
    listing({
      title: "Sectional couch",
      priceText: "$123",
      visibleText: "$123 is not actual price. Read description for price. Actual price $700."
    })
  );
  const disabledResult = scoreListing(
    listing({
      title: "Sectional couch",
      priceText: "$123",
      visibleText: "$123 is not actual price. Read description for price. Actual price $700."
    }),
    {
      ...DEFAULT_SETTINGS,
      disabledRuleIds: ["bait-price-dynamic"]
    }
  );

  assert.equal(enabledResult.action, "hide");
  assert.ok(enabledResult.matches.some((match) => match.ruleId === "bait-price-gamed"));
  assert.equal(disabledResult.action, "allow");
});

test("explicit counterfeit language is hidden", () => {
  const result = scoreListing(
    listing({
      title: "1:1 Louis Vuitton replica bag",
      priceText: "$85",
      visibleText: "1:1 LV replica bag, mirror quality, no receipt."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.category === "counterfeit"));
});

test("luxury authenticity dodges dim when paired with low price", () => {
  const result = scoreListing(
    listing({
      title: "Gucci purse",
      priceText: "$60",
      visibleText: "Gucci purse, no receipt or dust bag. I don't know if it's real."
    })
  );

  assert.equal(result.action, "dim");
  assert.ok(result.matches.some((match) => match.ruleId === "counterfeit-authenticity-dodge"));
  assert.ok(result.matches.some((match) => match.ruleId === "counterfeit-luxury-underpriced"));
});

test("fake payment and verification-code scam language is hidden", () => {
  const paymentResult = scoreListing(
    listing({
      title: "Marketplace payment help",
      priceText: "$1",
      visibleText: "Payment is pending. Upgrade your Zelle business account first so funds can be released."
    })
  );
  const codeResult = scoreListing(
    listing({
      title: "Quick verification required",
      priceText: "$1",
      visibleText: "Send me the six digit verification code before pickup."
    })
  );

  assert.equal(paymentResult.action, "hide");
  assert.ok(paymentResult.matches.some((match) => match.ruleId === "scam-fake-payment-upgrade"));
  assert.equal(codeResult.action, "hide");
  assert.ok(codeResult.matches.some((match) => match.ruleId === "scam-verification-code"));
});

test("gift-card crypto and overpayment scam language is hidden without blocking normal crypto items", () => {
  const giftCardResult = scoreListing(
    listing({
      title: "Sofa hold",
      priceText: "$80",
      visibleText: "Payment with Apple gift cards required before pickup."
    })
  );
  const overpaymentResult = scoreListing(
    listing({
      title: "Refund difference",
      priceText: "$200",
      visibleText: "Check for more than asking price. Refund the difference after deposit clears."
    })
  );
  const miningRigResult = scoreListing(
    listing({
      title: "Bitcoin mining rig",
      priceText: "$300",
      visibleText: "Bitcoin mining rig. Used for 2 years, fan is loud, pickup only."
    })
  );

  assert.equal(giftCardResult.action, "hide");
  assert.ok(giftCardResult.matches.some((match) => match.ruleId === "scam-gift-card-crypto"));
  assert.equal(overpaymentResult.action, "hide");
  assert.ok(overpaymentResult.matches.some((match) => match.ruleId === "scam-overpayment-refund"));
  assert.equal(miningRigResult.action, "allow");
});

test("authenticated luxury listing is not hidden by underpriced-luxury heuristic alone", () => {
  const result = scoreListing(
    listing({
      title: "Vintage Gucci wallet",
      priceText: "$90",
      visibleText: "Vintage Gucci wallet, receipt included, worn corners, pickup only."
    })
  );

  assert.notEqual(result.action, "hide");
  assert.ok(!result.matches.some((match) => match.ruleId === "counterfeit-luxury-underpriced"));
});

test("real moving-sale appliance with generic brand is allowed", () => {
  const result = scoreListing(
    listing({
      title: "Samsung washer and dryer",
      priceText: "$200",
      visibleText: "Samsung washer and dryer set. Owned for 5 years, works but scratched. Pickup only, moving this week."
    })
  );

  assert.equal(result.action, "allow");
});

test("in Filter mode, used retail-brand furniture with condition details stays visible", () => {
  const result = scoreListing(
    listing({
      title: "IKEA Billy bookcase",
      priceText: "$25",
      visibleText: "IKEA Billy bookcase. Used for 6 years, shelf peg missing, scratches on side. Pickup only."
    }),
    FILTER_MODE_SETTINGS
  );

  assert.equal(result.action, "allow");
});

test("sparse human condition shorthand keeps retail-brand listings visible", () => {
  const ikeaResult = scoreListing(
    listing({
      title: "IKEA MALM dresser",
      priceText: "$75",
      visibleText: "IKEA MALM dresser. Good condition. Pickup in Ballard."
    }),
    FILTER_MODE_SETTINGS
  );
  const wayfairResult = scoreListing(
    listing({
      title: "Wayfair couch",
      priceText: "$120",
      visibleText: "Wayfair couch. Gently used, no stains, minor wear on one arm."
    })
  );

  assert.equal(ikeaResult.action, "allow");
  assert.ok(ikeaResult.matches.some((match) => match.ruleId === "gem-condition-details"));
  assert.equal(wayfairResult.action, "allow");
  assert.ok(wayfairResult.matches.some((match) => match.ruleId === "gem-condition-details"));
});

test("condition shorthand does not rescue obvious dropship source spam", () => {
  const result = scoreListing(
    listing({
      title: "Temu patio chair",
      priceText: "$123",
      visibleText:
        "Temu patio chair. Like new style, available in multiple colors, ships from warehouse. Actual price $299."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.ruleId === "vendor-temu"));
  assert.ok(result.matches.some((match) => match.category === "dropship-phrasing"));
  assert.ok(result.matches.some((match) => match.category === "bait-pricing"));
});

test("legitimate Amazon-branded used electronics are not hidden by source-word alone", () => {
  const echoResult = scoreListing(
    listing({
      title: "Amazon Echo Dot",
      priceText: "$20",
      visibleText: "Amazon Echo Dot. Works great, factory reset, pickup only."
    })
  );
  const tabletResult = scoreListing(
    listing({
      title: "Amazon Fire tablet",
      priceText: "$25",
      visibleText: "Amazon Fire tablet. Screen cracked but tested and working, no charger."
    })
  );

  assert.equal(echoResult.action, "allow");
  assert.ok(!echoResult.matches.some((match) => match.ruleId === "vendor-amazon"));
  assert.ok(echoResult.matches.some((match) => match.ruleId === "gem-condition-details"));
  assert.equal(tabletResult.action, "allow");
  assert.ok(tabletResult.matches.some((match) => match.ruleId === "gem-condition-details"));
});

test("Amazon source slop is still hidden when paired with catalog fulfillment language", () => {
  const result = scoreListing(
    listing({
      title: "Amazon find smart plug",
      priceText: "$15",
      visibleText:
        "Amazon find smart plug. Brand new, works with Alexa, delivery available, ships from warehouse, limited stock."
    })
  );

  assert.equal(result.action, "hide");
  assert.ok(result.matches.some((match) => match.ruleId === "vendor-amazon"));
  assert.ok(result.matches.some((match) => match.category === "dropship-phrasing"));
  assert.ok(!result.matches.some((match) => match.ruleId === "gem-condition-details"));
});

test("reference photo disclaimers are hidden without catching normal photo notes", () => {
  const referenceResult = scoreListing(
    listing({
      title: "Twin mattress",
      priceText: "$2",
      visibleText: "Picture for reference only, not actual mattress. Multiple sizes available, delivery available."
    })
  );
  const stockResult = scoreListing(
    listing({
      title: "Bathroom vanity",
      priceText: "$180",
      visibleText: "Sample photos for reference. Actual item may vary. Product dimensions available on request."
    })
  );
  const priceResult = scoreListing(
    listing({
      title: "Dining table set",
      priceText: "$123",
      visibleText: "$123 is not actual price. Read description for price. Actual price $650."
    })
  );
  const normalPhotoResult = scoreListing(
    listing({
      title: "Vintage desk",
      priceText: "$90",
      visibleText: "Vintage desk. See third picture for close-up reference. Used for 5 years, scratches, pickup only."
    })
  );

  assert.equal(referenceResult.action, "hide");
  assert.ok(referenceResult.matches.some((match) => match.ruleId === "catalog-reference-photo"));
  assert.equal(stockResult.action, "dim");
  assert.ok(stockResult.matches.some((match) => match.ruleId === "catalog-reference-photo"));
  assert.ok(!priceResult.matches.some((match) => match.ruleId === "catalog-reference-photo"));
  assert.equal(normalPhotoResult.action, "allow");
  assert.ok(!normalPhotoResult.matches.some((match) => match.ruleId === "catalog-reference-photo"));
});

test("realistic slop and gem corpus stays calibrated", () => {
  const cases: Array<{ name: string; listing: Partial<ListingSnapshot>; action: "allow" | "label" | "dim" | "hide" }> = [
    {
      name: "Wayfair catalog furniture with delivery",
      action: "hide",
      listing: {
        title: "Wayfair modern sectional",
        priceText: "$399",
        visibleText:
          "Wayfair modern sectional. Brand new in box, premium quality materials, delivery available, weekly specials."
      }
    },
    {
      name: "price hidden in description",
      action: "hide",
      listing: {
        title: "Dining table set",
        priceText: "$123",
        visibleText: "$123 is not actual price. Read description for price. Real price $650."
      }
    },
    {
      name: "reference-photo catalog listing",
      action: "hide",
      listing: {
        title: "Digital air conditioner",
        priceText: "$350",
        visibleText: "Picture is not actual AC unit. Multiple sizes available, delivery available."
      }
    },
    {
      name: "phone redirect ad",
      action: "hide",
      listing: {
        title: "Queen mattress sale",
        priceText: "$99",
        visibleText: "New shipment in stock. Text 415-555-0134 to buy. Financing available and delivery available."
      }
    },
    {
      name: "rental application spam",
      action: "dim",
      listing: {
        title: "Room for rent",
        priceText: "$800",
        visibleText: "Room for rent. Rental application fee due today. Property manager showing."
      }
    },
    {
      name: "work-from-home opportunity spam",
      action: "hide",
      listing: {
        title: "Remote online job",
        priceText: "$1",
        visibleText: "Remote online job. Earn extra income online, paid daily, no experience required."
      }
    },
    {
      name: "loan approval spam",
      action: "hide",
      listing: {
        title: "Personal loans",
        priceText: "$1",
        visibleText: "Personal loans and debt relief. No credit check loans, funding available."
      }
    },
    {
      name: "deposit scam",
      action: "hide",
      listing: {
        title: "Toyota Camry",
        priceText: "$1,200",
        visibleText: "Toyota Camry. Shipping only, send deposit required by Zelle to hold."
      }
    },
    {
      name: "dealer down-payment price bait",
      action: "hide",
      listing: {
        title: "2016 Honda Civic",
        priceText: "$999",
        visibleText: "$999 down payment. Financing available, tax extra, call today to apply."
      }
    },
    {
      name: "not-authentic designer listing",
      action: "hide",
      listing: {
        title: "Prada sunglasses",
        priceText: "$45",
        visibleText: "Prada sunglasses, not authentic, no receipt."
      }
    },
    {
      name: "used IKEA is hidden by the gem-hunting default",
      action: "hide",
      listing: {
        title: "IKEA Kallax shelf",
        priceText: "$35",
        visibleText: "IKEA Kallax shelf, owned for 3 years. Scratches on one side. Pickup only because we are moving."
      }
    },
    {
      name: "used West Elm table from real person",
      action: "allow",
      listing: {
        title: "West Elm coffee table",
        priceText: "$120",
        visibleText: "West Elm coffee table. Used for 4 years, small dent on top. Pickup only this weekend."
      }
    },
    {
      name: "free curb alert stays visible",
      action: "allow",
      listing: {
        title: "Free curb alert bookshelf",
        priceText: "Free",
        visibleText: "Free curb alert bookshelf. Scratched but usable. Pickup only, no delivery."
      }
    }
  ];

  for (const fixture of cases) {
    const result = scoreListing(listing(fixture.listing));
    assert.equal(result.action, fixture.action, fixture.name);
  }

  // The same used-IKEA listing is fully visible once the user picks Filter.
  const filterModeIkea = scoreListing(
    listing({
      title: "IKEA Kallax shelf",
      priceText: "$35",
      visibleText: "IKEA Kallax shelf, owned for 3 years. Scratches on one side. Pickup only because we are moving."
    }),
    FILTER_MODE_SETTINGS
  );
  assert.equal(filterModeIkea.action, "allow", "taste default must stay reversible");
});

test("brand-new/in-box titles dim by default; sealed collectibles are exempt", () => {
  const flipper1 = scoreListing(
    listing({ title: "New, in Box | Modern Fluted 5-Drawer Dresser", priceText: "$150", visibleText: "New, in Box | Modern Fluted 5-Drawer Dresser" })
  );
  assert.equal(flipper1.action, "dim");
  assert.ok(flipper1.matches.some((match) => match.ruleId === "new-in-box-title"));

  const flipper2 = scoreListing(
    listing({ title: "✨ Stunning Brand New Pair of Walnut Nightstands", priceText: "$220", visibleText: "✨ Stunning Brand New Pair of Walnut Nightstands" })
  );
  assert.equal(flipper2.action, "dim");

  const oneWord = scoreListing(
    listing({ title: "Brandnew wood dresser with six drawers", priceText: "$650", visibleText: "Brandnew wood dresser with six drawers" })
  );
  assert.equal(oneWord.action, "dim", "'Brandnew' as one word counts");

  const collector = scoreListing(
    listing({ title: "LEGO Millennium Falcon 75192 sealed", priceText: "$500", visibleText: "LEGO Millennium Falcon 75192 sealed" })
  );
  assert.equal(collector.action, "allow", "bare 'sealed' collectors stay visible");

  const filterOff = scoreListing(
    listing({ title: "New, in Box | Modern Fluted 5-Drawer Dresser", priceText: "$150", visibleText: "New, in Box | Modern Fluted 5-Drawer Dresser" }),
    FILTER_MODE_SETTINGS
  );
  assert.equal(filterOff.action, "allow", "reversible via the quick filter");
});

test("gem-hunting defaults migrate old saves but respect explicit choices", () => {
  // Fresh install: IKEA ships hidden.
  assert.deepEqual(normalizeSettings({}).quickToggleBlockAll, ["ikea"]);
  assert.equal(normalizeSettings({}).defaultsVersion, 2);

  // Pre-v2 save with no hide-alls: adopts the new default once.
  assert.deepEqual(normalizeSettings({ quickToggleBlockAll: [] }).quickToggleBlockAll, ["ikea"]);

  // Pre-v2 save where the user had configured hide-alls: respected as-is.
  assert.deepEqual(normalizeSettings({ quickToggleBlockAll: ["liquidation"] }).quickToggleBlockAll, ["liquidation"]);

  // v2 save where the user explicitly switched IKEA back to Filter: sticks.
  assert.deepEqual(normalizeSettings({ defaultsVersion: 2, quickToggleBlockAll: [] }).quickToggleBlockAll, []);
});

test("settings normalization preserves per-rule disables and fills new defaults", () => {
  const settings = normalizeSettings({
    enabled: true,
    disabledRuleIds: ["vendor-ikea", "store-liquidation-outlet", "vendor-ikea"],
    enabledCategories: {
      "known-vendor": false
    }
  });

  assert.deepEqual(settings.disabledRuleIds, ["vendor-ikea", "store-liquidation-outlet"]);
  assert.deepEqual(settings.customAllowItemIds, []);
  assert.equal(settings.enabledCategories["known-vendor"], false);
  assert.equal(settings.enabledCategories.counterfeit, true);
  assert.equal(settings.showReasons, true);
});

function listing(overrides: Partial<ListingSnapshot>): ListingSnapshot {
  return {
    title: "",
    priceText: "",
    locationText: "",
    visibleText: "",
    ...overrides
  };
}
