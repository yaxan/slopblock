# SlopBlock Privacy

SlopBlock is designed to run locally in the browser.

## Data Collection

SlopBlock does not collect, transmit, sell, rent, or monetize user data.

The extension does not include:

- Accounts or sign-in.
- Analytics or telemetry.
- Ads or affiliate links.
- A backend service.
- Remote rule updates.
- Listing-history upload or storage.

## Deep Scan

The optional "Deep scan descriptions" feature (on by default, toggleable in the popup and settings) fetches Marketplace listing pages directly from facebook.com in the background using your existing Facebook session — the same request your browser makes when you click a listing. This is used only to read the listing's own title, price, and description so spam can be detected before you open it. These requests go only to facebook.com; results are kept in memory for the current tab session only and are never stored or transmitted anywhere.

## Photo Analysis

The "Analyze listing photos on this device" feature (on by default, toggleable in settings) examines listing photos entirely on your device to detect retailer-catalog-style images and reused photos. Photos are never uploaded, and no external service is contacted.

The "Find photo online" button on flagged listings opens Google Lens with the photo's public URL in a new tab. This only happens when you click it — it is your action in your browser, and SlopBlock itself never contacts Google or any third party.

## Local Storage

SlopBlock stores only user-controlled settings in Chrome extension storage:

- Enabled/disabled state.
- Aggressiveness and filter mode.
- Enabled/disabled rule groups.
- Disabled built-in rule IDs.
- Custom block terms.
- Custom vendor terms.
- Custom allowlist terms.

Raw Facebook Marketplace listing text is scored in memory on the page and is not persisted by SlopBlock.

## Network Requests

SlopBlock does not intentionally make external network requests. Filtering is performed from visible page text using bundled local rules.

## Permissions

SlopBlock requests:

- `storage`: to save local settings.
- Facebook Marketplace host access: to run the content script on Marketplace pages and hide/dim/label listings.

## Settings Export

The options page can export settings as JSON. Exported JSON is displayed locally in the page so users can back it up or share it manually.

## Diagnostics Export

The popup can copy local diagnostics for the current Marketplace page. This is a manual user action intended for debugging false positives. Diagnostics are not sent anywhere by SlopBlock.

Copied diagnostics can be analyzed locally with `npm run diagnostics -- path/to/diagnostics.json`.
Marketplace URL query parameters are stripped and common phone/email patterns are redacted from copied excerpts and matched rule samples.
