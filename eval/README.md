# SlopBlock eval

Real-world evaluation corpus and harness. This is what keeps the filter honest: rules only ship if they produce **zero false positives** on real listings.

## Layout

- `corpus/*.json` — labeled entries scored by `npm run eval`.
  - `craigslist-real.json` — real listings fetched from public Craigslist pages across cities/categories (same seller population as Marketplace), reviewed and labeled by hand. Includes organically-found true positives: a curbstoning dealer ad, a commercial parts-flood seller, a suspect luxury purse.
  - `web-sourced-slop.json` — real spam text quoted from consumer-protection reports, dealer sites, and community documentation (sources in each entry).
  - `handwritten-*.json` — curated edge cases probing every rule's false-positive boundary (vendor mentions in legit resales, "$15 each", "cash or venmo", phone numbers, negated dealer terms, borderline cases).
- `raw/` — provenance: fetched raw data, the collected spam examples, and `fb-dom-notes.md` (researched real Marketplace DOM structure with per-claim sources, used to build the E2E fixture).
- `run.ts` + `scenarios.ts` — the harness: scores every corpus entry at all three strengths in card view (price/title/location only — what feed cards show) and detail view (with description), prints FP/miss/per-rule-noise tables, and runs duplicate-flood page scenarios (search results vs true floods vs seller profiles).
- `fetch-craigslist.mjs` — refetches fresh real listings (headless Chrome) into `raw/` for corpus expansion.

## Commands

```sh
npm run eval               # summary tables
npm run eval -- --verbose  # every failing entry with matched rules and samples
npm run eval -- --level=balanced
npm run eval:gate          # exit 1 on any legit dim/hide at balanced or scenario failure (in npm run verify)
```

## Labels

- `legit` — must stay fully visible (`allow`). Any label/dim/hide is a false positive; dim/hide at balanced fails the gate.
- `slop` — should be actioned; detail-view `allow` counts as a miss.
- `borderline` — judgment calls (honest replica furniture, cross-posters, small local shops); reported but never gated.

When adding entries: real text only, keep the `source` URL, and label with care — this corpus is the spec.
