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

/** Tiny 16x16 24bpp BMP writer so the extension's canvas analysis sees real pixels. */
export function bmp16(pixelAt) {
  const width = 16;
  const height = 16;
  const rowBytes = width * 3;
  const fileSize = 54 + rowBytes * height;
  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(rowBytes * height, 34);
  let offset = 54;
  for (let fileRow = 0; fileRow < height; fileRow += 1) {
    const y = height - 1 - fileRow; // BMP rows are bottom-up
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      buf[offset] = b;
      buf[offset + 1] = g;
      buf[offset + 2] = r;
      offset += 3;
    }
  }
  return buf;
}

/** Product-on-pure-white, the retailer catalog style. */
export function catalogBmp() {
  return bmp16((x, y) => (x >= 5 && x <= 10 && y >= 4 && y <= 11 ? [139, 94, 60] : [255, 255, 255]));
}

/** A fixed distinctive pattern shared by repost-flood cards. */
export function floodBmp() {
  return bmp16((x, y) => [((x * 37 + y * 11) % 200) + 30, ((x * 7 + y * 29) % 180) + 40, ((x * 17 + y * 3) % 160) + 50]);
}

/** Deterministic per-listing noise so unrelated cards never hash-collide. */
export function noiseBmp(seedText) {
  let seed = 0;
  for (const ch of String(seedText)) {
    seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return bmp16((x, y) => {
    const v = (seed ^ (x * 2654435761) ^ (y * 40503)) >>> 0;
    return [(v & 255), ((v >> 8) & 255), ((v >> 16) & 255)];
  });
}

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
          <img alt="${alt}" class="${IMG_CLASSES}" src="/img/${card.image ?? `n-${card.id}.bmp`}" style="width: 100%; height: 200px; object-fit: cover; background: #ccd3dc;">
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

/**
 * Item detail page (direct load): role=main with the listing info column
 * (last h1 = title, price with aria-label, "Listed … in …", Condition rows,
 * description with l.facebook.com-wrapped outbound links and an optional
 * "See more" toggle that inserts the remaining text on click), a related
 * items grid, and a right-rail Sponsored box.
 */
export function renderItemDetailPage(listing, { related = [], truncated = false } = {}) {
  const linkHtml = (url, index) =>
    `<a href="https://l.facebook.com/l.php?u=${encodeURIComponent(url)}&h=AT${index}abc" target="_blank" rel="nofollow">${escapeHtml(
      url.replace(/^https:\/\//, "").slice(0, 34)
    )}…</a>`;

  const visibleParagraphs = (listing.description ?? [])
    .map((line) => `<div><span dir="auto">${escapeHtml(line)}</span></div>`)
    .join("\n");
  const linkBlock = (listing.links ?? []).map(linkHtml).join("<br>");

  const descriptionBody = truncated
    ? `${visibleParagraphs}
       <div role="button" tabindex="0" id="see-more-toggle">See more</div>
       <script>
         document.getElementById("see-more-toggle").addEventListener("click", function () {
           const rest = document.createElement("div");
           rest.innerHTML = ${JSON.stringify(linkBlock)};
           this.parentNode.appendChild(rest);
           this.remove();
         });
       </script>`
    : `${visibleParagraphs}<div>${linkBlock}</div>`;

  const embeddedJson = JSON.stringify({
    require: [["ScheduledServerJS", null, null, [{ __bbox: { result: { data: { viewer: { marketplace_product_details_page: { target: {
      __typename: "MarketplaceProductItem",
      id: listing.id ?? "0",
      marketplace_listing_title: listing.title,
      redacted_description: { text: [...(listing.description ?? []), ...(listing.links ?? [])].join("\n") },
      formatted_amount: listing.price,
      is_sold: Boolean(listing.sold),
      is_pending: false
    } } } } } } }]]]
  });

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(listing.title)} - Marketplace</title>
<script type="application/json" data-sjs>${embeddedJson.replaceAll("</", "<\\/")}</script>
<style>
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; background: #f0f2f5; }
  [role="main"] { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; padding: 16px; }
  .hero { background: #ddd; height: 420px; border-radius: 8px; }
  .info { background: #fff; border-radius: 8px; padding: 16px; }
  a { color: #216fdb; text-decoration: none; }
</style></head>
<body>
<div role="banner"><h1 style="position:absolute;left:-9999px">Facebook</h1></div>
<div role="navigation" aria-label="Marketplace sidebar"><input aria-label="Search Marketplace"></div>
<div role="main">
  <div>
    <div class="hero"><img alt="Product photo of ${escapeHtml(listing.title)}" src="/img/detail.png" style="width:100%;height:100%;object-fit:cover;"></div>
    <div class="related">
      <h2>More like this</h2>
      ${renderGridSection(related)}
    </div>
  </div>
  <div class="right-col">
    <div class="info">
      <h1>${escapeHtml(listing.title)}</h1>
      <div><span aria-label="${escapeHtml(listing.price)}" dir="auto">${escapeHtml(listing.price)}</span></div>
      <div><span dir="auto">Listed a day ago in ${escapeHtml(listing.location)}</span></div>
      <div><span dir="auto">Details</span></div>
      <div><span dir="auto">Condition</span> <span dir="auto">${escapeHtml(listing.condition ?? "New")}</span></div>
      <div class="description">${descriptionBody}</div>
      <div><span dir="auto">Seller information</span></div>
      <div><a href="/marketplace/profile/99887766/">Casey Seller</a> <span dir="auto">Joined Facebook in 2019</span></div>
    </div>
    <div class="rail-ad">
      <span><h2><a href="/ads/about/?entry_product=ad_preferences">Sponsored</a></h2></span>
      <a href="https://l.facebook.com/l.php?u=${encodeURIComponent("https://ads.example.com/promo")}">Shop deals</a>
    </div>
  </div>
</div>
</body>
</html>`;
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
