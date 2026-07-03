import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  "dist/manifest.json",
  "dist/content.js",
  "dist/content.css",
  "dist/popup.html",
  "dist/popup.js",
  "dist/popup.css",
  "dist/options.html",
  "dist/options.js",
  "dist/options.css",
  "dist/icons/icon-16.png",
  "dist/icons/icon-48.png",
  "dist/icons/icon-128.png"
];
const allowedFiles = new Set(requiredFiles);

for (const file of requiredFiles) {
  assert(existsSync(file), `Missing packaged file: ${file}`);
}

for (const file of allFiles(["dist"])) {
  assert(allowedFiles.has(file), `Unexpected packaged file: ${file}`);
}

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
assert(manifest.manifest_version === 3, "Expected Manifest V3");
assert(manifest.permissions.length === 1 && manifest.permissions[0] === "storage", "Expected storage-only extension permission");
assert(Array.isArray(manifest.host_permissions), "Expected host_permissions");
assert(
  manifest.host_permissions.every((permission) => /^https:\/\/(?:www\.)?facebook\.com\/marketplace\*/.test(permission)),
  "Expected host permissions to be limited to Facebook Marketplace"
);
assert(!("background" in manifest), "Did not expect a background service worker");
assert(!("web_accessible_resources" in manifest), "Did not expect web-accessible resources");
assert(!("externally_connectable" in manifest), "Did not expect external extension messaging");
assert(manifest.action?.default_popup === "popup.html", "Expected popup.html as action popup");
assert(manifest.options_page === "options.html", "Expected options.html as options page");
assert(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 1, "Expected exactly one content script");

const [contentScript] = manifest.content_scripts;
assert(
  contentScript.matches.every((match) => /^https:\/\/(?:www\.)?facebook\.com\/marketplace\*/.test(match)),
  "Expected content script matches to be limited to Facebook Marketplace"
);
assert(contentScript.js.length === 1 && contentScript.js[0] === "content.js", "Expected content.js content script");
assert(contentScript.css.length === 1 && contentScript.css[0] === "content.css", "Expected content.css content stylesheet");

for (const [size, iconPath] of Object.entries(manifest.icons ?? {})) {
  assert(["16", "48", "128"].includes(size), `Unexpected icon size: ${size}`);
  assert(existsSync(join("dist", iconPath)), `Missing manifest icon: ${iconPath}`);
}

for (const file of allFiles(["dist"])) {
  assert(!file.endsWith(".map"), `Release build should not include source map: ${file}`);
}

for (const file of codeFiles(["dist"])) {
  const content = readFileSync(file, "utf8");
  assert(!/sourceMappingURL=/.test(content), `Release build should not reference a source map: ${file}`);
}

// Network policy: fetch() is allowed ONLY where a documented feature needs
// it — deep scan (same-origin listing pages from facebook.com) and local
// photo analysis (reading image pixels the page already displays). The
// popup/options bundles and everything else stay network-free.
const fetchAllowedFiles = new Set(["src/content/deepScan.ts", "src/content/imageScan.ts", "dist/content.js"]);

const forbiddenCodePatterns = [
  /\bXMLHttpRequest\b/,
  /\bnavigator\.sendBeacon\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /\bchrome\.runtime\.connect\b/,
  /\bchrome\.cookies\b/,
  /\bchrome\.history\b/,
  /\bchrome\.tabs\.captureVisibleTab\b/
];

for (const file of codeFiles(["src", "dist"])) {
  const content = readFileSync(file, "utf8");
  for (const pattern of forbiddenCodePatterns) {
    assert(!pattern.test(content), `Forbidden network/privacy-sensitive API in ${file}: ${pattern}`);
  }

  if (/\bfetch\s*\(/.test(content)) {
    assert(fetchAllowedFiles.has(file.replaceAll("\\", "/")), `fetch() outside the allowlisted network features in ${file}`);
  }
}

// Deep scan may only talk to facebook.com, with the user's own session.
const deepScanSource = readFileSync("src/content/deepScan.ts", "utf8");
assert(
  deepScanSource.includes("https://www.facebook.com/marketplace/item/"),
  "Deep scan must fetch Marketplace item pages only"
);

// Photo analysis must not attach credentials to CDN image requests.
const imageScanSource = readFileSync("src/content/imageScan.ts", "utf8");
assert(imageScanSource.includes('credentials: "omit"'), "Image analysis must fetch images without credentials");

// The extension pages stay entirely network-free.
for (const file of ["dist/popup.js", "dist/options.js"]) {
  assert(!/\bfetch\s*\(/.test(readFileSync(file, "utf8")), `Expected no network calls in ${file}`);
}

// Every absolute URL baked into the content bundle must point at an
// expected host (facebook.com for deep scan/diagnostics links, l.facebook.com
// unwrapping, Google Lens for the user-initiated button).
const allowedContentHosts = new Set(["www.facebook.com", "l.facebook.com", "lens.google.com"]);
const contentBundle = readFileSync("dist/content.js", "utf8");
for (const match of contentBundle.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
  assert(allowedContentHosts.has(match[1].toLowerCase()), `Unexpected host baked into content bundle: ${match[1]}`);
}

console.log("Extension package verified.");

function* allFiles(paths) {
  for (const path of paths) {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const child of readdirSync(path)) {
        yield* allFiles([join(path, child)]);
      }
    } else {
      yield path;
    }
  }
}

function* codeFiles(paths) {
  for (const path of paths) {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const child of readdirSync(path)) {
        yield* codeFiles([join(path, child)]);
      }
    } else if (/\.(?:ts|js|html)$/.test(path)) {
      yield path;
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
