# LexiTrace Privacy Policy

Last updated: 2026-05-01

LexiTrace 詞跡 is a browser extension for contextual English vocabulary lookup, saved lookup history, page highlights, and passive review while reading English web pages.

## Data LexiTrace Handles

LexiTrace may store the following data in the user's browser:

- selected English words or short phrases
- Traditional Chinese meanings and English hints
- source sentence snippets
- page title, page URL, and domain for saved lookup context
- lookup count, seen count, recall results, and review scheduling metadata
- Google Sheet sync status, if the user enables sync

LexiTrace does not collect health information, payment information, passwords, private messages, or precise location data.

## How Data Is Used

LexiTrace uses this data only to provide its single purpose: contextual vocabulary lookup and passive vocabulary review while reading English web pages.

The data is used to:

- show lookup results for selected words or short phrases
- save vocabulary records locally
- highlight saved words when they appear again
- show recall-first review prompts
- schedule lightweight vocabulary review
- export vocabulary data as JSON
- optionally sync saved vocabulary records to a Google Sheet owned by the user

## Local Storage

By default, vocabulary records are stored locally in the browser using IndexedDB and Chrome extension storage. The developer does not receive a copy of this local data.

## External Services

LexiTrace may contact external services to provide dictionary lookup, translation fallback, or optional sync. Only the selected word or short phrase is sent to lookup providers. Full page contents are not uploaded.

The extension may contact:

- ECDICT via jsDelivr CDN
- Free Dictionary API
- Wiktapi / Wiktionary
- Datamuse API
- MyMemory Translation API
- Google Sheets API, only if Google Sheet sync is enabled
- translate.googleapis.com, only if the user enables the experimental unofficial Google Translate option

If Google Sheet sync is enabled, saved vocabulary records are written to a Google Sheet in the user's Google Drive. Google handles that data under Google's own privacy policies.

## Data Sharing

LexiTrace does not sell user data.

LexiTrace does not transfer user data to third parties except when necessary to provide its user-facing features, such as sending the selected word to a dictionary provider or writing saved vocabulary records to the user's own Google Sheet after the user enables sync.

LexiTrace does not use user data for advertising, credit evaluation, lending, or unrelated profiling.

## Authentication

Google OAuth is used only to let the user create and sync to a Google Sheet. LexiTrace does not bundle a client secret, service account key, refresh token, or private API key. OAuth access tokens are handled through Chrome's identity API and are not stored by LexiTrace as vocabulary data.

## User Control

Users can:

- disable LexiTrace from the settings page
- disable page highlights
- disable lightweight review prompts
- disable Google Sheet sync
- export local vocabulary as JSON
- remove extension data by uninstalling the extension or clearing extension storage in the browser

## Contact

For privacy questions, please contact the developer through the GitHub repository:

https://github.com/sheng1111/lexitrace
