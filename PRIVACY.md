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
