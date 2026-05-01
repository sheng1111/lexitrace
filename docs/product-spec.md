# Invisible English Learning Browser Extension Spec

## 1. Product Positioning

This browser extension helps intermediate English learners read original English web pages while silently building vocabulary memory through contextual lookup, page highlights, recall prompts, and lightweight review.

The product is not a full-page translator, not a heavy vocabulary app, and not a TOEIC course. It is a reading-first assistant for users who want to improve English while doing their normal work.

Core positioning:

> Read English first. Learn silently in the background.

Primary product goal:

> Help users understand English web content with minimal interruption, while gradually improving TOEIC and workplace English vocabulary through repeated real-world exposure.

---

## 2. Target Users

Primary users:

* Engineers and office workers who often read English websites, documentation, GitHub issues, product announcements, business articles, or work-related English.
* English level around TOEIC 450 to 700.
* Users who previously relied on full-page translation but now want to train themselves to read original English.
* Users who do not want to open a separate learning app during work.
* Users who prefer lightweight, professional, low-friction tools.

Representative user:

> An engineer with TOEIC around 550 needs to read English documentation and articles at work. They want to avoid full-page translation and instead read original English. When they get stuck, they want to select a word or phrase, understand it quickly, save it, see it highlighted later, and be reminded to recall it when it appears again.

---

## 3. Product Principles

The extension should follow these principles:

1. Reading comes first.
2. Learning should be silent and lightweight.
3. Do not encourage full-page translation.
4. Do not interrupt users with heavy learning flows.
5. Saved words should leave visible but subtle traces on the page.
6. When a saved word appears again, ask the user to recall first instead of immediately showing the answer.
7. Review prompts should feel like optional suggestions, not forced tests.
8. UI should be professional, modern, quiet, and not playful.
9. Avoid emoji in product UI.
10. Phase 1 should be free and should not depend on AI.
11. Google Sheet sync should be optional, not required.
12. Local-first data ownership is required.

---

## 4. Product Scope

## 4.1 Phase 1: Free Local-First MVP

Phase 1 should be usable without AI, without a paid backend, and without a required account.

Phase 1 includes:

* Select English word or phrase on any web page.
* Show a lightweight lookup popup.
* Save vocabulary locally.
* Highlight saved words on the original page.
* Show recall-first popup when a saved word appears again.
* Provide a page vocabulary bubble.
* Provide very lightweight review prompts.
* Store all data locally by default.
* Optionally sync/export records to Google Sheet if the user configures it.

Phase 1 does not include:

* AI-generated explanations.
* Full-page translation.
* Built-in cloud account system.
* Full TOEIC mock exams.
* Heavy spaced repetition engine.
* Social features.
* Gamification.
* Ranking, streaks, or daily pressure.
* Notion sync.
* Anki export, unless trivial CSV compatibility is enough.

---

## 4.2 Phase 2: Intelligence Layer Discussion

Phase 2 is reserved for deciding how to add smarter explanations and quiz generation.

Possible Phase 2 directions:

1. User-provided API key.
2. Hosted cloud service.
3. Browser local AI model.
4. Hybrid mode.

Phase 2 should not be implemented in Phase 1.

Phase 1 architecture should leave a clean interface for adding an explanation provider later.

---

## 5. Key Product Experience

The core product loop:

1. User reads an English page.
2. User selects an unfamiliar word or phrase.
3. Extension shows a small contextual lookup popup.
4. User saves the word if useful.
5. The word is highlighted on the page.
6. When the word appears again, the extension prompts recall before revealing the meaning.
7. If the user remembers it, highlights become weaker over time.
8. If the user forgets it, the word receives stronger priority for future review.
9. Occasionally, the extension offers a one-question review prompt in a quiet way.

Core learning behavior:

> The extension should not simply answer every lookup. It should remember what the user has looked up and help the user recall it later.

---

## 6. UX Tone and Visual Style

## 6.1 UI Style

The UI should feel:

* Modern.
* Professional.
* Minimal.
* Calm.
* Engineering-friendly.
* Text-focused.
* Low-noise.

The UI should not feel:

* Cute.
* Childish.
* Game-like.
* Overly motivational.
* AI-generated.
* Like a cram school app.
* Like a chatbot.

## 6.2 Emoji Policy

No emoji should be used in the product UI.

Do not use emoji in:

* Buttons.
* Toast messages.
* Empty states.
* Popup titles.
* Review prompts.
* Status badges.

Use plain text labels instead.

Preferred examples:

* Speak
* Save
* Recall
* Later
* Show hint
* Mark as known

Avoid examples:

* Any emoji-based iconography.

Icons are allowed if they are professional SVG icons, but text labels should remain clear.

---

## 7. Phase 1 Lookup Strategy Without AI

Phase 1 should not depend on AI.

## 7.1 Lookup Sources

Possible free lookup sources:

1. Built-in local dictionary package.
2. Open dictionary API.
3. Browser extension bundled dictionary data.
4. User-configurable dictionary endpoint.
5. Simple fallback to external dictionary link.

The implementation should not depend only on a hand-written local dictionary. Phase 1 should prefer free and open resources first:

1. ECDICT through jsDelivr CDN for English-to-Chinese meanings, converted to Taiwan Traditional Chinese with OpenCC.
2. Free Dictionary API for English definitions, parts of speech, and pronunciation.
3. Wiktapi / Wiktionary for structured English definitions, parts of speech, pronunciations, and available Chinese translations.
4. Datamuse API for additional English definitions, parts of speech, related words, and semantic fallback.
5. MyMemory Translation API as a free non-Google English-to-Traditional-Chinese fallback when dictionary Chinese meanings are still missing.
6. Small local fallback dictionary for resilience.
7. External dictionary link if all providers fail.

Lookup should call network providers in parallel where practical and should use a bounded timeout per provider. A slow provider must not block the popup indefinitely.

English words should be lemmatized before lookup so common inflections can fall back to their base form, for example plural nouns, past tense verbs, and progressive forms.

Phase 1 should not enable unofficial Google Translate endpoints by default and must not scrape browser built-in translation UI. For self-use builds, an explicit opt-in setting may allow the user to prioritize the unofficial `translate.googleapis.com` endpoint. The UI must label this as experimental and unstable.

## 7.2 Required Lookup Output in Phase 1

Because AI is not available in Phase 1, the lookup result may be less contextual. The popup should still be useful and concise.

Required fields:

* selected text
* part of speech, if available
* short Chinese meaning
* short English definition, if available
* source sentence captured from page
* Save action
* Mark as understood action

Optional fields:

* pronunciation text
* audio pronunciation if available
* common definitions
* external dictionary link
* manual edit meaning

## 7.3 Manual Correction

Because Phase 1 does not use AI, meanings may be imperfect.

Users should be able to manually edit the saved meaning.

Manual edit fields:

* Chinese meaning
* English hint
* note
* context type
* TOEIC usefulness

This is important because the user may know the correct meaning from context and wants to store it accurately.

---

## 8. Main UI Components

Phase 1 requires four UI components:

1. Selection Lookup Popup.
2. Recall Popup.
3. Page Vocabulary Bubble.
4. Lightweight Review Prompt.

---

# 9. Selection Lookup Popup

## 9.1 Trigger

The popup appears when the user selects a reasonable English word or phrase on a webpage.

Do not trigger automatically when:

* Selection is too long.
* Selection is not English.
* Selection is inside input, textarea, code editor, or contenteditable area.
* Selection contains excessive line breaks.
* Selection is mostly symbols or numbers.
* Selection exceeds the configured word limit.

Default selection limit:

* 1 to 8 English words.

## 9.2 Position

The popup should appear near the selected text.

Requirements:

* Do not cover too much page content.
* Reposition if close to viewport edge.
* Close when clicking outside.
* Close when pressing Escape.
* Do not persist after text selection disappears unless pinned or saved.

## 9.3 Default Popup Layout

Example layout:

```text
mitigate
verb

Meaning
減輕；緩和；降低嚴重程度

English hint
make something less severe or harmful

Source sentence
This cache helps mitigate latency.

TOEIC: High    Context: Technical

[Understood]    [Save]
```

## 9.4 Required Fields

| Field           | Description                              |
| --------------- | ---------------------------------------- |
| Selected text   | The word or phrase selected by the user. |
| Part of speech  | Show if dictionary source provides it.   |
| Meaning         | Short Chinese meaning.                   |
| English hint    | Short English definition if available.   |
| Source sentence | The sentence where the word appears.     |
| TOEIC badge     | Optional small badge.                    |
| Context badge   | Optional small badge.                    |
| Understood      | Save light record only.                  |
| Save            | Save as active vocabulary item.          |

## 9.5 Button Behavior

### Understood

Meaning:

> The user understands the word now and does not want active review.

System behavior:

* Save a lightweight lookup record.
* Do not add the word to active review queue.
* Do not show strong future prompts.
* Optionally keep very subtle page-only highlight.

### Save

Meaning:

> The user wants this word remembered and tracked.

System behavior:

* Save full vocabulary record.
* Add to active review candidate list.
* Highlight current page occurrences.
* Match this word on future pages.
* Enable recall-first behavior.

## 9.6 Advanced Section

The popup may have a compact advanced section, hidden by default.

Label:

```text
More
```

Advanced section may include:

* More definitions.
* Common collocations.
* External dictionary link.
* Edit meaning.
* Mark as known.
* Ignore this word.
* Add note.

Keep the default view minimal.

---

# 10. Recall Popup

## 10.1 Purpose

The recall popup appears when the user interacts with a previously saved highlighted word.

Its purpose is not to answer immediately. Its purpose is to help the user recall.

## 10.2 Trigger

Triggered when:

* User clicks a highlighted saved word.
* User hovers over a highlighted saved word, if hover mode is enabled.

Default recommendation:

* Click opens popup.
* Hover may show only a small preview or underline state.

## 10.3 Recall Mode Layout

Example:

```text
mitigate

Looked up 3 times
Last seen 2 days ago

Try to recall the meaning before revealing it.

[Show hint]
[Remembered]    [Still unsure]
```

## 10.4 Recall Mode Rules

Do not show Chinese meaning immediately.

Show only:

* Word or phrase.
* Lookup count.
* Last seen time.
* A short recall instruction.
* Show hint button.
* Remembered button.
* Still unsure button.

## 10.5 Button Behavior

### Show hint

Show a weak hint, not the full answer.

Possible hints:

* English hint.
* First Chinese character.
* Part of speech.
* Previous source domain.
* A short cloze sentence.

Example:

```text
Hint
make something less severe
```

### Remembered

System behavior:

* Increment remember_count.
* Reduce review priority.
* Move status toward familiar or mastered.
* Reduce highlight intensity.
* Close popup.

### Still unsure

System behavior:

* Increment forget_count.
* Increase review priority.
* Move status toward weak.
* Increase highlight intensity slightly.
* Open reveal mode.
* Add to near-future review candidates.

---

# 11. Reveal Mode

## 11.1 Purpose

Reveal mode appears only after the user chooses to reveal or indicates they are still unsure.

## 11.2 Layout

Example:

```text
mitigate

Meaning
減輕；緩和；降低嚴重程度

English hint
make something less severe or harmful

Previous sentence
This cache helps mitigate latency.

Current sentence
The company introduced measures to mitigate financial risk.

[Add to review]    [Understood]
```

## 11.3 Fields

Required:

* Word or phrase.
* Meaning.
* English hint, if available.
* Previous source sentence, if available.
* Current sentence.
* Add to review.
* Understood.

Optional:

* Edit meaning.
* Mark as known.
* Ignore.

---

# 12. Highlight System

## 12.1 Purpose

Highlights show that the user has previously looked up or saved a word.

The highlight is a memory cue, not decoration.

## 12.2 Highlight States

| Status   | Visual Style                                                     | Meaning                         |
| -------- | ---------------------------------------------------------------- | ------------------------------- |
| new      | subtle yellow background                                         | Recently saved.                 |
| learning | subtle underline                                                 | In active learning.             |
| weak     | slightly stronger underline or background                        | Often forgotten.                |
| familiar | very subtle underline                                            | Mostly known.                   |
| mastered | no automatic highlight; available on manual search or hover only | Known enough.                   |
| ignored  | no highlight                                                     | User does not want to track it. |

## 12.3 Highlight Intensity Logic

* More forgetting means stronger highlight.
* More successful recall means weaker highlight.
* Mastered words should not clutter the page.
* Users must be able to hide all highlights on the current page.

## 12.4 Matching Scope

Phase 1 should support:

* Same page after saving.
* Same URL when reopened.
* Other pages when exact saved text appears.

Phase 1 exact matching:

* Case-insensitive exact match.
* Phrase exact match.
* Prefer longest phrase match before word match.

Phase 2 or later:

* Lemmatization.
* Word family.
* Inflection matching.
* Similar phrase matching.

## 12.5 DOM Safety

Do not highlight inside:

* script
* style
* input
* textarea
* select
* option
* pre
* code
* contenteditable
* embedded editors

The extension must not break page layout or page functionality.

---

# 13. Page Vocabulary Bubble

## 13.1 Purpose

The page vocabulary bubble quietly reminds the user that this page contains looked-up words.

It should not feel like a notification.

## 13.2 Position

Default position:

* Bottom-right corner.

Visual style:

* Small.
* Neutral.
* Low contrast but readable.
* No animation by default.
* No emoji.

## 13.3 Display Conditions

Show when:

* Current page has at least one looked-up or saved word.

Text examples:

```text
3 words saved on this page
```

```text
1 word to recall
```

```text
Page vocabulary
```

## 13.4 Expanded View

Example:

```text
Page vocabulary

mitigate       learning
fallback       weak
sufficient     new

[Recall 1 word]
[Review this page]
[Hide highlights]
```

## 13.5 Actions

### Recall 1 word

Starts one lightweight recall question.

### Review this page

Starts up to three questions based on this page.

### Hide highlights

Temporarily hides highlights on current page.

---

# 14. Lightweight Review Prompt

The user specifically wants the review prompt to be light.

## 14.1 Principle

The review prompt should be an invitation, not an interruption.

It should not look like a test starting screen.

## 14.2 UI Type

Use a small toast or compact bubble near the page vocabulary bubble.

Do not use a large modal for the initial prompt.

## 14.3 Recommended Prompt Text

Use quiet text such as:

```text
Want to recall 1 word?
```

```text
1 saved word is ready for recall.
```

```text
You looked up 3 words on this page.
```

```text
Review 1 word from this page?
```

## 14.4 Prompt Buttons

Recommended buttons:

```text
Recall
Later
```

or

```text
Review 1
Dismiss
```

## 14.5 Avoided Text

Do not use pressure-based copy such as:

```text
Start test now
You must review
Daily goal incomplete
You are behind
Complete your training
```

## 14.6 Trigger Conditions

Phase 1 may trigger a prompt when:

* User saves the third word on a page.
* User clicks Still unsure in recall popup.
* User opens the page vocabulary bubble.
* User scrolls near the end of the article and has saved words on this page.

## 14.7 Suppression Rules

Do not show a review prompt when:

* User is selecting text.
* Lookup popup is open.
* Recall popup is open.
* User is typing.
* User is scrolling quickly.
* User dismissed the prompt on this page.

Limits:

* At most one automatic review prompt per page view.
* At most one to two automatic prompts per 30 minutes.
* If the user repeatedly dismisses prompts, reduce future prompt frequency.

---

# 15. Micro Review Question

## 15.1 Purpose

A micro review question helps the user recall saved words without entering a heavy study mode.

## 15.2 Question Count

Defaults:

* Quick recall: 1 question.
* Page review: up to 3 questions.

Never start a long quiz automatically.

## 15.3 Question Types in Phase 1

Because Phase 1 has no AI, question generation should be simple.

Supported question types:

1. Meaning multiple choice.
2. Source sentence cloze.

## 15.4 Meaning Multiple Choice

Example:

```text
mitigate means:

A. reduce or make less severe
B. assign to someone
C. delay until later
D. notify officially

[Skip]
```

Distractors may come from other saved words or a static distractor pool.

## 15.5 Source Sentence Cloze

Example:

```text
This cache helps ______ latency.

A. mitigate
B. assign
C. notify
D. postpone

[Skip]
```

Cloze should be generated only when a source sentence is available and not too long.

## 15.6 Feedback

Correct answer:

```text
Correct. This word will appear less often.
```

Wrong answer:

```text
Not quite. mitigate means reduce or make less severe.
```

Feedback should be short.

---

# 16. Learning State Logic

Each saved vocabulary item has a learning status.

## 16.1 Status Values

* new
* learning
* weak
* familiar
* mastered
* ignored

## 16.2 Status Transitions

When user saves a word:

```text
status = new
```

When user clicks Still unsure:

```text
new or learning -> weak
```

When user clicks Remembered:

```text
weak -> learning
learning -> familiar
familiar -> mastered
```

When user answers correctly:

```text
increase remember_count
move toward familiar or mastered
reduce review_priority
```

When user answers incorrectly:

```text
increase forget_count
move toward weak
increase review_priority
```

When user ignores a word:

```text
status = ignored
```

## 16.3 Review Priority

Each word should have review_priority.

Factors that increase priority:

* User clicked Still unsure.
* User answered incorrectly.
* User repeatedly looks up the same word.
* Word appears again recently.
* TOEIC usefulness is high.
* Word is saved on the current page.

Factors that decrease priority:

* User clicked Remembered.
* User answered correctly.
* User marked as known.
* Word is familiar or mastered.

---

# 17. TOEIC and Workplace English Support

## 17.1 Purpose

The extension should support TOEIC and workplace English improvement without becoming a TOEIC course.

## 17.2 TOEIC Usefulness

Each vocabulary item may have one of these values:

* High
* Medium
* Low
* Unknown

## 17.3 Phase 1 Detection Without AI

Because Phase 1 does not use AI, TOEIC usefulness should be rule-based.

Possible sources:

* Built-in TOEIC high-frequency word list.
* Built-in workplace vocabulary list.
* User editable value.
* Dictionary metadata if available.

Default behavior:

* If the word appears in the built-in TOEIC/workplace list, mark High or Medium.
* If the word appears in a technical-only list, mark Low or Unknown.
* Allow user to manually change it.

## 17.4 Display

Display as a small badge only.

Examples:

```text
TOEIC: High
```

```text
Workplace
```

Do not make this visually dominant.

---

# 18. Context Classification

## 18.1 Values

* Technical
* Business
* General
* TOEIC-like
* Unknown

## 18.2 Phase 1 Detection Without AI

Use simple rules:

* Domain-based classification.
* URL keywords.
* Page title keywords.
* Built-in technical vocabulary list.
* Built-in business vocabulary list.
* User manual override.

Examples:

Technical domains or patterns:

* developer.mozilla.org
* docs.*
* github.com
* stackoverflow.com
* npmjs.com
* cloud provider docs

Business-like patterns:

* invoice
* schedule
* meeting
* policy
* announcement
* customer
* shipping
* refund

## 18.3 Display

Use small badge text:

```text
Context: Technical
```

```text
Context: Business
```

---

# 19. Data Storage

## 19.1 Storage Principle

The product is local-first.

Default:

* All data is stored locally.
* No account is required.
* No cloud service is required.

Optional:

* If the user configures Google Sheet sync, vocabulary records can be written to a Google Sheet for cross-device access.

## 19.2 Local Storage Recommendation

Use:

* IndexedDB for vocabulary records, page records, quiz records, and sync queue.
* chrome.storage.local for settings and small metadata.

## 19.3 Vocabulary Record

Fields:

```text
id
text
normalized_text
type
part_of_speech
meaning_zh
meaning_en
user_note
pronunciation
source_sentence
source_context_before
source_context_after
page_url
page_title
domain
created_at
updated_at
last_seen_at
lookup_count
seen_count
remember_count
forget_count
quiz_correct_count
quiz_wrong_count
status
review_priority
toeic_usefulness
context_type
is_phrase
is_ignored
sync_status
external_sheet_row_id
```

## 19.4 Page Record

Fields:

```text
id
url
normalized_url
title
domain
first_seen_at
last_seen_at
vocabulary_ids
lookup_count_on_page
```

## 19.5 Review Record

Fields:

```text
id
vocabulary_id
review_type
question
options
correct_answer
user_answer
is_correct
created_at
answered_at
source
```

Review source values:

* page_bubble
* lightweight_prompt
* recall_popup
* manual_review

---

# 20. Optional Google Sheet Sync

## 20.1 Purpose

Google Sheet sync provides a lightweight cross-device option without requiring the product to run its own backend.

The product should remain fully usable without Google Sheet sync.

## 20.2 Setup Options

The user should be able to configure Google Sheet sync in settings.

Possible implementation approaches:

### Option A: Google OAuth

Pros:

* Better user experience.
* Can write directly to selected spreadsheet.
* More standard long-term approach.
* Can automatically create a dedicated spreadsheet for the user.

Cons:

* Requires Google Cloud project setup.
* OAuth consent and permission handling.
* More implementation complexity.

### Option B: Google Apps Script Web App URL

Pros:

* Lightweight.
* User can paste an endpoint URL.
* No full backend needed.
* Easier for early MVP or personal tool.

Cons:

* Setup is more technical.
* Security depends on the Apps Script deployment.
* Error handling may be rougher.

Recommended Phase 1 approach:

> Use Google OAuth as the primary user flow. Keep Google Apps Script Web App URL as an advanced fallback for early testing or self-hosted workflows.

Recommended user flow:

```text
Data sync

Your data is currently stored in this browser.

After enabling Google Sheet sync, lookup history, familiarity, and quiz progress will sync to your Google Drive.
LexiTrace will automatically create a dedicated spreadsheet. You can open it anytime for review or backup.

[Enable Google Sheet sync]
```

After the user clicks Enable Google Sheet sync:

1. Open Google authorization flow.
2. User selects an account and grants permission.
3. Extension creates a dedicated Google Sheet.
4. Extension stores the Sheet ID locally.
5. Extension initializes sheet columns.
6. Settings page shows sync success.

Successful state:

```text
Google Sheet sync enabled

Sync file: LexiTrace Sync Data
Last sync: 2026/05/01 23:42

[Sync now]
[Open Google Sheet]
[Change sync spreadsheet]
[Disable sync]
```

## 20.3 Settings Fields

Google Sheet settings:

```text
sync_enabled
sync_provider = google_sheet
sync_mode = off | manual | auto
google_sheet_endpoint_url
google_sheet_id
google_sheet_name
google_sheet_url
google_sheet_tab_name
last_sync_at
```

For OAuth mode, the minimum required local settings after setup are:

```text
google_sheet_id
google_sheet_url
```

For Apps Script URL fallback mode, the minimum required setting is:

```text
google_sheet_endpoint_url
```

## 20.4 Sync Modes

### Off

Default mode.

Behavior:

* No cloud sync.
* Data remains local only.

### Manual

Behavior:

* User clicks Sync now.
* Extension sends unsynced vocabulary records to Google Sheet.

### Auto

Behavior:

* Extension syncs new or updated vocabulary records periodically.
* Sync should be debounced.
* Sync should not run too frequently.

Recommended default after setup:

```text
Manual
```

## 20.5 Google Sheet Columns

Recommended columns:

```text
id
text
normalized_text
meaning_zh
meaning_en
source_sentence
page_title
page_url
domain
status
review_priority
toeic_usefulness
context_type
lookup_count
remember_count
forget_count
quiz_correct_count
quiz_wrong_count
created_at
updated_at
last_seen_at
note
```

## 20.6 Sync Behavior

When a vocabulary record is created or updated:

* Mark sync_status as pending.
* Add to local sync queue.
* If sync mode is auto, schedule a debounced sync.
* If sync mode is manual, wait until user clicks Sync now.

Sync status values:

* local_only
* pending
* synced
* failed
* conflict

## 20.7 Conflict Handling

Phase 1 can use simple last-write-wins.

Recommended conflict rule:

* If local updated_at is newer than sheet updated_at, push local record.
* If sheet updated_at is newer, pull sheet record only if pull sync is supported.

MVP may be push-only.

Recommended Phase 1 minimum:

> Push local vocabulary records to Google Sheet. Do not require full bidirectional sync in the first version.

## 20.8 Cross-Device Behavior

There are two levels:

### Phase 1A: Export-style sync

* Device A pushes vocabulary records to Google Sheet.
* Google Sheet acts as readable backup.
* Device B does not automatically import.

### Phase 1B: Simple pull sync

* Device B can connect to the same Google Sheet.
* Device B can import existing vocabulary records.
* Conflict rules remain simple.

Recommended:

* Implement Phase 1A first.
* Add Phase 1B after local MVP is stable.

## 20.9 Error Handling

If sync fails:

Show a quiet settings-level error, not an intrusive page notification.

Example:

```text
Google Sheet sync failed. Data is still saved locally.
```

Do not block lookup, highlighting, or review features.

---

# 21. Dictionary and Explanation Provider Interface

Even though Phase 1 does not use AI, the architecture should support future providers.

Create a conceptual provider interface with these provider types:

* local_dictionary
* open_dictionary_api
* external_dictionary_link
* ai_api_key
* cloud_ai_service
* browser_local_ai

Phase 1 enabled providers:

* local_dictionary
* open_dictionary_api
* external_dictionary_link

Phase 2 possible providers:

* ai_api_key
* cloud_ai_service
* browser_local_ai

The UI should not expose AI controls in Phase 1 unless disabled as future placeholders.

---

# 22. Settings Page

## 22.1 Required Settings

General:

```text
Enable extension
Enable highlights
Enable page vocabulary bubble
Enable lightweight review prompts
Review prompt frequency: Low / Medium / High
Default action after lookup: Ask / Save automatically / Understood automatically
Show TOEIC badge
Show context badge
Disable in code blocks
```

Storage and sync:

```text
Storage mode: Local only / Google Sheet optional sync
Google Sheet sync enabled
Google Sheet endpoint URL
Sync mode: Off / Manual / Auto
Sync now
Last sync time
Export CSV
Export JSON
Clear local data
```

Review:

```text
Enable recall-first popup
Quick review question count: 1
Page review question count: 1 to 3
Hide mastered words
```

## 22.2 Default Settings

```text
Extension: enabled
Highlights: enabled
Page vocabulary bubble: enabled
Lightweight review prompts: enabled
Review prompt frequency: Low
Default action after lookup: Ask
TOEIC badge: enabled
Context badge: enabled
Disable in code blocks: enabled
Storage mode: Local only
Google Sheet sync: disabled
Sync mode: Off
Recall-first popup: enabled
Hide mastered words: enabled
```

---

# 23. Privacy and Data Policy

## 23.1 Local-First Privacy

By default:

* No account.
* No backend.
* No upload.
* No full-page capture.
* No browsing history upload.
* Only user-selected vocabulary and related source sentences are stored.

## 23.2 Google Sheet Sync Privacy

If enabled:

* Only saved vocabulary records are sent to the configured Google Sheet endpoint.
* Full page content should not be sent.
* Browsing history should not be sent.
* User should clearly understand that data is being written to their configured Google Sheet.

## 23.3 Future AI Privacy

When Phase 2 AI is discussed, the design must clearly define:

* What text is sent.
* Whether source sentence or surrounding context is sent.
* Whether data is logged.
* Whether user API key is stored locally.
* Whether browser local AI can avoid sending text externally.

Phase 1 should not send text to AI services.

---

# 24. Permissions

Use the minimum permissions required.

Possible permissions:

```text
storage
activeTab
scripting
contextMenus
host permissions depending on implementation
```

Principles:

* Request only necessary permissions.
* Avoid broad host permissions if activeTab or user-granted site access is enough.
* Clearly explain why page access is needed: to detect selected text and highlight saved words.

---

# 25. Export

Phase 1 should support local export.

Formats:

* CSV
* JSON

CSV columns:

```text
text
meaning_zh
meaning_en
source_sentence
page_title
page_url
domain
status
toeic_usefulness
context_type
lookup_count
remember_count
forget_count
created_at
updated_at
```

Export should work even if Google Sheet sync is disabled.

---

# 26. Error Handling

## 26.1 Lookup Failure

Show:

```text
No clear definition found.
```

Actions:

```text
[Edit manually]
[Open dictionary]
```

## 26.2 Sync Failure

Show in settings or small non-intrusive message:

```text
Sync failed. Your data is still saved locally.
```

## 26.3 Highlight Failure

Fail silently.

The extension must never break the page.

## 26.4 Dictionary Provider Failure

Fallback order:

1. Local cached result.
2. Other configured free dictionary source.
3. External dictionary link.
4. Manual edit.

---

# 27. Success Metrics

## 27.1 Product Usage Metrics

If analytics are added later, they must be privacy-aware and optional.

Useful local metrics:

* Number of words looked up per week.
* Number of saved words.
* Number of recall interactions.
* Number of Remembered clicks.
* Number of Still unsure clicks.
* Review prompt dismissal rate.
* Page vocabulary bubble usage.

## 27.2 Learning Metrics

* Same word repeated lookup count decreases.
* weak words move to learning or familiar.
* familiar words move to mastered.
* TOEIC High words get better recall rates.
* User uses full-page translation less often.

---

# 28. Development Priority

## P0: Required for MVP

* Selection detection.
* Selection lookup popup.
* Free dictionary lookup or local dictionary lookup.
* Manual edit meaning.
* Save vocabulary locally.
* Highlight saved words on current page.
* Recall popup for saved words.
* Local IndexedDB storage.
* Basic settings page.
* No emoji UI.

## P1: Strongly Recommended

* Page vocabulary bubble.
* Lightweight review prompt.
* One-question review.
* TOEIC usefulness rule-based badge.
* Context rule-based badge.
* Highlight intensity by learning status.
* CSV and JSON export.
* Google Sheet OAuth sync, dedicated Sheet creation, push-only.

## P2: Later

* Google Sheet pull sync.
* Google Sheet pull sync.
* Advanced spaced repetition.
* Lemmatization and word family matching.
* Anki export.
* Notion sync.
* Better statistics page.
* AI provider integration.
* Browser local AI integration.

---

# 29. Example End-to-End Experience

## 29.1 First Lookup

User reads:

```text
This cache helps mitigate latency when the service receives repeated requests.
```

User selects:

```text
mitigate
```

Popup shows:

```text
mitigate
verb

Meaning
減輕；緩和；降低嚴重程度

English hint
make something less severe or harmful

Source sentence
This cache helps mitigate latency.

TOEIC: High    Context: Technical

[Understood]    [Save]
```

User clicks Save.

System behavior:

* Saves vocabulary locally.
* Adds highlight to mitigate on the page.
* Marks status as new.
* Adds to review candidates.
* If Google Sheet sync is configured, marks record as pending sync.

## 29.2 Later Encounter

Two days later, user reads:

```text
The company introduced measures to mitigate financial risk.
```

The word mitigate is subtly highlighted.

User clicks the highlight.

Recall popup shows:

```text
mitigate

Looked up 1 time
Last seen 2 days ago

Try to recall the meaning before revealing it.

[Show hint]
[Remembered]    [Still unsure]
```

User clicks Still unsure.

Reveal mode shows:

```text
mitigate

Meaning
減輕；緩和；降低嚴重程度

English hint
make something less severe or harmful

Previous sentence
This cache helps mitigate latency.

Current sentence
The company introduced measures to mitigate financial risk.

[Add to review]    [Understood]
```

System behavior:

* Increases forget_count.
* Increases review_priority.
* Keeps or strengthens highlight.
* May later show a quiet prompt:

```text
Want to recall 1 word?

[Recall]    [Later]
```

---

# 30. One-Paragraph Implementation Brief for Coding AI

Build a modern, professional, local-first browser extension for invisible English learning during real web reading. Users can select unfamiliar English words or phrases on a web page, receive a compact non-AI dictionary-based explanation popup, and save useful terms. Saved terms are stored locally, highlighted on the original page, and shown again on future pages using subtle highlight states. When users interact with a saved word, the extension should first ask them to recall the meaning before revealing it. The system tracks familiarity through remembered, unsure, and review results, adjusting highlight intensity and review priority over time. Add a small page vocabulary bubble and very lightweight optional one-question review prompts. Phase 1 must be free, must not depend on AI, must avoid emoji, and should optionally support Google Sheet sync through user configuration while remaining fully usable local-only.

---

# 31. Phase 2 Discussion Placeholder

Phase 2 should be discussed after Phase 1 MVP is validated.

Open decisions:

1. Should intelligence be powered by user-provided API key, hosted cloud service, browser local AI, or hybrid mode?
2. Should AI generate contextual meanings, TOEIC-style examples, and cloze questions?
3. How much source context can be sent while preserving privacy?
4. Should cloud sync become a product feature or remain user-configured Google Sheet sync?
5. Should local AI be used for privacy-preserving explanations when browser support becomes reliable?

Phase 2 should not change the core principle:

> Reading first. Learning silently. Minimal interruption.
