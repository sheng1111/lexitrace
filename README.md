# LexiTrace 詞跡

**輕量查詞與隱形複習插件**  
**A lightweight browser extension for contextual vocabulary lookup, lookup history, and passive vocabulary review.**

LexiTrace 詞跡是一個 local-first 的瀏覽器查詞插件。它讓使用者在閱讀英文網頁、文件、GitHub issue 或技術文章時，快速查詢選取的單字或片語，保存查詞紀錄，並在之後用低干擾的頁面標記與回想提示偷偷複習。

LexiTrace is built for English learners who still want to read original English content. It is not a full-page translator, a chatbot, or a heavy flashcard app. The goal is to keep English learning inside the normal reading flow.

Repository: <https://github.com/sheng1111/lexitrace>

## Why

開發者是一個英文不好的 RD。工作時常常要讀英文文件、產品公告、GitHub issue 和技術文章。整頁翻譯雖然很快，但看久了英文不會進步，單字也記不起來。

詞跡想解決的是這個很日常的痛點：上班閱讀英文時，不離開原本頁面就能查詞、記錄、標記，之後再次遇到同一個詞時先回想再看答案。希望它能幫助使用者慢慢提升英文閱讀能力與多益相關字彙，而不是只依賴整頁翻譯。

## Status

Current status: **Phase 1 MVP / local-first self-use build**.

Implemented:

- Chrome / Chromium Manifest V3 extension
- Selection-based lookup popup
- Traditional Chinese meaning and English hint fields
- Manual meaning correction
- Local vocabulary storage with IndexedDB
- Saved-word highlights on web pages
- Recall-first popup for saved words
- Lightweight due-review prompt based on saved words found on the current page
- Spaced review metadata: next review time, last reviewed time, interval, and ease factor
- Page exposure tracking for repeated encounters
- Page vocabulary bubble
- Toolbar popup and options page
- Optional Google Sheet push sync foundation
- JSON export
- Extension icon set

Not yet complete:

- Full cross-device pull sync
- Conflict resolution for Google Sheet sync
- Full spaced repetition scheduling
- Automated tests
- Chrome Web Store release hardening

## Tech Stack

- TypeScript
- Vite
- Chrome Extension Manifest V3
- Native IndexedDB
- `chrome.storage.local`
- `opencc-js` for Simplified-to-Traditional Chinese conversion
- `wink-lemmatizer` for English word-form normalization
- Plain DOM UI for a small MVP runtime

Python is not part of the extension runtime. If Python tooling is added later, use a local `.venv`.

## Lookup Sources

LexiTrace does not rely on a hand-written local dictionary. Lookup providers run with bounded timeouts and are merged into one popup result.

Default providers:

- **ECDICT via jsDelivr CDN**: primary English-to-Chinese dictionary data, converted to Taiwan Traditional Chinese.
- **Free Dictionary API**: English definitions, parts of speech, and pronunciation.
- **Wiktapi / Wiktionary**: structured Wiktionary definitions, pronunciations, and available translations.
- **Datamuse API**: semantic fallback for English definitions and related word metadata.
- **MyMemory Translation API**: non-Google translation fallback when dictionary providers do not provide Chinese.
- **Local fallback dictionary**: small resilience layer for common work and technical words.

Experimental opt-in:

- **Unofficial Google Translate endpoint**: disabled by default. When enabled in Settings, Chinese meanings are prioritized from `translate.googleapis.com`. This is not an official public API and may break or be limited, so it is intended for self-use only.

## Learning Design

LexiTrace is designed around a few practical language-learning ideas:

- **Incidental vocabulary learning**: learn from real reading instead of leaving the page for a separate study session.
- **Repeated exposure**: saved words are highlighted when they reappear, and each page encounter is tracked.
- **Retrieval practice**: saved words ask the user to recall first before revealing the meaning.
- **Spaced review**: remembered words are scheduled farther into the future; uncertain words come back sooner.
- **Context retention**: source sentences are stored so the word is reviewed in the same kind of usage where it was found.
- **TOEIC/workplace relevance**: badges and priority rules highlight words likely to matter in work, documentation, and business reading.

The product intentionally avoids full-page translation as the default habit. It helps the user read English first, then gives targeted support only when needed.

## Install

Requirements:

- Node.js 20+
- npm
- Chrome, Edge, Brave, or another Chromium-based browser

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

The loadable extension is generated at:

```text
dist/
```

## Load in Chrome / Edge

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click Load unpacked
5. Select the project `dist/` folder
6. Open any English web page and select a word or short phrase

After rebuilding or reloading the extension, refresh already-open web pages so the new content script is injected.

## Development

Type check:

```bash
npm run typecheck
```

Generate icons:

```bash
npm run build:icons
```

Build everything:

```bash
npm run build
```

Release build:

```bash
npm run build:release
```

`build:release` requires `LEXITRACE_GOOGLE_OAUTH_CLIENT_ID` so the extension is not accidentally packaged with the OAuth placeholder.

## Google Sheet Sync

LexiTrace is local-first by default. Google Sheet sync is optional and currently focuses on creating a user-owned spreadsheet and pushing saved vocabulary records.

Recommended user flow:

1. Open Settings
2. Click 啟用 Google Sheet 同步
3. Complete Google authorization
4. LexiTrace creates a dedicated `LexiTrace Sync Data` spreadsheet
5. Use 立即同步 or 打開 Google Sheet from Settings

Developer setup:

```bash
cp .env.example .env
```

Then set:

```text
LEXITRACE_GOOGLE_OAUTH_CLIENT_ID=your-extension-oauth-client-id.apps.googleusercontent.com
```

The OAuth client ID is public by design. Do not put client secrets, service account keys, refresh tokens, or private API keys into the extension.

## Privacy and Safety

- Vocabulary is stored locally by default.
- The extension stores selected words, meanings, source sentence snippets, page title, URL, and review state.
- It does not upload full page contents.
- External lookup providers receive only the selected word or short phrase.
- Google Sheet sync writes vocabulary records to a spreadsheet owned by the user.
- No API secret is bundled into the extension.

## Chrome Web Store Publishing

Before publishing:

1. Decide whether this is a self-use build or a public Chrome Web Store release.
2. For a public release, consider disabling or clearly documenting the experimental unofficial Google Translate option.
3. Create a Chrome Web Store developer account.
4. Create a Chrome Web Store item first if you need a stable production extension ID.
5. Create a Google Cloud Chrome Extension OAuth client bound to that production extension ID.
6. Set `LEXITRACE_GOOGLE_OAUTH_CLIENT_ID` in `.env`.
7. Run:

```bash
npm run typecheck
npm run build:release
npm audit --audit-level=moderate
```

Package the generated extension:

```bash
cd dist
zip -r ../lexitrace-chrome.zip .
```

Upload `lexitrace-chrome.zip` in the Chrome Developer Dashboard.

Store listing checklist:

- Extension name: `LexiTrace 詞跡`
- Short description: `輕量查詞與隱形複習插件`
- Category: Education or Productivity
- Icon: included at `icons/icon-128.png`
- Screenshots: prepared in `store-assets/screenshots/` at 1280x800
- Privacy practices: disclose selected text, source sentence snippets, page URL/title, local vocabulary records, and optional Google Sheet sync
- Single purpose: contextual vocabulary lookup and passive review while reading English web pages
- Test instructions: explain how to select an English word, save it, refresh a page, and see the recall/highlight flow

Useful official references:

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Supplying Chrome Web Store images](https://developer.chrome.com/docs/webstore/images)
- [Manifest file format](https://developer.chrome.com/docs/extensions/reference/manifest)

## Project Structure

```text
config/                     Build-time manifest template
docs/                       Product and engineering documents
options/                    Options page HTML entry
popup/                      Toolbar popup HTML entry
public/                     Extension static assets and generated manifest
scripts/                    Build helpers
store-assets/               Chrome Web Store listing drafts, OAuth notes, screenshots
src/background/             MV3 service worker
src/content/                Selection popup, highlights, recall UI
src/core/                   Shared types, settings, messages, i18n
src/dictionary/             Lookup providers and provider orchestration
src/options/                Options page logic and styles
src/popup/                  Toolbar popup logic and styles
src/storage/                IndexedDB persistence
src/sync/                   Optional Google Sheet sync
```

Product source of truth:

- [docs/product-spec.md](./docs/product-spec.md)
- [docs/project-design.md](./docs/project-design.md)
- [docs/mvp-roadmap.md](./docs/mvp-roadmap.md)
- [docs/release-checklist.md](./docs/release-checklist.md)

## License

MIT
