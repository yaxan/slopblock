# SlopBlock

SlopBlock is a local-first Chrome/Chromium extension that filters Facebook Marketplace spam: dropshipped listings, Amazon/Temu-style retail slop, bait prices, sponsored ads, external redirects, store and dealer ads, service/job/MLM spam, scam scripts, counterfeit goods, repeated listing floods, and dead sold/wanted posts — so real secondhand gems are easier to find.

No account, backend, analytics, monetization, or remote rule updates. Filtering happens in the browser against visible Marketplace text; only your settings are stored locally with `chrome.storage.local`.

## How it decides

Explainable weighted rules with a three-band action ladder — see [docs/FILTERING.md](docs/FILTERING.md) for the full model:

- **Hide** is reserved for near-certain signals (sold/ISO posts, scam scripts, sponsored ads, confirmed bait pricing, replica language, repeat floods).
- **Dim** (fogged but visible) covers medium evidence — nothing is removed on a hunch.
- **Label** annotates mild suspicion, and every filtered card can show its reasons.

Repeated-listing floods are **collapsed, not punished**: the first copy always stays visible and only repeats beyond it hide ("repeat of a visible listing, 3 of 9 identical"). Same title alone never counts — search results full of "iPhone 12 128GB" from different sellers at different prices are untouched.

## Tested against real listings

The rules are tuned and gated against real-world text, not intuition:

- `eval/corpus/` holds 190+ labeled entries: real listings fetched from public marketplace pages (furniture, electronics, cars, free stuff, tools…), real dealer/scam/dropship/counterfeit text collected from consumer-protection reports and community documentation, plus curated edge cases (IKEA resales, "cash or venmo", "$15 each", phone numbers, "no dealer fees here"…).
- `npm run eval` scores the whole corpus at every strength in both **card view** (price/title/location — what feed cards actually show) and **detail view**; it reports false positives, misses, and per-rule noise.
- `npm run eval:gate` (part of `npm run verify`) **fails the build if any legit listing gets dimmed or hidden** at balanced strength. Current state: 0 false positives at any strength, 98% of slop actioned in detail view.
- `npm run e2e` loads the built extension into real Chromium against a high-fidelity Marketplace DOM fixture (structure reconstructed from public scraper sources) and runs 31 end-to-end checks: hiding, flood collapse, sponsored-cell removal, infinite scroll, on-card badges, allow-item persistence, popup summary and settings sync, options rule tester.

## Using it

- The **popup** shows what happened on the current page: scanned/hidden counts, top triggers with one-click **Disable**, hidden examples with one-click **Allow item**, strength/action controls, and quick filters (Amazon/Temu sources, IKEA, liquidation stores, sponsored cards, floods, not-for-sale posts, job/loan scams…). Everything saves instantly.
- A small **pill** in the corner of Marketplace pages shows how many listings were filtered; click it for counts and a "Show hidden" preview where every hidden card displays its reason with Allow/Disable buttons.
- The **options page** has every built-in rule with its exact pattern, weight, and confidence (searchable, individually toggleable), a rule tester for pasting listing text, custom block/vendor/allow terms, and JSON export/import. All changes autosave.

## Development

```sh
npm install
npm test          # typecheck + 79 unit tests
npm run eval      # score the real-listing corpus (add -- --verbose for details)
npm run e2e       # build + end-to-end tests in real Chromium (needs npx playwright install chromium once)
npm run build     # production build into dist/
npm run verify    # test + eval gate + build + audit + package checks
npm run package   # verify + write release/slopblock.zip
npm run diagnostics -- path/to/diagnostics.json
node e2e/screenshots.mjs   # UI screenshots (light+dark) into .tmp-tests/screens
```

## Load in Chrome

1. `npm run build`
2. Open `chrome://extensions`, enable Developer mode.
3. "Load unpacked" → select `dist/`.
4. Open Facebook Marketplace.

## Tuning false positives

Fast to deep: on-card badge buttons → popup "This page" (disable a trigger / allow an item) → popup quick filters → strength/action mode → options rule groups → individual rules → custom allow terms → `Copy diagnostics` + `npm run diagnostics` for offline analysis. Details in [docs/FILTERING.md](docs/FILTERING.md#false-positive-recovery).

## Privacy

SlopBlock sends nothing anywhere. No backend, telemetry, ads, payments, or accounts. Copied diagnostics strip URL tracking params and redact phone/email patterns, and only leave the browser if you paste them somewhere yourself. See [PRIVACY.md](PRIVACY.md).
