// High-fidelity Facebook Marketplace DOM fixture, reconstructed from public
// scraper/extension sources (see eval/raw/fb-dom-notes.md for the research and
// per-claim citations). Structure mirrors the Oct-2024+ card wrapper chains:
// cell div[style*=min-width] > div > span > div > div > a > [image, details].

const ANCHOR_CLASSES =
  "x1i10hfl xjbqb8w x1ejq31n xd10rxx x1sy0etr x17r0tee x972fbf xcfux6l x1qhh985 xm0m39n x9f619 x1ypdohk xt0psk2 xe8uvvx xdj266r x11i5rnm xat24cr x1mh8g0r xexx8yu x4uap5 x18d9i69 xkhd6sd x16tdsg8 x1hl2dhg xggy1nq x1a2a7pz x1heor9g x1sur9pj xkrqix3 x1lku1pv";
const CELL_CLASSES =
  "x9f619 x78zum5 x1r8uery xdt5ytf x1iyjqo2 xs83m0k x135b78x x11lfxj5 x1iorvi4 xjkvuk6 xnpuxes x1cjf5ee x17dddeq";
const PRICE_CLASSES =
  "x193iq5w xeuugli x13faqbe x1vvkbs x1xmvt09 x1lliihq x1s928wv xhkezso x1gmr53x x1cpjm7i x1fgarty x1943h6x x4zkp8e x3x7a5m x6prxxf xvq8zen xo1l8bm xzsf02u";
const TITLE_CLASSES = "x1lliihq x6ikm8r x10wlt62 x1n2onr6";
const LOCATION_CLASSES = "x1lliihq x6ikm8r x10wlt62 x1n2onr6 xlyipyv xuxw1ft x1j85h84";
const IMG_CLASSES = "xt7dq6l xl1xv1r x6ikm8r x10wlt62 xh8yej3";

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * card spec:
 * { id, title, price, location,
 *   oldPrice?, extra?, justListed?, sponsoredLine?, np?, ariaLabel?,
 *   emptyTitle?, virtualized?, adCell? (external sponsored unit) }
 */
export function renderCell(card) {
  if (card.virtualized) {
    return `<div class="${CELL_CLASSES}" style="min-width: 242px; max-width: 300px; width: 260px; min-height: 320px;" data-virtualized="true"></div>`;
  }

  if (card.adCell) {
    return renderSponsoredAdCell(card);
  }

  const title = card.emptyTitle ? "" : card.title;
  const alt = `${escapeHtml(title)} in ${escapeHtml(card.location)}`;
  const aria = card.ariaLabel === false ? "" : ` aria-label="${alt}"`;
  const path = card.np ? "np/item" : "item";
  const href = `/marketplace/${path}/${card.id}/?ref=search&referral_code=null&referral_story_type=post`;

  const priceLine = card.oldPrice
    ? `${escapeHtml(card.price)}<span class="xzsf02u" style="text-decoration: line-through;" dir="auto">${escapeHtml(card.oldPrice)}</span>`
    : escapeHtml(card.price);

  const lines = [];
  if (card.justListed) {
    lines.push(`<div><span class="${TITLE_CLASSES}" dir="auto">Just listed</span></div>`);
  }
  lines.push(`<div><span class="${PRICE_CLASSES}" dir="auto">${priceLine}</span></div>`);
  lines.push(`<div><span class="${TITLE_CLASSES}" dir="auto"><span>${escapeHtml(title)}</span></span></div>`);
  if (card.sponsoredLine) {
    lines.push(`<div><span class="${LOCATION_CLASSES}" dir="auto">Sponsored</span></div>`);
  } else if (card.location) {
    lines.push(`<div><span class="${LOCATION_CLASSES}" dir="auto">${escapeHtml(card.location)}</span></div>`);
  }
  if (card.extra) {
    lines.push(`<div><span class="${LOCATION_CLASSES}" dir="auto">${escapeHtml(card.extra)}</span></div>`);
  }

  return `
<div class="${CELL_CLASSES}" style="min-width: 242px; max-width: 300px; width: 260px;" data-virtualized="false">
  <div><span><div><div>
    <a class="${ANCHOR_CLASSES}" role="link" tabindex="0"${aria} href="${href}">
      <div class="x9f619 x78zum5 xdt5ytf x1qughib">
        <div class="x78zum5 x1iyjqo2 xs83m0k">
          <img alt="${alt}" class="${IMG_CLASSES}" src="/img/listing-${String(card.id).slice(-1)}.png" style="width: 100%; height: 200px; object-fit: cover; background: #ccd3dc;">
        </div>
        <div class="x9f619 x78zum5 xdt5ytf x1iyjqo2">${lines.join("\n")}</div>
      </div>
    </a>
  </div></div></span></div>
</div>`;
}

function renderSponsoredAdCell(card) {
  return `
<div style="min-width: 242px; max-width: 300px; width: 260px;">
  <span>
    <div>
      <a class="${ANCHOR_CLASSES}" role="link" target="_blank"
         href="https://l.facebook.com/l.php?u=${encodeURIComponent(card.adUrl ?? "https://shop.example.com/deal")}&__cft__[0]=AbCdEf">
        <div class="x9f619 x78zum5 xdt5ytf x1qughib">
          <div class="x78zum5 x1iyjqo2 xs83m0k">
            <img alt="${escapeHtml(card.title)}" class="${IMG_CLASSES}" src="/img/ad.png" style="width: 100%; height: 200px; object-fit: cover; background: #d9cfc2;">
          </div>
          <div class="x9f619 x78zum5 xdt5ytf x1iyjqo2">
            <div><span class="${PRICE_CLASSES}" dir="auto">${escapeHtml(card.price)}</span></div>
            <div><span class="${TITLE_CLASSES}" dir="auto"><span>${escapeHtml(card.title)}</span></span></div>
            <div><span class="${LOCATION_CLASSES}" dir="auto">Sponsored</span></div>
          </div>
        </div>
      </a>
    </div>
  </span>
</div>`;
}

export function renderGridSection(cards, { heading, sponsoredHeading = false } = {}) {
  const headingHtml = heading
    ? sponsoredHeading
      ? `<div><a href="/ads/about/?entry_product=ad_preferences">Sponsored</a></div>`
      : `<div><span class="${TITLE_CLASSES}">${escapeHtml(heading)}</span></div>`
    : "";

  return `
<div style="max-width:1872px">
  <div>${headingHtml}</div>
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
    ${cards.map(renderCell).join("\n")}
  </div>
</div>`;
}

export function renderMarketplacePage(sections, { title = "Facebook Marketplace" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; background: #f0f2f5; }
  [role="navigation"] { position: fixed; left: 0; top: 0; bottom: 0; width: 300px; background: #fff; padding: 12px; box-sizing: border-box; }
  [role="main"] { margin-left: 316px; padding: 16px; }
  a { color: inherit; text-decoration: none; }
  img { display: block; border-radius: 8px; }
</style>
</head>
<body>
<div role="banner"><h1 style="position:absolute;left:-9999px">Facebook</h1></div>
<div role="navigation" aria-label="Marketplace sidebar">
  <input aria-label="Search Marketplace" placeholder="Search Marketplace" style="width:100%">
  <div><span>Buying</span></div>
  <div><span>Selling</span></div>
</div>
<div role="main">
  <div aria-label="Collection of Marketplace items">
    <div><div>
      <div><span>Today's picks</span></div>
      <div></div>
      <div id="grid-sections">
        ${sections.join("\n")}
      </div>
    </div></div>
  </div>
</div>
</body>
</html>`;
}
