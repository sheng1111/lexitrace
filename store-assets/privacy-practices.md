# Privacy Practices Draft

## Data Collected or Stored

LexiTrace stores vocabulary learning data locally in the browser:

- selected words or short phrases
- Traditional Chinese meanings
- English hints
- source sentence snippets
- page title
- page URL and domain
- lookup count
- seen count
- recall result counts
- review scheduling metadata
- sync status

## Data Use

Data is used only to provide contextual lookup, saved-word highlights, recall prompts, review scheduling, local export, and optional Google Sheet sync.

## Data Sharing

By default, vocabulary records remain on the user's device.

If external lookup providers are enabled or used, only the selected word or short phrase is sent to the configured provider. Full page contents are not uploaded.

If Google Sheet sync is enabled, saved vocabulary records are written to a Google Sheet owned by the user.

## Remote Services

The extension may contact these services for lookup or sync:

- ECDICT via jsDelivr CDN
- Free Dictionary API
- Wiktapi / Wiktionary
- Datamuse API
- MyMemory Translation API
- Google Sheets API, only when sync is enabled
- translate.googleapis.com, only when the experimental unofficial Google Translate option is enabled

## Secrets

No client secret, service account key, refresh token, or private API key is bundled into the extension. Google OAuth client IDs are public identifiers and are expected to be visible in `manifest.json`.

## User Control

Users can:

- disable the extension
- disable page highlights
- disable lightweight review prompts
- export local vocabulary as JSON
- disable Google Sheet sync
- delete extension data through browser extension/site data controls
