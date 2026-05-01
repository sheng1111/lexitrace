# Google OAuth Setup Notes

## Do I need to publish first?

For a Google Cloud OAuth client of type Chrome Extension, Google asks for a Chrome extension ID.

You do not need to complete public publishing first, but you need a stable extension ID.

Recommended production flow:

1. Create a Chrome Web Store item as a draft.
2. Use the draft item's extension ID.
3. Create a Google Cloud OAuth client with application type Chrome Extension.
4. Paste that extension ID into the OAuth client configuration.
5. Copy the generated OAuth client ID into `.env`.

Local development flow:

1. Load the unpacked extension from `dist/`.
2. Copy the extension ID shown in `chrome://extensions`.
3. Create a separate Google Cloud OAuth client for local testing.
4. Use that local OAuth client ID in `.env`.

Local unpacked IDs are useful for testing but should not be reused as the public release OAuth client.

## Environment Variable

```text
LEXITRACE_GOOGLE_OAUTH_CLIENT_ID=your-real-client-id.apps.googleusercontent.com
```

The example placeholder will not pass `npm run build:release`.

## Release Build

```bash
npm run build:release
```

If the OAuth client ID is missing or still an example value, release build fails intentionally.
