# MVP Roadmap

## P0: Reading Loop

1. Selection detection
2. Lookup popup
3. Local vocabulary save
4. Current-page highlights
5. Recall-first popup
6. IndexedDB storage
7. Basic settings page

Done means a user can select a word, save it, see it highlighted, click it later, and answer remembered or still unsure.

## P1: Passive Review

1. Page vocabulary bubble
2. One-question review prompt
3. Highlight intensity by status
4. Rule-based TOEIC badge
5. Rule-based context badge
6. CSV and JSON export

Done means saved words naturally reappear as light review opportunities during browsing.

## P1 Sync

1. Google OAuth permission flow
2. Automatic dedicated Sheet creation
3. Manual push sync
4. Pending, synced, failed statuses
5. Quiet sync errors in settings

The OAuth-first UI and push path exist in the current foundation. Done means the extension remains local-first but can export saved vocabulary to a user-owned sheet.

## P2

1. Pull sync
2. Better dictionary data
3. Lemmatization and word-family matching
4. AI provider discussion
5. Local AI provider discussion

## Release Readiness

1. Reserve Chrome Web Store extension ID.
2. Create production Google OAuth client bound to that extension ID.
3. Build with `npm run build:release`.
4. Verify Google Sheet OAuth sync from settings.
