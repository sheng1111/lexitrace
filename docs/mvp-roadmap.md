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
7. Five-word TOEIC foundation sessions prioritized by weakness and due state
8. Local TOEIC attention and quiz-accuracy metrics

Done means saved words naturally reappear as light review opportunities during browsing.

## P1 Sync

1. Google OAuth permission flow
2. Automatic dedicated Sheet creation
3. Connect an existing Sheet on another device
4. Manual sync plus durable debounced, polling, and retrying automatic sync
5. Bidirectional last-write-wins merge
6. Pending, synced, failed, and resolved-conflict reporting
7. Quiet sync errors in settings

Done means the extension remains local-first while two devices can converge vocabulary through a user-owned Sheet without a custom endpoint.

## P2

1. Selective sync restore and history
2. Better dictionary data
3. Broader word-family derivation beyond the lightweight Phase 1 rules
4. AI provider discussion
5. Local AI provider discussion

## Release Readiness

1. Reserve Chrome Web Store extension ID.
2. Create production Google OAuth client bound to that extension ID.
3. Build with `npm run build:release`.
4. Verify Google Sheet OAuth sync from settings.
