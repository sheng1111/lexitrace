import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { LookupResult } from "../core/types";
import {
  createOrUpdateVocabulary,
  getVocabularyById,
  listVocabulary,
  putVocabulary,
  reconcileSavedVocabularySnapshot,
  recordRecallOutcome,
  updateVocabularyDetails
} from "./db";

describe("vocabulary learning state", () => {
  it("creates an active review record when a lookup is saved", async () => {
    const record = await createOrUpdateVocabulary({
      lookup: createLookup("mitigate-save"),
      intent: "save",
      manualMeaningZh: "降低風險",
      userNote: "常與 risk 搭配",
      manualToeicUsefulness: "High",
      manualContextType: "Business"
    });

    expect(record.type).toBe("saved");
    expect(record.status).toBe("new");
    expect(record.next_review_at).toBeTruthy();
    expect(record.user_note).toBe("常與 risk 搭配");
    expect(record.toeic_usefulness).toBe("High");
    expect(record.context_type).toBe("Business");
  });

  it("records quiz accuracy separately from recall outcomes", async () => {
    const saved = await createOrUpdateVocabulary({
      lookup: createLookup("allocate-quiz"),
      intent: "save"
    });

    const correct = await recordRecallOutcome(saved.id, "remembered", "quiz");
    expect(correct.remember_count).toBe(1);
    expect(correct.quiz_correct_count).toBe(1);
    expect(correct.quiz_wrong_count).toBe(0);
    expect(correct.status).toBe("learning");

    const incorrect = await recordRecallOutcome(saved.id, "unsure", "quiz");
    expect(incorrect.forget_count).toBe(1);
    expect(incorrect.quiz_correct_count).toBe(1);
    expect(incorrect.quiz_wrong_count).toBe(1);
    expect(incorrect.status).toBe("weak");
    expect(new Date(incorrect.next_review_at ?? 0).getTime()).toBeGreaterThan(Date.now());
  });

  it("updates saved details and marks synced data for another push", async () => {
    const saved = await createOrUpdateVocabulary({
      lookup: createLookup("sufficient-edit"),
      intent: "save"
    });
    await putVocabulary({ ...saved, sync_status: "synced" });

    const updated = await updateVocabularyDetails({
      id: saved.id,
      meaningZh: "足夠的",
      meaningEn: "enough for a purpose",
      userNote: "sufficient resources",
      toeicUsefulness: "High",
      contextType: "TOEIC-like"
    });

    expect(updated.meaning_zh).toBe("足夠的");
    expect(updated.meaning_en).toBe("enough for a purpose");
    expect(updated.user_note).toBe("sufficient resources");
    expect(updated.sync_status).toBe("pending");
  });

  it("preserves local edits made while a sync snapshot is in flight", async () => {
    const baseline = await createOrUpdateVocabulary({
      lookup: createLookup("concurrent-sync"),
      intent: "save"
    });
    const allBaseline = (await listVocabulary()).filter(
      (record) => record.type === "saved"
    );
    const remoteSnapshot = {
      ...baseline,
      meaning_zh: "remote value",
      updated_at: "2026-08-12T10:00:00.000Z",
      sync_status: "synced" as const
    };

    const concurrentEdit = await updateVocabularyDetails({
      id: baseline.id,
      meaningZh: "local value",
      meaningEn: baseline.meaning_en,
      userNote: "edited during sync",
      toeicUsefulness: baseline.toeic_usefulness,
      contextType: baseline.context_type
    });

    const preserved = await reconcileSavedVocabularySnapshot(
      allBaseline.map((record) =>
        record.id === baseline.id
          ? remoteSnapshot
          : { ...record, sync_status: "synced" as const }
      ),
      allBaseline
    );

    expect(preserved).toBe(1);
    expect(await getVocabularyById(baseline.id)).toMatchObject({
      meaning_zh: concurrentEdit.meaning_zh,
      user_note: "edited during sync",
      sync_status: concurrentEdit.sync_status
    });
  });
});

function createLookup(text: string): LookupResult {
  return {
    selectedText: text,
    normalizedText: text,
    provider: "local_dictionary",
    partOfSpeech: "verb",
    meaningZh: "測試意思",
    meaningEn: "test meaning",
    sourceSentence: `This sentence uses ${text}.`,
    pageUrl: "https://example.com/article",
    pageTitle: "Example article",
    domain: "example.com",
    toeicUsefulness: "Unknown",
    contextType: "General",
    found: true
  };
}
