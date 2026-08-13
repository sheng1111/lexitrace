import { bench, describe } from "vitest";
import type { VocabularyRecord } from "../core/types";
import {
  createVocabularyMatcher,
  findVocabularyMatches
} from "./matching";

const VOCABULARY_SIZE = 750;
const PAGE_TOKEN_COUNT = 4_000;
const vocabulary = Array.from({ length: VOCABULARY_SIZE }, (_, index) =>
  createRecord(`term${toLetters(index)}`)
);
const pageText = Array.from({ length: PAGE_TOKEN_COUNT }, (_, index) =>
  index % 50 === 0
    ? vocabulary[index % vocabulary.length].normalized_text
    : `filler${toLetters(index)}`
).join(" ");
const matcher = createVocabularyMatcher(vocabulary);

describe("page vocabulary matching", () => {
  bench("scan a 4,000-token page against 750 saved words", () => {
    const matches = findVocabularyMatches(pageText, matcher);

    if (matches.length !== 80) {
      throw new Error(`Expected 80 matches, received ${matches.length}`);
    }
  });
});

function toLetters(value: number): string {
  let result = "";
  let remaining = value;
  do {
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  } while (remaining > 0);
  return result.padStart(3, "a");
}

function createRecord(text: string): VocabularyRecord {
  const now = "2026-08-12T00:00:00.000Z";
  return {
    id: text,
    text,
    normalized_text: text,
    type: "saved",
    meaning_zh: "test",
    source_sentence: "",
    page_url: "https://example.com",
    page_title: "Example",
    domain: "example.com",
    created_at: now,
    updated_at: now,
    last_seen_at: now,
    lookup_count: 1,
    seen_count: 1,
    remember_count: 0,
    forget_count: 0,
    quiz_correct_count: 0,
    quiz_wrong_count: 0,
    status: "new",
    review_priority: 50,
    toeic_usefulness: "Unknown",
    context_type: "Unknown",
    is_phrase: false,
    is_ignored: false,
    sync_status: "local_only"
  };
}
