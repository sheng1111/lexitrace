# Release Checklist

This checklist assumes LexiTrace is going to be published to the Chrome Web Store.

## Chrome Web Store ID

OAuth for Chrome extensions depends on a stable extension ID. For production:

1. Create or reserve the Chrome Web Store item.
2. Use that production extension ID when creating the Google Cloud OAuth client.
3. Keep the production extension ID stable across releases.

For local development, unpacked extensions may have a different ID. Use a separate development OAuth client if needed.

## Google OAuth Client

Create a Google Cloud OAuth client for a Chrome extension:

- Application type: Chrome Extension
- Extension ID: production Chrome Web Store extension ID
- Scopes:
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/drive.file`

Do not put any client secret, service account key, or refresh token in the extension. The OAuth client ID is public and expected to be visible in `manifest.json`.

## Build Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set:

```text
LEXITRACE_GOOGLE_OAUTH_CLIENT_ID=your-production-extension-oauth-client-id.apps.googleusercontent.com
```

Use release build:

```bash
npm run build:release
```

`build:release` fails if `LEXITRACE_GOOGLE_OAUTH_CLIENT_ID` is missing.

## Security Notes

- `client_id` is not a secret.
- Do not obfuscate `client_id`; obfuscation does not provide real security.
- Keep scopes minimal.
- Use `drive.file` so LexiTrace can only access files it creates or the user explicitly opens with the app.
- Keep user vocabulary local-first and sync only saved vocabulary data.

## Pre-Submission Checks

```bash
npm run typecheck
npm run build:release
npm audit --audit-level=moderate
```

Then load `dist/` as an unpacked extension and verify:

- Selection lookup popup appears and is not clipped.
- Traditional Chinese meanings appear for common words.
- Saved words are highlighted.
- Recall popup uses Traditional Chinese UI.
- Google Sheet sync authorization opens from the settings button.
- A dedicated Google Sheet is created.
- Sync writes vocabulary rows.

