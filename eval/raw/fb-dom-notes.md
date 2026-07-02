# Facebook Marketplace DOM — research notes for test fixtures

Compiled 2026-07-01 from public scraper/extension source code, uBlock filter lists, and scraping
blog posts. No logged-in access was used. Every claim below is tied to a source; verbatim code is
quoted exactly as found. Dates matter: FB's class names churn per deploy, but the *structural*
patterns below have been stable across 2023–2026 sources unless noted.

---

## 0. Source index

| # | Source | Type | Era | URL |
|---|--------|------|-----|-----|
| S1 | passivebot/facebook-marketplace-scraper `app.py` | Playwright+BS4 scraper | 2023 | https://github.com/passivebot/facebook-marketplace-scraper |
| S2 | SPolton/fb-marketplace-scraper `models.py`, `app.py` (fork of S1) | scraper | 2023–24 | https://github.com/SPolton/fb-marketplace-scraper |
| S3 | BoPeng/ai-marketplace-monitor `src/ai_marketplace_monitor/facebook.py` | actively-maintained monitor | 2024–2026 | https://github.com/BoPeng/ai-marketplace-monitor |
| S4 | yodalived/market-create `services/extract-fb/main.py` | Selenium scraper | ~2024 | https://github.com/yodalived/market-create |
| S5 | stephanlensky/hyacinth `plugins/marketplace/client.py` | Playwright+BS4 | 2023–24 | https://github.com/stephanlensky/hyacinth |
| S6 | johndelagarza/fb-scrape `public/scrape.js` | Puppeteer, logged-out | ~2021 | https://github.com/johndelagarza/fb-scrape |
| S7 | alexanderjj03/Marketplace-extension `src_alex/multipleListings/scrapeListings.js` | Chrome ext content script | 2024–25 | https://github.com/alexanderjj03/Marketplace-extension |
| S8 | ksucpea/marketplacehelper `js/content.js` | Chrome ext content script | ~2023 | https://github.com/ksucpea/marketplacehelper |
| S9 | webmastersmith/facebook-sort `src/facebook-sort.js`, `src/utils.js` | userscript (sort by price) | 2023–24 | https://github.com/webmastersmith/facebook-sort |
| S10 | zbluebugz/facebook-clean-my-feeds `greasyfork-release/fb-clean-my-feeds.user.js` | userscript, dated selector changelog | 2022–2025 | https://github.com/zbluebugz/facebook-clean-my-feeds |
| S11 | ethan-xd blocklist `fb.txt` (uBO filters, auto-updating list) | uBO cosmetic filters | maintained | https://github.com/ethan-xd/ethan-xd.github.io/blob/master/fb.txt |
| S12 | "Hide Shipped and Sponsored Items in Facebook Marketplace" (greasyfork 433800) | userscript | 2021–22 | https://greasyfork.org/en/scripts/433800 |
| S13 | lotrez/facebook-cli `src/lib/marketplace.ts` | Playwright CLI (French locale) | 2024–25 | https://github.com/lotrez/facebook-cli |
| S14 | monjurkuet/sm-auto `src/parsers/dom/marketplace_dom_parser.ts` | Puppeteer DOM parser incl. seller profiles | 2025 | https://github.com/monjurkuet/sm-auto |
| S15 | matthewmiglio/openclaw-facebook-marketplace `src/browser.py` | Playwright bot | 2025–26 | https://github.com/matthewmiglio/openclaw-facebook-marketplace |
| S16 | 805lager/deal-scout `attached_assets/fbm_1773333476109.js` (content script, versioned v0.19.9→v0.26.1, asset timestamp Nov 2025) | Chrome ext | 2025 | https://github.com/805lager/deal-scout |
| S17 | Mudasir345/facebook-marketplace-scraper `content.js` | Chrome ext | 2024–25 | https://github.com/Mudasir345/facebook-marketplace-scraper |
| S18 | deepmroot/playwright `docs/project/research/research-2026-03-02-facebook-marketplace-scraper.md` | empirical playwright-codegen notes | **2026-03** | https://github.com/deepmroot/playwright |
| S19 | sifting-room/MarketplaceSucks `src/content/selectors.config.ts` | Chrome ext selector config — **`data-testid` entries look aspirational/AI-generated; treat only its structural fallbacks as corroboration** | 2025 | https://github.com/sifting-room/MarketplaceSucks |
| S20 | Scrapfly "How to Scrape Facebook" (2026 edition) | blog | 2025–26 | https://scrapfly.io/blog/posts/how-to-scrape-facebook |
| S21 | extesy/hoverzoom `plugins/facebook.js` | popular extension | maintained | https://github.com/extesy/hoverzoom |
| S22 | Jasminestrone/MiataMaestro `scraper.js` | Puppeteer scraper | 2025 | https://github.com/Jasminestrone/MiataMaestro |
| S23 | uso-archive usercss 128191 / "Silent Facebook" (greasyfork 422284) | usercss | 2021+ | https://github.com/uso-archive/data |
| S24 | axiom.ai Marketplace scrape page | no-code blog | 2024–25 | https://axiom.ai/scrape/facebook-marketplace/ |

---

## 1. The item anchor

### 1.1 href format — HIGH confidence, every source agrees

- Selector `a[href*="/marketplace/item/"]` matches all organic listing cards on browse, category,
  search, and seller-profile pages (S3, S7, S8, S9, S13, S14, S15, S19, S22).
- The `href` **attribute is relative** and the ID is **numeric**:
  - S5: `link["href"].startswith("/marketplace/item")` then
    `f"https://www.facebook.com{url}"`.
  - S6: `'https://www.facebook.com' + listing.querySelector('[href]').getAttribute('href')`,
    id via `url.match(/item\/(.*)\//)`.
  - S3: `if post_url.startswith("/"): post_url = f"https://www.facebook.com{post_url}"`.
  - S13/S14/S22: `href.match(/\/marketplace\/item\/(\d+)/)`.
  - S7/S8/S9 extract the id as path segment 3: `href.split('/')[3]` (S7, S9) /
    `href.split("/marketplace/item/")[1].split("/")[0]` (S8).
- Query-string tracking params on the href — HIGH confidence:
  - Search results: `?ref=search` — S15 selects
    `'a[href*="/marketplace/item/"][href*="ref=search"]'`.
  - Seller profile: `?ref=marketplace_profile` — S14
    (`extractMarketplaceLinkRef(href) === 'marketplace_profile'` scores profile-page cards).
  - S3 comment: *"all the ?referral_code&referral_sotry_type etc could be helpful for live
    navigation, but will be stripped for caching"* → full form is like
    `/marketplace/item/<id>/?ref=search&referral_code=null&referral_story_type=post&tracking=...`.
  - S10 strips tracking with `document.querySelectorAll('a[href*="/?ref="]')`.
- **Non-personalized variant exists**: `/marketplace/np/item/<id>/` (EU non-personalized
  browsing). S10's Oct-2024 selector block queries both
  `a[href*="/marketplace/item/"]` and `a[href*="/marketplace/np/item/"]`. Fixtures should
  ideally include one `np` URL. MEDIUM-HIGH confidence (single well-maintained source, dated).

### 1.2 Anchor element attributes — MEDIUM-HIGH confidence

- Comet-standard link classes; the first utility class is `x1i10hfl`. Two dated verbatim sets:
  - 2023 (S1): `x1i10hfl xjbqb8w x6umtig x1b1mbwd xaqea5y xav7gou x9f619 x1ypdohk xt0psk2
    xe8uvvx xdj266r x11i5rnm xat24cr x1mh8g0r xexx8yu x4uap5 x18d9i69 xkhd6sd x16tdsg8
    x1hl2dhg xggy1nq x1a2a7pz x1heor9g x1lku1pv`
  - 2023–24 (S2): `x1i10hfl xjbqb8w x1ejq31n xd10rxx x1sy0etr x17r0tee x972fbf xcfux6l
    x1qhh985 xm0m39n x9f619 x1ypdohk xt0psk2 xe8uvvx xdj266r x11i5rnm xat24cr x1mh8g0r
    xexx8yu x4uap5 x18d9i69 xkhd6sd x16tdsg8 x1hl2dhg xggy1nq x1a2a7pz x1heor9g x1sur9pj
    xkrqix3 x1lku1pv`
- `role="link"` + `tabindex="0"` on the anchor: S19 fallback selector
  `'a[href*="/marketplace/item/"][role="link"]'`; consistent with FB Comet anchors generally.
  MEDIUM confidence (few scrapers assert it explicitly because href alone suffices).

### 1.3 aria-label on the anchor — MEDIUM confidence, nuanced

**No source shows a price inside the card anchor's aria-label.** The accessible name pattern that
is attested is **"{title} in {location}"** (localized), and it appears **primarily as the `<img>`
`alt`, sometimes also as an anchor `aria-label`**:

- S18 (empirical, 2026-03): each card contains *"Image: `img` with alt text
  `"{title} in {location}"`"*.
- S13 (French locale), verbatim comments and code:
  ```ts
  // Extract title and location from image alt text (most reliable)
  // Format: "Title dans Location" e.g., "1996 BMW dans Saint-Ouen-de-Mimbré, PDL"
  // Sometimes format is: " dans Location" (no title in search results)
  ...
  // Fallback: try aria-label if img alt didn't work
  const ariaLabel = await link.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.includes(' dans ')) { ... }
  ```
  i.e. anchor `aria-label` = same "{title} in {location}" string, **present on some cards only**,
  and the title half can be an empty string (alt/label = `" dans Location"`).
- S8 treats `listing.querySelector("img").alt` as the title (older layout where alt = title only).
- Counterpoint: on **item detail pages** the price element itself carries the price as an
  aria-label — S16 (Nov 2025): *"FBM stamps the listing price as `aria-label="$150"` on the
  h2/span near the title"* (`label.match(/^\$([0-9,]+(?:\.[0-9]{2})?)$/)`). That is the detail
  page, not the browse card.

**Fixture recommendation:** give every card `img[alt="{title} in {location}"]`; give ~half the
cards the same string as `aria-label` on the anchor; include one card with empty-title alt
(`" in Springfield, IL"`); do NOT put prices in card aria-labels.

### 1.4 Recent changes (2024–2026)

- S10's changelog entries "Updated Marketplace detection rules" appear repeatedly through
  2023–2025; its selector table keeps **two dated structural variants** (March 2024 and
  October 2024 — see §4.3), showing FB re-nests the anchor wrapper every few months.
- passivebot PRs: #9 *"Updated post_url class for new Facebook html"* (2024-04-29),
  #10 *"Fixed scraper — Instead of using css classes to target each listing, I traversed
  through the divs"* (2024-08-25) — class-based selection broke twice in 2024.
- S20 (2026): *"CSS classes like `x8gbvx8 x78zum5` rotate weekly. Never use them as your main
  hook."*

---

## 2. Text content inside a card

### 2.1 Line order — HIGH confidence (5+ independent sources)

Inside the anchor there is one wrapper div containing an **image section** and a **details
section**; the details section renders line-divs in this order:

1. **price** (optionally two prices: new + struck-through old)
2. **title**
3. **location** ("City, ST" — can be missing/empty on rare cards)
4. optional **extra metadata** (vehicles: mileage "142K km"; sometimes distance "12 mi away"…)

Verbatim evidence:

- S3 (Playwright, actively maintained):
  ```python
  details_divs = atag.query_selector_all(":scope > :first-child > div")
  details = details_divs[1]
  divs = details.query_selector_all(":scope > div")
  raw_price = "" if len(divs) < 1 else divs[0].text_content() or ""
  title = "" if len(divs) < 2 else divs[1].text_content() or ""
  # location can be empty in some rare cases
  location = "" if len(divs) < 3 else (divs[2].text_content() or "")
  ```
- S9 (`utils.js`):
  ```js
  const isListings = itemContainer.querySelector('a[href*="/marketplace/item"] > div > div:last-of-type');
  ...
  const dataItems = isListings.childNodes;
  let price = parseInt(dataItems[0]?.innerText?.trim().replaceAll(/\$|,/g, ''));
  const title = dataItems[1]?.innerText?.trim() || '';
  const location = dataItems[2]?.innerText?.trim() || '';
  ```
- S6 (2021 — same order even then): price = first `[dir]` element; title =
  `div:nth-child(2) > div:nth-child(2)`; location = `div:nth-child(2) > div:nth-child(3)`.
- S7 collects `listing.querySelectorAll('[dir="auto"]')` texts, skips leading non-price entries,
  then `price = contents[idx]`, `title = contents[idx+1]`, location next, and
  `const other = contents[idx+3]` — *"Additional info (e.g. number of km on a car)"*.
- S13: `link.textContent` = `"Price Title Location KM"` concatenated (their comment).

**Text nodes live in `span[dir="auto"]` / elements with `dir="auto"`** (S6 `[dir]`, S7
`[dir="auto"]`, S17 `span[dir="auto"]`, S19). The anchor's `textContent` is the concatenation of
all lines with no separators.

### 2.2 Leading badge line: "Just listed" — HIGH confidence

A badge line can precede the price in DOM order, so line[0] is not always the price:

- S7: skips while `contents[idx] === "just listed"` (or non-numeric).
- S14: filters `!/^Just listed$/i.test(entry)` before picking title.

Other observed badge/overlay texts on cards: `"Ships to you"` (S12 XPath
`//span[text()='Sponsored' or text()='Ships to you']`), `"Sponsored"` (see §2.4), `"Sold"`,
`"Pending"` (S15 checks `span:has-text("Sold")` on item pages; greasyfork script name
"Hide *Shipped*…" confirms shipping badges on cards).

### 2.3 Strikethrough old price — HIGH confidence on behavior, MEDIUM on exact markup

- S10 comment (verbatim): *"scan the first price listed in itemPrices for a match.
  **(second price is the old one (with strike-through))**"* — i.e. the price line contains the
  current price first, then the old price, both inside the first text block of the card.
- S16 (Nov 2025, item page but same rendering family), verbatim comments:
  ```
  // Strategy 0: concatenated dual-price span — "$CURRENT$ORIGINAL"
  // Seen on reduced listings: textContent = "$250$300" in a single span/h2.
  ...
  // Strategy 2: line-through (reduced price) container
  // FBM wraps reduced listings as: <s>$200</s> $150
  const strikeEls = document.querySelectorAll('s, [style*="line-through"]');
  ```
  So `textContent` of the price line concatenates to e.g. `"$250$300"`, and the old price is
  struck through either via an `<s>`-like element or a `text-decoration: line-through` style
  (S16 queries both, meaning they observed FB using CSS line-through — fixture should use a
  `<span>` whose style/class applies `text-decoration: line-through`, since `<s>` in FB's Comet
  DOM is unusual; keeping both variants in fixtures is safest).
- Currency variants seen in sources: `$1,234`, `CA$…`/`A$…` (browsing-skills regex
  `/^(free|[$€£]|CA\$|A\$)\s*/i`), `€` with French spacing `1 500 €` (S13), `₫800,000` (S18),
  `BDT`/`৳` (S14), and the literal string `Free` (S14 `/^(BDT\s?[\d,]+|\$\s?[\d,]+|FREE)$/i`).

### 2.4 "Sponsored" label on cards — HIGH confidence it's plain text on Marketplace

Unlike the news feed (which obfuscates "Sponsored" — see §below), **Marketplace grid cards and
item pages render "Sponsored" as plain span text**:

- S12 (2021–22): `//span[text()='Sponsored' or text()='Ships to you']`.
- S14 (2025) filters span text `'Sponsored'` verbatim from card/item text lists:
  `/^(Send|Message|Save|Share|Sponsored|Details|Seller information|Today's picks|a day ago|today|yesterday)$/i`.
- S17 (2024–25) same: excludes `'Sponsored'` from `span[dir="auto"]` texts on item pages.
- S10: on **item pages** the right-rail sponsored box's label is a link:
  `span h2 [href*="/ads/about/"]` (i.e. `<h2><a href="/ads/about/...">Sponsored</a></h2>`
  inside a `<span>` container).

**The robust ad discriminators used by blockers, however, are hrefs, not text** — see §4.5.

News-feed-only obfuscation (do NOT put in Marketplace fixtures, but useful for negative tests;
from S11 filters and S10's `uBO-sponsored-filter/sponsored-filter-builder.js`):
- interleaved letters: `b:has-text(/S-*p-*o-*n-*s-*o-*r-*e-*d/)`
- per-letter spans shuffled with flexbox: spans/divs `[style^="order: "]` containing single
  letters `S`, `p`, `o`, `n`…
- svg shadow text: `svg > use[*|href]:not([href])` referencing `svg > text[id]`, inside
  `a[href="#"]`, sometimes wrapped in `<object>` (`aTag.parentElement.tagName !== 'OBJECT'`
  false-positive check)
- `a[aria-label="Sponsored"]` (news feed / watch feed)
- FB uses NBSP (`charCode 160`) inside label text (S10 builder trims it).

---

## 3. Class names, roles, image placement

### 3.1 Verbatim class sets (for fixture realism — these churn; note the eras)

2023 (S1/S2 — BS4 `find` classes):

| element | classes |
|---|---|
| grid cell (LISTINGS) | `x9f619 x78zum5 x1r8uery xdt5ytf x1iyjqo2 xs83m0k x1e558r4 x150jy0e x1iorvi4 xjkvuk6 xnpuxes x291uyu x1uepa24` |
| `img` (IMAGE) | `xt7dq6l xl1xv1r x6ikm8r x10wlt62 xh8yej3` |
| title `span` (TITLE) | `x1lliihq x6ikm8r x10wlt62 x1n2onr6` |
| price `span` (PRICE) | `x193iq5w xeuugli x13faqbe x1vvkbs x1xmvt09 x1lliihq x1s928wv xhkezso x1gmr53x x1cpjm7i x1fgarty x1943h6x xudqn12 x676frb x1lkfr7t x1lbecb7 x1s688f xzsf02u` |
| location `span` (LOCATION) | `x1lliihq x6ikm8r x10wlt62 x1n2onr6 xlyipyv xuxw1ft x1j85h84` |

~2024 (S4 — Selenium XPaths): title span identical (`x1lliihq x6ikm8r x10wlt62 x1n2onr6`);
price span variant: `x193iq5w xeuugli x13faqbe x1vvkbs x1xmvt09 x1lliihq x1s928wv xhkezso
x1gmr53x x1cpjm7i x1fgarty x1943h6x x4zkp8e x3x7a5m x6prxxf xvq8zen xo1l8bm xzsf02u`
(same head, different font-size tail utilities).

2024–25 (S17):
- row wrapper: `x8gbvx8 x78zum5 x1q0g3np x1a02dak x1nhvcw1 x1rdy4ex x1lxpwgx x4vbgl9 x165d6jo`
- grid cell: `x9f619 x78zum5 x1r8uery xdt5ytf x1iyjqo2 xs83m0k x135b78x x11lfxj5 x1iorvi4
  xjkvuk6 xnpuxes x1cjf5ee x17dddeq`

**Stable observations:** cell class prefix `x9f619 x78zum5 x1r8uery xdt5ytf x1iyjqo2 xs83m0k`
persisted 2023→2025 (only the padding/margin tail churned). Location span = title span classes
plus truncation utilities `xlyipyv xuxw1ft x1j85h84`. `x78zum5`≈`display:flex`,
`xdt5ytf`≈`flex-direction:column`, `x1q0g3np`≈`flex-direction:row` (inferable from usage).

### 3.2 Semantics: what the cards are NOT — HIGH confidence

- Cards are **plain `<div>`s with no `role`, no `data-testid`, no `aria-posinset`** (contrast:
  news-feed posts have `div[aria-posinset]` — S11 uses that for the feed, but its Marketplace
  rules use `[aria-label="Collection of Marketplace items"] div[style*=min-width]` instead).
- No production `data-testid="marketplace-*"` hooks: S19 lists them first but its own header
  says FB relies on *"data-* attributes… aria-label… structural patterns like
  `a[href*="/marketplace/item/"]`"* and every working scraper uses structure/aria instead.
  Facebook strips `data-testid` in prod builds.
- Attributes that DO exist on/near cells:
  - inline `style` with sizing: cells `div[style*="min-width"]` (S11 verbatim:
    `##[aria-label="Collection of Marketplace items"] div[style*=min-width]:has(video)`);
    outer card wrapper matched by `item.closest('div[style]')` (S10).
  - `data-virtualized="false"` on materialized cell wrappers (S7:
    `col.querySelectorAll('[data-virtualized="false"]')`). This is FB Comet's list
    virtualization attribute (a `CometVirtualization_react.js` module exists in FB bundles).
    MEDIUM confidence (one direct source + corroborating module name).

### 3.3 Image placement — HIGH confidence

First child region of the anchor's wrapper is the image box; `listing.querySelector("img")`
suffices (S3, S6). `img` src host is `scontent-*.fbcdn.net` (S16 `img[src*="scontent"]`,
S19 `img[src*="scontent"]`, `img[src*="fbcdn"]`); UI sprites/emoji come from
`static.xx.fbcdn.net` and are filtered out (S14). Alt text per §1.3. On item pages the hero
image alt starts `"Product photo of "` (S15: `img[alt^="Product photo of"]`).

---

## 4. Page types, containers, and where cards sit

### 4.1 The collection container — HIGH confidence

- `aria-label="Collection of Marketplace items"` marks the results container on **browse-all,
  category, and search** pages. Verbatim selectors:
  - S6: `page.waitForSelector('div[aria-label="Collection of Marketplace items"]')`
  - S5: `soup.find("div", attrs={"aria-label": "Collection of Marketplace items"})`
  - S7/S8: `document.querySelector('[aria-label="Collection of Marketplace items"]')`
  - S4: `//div[@aria-label="Collection of Marketplace items"]/div/div/div/div[2]/div/div`
    (grid items)
  - S3: `f'[aria-label="{self.translator("Collection of Marketplace items")}"]'` —
    **the label is localized** with UI language; fixtures targeting non-English need the
    translated string.
  - S18 (2026-03) recorded it as `main[aria-label="Collection of Marketplace items"]` — either
    the label moved onto the `role="main"`/`<main>` element or their a11y-tree flattened it.
    Fixtures safest with `div[aria-label=…]` *inside* `div[role="main"]` (all direct-DOM
    sources say `div`). MEDIUM confidence on the `main` variant.
- Page chrome around it — HIGH confidence:
  - Left nav: `div[role="navigation"][aria-label="Marketplace sidebar"]` (S9, S23).
  - Search box: `div[role="navigation"] input[aria-label="Search Marketplace"]` (S9).
  - Main column: `div[role="navigation"] ~ div[role="main"]` (S10 verbatim query).
  - Logged-out pages show a dismissable login modal: `div[aria-label="Close"][role="button"]`
    (S2, S20).

### 4.2 Grid internals — MEDIUM-HIGH confidence

- Inside the collection there's a fixed-width block: `div[style^="max-width"]`
  (S6 used literal `div[style="max-width:1872px"] > div > div` for cells; S9:
  `document.querySelector('div[role="main"] div[style^="max-width"]').parentElement`).
- S9 comment: *"returns array of childNodes. **Sometimes it's split into two or more divs**"* —
  i.e. the results area can contain multiple sibling grid sections (matches the
  "Results from outside your search" divider on search pages). Each section:
  `div[style^="max-width"] > div:last-of-type` = grid; its child divs = cells.
- S3's drill-down from the collection to the cells (search page, 2024–25):
  ```python
  grid_items = heading.locator(
      ":scope > :first-child > :first-child > :nth-child(3) > :first-child > :nth-child(2) > div"
  )
  ```
  and the anchor sits ~8 wrappers deep inside a cell:
  ```python
  atag = listing.query_selector(
      ":scope > :first-child > :first-child > :first-child > :first-child > :first-child > :first-child > :first-child > :first-child"
  )
  ```
- S3 fallback locates the grid as "ancestor of an `img` with >10 children":
  `parent.query_selector_all(":scope > *")` walking `xpath=..` — useful invariant: **the grid
  element has many (>10) cell children**.

### 4.3 Browse (landing) vs category vs search — MEDIUM-HIGH confidence

- **Same collection container + same card internals**; differences are (a) wrapper depth between
  the cell and the anchor, (b) section headers.
- S10 (dated verbatim queries; `postAtt` is their marker attribute):
  ```js
  // -- October 2024 (fb changed code - personalised and non-personalised)
  // -- landing page listing
  `div[style]:not([${postAtt}]) > div > div > span > div > div > div > div > a[href*="/marketplace/item/"]`,
  // -- category page listing
  `div[style]:not([${postAtt}]) > div > span > div > div > a[href*="/marketplace/item/"]`,
  // -- March 2024 ...
  // landing: div[style] > div > div > span > div > div > a[...]
  // category: div[style] > div > span > div > div > a[...]
  ```
  Note the `<span>` in the wrapper chain between cell and anchor on both page types.
- Landing page has section headings ("Today's picks" — S14/S17 filter that exact text) and
  category rows; search/category pages are a flat grid (S10 treats `'category'` and `'search'`
  as *"both have similar layout"*).
- Item detail opened from the grid renders **in a dialog** (`div[role="dialog"]`, SPA nav, URL
  changes to `/marketplace/item/<id>`); direct load renders as a page under `div[role="main"]`
  (S10 handles both; S15's message dialog: `div[role="dialog"][aria-label^="Message "]`).
- No-results state: a `span` with text `"Browse Marketplace"` (S3).

### 4.4 Sponsored placement in the grid — HIGH confidence

Sponsored/ad units in Marketplace grids are **extra cells in the same grid** plus a section
heading; identifiable by:

1. **Heading link to the ads-about page** (the visible "Sponsored" section label):
   ```js
   // S10 verbatim
   const queryHeadings = `div:not([${postAtt}]) > a[href="/ads/about/?entry_product=ad_preferences"], div:not([${postAtt}]) > object > a[href="/ads/about/?entry_product=ad_preferences"]`;
   ```
   (note the `<object>` wrapper variant), and S11:
   `a[href^="/ads/"]:upward(1):matches-path(marketplace)`,
   `a[href^="/ads/"]:upward(4) + div > div:first-child:matches-path(marketplace)`.
2. **The ad card's anchor does NOT point at `/marketplace/item/`**: S10 selects sponsored items
   as `div[style]:not([…]) > span > div:first-of-type > a:not([href*="marketplace"])`
   (Nov-2023 variant adds one `> div`); S12 (older): anchors to `l.facebook.com` /
   `li.facebook.com` redirectors, hrefs containing `?__cft__`, or `href="#"`;
   S11: cells `:has(a[href*="https://"])` (absolute external URL) or `:has(video)`.
3. On the **landing page**, sponsored cells start with a `<span>` child where organic cells
   start with `<div>` (S10: *"sponsored posts have `<span>` as the first child element"*,
   query `div[${mainColumnAtt}] > div > div > div > div > div > div[style] > span`).
4. The card may still show a plain-text `Sponsored` span line in place of location (§2.4).

### 4.5 Ancestor-walking to the card container (what blockers hide) — HIGH confidence

- S10: `const box = item.closest('div[style]')` from the anchor → the hideable cell.
- S9 works at grid-child level (`container.childNodes` = cells; sets `data-price` etc. on them).
- S16/S12 use `.closest("span")`/`.closest("a")` + `parentNode` chains.
- S10's generic `climbUpTheTree(item, 4)` = `parentElement` x4 from the ad anchor to the cell.
Fixture should therefore have: cell (`div` with inline `style` incl. `min-width`) → a few
anonymous divs/span → anchor → wrapper div → [image div, details div].

---

## 5. Infinite scroll behavior — HIGH confidence

- New cells are **appended into the same grid container(s)** as the user scrolls; extensions
  watch with MutationObserver and re-scan:
  ```js
  // S7 verbatim
  const container =
    document.querySelector('[aria-label="Collection of Marketplace items"]') || document.body;
  this.observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) { ...requestAnimationFrame(rescan)... }
    }
  });
  this.observer.observe(container, { childList: true, subtree: true });
  ```
  S9 loops `window.scrollTo({top: document.body.scrollHeight})` + `sleep(1500)` until
  `querySelectorAll('a[href*="/marketplace/item"] …').length` reaches target; S24: *"Marketplace
  fills in as you scroll… scroll slowly and wait for the cards to appear before reading."*
- **Virtualization caveats** (fixture should simulate):
  - materialized cells carry `data-virtualized="false"` (S7); far-offscreen cells can be
    emptied — S3 skips cells with no text: `if not listing.text_content(): continue`
    (*"Some grid item cannot be read"* tolerated).
  - Later batches may arrive as a **new sibling grid section** rather than children of the first
    grid (S9's multi-section loop, §4.2).
- SPA navigation: URL changes without reload; extensions poll `location.pathname` and/or
  re-run on MutationObserver + `setInterval` heartbeat (S8 `setInterval(checkQueue, delay)`,
  S16 rescans on message, askarthur (matchmoments-admin/ask-arthur
  `facebook-marketplace.content.ts`) uses observer + 3s heartbeat).

---

## 6. Seller profile pages (`/marketplace/profile/<id>/`) — MEDIUM-HIGH confidence

Primary source S14 (`parseMarketplaceSellerFromDom`), corroborated by S3/S16/S18/S21:

- URL: `/marketplace/profile/<numeric id>/`; from an item page the seller link is
  `a[href*="/marketplace/profile/"]` (S3 XPath `//a[contains(@href, '/marketplace/profile')]`,
  fallback `//a[contains(@href, '/profile')]`), and can carry `?product_id=<listing_id>` (S18).
  Seller id regexes: `/\/marketplace\/profile\/(\d+)/` or `/id=(\d+)/` (S14).
- **Listing cards on the profile page are the same anchor pattern**:
  S14 collects `links.filter((link) => link.href.includes('/marketplace/item/')).slice(0, 40)`
  and reads per-card `Array.from(link.querySelectorAll('span'))` texts; normalization shows the
  span-line order is [optional `"Just listed"`, price, title, …, location(last)]:
  ```ts
  const priceText = extractMarketplacePriceText(normalizedSpans, normalizedText); // /^(BDT\s?[\d,]+|\$\s?[\d,]+|FREE)$/i
  const visibleTexts = normalizedSpans.filter((entry) => entry !== priceText && !/^Just listed$/i.test(entry));
  const title = visibleTexts[0] ?? ...;
  const fullLocation = visibleTexts.length > 1 ? visibleTexts[visibleTexts.length - 1] : null;
  ```
  Profile-page item hrefs use `?ref=marketplace_profile` (S14 scoring, §1.1).
- Seller header texts (plain spans, in order near each other): name, rating in the exact format
  `"4.9 (12)"` (S14 regex `/^\d+(\.\d+)?\s+\(\d+\)$/`), `"Highly responsive"` /
  `/responsive/i`, `"Joined Facebook in {year}"` (S14, S18, S16 `joined in {year}` regex),
  plus `"identity verified"`, `"{n} items sold"`, `"4.8 (12 ratings)"` phrasing on item-page
  seller box (S16).

---

## 7. Reconstructed fixture skeletons

### 7.1 One organic listing card (search/category grid, category-page depth, ca. Oct 2024+)

As faithful as sources allow — wrapper depths from S10 (Oct 2024 category chain
`div[style] > div > span > div > div > a`), classes from S1/S2/S4/S17, contents from S3/S7/S9/S13/S16:

```html
<!-- grid cell -->
<div class="x9f619 x78zum5 x1r8uery xdt5ytf x1iyjqo2 xs83m0k x135b78x x11lfxj5 x1iorvi4 xjkvuk6 xnpuxes x1cjf5ee x17dddeq"
     style="min-width: 242px; max-width: 300px;" data-virtualized="false">
  <div>
    <span>
      <div>
        <div>
          <a class="x1i10hfl xjbqb8w x1ejq31n xd10rxx x1sy0etr x17r0tee x972fbf xcfux6l x1qhh985 xm0m39n x9f619 x1ypdohk xt0psk2 xe8uvvx xdj266r x11i5rnm xat24cr x1mh8g0r xexx8yu x4uap5 x18d9i69 xkhd6sd x16tdsg8 x1hl2dhg xggy1nq x1a2a7pz x1heor9g x1sur9pj xkrqix3 x1lku1pv"
             role="link" tabindex="0"
             aria-label="2015 Honda Civic in Toronto, ON"  <!-- present on SOME cards; format "{title} in {location}", localized -->
             href="/marketplace/item/1234567890123456/?ref=search&referral_code=null&referral_story_type=post&tracking=browse_serp%3Ac5c74a4e-8888-4a5d-9999-3c4c3fdd0f00">
            <div class="x9f619 x78zum5 xdt5ytf x1qughib">           <!-- single wrapper -->
              <!-- ① image section -->
              <div class="x78zum5 x1iyjqo2 xs83m0k">
                <img alt="2015 Honda Civic in Toronto, ON"
                     class="xt7dq6l xl1xv1r x6ikm8r x10wlt62 xh8yej3"
                     src="https://scontent-yyz1-1.xx.fbcdn.net/v/t45.5328-4/000000000_n.jpg">
              </div>
              <!-- ② details section: line order = price / title / location / extra -->
              <div class="x9f619 x78zum5 xdt5ytf x1iyjqo2">
                <div>
                  <span class="x193iq5w xeuugli x13faqbe x1vvkbs x1xmvt09 x1lliihq x1s928wv xhkezso x1gmr53x x1cpjm7i x1fgarty x1943h6x x4zkp8e x3x7a5m x6prxxf xvq8zen xo1l8bm xzsf02u" dir="auto">
                    CA$9,500<span class="xzsf02u" style="text-decoration: line-through;" dir="auto">CA$11,000</span>
                    <!-- reduced listings only; textContent concatenates to "CA$9,500CA$11,000" -->
                  </span>
                </div>
                <div>
                  <span class="x1lliihq x6ikm8r x10wlt62 x1n2onr6" dir="auto"><span>2015 Honda Civic</span></span>
                </div>
                <div>
                  <span class="x1lliihq x6ikm8r x10wlt62 x1n2onr6 xlyipyv xuxw1ft x1j85h84" dir="auto">Toronto, ON</span>
                </div>
                <div><!-- vehicles/optional 4th line -->
                  <span class="x1lliihq x6ikm8r x10wlt62 x1n2onr6 xlyipyv xuxw1ft x1j85h84" dir="auto">142K km</span>
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>
    </span>
  </div>
</div>
```

Variants to include in fixtures:
- a card with a leading `"Just listed"` line before the price div (S7/S14);
- a `Free` price card; a `€`/`₫` price card; an empty-title card (`alt=" in Toronto, ON"`, S13);
- a card with no location line (S3: "location can be empty in some rare cases");
- landing-page depth variant: two extra `<div>` wrappers before the `<span>`
  (`div[style] > div > div > span > div > div > div > div > a`, S10 Oct-2024);
- one `href="/marketplace/np/item/…"` card (S10);
- one **virtualized placeholder**: same cell div, `data-virtualized="true"`, empty innerHTML (S3/S7).

### 7.2 Feed/collection scaffold + sponsored unit

```html
<div role="navigation" aria-label="Marketplace sidebar" class="…">
  …<input aria-label="Search Marketplace" …>…
</div>
<div role="main">                                  <!-- sibling of the navigation (S10) -->
  <div aria-label="Collection of Marketplace items" class="…">   <!-- localized label -->
    <div><div>
      <div>…header/toolbar…</div>
      <div>…</div>
      <div>                                        <!-- :nth-child(3) per S3 -->
        <div>
          <div>…section heading, e.g. "Today's picks"…</div>
          <div style="max-width:1872px">           <!-- grid section (S6/S9) -->
            <div>…</div>
            <div>                                  <!-- :last-of-type = the grid; >10 children -->
              [CELL][CELL][CELL]…                  <!-- cells from §7.1 -->

              <!-- sponsored section heading, mid-grid -->
              <div>
                <div><a href="/ads/about/?entry_product=ad_preferences">Sponsored</a></div>
                <!-- variant per S10: same anchor wrapped in an <object> element:
                     <div><object><a href="/ads/about/?entry_product=ad_preferences">Sponsored</a></object></div> -->
              </div>

              <!-- sponsored CELL: same wrapper, but ① first child is <span> not <div> (landing),
                   ② anchor is NOT /marketplace/item/ -->
              <div style="min-width: 242px;">
                <span>
                  <div>
                    <a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fshop.example.com%2Fdeal&__cft__[0]=AbC…" role="link" target="_blank">
                      …img + price/title lines…
                      <span dir="auto">Sponsored</span>   <!-- plain text, where location would be -->
                    </a>
                  </div>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- second grid section appears after "Results from outside your search" (S9) -->
    </div></div>
  </div>
</div>
```

### 7.3 Useful non-DOM invariants (for tests that stub network/data)

- Embedded data: `<script type="application/json">` blobs contain listing objects with
  `__typename: "MarketplaceProductItem"` (or `GroupCommerceProductItem`), keys:
  `id`, `marketplace_listing_title`, `formatted_price`/`formatted_amount`,
  `location.reverse_geocode`, `is_sold`, `creation_time`, `marketplace_listing_seller`,
  `primary_listing_photo`, `marketplace_listing_category_id`;
  item pages: `marketplace_product_details_page` key (S5, S20).
- Item-page extras: last `h1` = title; price element = `h1 + *` sibling (S3) and carries
  `aria-label="$150"` (S16); `"Listed {time} ago in {location}"` span (S18, S14);
  thumbnails `div[aria-label^="Thumbnail "]` (S15/S18); `div[aria-label="View next image"]`;
  condition via a `span:text("Condition")` row (S3); "See more" `div[role="button"]` expands
  description (S3); 2025 utility-class hooks seen: price container `div.x1anpbxc`,
  description `div.x1gslohp` / `div.xod5an3` (S17 — churn-prone).

---

## 8. Change log distilled from sources (2023 → 2026)

| When | Change | Source |
|---|---|---|
| Nov 2023 | sponsored-item wrapper gained one `> div` (`div[style] > span > div:first-of-type > div > a`) | S10 |
| Mar 2024 | card wrapper chain re-nested (landing `div>div>span>div>div>a`; category `div>span>div>div>a`) | S10 |
| Apr 2024 | anchor class list changed, broke `post_url` class scraping | passivebot PR #9 |
| Aug 2024 | class-based cell selection abandoned for pure div traversal | passivebot PR #10 |
| Oct 2024 | wrapper chains deepened again (landing `div>div>span>div>div>div>div>a`); `/marketplace/np/item/` variant appears alongside | S10 |
| 2025 | grid row/cell utility tails churn (`x8gbvx8…` rows; cell tail `x135b78x x11lfxj5…`); "classes rotate weekly" | S17, S20 |
| Nov 2025 | reduced-price rendering commonly a single concatenated "$250$300" text node; price aria-label `"$150"` on item pages | S16 (v0.26.1 notes) |
| Mar 2026 | collection container observed as `main[aria-label="Collection of Marketplace items"]`; card a11y = image alt "{title} in {location}" + generic price/title/location lines | S18 |

Constants across the whole window: `a[href*="/marketplace/item/"]` with numeric id + `?ref=`
params; price→title→location line order in a trailing details div; `img` first;
"Collection of Marketplace items" aria-label (localized); sponsored = `/ads/about/` link +
non-marketplace anchor; infinite scroll appends cells into the same grid.
