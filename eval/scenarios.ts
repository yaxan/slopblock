import { scoreListing } from "../src/common/scoring";
import { DEFAULT_SETTINGS } from "../src/common/settings";
import { analyzeDuplicateFlood } from "../src/content/duplicateFlood";
import type { FilterAction, ListingSnapshot } from "../src/common/types";

type Scenario = {
  name: string;
  description: string;
  snapshots: ListingSnapshot[];
  isSellerProfileContext?: boolean;
  /** action expectations by snapshot index; unlisted indexes expect "allow" */
  expect: Record<number, FilterAction> | ((actions: FilterAction[]) => string | null);
};

function listing(index: number, title: string, price: string, location: string, id?: string): ListingSnapshot {
  const idHint = id ?? `id-${index}`;
  return {
    idHint,
    url: `https://www.facebook.com/marketplace/item/${idHint}/`,
    title,
    priceText: price,
    locationText: location,
    visibleText: [price, title, location].filter(Boolean).join("\n"),
    textLines: [price, title, location].filter(Boolean)
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: "search-results-common-item",
    description:
      "Search page: 10 different sellers list 'iPhone 12 128GB unlocked' at different prices. All must stay visible.",
    snapshots: Array.from({ length: 10 }, (_, index) =>
      listing(index, "iPhone 12 128GB unlocked", `$${180 + index * 25}`, index % 2 ? "Toronto, ON" : "Mississauga, ON")
    ),
    expect: {}
  },
  {
    name: "search-results-same-price-triple",
    description:
      "3 sellers coincidentally list the same title at the same common price. Below collapse threshold, all visible.",
    snapshots: Array.from({ length: 3 }, (_, index) => listing(index, "iPhone 12 128GB unlocked", "$250", "Toronto, ON")),
    expect: {}
  },
  {
    name: "true-flood-identical",
    description: "9 distinct listing IDs, identical title+price+location. Keep the first, hide the repeats.",
    snapshots: Array.from({ length: 9 }, (_, index) =>
      listing(index, "Sectional Sofa Couch Grey Fast Delivery", "$199", "Toronto, ON")
    ),
    expect: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, "hide"]))
  },
  {
    name: "true-flood-bait-price-rotation",
    description: "8 distinct IDs, same title+location, prices rotate $1/$2/Free. Keep first, hide the rest.",
    snapshots: Array.from({ length: 8 }, (_, index) =>
      listing(index, "Modern Luxury Sofa Set Sale", ["$1", "$2", "Free"][index % 3] ?? "$1", "Toronto, ON")
    ),
    expect: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, "hide"]))
  },
  {
    name: "mass-flood-rotating-locations",
    description: "7 distinct IDs, same title+price, locations rotate across suburbs. Keep first, hide the rest.",
    snapshots: Array.from({ length: 7 }, (_, index) =>
      listing(
        index,
        "Ergonomic Gaming Chair Racing Style",
        "$149",
        ["Toronto, ON", "Vaughan, ON", "Markham, ON", "Oshawa, ON", "Milton, ON", "Ajax, ON", "Whitby, ON"][index] ?? ""
      )
    ),
    expect: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, "hide"]))
  },
  {
    name: "generic-free-title-never-collapses",
    description: "5 'Free couch' posts from different sellers: generic short titles never flood-collapse.",
    snapshots: Array.from({ length: 5 }, (_, index) => listing(index, "Free couch", "Free", "Toronto, ON")),
    expect: {}
  },
  {
    name: "cloned-dom-nodes-single-listing",
    description: "The same listing (same item ID) rendered 4 times by Facebook counts once; nothing hidden.",
    snapshots: Array.from({ length: 4 }, (_, index) =>
      listing(index, "Solid Wood Bookshelf Dark Walnut", "$120", "Toronto, ON", "same-item-42")
    ),
    expect: {}
  },
  {
    name: "seller-profile-page-repeats",
    description: "Seller profile pages never flood-collapse (a seller's own catalog view).",
    isSellerProfileContext: true,
    snapshots: Array.from({ length: 8 }, (_, index) =>
      listing(index, "Handmade Charcuterie Board Walnut", "$45", "Toronto, ON")
    ),
    expect: {}
  },
  {
    name: "mixed-feed-flood-and-legit",
    description: "A flood group interleaved with unique legit listings: only the flood repeats hide.",
    snapshots: [
      listing(0, "Solid pine cube shelf white", "$60", "Toronto, ON"),
      listing(1, "Queen Mattress Pillowtop In Plastic", "$120", "Toronto, ON"),
      listing(2, "Vintage oak dresser", "$220", "Toronto, ON"),
      listing(3, "Queen Mattress Pillowtop In Plastic", "$120", "Scarborough, ON"),
      listing(4, "Free coffee table", "Free", "Toronto, ON"),
      listing(5, "Queen Mattress Pillowtop In Plastic", "$120", "North York, ON"),
      listing(6, "iPhone 12 128GB unlocked", "$250", "Toronto, ON"),
      listing(7, "Queen Mattress Pillowtop In Plastic", "$120", "Etobicoke, ON"),
      listing(8, "Queen Mattress Pillowtop In Plastic", "$120", "Toronto, ON"),
      listing(9, "Queen Mattress Pillowtop In Plastic", "$120", "Mississauga, ON")
    ],
    expect: { 3: "hide", 5: "hide", 7: "hide", 8: "hide", 9: "hide" }
  }
];

export function runFloodScenarios(verbose: boolean): number {
  console.log("== Duplicate-flood page scenarios ==");
  let failures = 0;

  for (const scenario of SCENARIOS) {
    const infos = scenario.isSellerProfileContext ? [] : analyzeDuplicateFlood(scenario.snapshots);
    const actions = scenario.snapshots.map((snapshot, index) => {
      const context: Parameters<typeof scoreListing>[2] = {
        isSellerProfileContext: scenario.isSellerProfileContext ?? false
      };
      const info = infos[index];
      if (info) {
        context.duplicate = info;
      }
      const result = scoreListing(snapshot, DEFAULT_SETTINGS, context);
      return result.action;
    });

    let problem: string | null = null;
    if (typeof scenario.expect === "function") {
      problem = scenario.expect(actions);
    } else {
      for (const [index, action] of actions.entries()) {
        const expected = scenario.expect[index] ?? "allow";
        if (action !== expected) {
          problem = `index ${index}: expected ${expected}, got ${action}`;
          break;
        }
      }
    }

    if (problem) {
      failures += 1;
      console.log(`  FAIL ${scenario.name}: ${problem}`);
      if (verbose) {
        console.log(`       actions: ${actions.join(", ")}`);
        console.log(`       ${scenario.description}`);
      }
    } else {
      console.log(`  ok   ${scenario.name}`);
    }
  }

  return failures;
}
