import { describe, expect, it } from "vitest";
import type { VocabularyRecord } from "../core/types";
import {
  createClozeSentence,
  createVocabularyMatcher,
  findNextVocabularyMatch,
  findVocabularyMatches
} from "./matching";

describe("findNextVocabularyMatch", () => {
  it("matches a standalone word without matching inside a larger word", () => {
    const match = findNextVocabularyMatch(
      "A concatenate function is not a cat.",
      [createRecord("cat")]
    );

    expect(match?.text).toBe("cat");
    expect(match?.index).toBe(32);
  });

  it("matches a saved base form when an inflection appears on the page", () => {
    const match = findNextVocabularyMatch(
      "The patch mitigated the risk.",
      [createRecord("mitigate")]
    );

    expect(match?.text).toBe("mitigated");
  });

  it("matches a saved inflection when the base form appears later", () => {
    const match = findNextVocabularyMatch(
      "We can mitigate the risk.",
      [createRecord("mitigated")]
    );

    expect(match?.text).toBe("mitigate");
  });

  it("does not reduce unrelated words with a trailing s", () => {
    expect(
      findNextVocabularyMatch("The news arrived.", [createRecord("new")])
    ).toBeUndefined();
  });

  it("prefers the longest phrase when matches start together", () => {
    const match = findNextVocabularyMatch("Use the fallback plan today.", [
      createRecord("fallback"),
      createRecord("fallback plan", true)
    ]);

    expect(match?.text).toBe("fallback plan");
  });

  it("supports flexible whitespace while preserving phrase boundaries", () => {
    const match = findNextVocabularyMatch("Keep it in   order now.", [
      createRecord("in order", true)
    ]);
    const falseMatch = findNextVocabularyMatch("begin order now", [
      createRecord("in order", true)
    ]);

    expect(match?.text).toBe("in   order");
    expect(falseMatch).toBeUndefined();
  });

  it("finds every match in one pass and skips overlaps after the longest match", () => {
    const matcher = createVocabularyMatcher([
      createRecord("fallback"),
      createRecord("fallback plan", true),
      createRecord("mitigate")
    ]);

    expect(
      findVocabularyMatches(
        "Use the fallback plan; it mitigated risk.",
        matcher
      ).map((match) => [match.text, match.record.normalized_text])
    ).toEqual([
      ["fallback plan", "fallback plan"],
      ["mitigated", "mitigate"]
    ]);
  });

  it("reuses a compiled phrase matcher across text nodes", () => {
    const matcher = createVocabularyMatcher([createRecord("in order", true)]);

    expect(findVocabularyMatches("Keep it in order.", matcher)).toHaveLength(1);
    expect(findVocabularyMatches("Everything is in order.", matcher)).toHaveLength(1);
  });
});

describe("createClozeSentence", () => {
  it("hides an inflected occurrence of the saved word", () => {
    expect(
      createClozeSentence("The patch mitigated the risk.", "mitigate")
    ).toBe("The patch ______ the risk.");
  });

  it("leaves a sentence unchanged when the answer is absent", () => {
    expect(createClozeSentence("A different sentence.", "mitigate")).toBe(
      "A different sentence."
    );
  });
});

function createRecord(text: string, phrase = false): VocabularyRecord {
  const now = "2026-08-12T00:00:00.000Z";
  return {
    id: text,
    text,
    normalized_text: text.toLowerCase(),
    type: "saved",
    meaning_zh: "測試",
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
    is_phrase: phrase,
    is_ignored: false,
    sync_status: "local_only"
  };
}
