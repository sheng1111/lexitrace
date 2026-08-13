import { describe, expect, it } from "vitest";
import type { VocabularyRecord } from "../core/types";
import {
  GOOGLE_SHEET_COLUMNS,
  mergeVocabularySnapshots,
  parseSheetValues,
  recordsToSheetValues
} from "./google-sheet-codec";
import { extractSpreadsheetId } from "./google-sheet-oauth";

describe("Google Sheet vocabulary codec", () => {
  it("round-trips the full cross-device vocabulary shape", () => {
    const original = createRecord("mitigate", {
      user_note: "常與 risk 搭配",
      pronunciation: "/ˈmɪtɪɡeɪt/",
      source_context_before: "helps",
      source_context_after: "risk",
      seen_count: 8,
      is_phrase: false,
      is_ignored: true
    });

    const parsed = parseSheetValues(recordsToSheetValues([original]));

    expect(parsed.invalidRows).toBe(0);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      id: original.id,
      normalized_text: "mitigate",
      user_note: "常與 risk 搭配",
      pronunciation: "/ˈmɪtɪɡeɪt/",
      source_context_before: "helps",
      source_context_after: "risk",
      seen_count: 8,
      is_ignored: true,
      sync_status: "synced"
    });
  });

  it("imports the former push-only column layout", () => {
    const header = [
      "id",
      "text",
      "normalized_text",
      "meaning_zh",
      "updated_at",
      "status",
      "note"
    ];
    const parsed = parseSheetValues([
      header,
      [
        "legacy-id",
        "allocate",
        "allocate",
        "分配",
        "2026-08-12T00:00:00.000Z",
        "learning",
        "legacy note"
      ]
    ]);

    expect(parsed.records[0]).toMatchObject({
      id: "legacy-id",
      meaning_zh: "分配",
      user_note: "legacy note",
      status: "learning"
    });
  });

  it("uses a newer local record and reports a push conflict", () => {
    const local = createRecord("fallback", {
      meaning_zh: "本機版本",
      updated_at: "2026-08-12T10:00:00.000Z",
      sync_status: "pending"
    });
    const remote = createRecord("fallback", {
      meaning_zh: "遠端舊版本",
      updated_at: "2026-08-12T09:00:00.000Z",
      sync_status: "synced"
    });

    const merged = mergeVocabularySnapshots([local], [remote]);

    expect(merged).toMatchObject({ pushed: 1, pulled: 0, conflicts: 1 });
    expect(merged.records[0].meaning_zh).toBe("本機版本");
  });

  it("pulls a newer remote record and resolves a pending local conflict", () => {
    const local = createRecord("sufficient", {
      meaning_zh: "本機舊版本",
      updated_at: "2026-08-12T09:00:00.000Z",
      sync_status: "pending"
    });
    const remote = createRecord("sufficient", {
      meaning_zh: "遠端新版本",
      updated_at: "2026-08-12T10:00:00.000Z",
      sync_status: "synced"
    });

    const merged = mergeVocabularySnapshots([local], [remote]);

    expect(merged).toMatchObject({ pushed: 0, pulled: 1, conflicts: 1 });
    expect(merged.records[0].meaning_zh).toBe("遠端新版本");
  });

  it("deduplicates independently-created records by normalized text", () => {
    const local = createRecord("allocate", { id: "z-local" });
    const remote = createRecord("allocate", { id: "a-remote" });
    const merged = mergeVocabularySnapshots([local], [remote]);

    expect(merged.records).toHaveLength(1);
    expect(merged.records[0].id).toBe("a-remote");
  });

  it("uses a stable content tie-breaker when timestamps match", () => {
    const local = createRecord("converge", {
      meaning_zh: "alpha",
      sync_status: "pending"
    });
    const remote = createRecord("converge", {
      meaning_zh: "omega",
      sync_status: "synced"
    });

    const localFirst = mergeVocabularySnapshots([local], [remote]);
    const remoteFirst = mergeVocabularySnapshots([remote], [local]);

    expect(localFirst.records[0].meaning_zh).toBe(
      remoteFirst.records[0].meaning_zh
    );
  });

  it("rejects data with no recognizable identity columns", () => {
    expect(() => parseSheetValues([["word", "meaning"], ["risk", "風險"]])).toThrow(
      /缺少 id 或 normalized_text/
    );
  });

  it("keeps the exported schema unique", () => {
    expect(new Set(GOOGLE_SHEET_COLUMNS).size).toBe(GOOGLE_SHEET_COLUMNS.length);
  });

  it("accepts a spreadsheet URL or a bare spreadsheet ID", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz_123456";

    expect(extractSpreadsheetId(id)).toBe(id);
    expect(
      extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)
    ).toBe(id);
    expect(() => extractSpreadsheetId("not-a-sheet")).toThrow();
  });
});

function createRecord(
  text: string,
  patch: Partial<VocabularyRecord> = {}
): VocabularyRecord {
  const now = "2026-08-12T09:00:00.000Z";
  return {
    id: `id-${text}`,
    text,
    normalized_text: text.toLowerCase(),
    type: "saved",
    meaning_zh: "測試",
    source_sentence: `This sentence uses ${text}.`,
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
    is_phrase: text.includes(" "),
    is_ignored: false,
    sync_status: "synced",
    ...patch
  };
}
