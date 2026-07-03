import type { RuleControlDefinition, RuleDefinition } from "./types";

function vendorRule(
  id: string,
  reason: string,
  weight: number,
  pattern: RegExp,
  confidence: RuleDefinition["confidence"] = "medium"
): RuleDefinition {
  return {
    id,
    category: "known-vendor",
    reason,
    weight,
    confidence,
    fields: ["allText"],
    pattern
  };
}

/**
 * Weight guide (balanced thresholds: label 20, dim 34, hide 72):
 * - 12-19: context only; never visible alone, stacks with other signals.
 * - 20-33: label alone; needs company to dim.
 * - 34-54: dims alone; a second signal pushes toward hide.
 * - 55+:   reserved for signals that are nearly always right.
 *
 * Vendor mentions are deliberately in the low bands: "IKEA Kallax shelf" and
 * "Amazon Echo" are everyday legit resales. The vendor-retail-combo dynamic
 * rule escalates when a vendor mention appears with retail-style wording.
 */
export const DEFAULT_RULES: RuleDefinition[] = [
  // --- Known vendors: dropship sources (rarely legit product names) ---
  vendorRule("vendor-temu", "Temu/source mention", 32, /\btemu\b/i, "high"),
  vendorRule("vendor-aliexpress", "AliExpress/source mention", 32, /\bali\s*express\b/i, "high"),
  vendorRule("vendor-alibaba", "Alibaba/source mention", 32, /\balibaba\b/i, "high"),
  vendorRule("vendor-dhgate", "DHgate/source mention", 32, /\bdhgate\b/i, "high"),
  vendorRule("vendor-banggood", "Banggood/source mention", 32, /\bbanggood\b/i, "high"),
  vendorRule("vendor-shein", "SHEIN/source mention", 30, /\bshein\b/i, "high"),
  vendorRule("vendor-tiktok-shop", "TikTok Shop/source mention", 30, /\btiktok\s*shop\b/i, "high"),
  vendorRule(
    "vendor-wish",
    "Wish marketplace mention",
    30,
    /\bwish\.com\b|\bwish\s+app\b|\b(?:from|off|on|via)\s+wish\b|\bordered\s+(?:from|on)\s+wish\b/i,
    "high"
  ),
  vendorRule("vendor-shopify", "Shopify storefront mention", 26, /\bshopify\b/i),

  // --- Known vendors: product brands and provenance (usually legit resale) ---
  vendorRule(
    "vendor-amazon",
    "Amazon/source mention",
    22,
    /\bamazon\b(?!\s*(?:echo|alexa|kindle|fire|firestick|dot|show|tap|halo|eero|basics|music|prime))/i
  ),
  vendorRule("vendor-ikea", "IKEA mention", 14, /\bikea\b/i, "low"),
  vendorRule("vendor-wayfair", "Wayfair mention", 16, /\bwayfair\b/i, "low"),
  vendorRule("vendor-overstock", "Overstock mention", 16, /\boverstock\b/i, "low"),
  vendorRule("vendor-walmart", "Walmart mention", 14, /\bwalmart\b/i, "low"),
  vendorRule(
    "vendor-target",
    "Target store mention",
    14,
    /\b(?:from|at|bought\s+at)\s+target\b|\btarget\s+(?:brand|clearance|exclusive)\b/i,
    "low"
  ),
  vendorRule("vendor-costco", "Costco mention", 14, /\bcostco\b/i, "low"),
  vendorRule("vendor-sams-club", "Sam's Club mention", 14, /\bsam'?s\s+club\b/i, "low"),
  vendorRule("vendor-home-depot", "Home Depot mention", 14, /\bhome\s*depot\b/i, "low"),
  vendorRule("vendor-lowes", "Lowe's mention", 14, /\blowe'?s\b/i, "low"),
  vendorRule("vendor-ashley", "Ashley Furniture mention", 16, /\bashley\s+furniture\b/i, "low"),
  vendorRule("vendor-rooms-to-go", "Rooms To Go mention", 16, /\brooms?\s+to\s+go\b/i, "low"),
  vendorRule("vendor-ebay", "eBay mention", 12, /\be\s*bay\b|\bebay\b/i, "low"),
  vendorRule("vendor-mercari", "Mercari mention", 12, /\bmercari\b/i, "low"),
  vendorRule("vendor-poshmark", "Poshmark mention", 12, /\bposhmark\b/i, "low"),

  // --- Counterfeits ---
  {
    id: "vendor-copycat-language",
    category: "counterfeit",
    reason: "replica/copycat language",
    weight: 54,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:replica|knock[-\s]?off|counterfeit|fake\s+(?:designer|luxury|brand)|bootleg|superclone|super\s+clone|1\s*:\s*1(?!\s*scale)|aaa\s+(?:quality|replica|grade)|mirror\s+(?:quality|grade|copy)|unauthorized\s+authentic|ua\s+(?:pair|quality|batch|shoes|sneakers)|best\s+batch|rep\s+(?:pair|shoes|sneakers)|not\s+authentic)\b/i
  },
  {
    id: "counterfeit-designer-dupe",
    category: "counterfeit",
    reason: "designer-dupe language",
    weight: 38,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:designer\s+dupe|dupe\s+(?:bag|shoes|sneakers|watch)|(?:designer|luxury|brand)[-\s]inspired|inspired\s+by\s+(?:lv|louis\s+vuitton|gucci|chanel|prada|dior|herm[eè]s)|look\s*alike\s+(?:bag|watch|shoes)|same\s+as\s+(?:the\s+)?(?:real|authentic|original)\s+(?:one|thing)|luxury\s+inspired)\b/i
  },

  // --- Dropship phrasing ---
  {
    id: "dropship-variants",
    category: "dropship-phrasing",
    reason: "variant/catalog availability",
    weight: 30,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:available\s+in\s+(?:multiple|many|different|all)\s+(?:colors?|colours?|sizes?)|multiple\s+(?:colors?|colours?|sizes?)\s+available|choose\s+(?:your\s+)?(?:colors?|colours?|sizes?)\b|all\s+sizes?\s+available|any\s+size\s+available|customize\s+your\s+order|made\s+to\s+order)\b/i
  },
  {
    id: "dropship-order-language",
    category: "dropship-phrasing",
    reason: "order fulfillment language",
    weight: 32,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:order\s+(?:now|today|yours)|dm\s+(?:me\s+)?to\s+order|message\s+(?:me\s+)?to\s+order|place\s+(?:an\s+|your\s+)?order|order\s+(?:through|via)\b|ships?\s+(?:direct|nationwide)|ships?\s+from\s+(?:our\s+)?(?:warehouse|supplier|factory)|delivery\s+nationwide|limited\s+stock|while\s+supplies\s+last)\b/i
  },
  {
    id: "dropship-wholesale",
    category: "dropship-phrasing",
    reason: "wholesale/supplier language",
    weight: 34,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:wholesale|bulk\s+(?:available|pricing|orders?)|supplier|factory\s+direct|imported\s+direct|warehouse\s+stock|new\s+inventory|reseller\s+pricing)\b/i
  },
  {
    id: "shop-catalog-product",
    category: "dropship-phrasing",
    reason: "shop catalog product card",
    weight: 44,
    confidence: "high",
    fields: ["allText"],
    pattern: /\b(?:view\s+in\s+3d|see\s+it\s+in\s+your\s+space|choose\s+(?:a\s+)?(?:color|colour|finish|fabric)\s*:)\b/i
  },
  {
    id: "dropship-quantity",
    category: "dropship-phrasing",
    reason: "quantity-on-hand language",
    weight: 16,
    confidence: "low",
    fields: ["allText"],
    pattern: /\b(?:multiple\s+(?:available|units|in\s+stock)|many\s+available|more\s+in\s+stock|restocked)\b/i
  },

  // --- Stores and dealers ---
  {
    id: "store-showroom",
    category: "store-business",
    reason: "store or showroom ad",
    weight: 40,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:showroom|(?<!no\s)(?<!not\s+a\s)(?<!not\s)dealer(?!\s+plates?|\s+fees?)|dealership|retail\s+store|store\s+hours|visit\s+(?:us|our\s+(?:store|location|website))|grand\s+opening)\b/i
  },
  {
    id: "store-liquidation-outlet",
    category: "store-business",
    reason: "liquidation/outlet listing",
    weight: 30,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:warehouse\s+sale|liquidation|pallets?\s+(?:sale|available|of)|(?:amazon|store)\s+returns?\s+pallets?|truckloads?\s+(?:sale|available)|outlet\s+(?:store|prices?|deals?|mall)|furniture\s+outlet|mystery\s+box(?:es)?)\b/i
  },
  {
    id: "store-sales-language",
    category: "store-business",
    reason: "commercial sales language",
    weight: 26,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:inventory|in\s+stock|tax\s+(?:included|extra)|plus\s+(?:hst|gst)\b|financing\s+available|lease\s+to\s+own|rent\s+to\s+own|new\s+shipment|weekly\s+specials?|ask\s+about\s+financing|90\s+days?\s+same\s+as\s+cash)\b|\+\s*(?:hst|gst)\b/i
  },
  {
    id: "store-call-to-action",
    category: "store-business",
    reason: "business call to action",
    weight: 28,
    confidence: "medium",
    fields: ["allText"],
    pattern: /\b(?:call\s+today|text\s+.{0,24}to\s+(?:buy|order|purchase)|contact\s+our\s+team|apply\s+(?:today|now)|schedule\s+a\s+(?:showing|visit|test\s+drive)|book\s+now|check\s+out\s+our\s+(?:page|website|store))\b/i
  },
  {
    id: "store-auto-dealer-financing",
    category: "store-business",
    reason: "auto dealer financing",
    weight: 44,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:buy\s+here\s+pay\s+here|we\s+finance|in[-\s]?house\s+financing|bad\s+credit(?:\s*[,.?!]?\s*no\s+credit)?|no\s+credit\s+(?:ok|okay|approved|needed|check)|everyone\s+(?:is\s+)?approved|all\s+credit\s+(?:welcome|accepted|ok)|get\s+(?:you\s+)?approved|guaranteed\s+approval|payments?\s+as\s+low\s+as|drives?\s+(?:it\s+)?(?:home\s+)?today|low\s+down\s+payment|cash\s+down|down\s+payment\s+(?:required|as\s+low\s+as)|o\.?a\.?c\.?\b|w\.?a\.?c\.?\b)\b|\$\d+\s+down\b/i
  },
  {
    id: "store-auto-dealer-fees",
    category: "store-business",
    reason: "dealer fee language",
    weight: 34,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:plus\s+(?:tax|ttl|title|license|licensing|registration|doc\s+fee|dealer\s+fee)|tax\s+title\s+(?:and\s+)?license|title\s+and\s+license\s+fees|dmv\s+fees?|doc\s+fees?|(?<!no\s)(?<!or\s)(?<!zero\s)(?<!without\s)dealer\s+fees?|safety\s+certification\s+(?:available|extra))\b|\+\s*(?:ttl|licensing|doc\s+fee)\b/i
  },

  // --- External redirects ---
  {
    id: "external-url",
    category: "external-redirect",
    reason: "external website/order link",
    weight: 46,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /(?:https?:\/\/|\bwww\.[a-z0-9-]+|bit\.ly|tinyurl|linktr\.ee|goo\.gl|\.shop\b|\.store\b|link\s+in\s+(?:bio|profile|comments?)|order\s+(?:at|on|from)\s+[a-z0-9-]+\.(?:com|net|ca|shop|store))/i
  },
  {
    id: "external-bare-domain",
    category: "external-redirect",
    reason: "website mention",
    weight: 22,
    confidence: "low",
    fields: ["allText"],
    pattern: /\b[a-z0-9-]{3,}\.(?:com|net)\b/i
  },
  {
    id: "external-retailer-product-link",
    category: "external-redirect",
    reason: "retailer catalog/product link",
    weight: 40,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:wayfair|amazon|walmart|target|ikea|overstock|temu|aliexpress|dhgate|shein|homedepot|lowe'?s|costco|bestbuy|samsclub|alibaba|banggood|wish)\.(?:com|ca|co\.uk|net)\S*(?:\/pdp\/|\/dp\/|\/ip\/|\/itm\/|\/gp\/product|\/p\/[a-z0-9-]|\/product[s/-]|[?&](?:piid|skuid|pid|asin|item)=)/i
  },
  {
    id: "external-messaging",
    category: "external-redirect",
    reason: "off-platform messaging app",
    weight: 24,
    confidence: "medium",
    fields: ["allText"],
    pattern: /\b(?:whats\s*app|telegram)\b/i
  },
  {
    id: "external-promo-code",
    category: "external-redirect",
    reason: "promo/checkout language",
    weight: 30,
    confidence: "medium",
    fields: ["allText"],
    pattern: /\b(?:coupon\s+code|promo\s+code|discount\s+code|use\s+code\s+\w+|checkout|add\s+to\s+cart|online\s+only)\b/i
  },
  {
    id: "external-phone-number",
    category: "external-redirect",
    reason: "phone-number contact",
    weight: 16,
    confidence: "low",
    fields: ["allText"],
    pattern:
      /\b(?:call|text|txt|sms)\b.{0,36}(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4})\b/i
  },
  {
    id: "external-social-handle",
    category: "external-redirect",
    reason: "social-handle redirect",
    weight: 26,
    confidence: "medium",
    fields: ["allText"],
    pattern: /\b(?:instagram|insta|ig|tiktok|snap(?:chat)?)\b.{0,24}@[a-z0-9_.]{3,}|@[a-z0-9_.]{3,}\s+(?:on|to)\s+(?:instagram|insta|ig|tiktok)|follow\s+(?:my|our)\s+(?:page|store|shop)/i
  },

  // --- Not for sale ---
  {
    id: "not-for-sale-title-request",
    category: "not-for-sale",
    reason: "wanted/request post",
    weight: 74,
    confidence: "high",
    fields: ["title"],
    pattern:
      /\b(?:iso|wtb|in\s+search\s+of|looking\s+(?:for(?!\s+(?:a\s+|its\s+|their\s+)?(?:new|good|forever)\s+home)|to\s+buy)|want(?:ed)?\s+to\s+buy|seeking(?!\s+(?:a\s+)?(?:new|good)\s+home))\b|^wanted\b(?!\s*(?:movie|film|poster|dvd|vhs|sign|print|dead\s+or\s+alive))|\bwanted:\s/i
  },
  {
    id: "not-for-sale-request-language",
    category: "not-for-sale",
    reason: "wanted/request post",
    weight: 72,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:does\s+anyone\s+have|anyone\s+(?:have|selling|got)\s+(?:a|an|any)\b|looking\s+to\s+buy|want(?:ed)?\s+to\s+buy|in\s+search\s+of|wtb)\b/i
  },
  {
    id: "not-for-sale-trade-only",
    category: "not-for-sale",
    reason: "trade/barter post",
    weight: 72,
    confidence: "medium",
    fields: ["allText"],
    pattern: /\b(?:trade\s+only|trades?\s+only|not\s+selling[,.]?\s+trades?|looking\s+to\s+trade|will\s+(?:only\s+)?trade\s+for|swap\s+for|barter)\b/i
  },
  {
    id: "not-for-sale-unavailable",
    category: "not-for-sale",
    reason: "sold/pending listing",
    weight: 74,
    confidence: "high",
    fields: ["title", "priceText"],
    pattern:
      /\b(?:sold(?!\s+(?:separately|individually|as\s+(?:a\s+)?(?:set|pair|lot)|together))|pending(?:\s+pickup)?|reserved|on\s+hold)\b/i
  },

  // --- Service spam ---
  {
    id: "service-moving-hauling",
    category: "service-spam",
    reason: "moving/hauling service ad",
    weight: 46,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:junk\s+removal|we\s+haul|haul\s+(?:away|it\s+all)|hauling\s+services?|moving\s+services?|movers\b|cleanouts?\b|dump\s+runs?|demolition|labor\s+available|two\s+men\s+and)\b/i
  },
  {
    id: "service-home-contractor",
    category: "service-spam",
    reason: "contractor/service ad",
    weight: 42,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:free\s+estimates?|licensed\s+(?:and|&)\s+insured|fully\s+insured|we\s+(?:install|repair|come\s+to\s+you)|installation\s+(?:services?|available|included)|repair\s+services?|handyman|lawn\s+care|snow\s+removal|pressure\s+washing|house\s+cleaning|cleaning\s+services?|tree\s+(?:service|removal|trimming)|credit\s+repair|tax\s+prep(?:aration)?|notary\s+services?|mobile\s+(?:detailing|mechanic))\b/i
  },
  {
    id: "service-rentals-real-estate",
    category: "service-spam",
    reason: "rental or real-estate ad",
    weight: 46,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:(?:apartment|room|house|condo|basement)\s+for\s+rent|for\s+rent\b|rental\s+application|open\s+house|realtor|broker|property\s+manager|first\s+and\s+last\s+month|per\s+month\s+plus\s+utilities)\b/i
  },
  {
    id: "service-job-opportunity",
    category: "service-spam",
    reason: "job/opportunity listing",
    weight: 72,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:(?:work\s+from\s+home|remote\s+work)\s+(?:job|position|opportunit(?:y|ies)|income|available)|(?:remote|online)\s+(?:job|position|opportunit(?:y|ies))|(?:now\s+hiring|hiring\s+(?:now|immediately|today)|we'?re\s+hiring).{0,40}\b(?:apply|job|position|drivers?|workers?|reps?|sales|remote)|make\s+money\s+(?:online|from\s+home|daily|weekly)|earn\s+(?:extra\s+)?(?:cash|income|money)\s+(?:online|from\s+home|daily|weekly))\b/i
  },
  {
    id: "service-income-hype",
    category: "service-spam",
    reason: "income-hype wording",
    weight: 30,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:side\s+hustle|passive\s+income|business\s+opportunit(?:y|ies)|be\s+your\s+own\s+boss|set\s+your\s+own\s+schedule|unlimited\s+earning\s+potential|paid\s+daily|daily\s+pay)\b/i
  },
  {
    id: "service-task-mlm",
    category: "service-spam",
    reason: "task/MLM income pitch",
    weight: 44,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:app\s+optimization|product\s+boosting|(?:rate|rating|review(?:ing)?)\s+(?:products|apps|hotels|restaurants)|join\s+(?:my|our)\s+team|become\s+(?:a\s+)?(?:distributor|consultant|brand\s+ambassador)|commission\s+(?:based|only)|residual\s+income|starter\s+kit\s+required)\b/i
  },

  // --- Scams and payment pressure ---
  {
    id: "scam-deposit",
    category: "scam-pressure",
    reason: "deposit or hold-fee pressure",
    weight: 52,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:deposit\s+(?:required|first|via|through)|deposit\s+is\s+(?:necessary|needed|required)|deposit\s+(?:is\s+necessary\s+|is\s+required\s+)?to\s+(?:hold|secure|reserve)|send\s+(?:a\s+)?\$?\d*\s*deposit|hold\s+fee|non[-\s]?refundable\s+deposit|deposits?\s+are\s+(?:fully\s+)?refundable|pay\s+to\s+hold|reservation\s+fee|holding\s+fee)\b/i
  },
  {
    id: "scam-payment-app",
    category: "scam-pressure",
    reason: "payment app pressure",
    weight: 42,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:zelle\s+only|cash\s*app\s+only|venmo\s+only|apple\s+pay\s+only|paypal\s+(?:friends\s+and\s+family|f\s*&\s*f)\s+only|crypto\s+only|wire\s+transfer\s+(?:only|required)|payment\s+(?:up\s*front|in\s+advance|before\s+(?:pickup|meeting|delivery)))\b/i
  },
  {
    id: "scam-shipping-only",
    category: "scam-pressure",
    reason: "shipping/off-platform pressure",
    weight: 38,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:shipping\s+only|no\s+(?:local\s+)?pickup(?:\s+possible|\s+available)?[,.]?\s+(?:shipping|ship|courier)|courier\s+only|escrow|(?:i'?m|i\s+am|currently)\s+(?:out\s+of\s+(?:town|state|country)|overseas|deployed|relocated).{0,60}\b(?:ship|shipping|courier|mail)\b)\b/i
  },
  {
    id: "scam-fake-payment-upgrade",
    category: "scam-pressure",
    reason: "fake payment/account-upgrade language",
    weight: 72,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:(?:payment|funds?|money)\s+(?:is\s+|are\s+)?(?:pending|on\s+hold|sent|confirmed|released)|on\s+hold\s+due\s+to|(?:zelle|venmo|paypal|cash\s*app)\s+account\s+limit|(?:upgrade|expand)\s+(?:your\s+|my\s+)?account|(?:upgrade|convert)\s+(?:to\s+)?(?:a\s+)?(?:your\s+)?(?:zelle|venmo|paypal|cash\s*app)?\s*business\s+account|business\s+account\s+(?:fee|upgrade|limit)|release\s+(?:the\s+)?funds?|refund\s+the\s+(?:fee|upgrade)|you\s+will\s+be\s+refunded)\b/i
  },
  {
    id: "scam-remote-seller",
    category: "scam-pressure",
    reason: "absent-seller arrangement",
    weight: 30,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:(?:i'?m|i\s+am|i'?ll\s+be|currently|owner\s+is)\s+out\s+of\s+(?:town|state|the\s+country)|(?:my|the)\s+(?:assistant|agent|secretary|movers?)\s+will\s+(?:coordinate|handle|pick|meet)|on\s+mission(?:ary)?\s+work|deployed\s+overseas)\b/i
  },
  {
    id: "scam-verification-code",
    category: "scam-pressure",
    reason: "verification-code request",
    weight: 74,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:(?:send|share|text|give|read)\s+(?:me\s+)?(?:back\s+)?(?:the\s+)?(?:six|6)[-\s]?digit\s+(?:code|verification|number)|(?:google\s+voice|verification|security|confirmation)\s+code|code\s+to\s+(?:verify|confirm)\s+(?:you|yourself))\b/i
  },
  {
    id: "scam-gift-card-crypto",
    category: "scam-pressure",
    reason: "gift-card/crypto payment pressure",
    weight: 74,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:pay(?:ment)?\s+(?:by|with|via|in)\s+(?:gift\s*cards?|bitcoin|crypto|cryptocurrency|usdt|btc)|(?:apple|google\s+play|steam|visa|vanilla|amazon)\s+gift\s*cards?\s+(?:only|required|payment|accepted)|(?:bitcoin|crypto|cryptocurrency|usdt|btc)\s+(?:only|required|payment|accepted))\b/i
  },
  {
    id: "scam-financial-opportunity",
    category: "scam-pressure",
    reason: "financial scheme pitch",
    weight: 72,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:forex|trading\s+signals?|crypto\s+(?:signals?|mentor(?:ship)?|course|training|investment|opportunit(?:y|ies))|investment\s+opportunit(?:y|ies)|guaranteed\s+(?:returns?|profits?|income)|double\s+your\s+money|(?:flip|turn)\s+\$\d+|loan\s+approval|guaranteed\s+approval\s+loans?|no\s+credit\s+check\s+loans?|bad\s+credit\s+loans?|personal\s+loans?|payday\s+loans?|debt\s+(?:relief|consolidation)|funding\s+available|processing\s+fee\s+(?:required|upfront)|upfront\s+(?:processing\s+)?fee)\b/i
  },
  {
    id: "scam-overpayment-refund",
    category: "scam-pressure",
    reason: "overpayment/refund scam language",
    weight: 72,
    confidence: "high",
    fields: ["allText"],
    pattern:
      /\b(?:overpaid|over\s+payment|sent\s+(?:you\s+)?extra|extra\s+(?:money|amount|funds)|refund\s+the\s+(?:difference|extra|rest)|send\s+back\s+the\s+(?:difference|extra)|check\s+for\s+more\s+than|cashier'?s\s+check.{0,50}\b(?:refund|difference|extra)\b)\b/i
  },

  // --- Catalog copy ---
  {
    id: "catalog-generic-copy",
    category: "catalog-copy",
    reason: "generic catalog copy",
    weight: 24,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:perfect\s+for\s+any\s+(?:room|space|home)|elevate\s+your|enhance\s+your\s+(?:space|home|living)|modern\s+minimalist|sleek\s+design|ergonomic\s+design|premium\s+quality|high[-\s]?quality\s+materials|crafted\s+from\s+premium|breathable\s+mesh|upgrade\s+your\s+(?:space|home|setup))\b/i
  },
  {
    id: "catalog-sku-heavy",
    category: "catalog-copy",
    reason: "SKU/retail item-number copy",
    weight: 24,
    confidence: "medium",
    fields: ["allText"],
    pattern: /\b(?:sku\s*[:#]?\s*\w+|item\s*(?:no\.?|number|#)\s*\w+|upc\b|asin\b)\b/i
  },
  {
    id: "catalog-spec-boilerplate",
    category: "catalog-copy",
    reason: "retail spec boilerplate",
    weight: 14,
    confidence: "low",
    fields: ["allText"],
    pattern: /\b(?:assembly\s+required|product\s+dimensions|package\s+includes|weight\s+capacity|retail\s+(?:price|value)|msrp)\b/i
  },
  {
    id: "catalog-reference-photo",
    category: "catalog-copy",
    reason: "reference/stock photo disclaimer",
    weight: 42,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:(?:stock|catalog|sample|example|representative)\s+(?:photos?|pictures?|pics?|images?)(?:\s+only|\s+for\s+(?:reference|example|display|illustration))?|(?:photos?|pictures?|pics?|images?)\s+for\s+reference\s+(?:only|not\s+actual)|(?:photos?|pictures?|pics?|images?)\s+(?:are\s+)?(?:for\s+)?(?:reference|example|display|illustration)\s+only|(?:photos?|pictures?|pics?|images?)\s+(?:is|are)\s+not\s+(?:the\s+)?actual(?:\s+(?:item|unit|product|one|photo|picture|pic|image))?|not\s+(?:the\s+)?actual\s+(?:item|unit|product|photo|picture|pic|image|one)|actual\s+(?:item|unit|product|color|colors?)\s+may\s+(?:vary|differ))\b/i
  },

  // --- Gem-positive signals (reduce score) ---
  {
    id: "gem-estate-moving",
    category: "gem-positive",
    reason: "human sale context",
    weight: -24,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:estate\s+sale|moving\s+sale|garage\s+sale|yard\s+sale|downsizing|clearing\s+out|must\s+go|pickup\s+only|pick\s*up\s+only|curb\s+alert|first\s+come\s+first\s+serve)\b/i
  },
  {
    id: "gem-condition-details",
    category: "gem-positive",
    reason: "real condition details",
    weight: -20,
    confidence: "medium",
    fields: ["allText"],
    pattern:
      /\b(?:used\s+for|owned\s+for|gently\s+used|barely\s+used|pre[-\s]?owned|second[-\s]?hand|like\s+new|(?:good|great|excellent|fair|poor|mint|working)\s+condition|used\s*[-\s]\s*(?:good|fair|like\s+new)|works(?:\s+(?:great|well|perfectly|fine|but))?(?!\s+with)|tested(?:\s+and\s+working)?|factory\s+reset|reset\s+to\s+factory|charger\s+included|remote\s+included|no\s+(?:charger|remote|stains?|rips?|tears?|issues?|damage)|battery\s+(?:holds|health|needs|weak)|screen\s+(?:cracked|scratched?|scratch(?:es)?)|minor\s+(?:wear|scuffs?|scratches?)|small\s+(?:tear|rip|chip|stain|dent|scratch)|as[-\s]?is\b|needs\s+(?:tlc|repair|work|cleaning|a\s+bulb)|scratches?|dents?|normal\s+wear|patina|missing\s+(?:one|a)|smoke[-\s]?free|pet[-\s]?free|one\s+owner|adult\s+owned|well[-\s]maintained)\b/i
  },
  {
    id: "gem-material-vintage",
    category: "gem-positive",
    reason: "gem-positive item detail",
    weight: -18,
    confidence: "low",
    fields: ["allText"],
    pattern: /\b(?:solid\s+(?:wood|oak|maple|teak|mahogany|walnut)|hardwood|vintage|mid[-\s]?century|mcm\b|antique|handmade|hand[-\s]carved|heirloom|reupholstered|refinished)\b/i
  }
];

export const DYNAMIC_RULE_CONTROLS: RuleControlDefinition[] = [
  {
    id: "bait-price-dynamic",
    category: "bait-pricing",
    reason: "bait/display price mismatch",
    weight: 50,
    confidence: "high",
    description: "Flags $1/$123/free/contact-price tricks when the listing reveals a different price elsewhere."
  },
  {
    id: "keyword-stuffing-detected",
    category: "keyword-stuffing",
    reason: "keyword stuffing",
    weight: 34,
    confidence: "medium",
    description: "Flags repeated search terms, brand piles, and SEO-like titles (legit moving-sale bundles are exempt)."
  },
  {
    id: "counterfeit-luxury-underpriced",
    category: "counterfeit",
    reason: "suspicious price for branded item",
    weight: 34,
    confidence: "medium",
    description: "Flags suspiciously cheap luxury goods, brand-new cheap hype sneakers, and stacked designer-brand titles. Used items with wear details stay visible."
  },
  {
    id: "counterfeit-authenticity-dodge",
    category: "counterfeit",
    reason: "authenticity dodge on branded item",
    weight: 30,
    confidence: "medium",
    description: "Flags 'looks real', 'can't verify authenticity' wording on luxury/hype branded items."
  },
  {
    id: "duplicate-flood-dynamic",
    category: "duplicate-flood",
    reason: "repeat of a visible listing",
    weight: 80,
    confidence: "high",
    description:
      "Collapses repeat posts: when the same title+price appears under 4+ distinct item IDs (6+ across locations), the first stays visible and only the repeats hide. Same-title-different-price search results never collapse."
  },
  {
    id: "store-sponsored-card",
    category: "store-business",
    reason: "sponsored marketplace ad",
    weight: 74,
    confidence: "high",
    description: "Hides Marketplace cards with a standalone Sponsored marker. Listings merely containing the word 'sponsored' are unaffected."
  },
  {
    id: "image-catalog-photo",
    category: "catalog-copy",
    reason: "retailer-style stock photo",
    weight: 18,
    confidence: "medium",
    description:
      "On-device photo check: product on a pure-white background, the retailer catalog style used by Amazon/Wayfair copy-pastes. Never acts alone; stacks with vendor and retail wording."
  },
  {
    id: "missing-human-context",
    category: "missing-human",
    reason: "commercial text without condition detail",
    weight: 14,
    confidence: "low",
    description: "Adds a small score to retail-sounding listings that lack condition, pickup, ownership, or defect details. Never acts alone."
  },
  {
    id: "vendor-retail-combo",
    category: "known-vendor",
    reason: "vendor source + retail-style wording",
    weight: 26,
    confidence: "medium",
    description: "Escalates when a vendor/source mention appears together with retail-style wording (brand new, in box, order, stock) and no human condition details."
  }
];
