# SlopBlock Filtering Model

SlopBlock uses explainable weighted rules. Every decision is a sum of visible rule matches — no opaque ML, no remote calls — so every hidden card can show exactly why it was hidden.

## The action ladder

Scores map to actions through three thresholds per aggressiveness level:

| | label ≥ | dim ≥ | hide ≥ |
|---|---|---|---|
| Relaxed | 28 | 48 | 86 |
| Balanced (default) | 20 | 34 | 72 |
| Strict | 18 | 26 | 58 |

- **Label**: card stays fully visible with a small reason badge.
- **Dim**: card stays visible but fogged — medium evidence never removes anything.
- **Hide**: card is removed. Only near-certain signals reach this band.
- "Dim only" mode caps the strongest action at dim; "Label only" never alters visibility.

Weights are banded to match: 12–19 context-only (never visible alone), 20–33 label-alone, 34–54 dim-alone, 55+ reserved for signals that are nearly always right (sold/wanted posts, scam scripts, sponsored ads, confirmed bait pricing, flood repeats).

## Design principles (learned from real-listing testing)

The rule weights were tuned against a corpus of real listings fetched from public marketplace pages plus real spam/scam text collected from consumer-protection reports (see `eval/`). The eval gate (`npm run eval:gate`) fails the build if any legit corpus listing gets dimmed or hidden at balanced strength.

1. **Vendor mentions are context, not crimes.** "IKEA Kallax shelf", "Amazon Echo", "bought from Wayfair originally" are everyday legit resales. Vendor rules sit in the low bands, and the `vendor-retail-combo` rule escalates only when a vendor mention appears alongside retail-style wording with no human condition details. Amazon product names (Echo, Kindle, Fire, Basics…) are excluded from the Amazon source rule entirely.
1b. **Retail platform artifacts are near-certain slop.** Shop-catalog product cards ("View in 3D", "Choose color:" configurators) are retailers advertising inside search results, not people selling things — they hide on sight. Tokenization variants count too ("Brandnew" = "brand new"), and "read description" on a Free/$1 placeholder price is bait even without the word "price".
2. **Everyday phrasing is not evidence.** "$15 each", "cash or venmo", "delivery available", "text me at 416-…", "brand new in box — unwanted gift", "no dealer fees here" (negation-aware), and price-drop strikethroughs are all normal human listing language and are specifically kept out of the strong rules.
3. **Definitive signals are not rescued by condition words.** "Good condition" doesn't make a SOLD post buyable, so gem-positive offsets are ignored once a 70+ signal fires. User allowlists still always win.
4. **Hide requires certainty.** Single medium-confidence rules can at most dim. Hiding requires either one near-certain signal or several independent ones.

## Deep scan: judging feed cards by their descriptions

Feed cards expose only price/title/location, so description-only slop is undetectable from card text no matter how good the rules are. With **deep scan** (default on; popup and settings switch), SlopBlock background-fetches listing pages from facebook.com — the identical same-origin request the browser makes when the user clicks a card — and extracts only the seller-written fields (title, price, description, sold/pending state) from the page's embedded listing data:

- Viewport-first and **concurrent** (up to 10 parallel fetches — Facebook serves over HTTP/2, which multiplexes them over one connection, so they read as a single busy connection like FB's own app, not a swarm), so a full page is vetted in a couple of seconds rather than the ~25s a serial crawl took. Cards on screen are fetched before the look-ahead ring, so the listing you're about to click resolves first. Safety comes from an **adaptive rate budget (AIMD)** — starts at 120 fetches/min, earns +40/min for every clean 15s up to 360/min, and *halves* the moment Facebook returns a 429/503 (plus a hard pause) — not from crawling slowly; paused while the tab is hidden. Cards scrolled far past are pruned from the queue so fetches keep pace with what's on screen. The pill shows outstanding work for the current page view ("vetting N", drains to zero; counters re-base on every navigation/search so they never accumulate session-lifetime numbers next to the page's "Scanned" count), and opening a listing scores it instantly regardless.
- Two extraction paths: the embedded listing JSON, and a DOM-parser fallback that reuses the detail-page extractor for server-rendered pages (some vehicle/dealer listings ship rendered HTML with no JSON payload). Login-wall/checkpoint responses are treated as retryable, not as "no data".
- The popup summary and Copy-debug-data report include deep-scan health (fetched, parsed via JSON vs DOM, errors, and whether any fetch hit a login wall) so misses are diagnosable instead of silent.
- The deep result is merged with the card result and the stronger verdict wins, so flood/sponsored context from the card is never lost.
- Verdicts are cached in memory only for the tab session — no listing history is stored. Visiting a listing's detail page feeds the same cache, so a listing you opened once is judged on full text when it reappears in the feed.
- Extraction reads listing fields only; if they can't be found (login walls, layout changes), the card is left alone.
- Bonus: `is_sold`/`is_pending` flags from the listing data catch dead listings from the feed.

## Photo analysis: on-device, no uploads

Listing photos carry signals text can't. Everything below runs locally via canvas — no OCR models, no reverse-image-search services, nothing uploaded (toggle: "Analyze listing photos on this device"):

- **Catalog-style detection**: retailer product photos are product-on-pure-white (Amazon requires #FFFFFF backgrounds; Wayfair/Temu look the same). A white border ring around a real subject adds a context-band signal (`image-catalog-photo`, weight 18) that stacks with vendor/retail wording — "IKEA MALM Brand New in box" plus a stock photo reaches hide, while a real used item photographed in a room is untouched. Blank frames and legit sellers reusing an official photo for a genuinely used item (condition words present) stay safe.
- **Image-duplicate flood tier**: a perceptual hash (64-bit dHash, tolerant of JPEG re-encoding) extends the collapse model: same title + same photo across 4+ distinct listings collapses the repeats even when the flooder rotates BOTH price and location — the case no text tier can catch. Different sellers photographing their own items never hash-collide.
- **"Find photo online"**: a button on badges and detail banners opens Google Lens with the photo URL for a true reverse image search — strictly user-initiated, in a new tab.
- CDN images that refuse cross-origin pixel access simply produce no signal (fail open).

OCR was considered and deliberately deferred: a WASM OCR engine adds megabytes and ~100ms+ per thumbnail, and the white-background + duplicate-photo signals already catch the dominant copy-paste patterns those watermarks indicate.

## Item detail pages: where descriptions get scanned

Feed cards only expose price/title/location, so description-only slop (a card that says nothing but a description full of Wayfair catalog links) is invisible at browse time — that is a property of what Facebook renders, not a rule gap. SlopBlock therefore scans the **item detail page** (`/marketplace/item/<id>`, including the dialog variant) separately:

- The primary listing is located from the page's title heading and scoped so related-items grids and the right-rail Sponsored box never bleed into its score.
- Outbound links are read from **hrefs, not display text**: Facebook wraps external links in `l.facebook.com/l.php?u=…` redirects and truncates the visible text, so the real destination is decoded from the wrapper.
- Truncated descriptions are expanded (the "See more" toggle is activated once) so published text can't hide from scanning — this is a local UI action; nothing is fetched.
- The verdict is shown as an **inline banner** with score, reasons, and Allow/Disable buttons. A page the user deliberately opened is annotated, never removed.
- The structured `Condition` metadata row is treated correctly: bare "condition" is not human context (it appears on every listing), `Condition New` counts as retail context, and `Condition Used - Good` counts as human context.
- Retailer **product-page links** (wayfair/amazon/walmart/… URLs with `/pdp/`, `/dp/`, `/ip/`-style product paths) are a high-confidence rule of their own: a listing that links a retailer catalog page while claiming Condition New is dropshipping. A used listing pasting a retail link for price comparison keeps its gem offsets and at most dims.
- Card containers are required to contain **exactly one distinct listing**, and no finder may hide an element that spans page chrome (`role=main`/`role=dialog`/a page heading) — hiding one bad related card can never blank the page.

## Duplicate floods: collapse, don't punish

The old model penalized every card sharing a repeated title — which mass-flagged legitimate search results ("iPhone 12 128GB" from ten different sellers). The new model **collapses repeats instead**:

- The **first occurrence always stays visible**. Only repeats beyond it hide, with a badge like "repeat of a visible listing (3 of 9 identical)".
- Same title alone is never a flood. Collapse requires distinct Marketplace item IDs **and** matching price:
  - **exact**: same title + price + location, 4+ distinct listings;
  - **bait**: same title + location with every copy at ≤$5/Free, 4+ listings (price-rotating bait floods);
  - **mass**: same title + price across any locations, 6+ listings (location-rotating repost floods).
- Generic short titles ("Free couch") never build flood fingerprints; cloned DOM nodes of one listing count once; seller profile pages never collapse (a seller's own catalog legitimately repeats).

## Rule groups

- `Known vendors`: dropship sources (Temu, AliExpress, DHgate…) at label-level weights; brand/provenance mentions (IKEA, Costco, Walmart…) at context-level weights; `vendor-retail-combo` escalation.
- `Dropship phrasing`: variant/catalog availability, order-fulfillment language, wholesale/supplier language, quantity-on-hand.
- `Stores and dealers`: showrooms, liquidation/outlets, commercial sales language, business CTAs, subprime auto-dealer financing ("$500 down", "everyone approved", "buy here pay here") and dealer-fee language ("+ HST & Licensing", "plus TTL") — negation-aware so "no dealer fees" from private sellers stays safe.
- `Bait pricing`: placeholder prices ($1/$123/$1234/$9999/Free) combined with a revealed real price or price-disclosure phrasing ("prices in description"). A revealed higher price is hide-level. Garage/estate/moving multi-item posts with "message me for prices" are exempt.
- `External redirects`: order links/shorteners/"link in bio" (strong), bare domain mentions (weak), WhatsApp/Telegram (label-level; acceptance of Venmo/Zelle/cash is *not* a signal — only "X only" pressure is), promo codes, phone numbers (context-level only — real people post phone numbers).
- `Not for sale`: ISO/WTB/wanted posts, trade-only, sold/pending/reserved — hide-level; these are unambiguous non-listings. "Wanted" movie/poster titles and the "looking for a new home" giveaway idiom are excluded.
- `Service spam`: moving/hauling, contractor services (requires service context — "flooring" as leftover material is safe), rentals/real estate, job/opportunity posts (hide-level core phrases; "side hustle"-style hype words only stack because real equipment listings use them), task/MLM pitches.
- `Scams and payment pressure`: deposit-to-hold, payment-app-only pressure, shipping-only pushes, fake payment/business-account-upgrade scripts, verification-code requests, gift-card/crypto pressure, loan/investment schemes, overpayment/refund scripts, absent-seller arrangements ("out of town, my assistant will coordinate"). Tuned against real scam scripts from consumer-protection reports.
- `Counterfeits`: replica/superclone/1:1/UA language (hide-level), designer-dupe phrasing, authenticity dodges on branded goods ("looks real", "can't verify"), suspiciously cheap luxury-house goods, and brand-new cheap hype gear. Used hype gear with wear details ("Jordan 1, worn, $90") stays visible; receipts/box-and-papers suppress the price heuristic. Honest design-reproduction furniture ("Eames style replica") dims rather than hides.
- `Duplicate floods`: the collapse model above.
- `Catalog copy`: reference/stock-photo disclaimers ("photos for reference only", "not actual item"), generic product copy, SKU/spec boilerplate.
- `Keyword stuffing`: brand piles, separator stuffing (moving-sale bundle titles exempt), category-noun pileups ("sofa couch sectional loveseat recliner…"), repeated-word titles.
- `Missing human context`: retail-style wording with zero condition/pickup/ownership detail. Context-only weight; never acts alone.
- `Gem-positive signals`: estate/moving/garage sale, condition details, materials/vintage markers — negative weights that rescue borderline listings.
- `Your custom rules`: local block/vendor/allow terms and allowed item IDs.

## False-positive recovery

Every layer of the tuning story, from fastest to deepest:

1. **On-card badge** (dimmed/labeled/previewed cards): "Allow item" and "Disable top rule" buttons.
2. **Popup → This page**: live stats, top triggers with one-click Disable, hidden examples with one-click Allow.
2b. **The popup notices what keeps getting past you.** When a vendor group in Filter mode matches 2+ listings still visible on the current page, the summary shows "Seeing too much? IKEA items in N visible listings" with a one-tap **Hide all** — the escalation lever appears exactly where the annoyance happens.
3. **Popup → Quick filters**: the opinionated areas in one place. Vendor-flavored filters (Amazon/Temu sources, IKEA, liquidation) are three-way — **Off** (ignore entirely), **Filter** (default: a slop *signal*, so used IKEA resales stay visible while dropshippers flipping new IKEA stock get caught), **Hide all** (remove every listing that mentions the vendor — an explicit personal block, weight 96, still rescuable by allowlists). The rest are on/off: sponsored ads, catalog copy, repeated listings, not-for-sale posts, job/money pitches, vague commercial text.
4. **Popup → Filtering**: strength (relaxed/balanced/strict) and action (hide/dim/label).
5. **Options → Rule groups**: whole categories on/off.
6. **Options → All built-in rules**: every rule with its exact regex, weight, and confidence — individually toggleable, searchable.
7. **Options → Rule tester**: paste any listing text, see the exact action, score, and matched samples under current settings.
8. **Options → My terms**: custom block/vendor/allow terms (whole-word/phrase matching) and allowed item IDs.
9. **Popup → Copy diagnostics**: local JSON of current-page decisions (URLs stripped of tracking params; phones/emails redacted) for `npm run diagnostics`.

## Verification

- `npm test` — 104 unit tests (scoring, flood analysis, DOM and detail-page extraction, UI plumbing).
- `npm run eval` — scores the real-listing corpus (`eval/corpus/`) at every strength in both card view (what feed cards show) and detail view; reports FP/miss rates and per-rule noise. `--gate` fails on any legit dim/hide at balanced; wired into `npm run verify`.
- `npm run e2e` — loads the built extension into real Chromium against a high-fidelity Marketplace DOM fixture (reconstructed from public scraper sources, `eval/raw/fb-dom-notes.md`) and verifies hiding, flood collapse, sponsored-cell removal, infinite scroll, badges, allow-item persistence, popup summary/settings sync, item detail-page banners, deep-scan feed detection, on-device photo analysis (catalog-photo hides, image-flood collapse, Lens button), and the options tester — 53 checks.
- `npm run bench` — per-scan hot-path budget: scoring + DOM extraction for a 40-card page must stay under one frame's worth of time. Fails on regression.
- `npm run verify` — typecheck + tests + eval gate + build + audit + packaging checks.

Current eval results (195-entry corpus: 123 real+curated legit, 53 real slop, 19 borderline): **0 legit listings labeled, dimmed, or hidden at any strength**; 98.1% of slop actioned in detail view at balanced (1 exotic miss), 58.5% actioned from card text alone.
