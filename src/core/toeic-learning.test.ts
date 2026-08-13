import { describe, expect, it } from "vitest";
import type { VocabularyRecord } from "./types";
import { buildToeicFoundationPlan } from "./toeic-learning";

const NOW = Date.parse("2026-08-12T12:00:00.000Z");

describe("buildToeicFoundationPlan", () => {
  it("keeps the session focused on active TOEIC and workplace vocabulary", () => {
    const plan = buildToeicFoundationPlan([
      createRecord("invoice", { context_type: "Business" }),
      createRecord("allocate", { toeic_usefulness: "High" }),
      createRecord("kernel", { toeic_usefulness: "Low", context_type: "Technical" }),
      createRecord("agenda", { toeic_usefulness: "High", status: "mastered" })
    ], NOW);

    expect(plan.queue.map((record) => record.text)).toEqual(["allocate", "invoice"]);
    expect(plan.eligibleCount).toBe(2);
  });

  it("prioritizes due and weak words before newer high-value words", () => {
    const plan = buildToeicFoundationPlan([
      createRecord("confirm", {
        toeic_usefulness: "High",
        status: "learning",
        next_review_at: "2026-08-13T00:00:00.000Z"
      }),
      createRecord("shipment", {
        toeic_usefulness: "Medium",
        status: "weak",
        next_review_at: "2026-08-11T00:00:00.000Z"
      })
    ], NOW);

    expect(plan.queue[0].text).toBe("shipment");
    expect(plan.needsAttentionCount).toBe(1);
  });

  it("reports quiz accuracy across the relevant learning pool", () => {
    const plan = buildToeicFoundationPlan([
      createRecord("deadline", {
        toeic_usefulness: "High",
        quiz_correct_count: 3,
        quiz_wrong_count: 1
      }),
      createRecord("budget", {
        context_type: "TOEIC-like",
        quiz_correct_count: 1,
        quiz_wrong_count: 1
      })
    ], NOW);

    expect(plan.quizAccuracy).toBe(67);
  });
});

function createRecord(
  text: string,
  patch: Partial<VocabularyRecord> = {}
): VocabularyRecord {
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
    context_type: "General",
    is_phrase: false,
    is_ignored: false,
    sync_status: "local_only",
    ...patch
  };
}
