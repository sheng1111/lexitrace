import type {
  ContextType,
  LearningStatus,
  ToeicUsefulness,
  VocabularyRecord
} from "../core/types";

export const GOOGLE_SHEET_COLUMNS = [
  "id",
  "text",
  "normalized_text",
  "type",
  "part_of_speech",
  "meaning_zh",
  "meaning_en",
  "user_note",
  "pronunciation",
  "source_sentence",
  "source_context_before",
  "source_context_after",
  "page_url",
  "page_title",
  "domain",
  "created_at",
  "updated_at",
  "last_seen_at",
  "lookup_count",
  "seen_count",
  "remember_count",
  "forget_count",
  "quiz_correct_count",
  "quiz_wrong_count",
  "status",
  "review_priority",
  "next_review_at",
  "last_reviewed_at",
  "review_interval_days",
  "ease_factor",
  "toeic_usefulness",
  "context_type",
  "is_phrase",
  "is_ignored"
] as const;

export interface ParsedSheetSnapshot {
  records: VocabularyRecord[];
  invalidRows: number;
  dataRowCount: number;
}

export interface MergedVocabularySnapshot {
  records: VocabularyRecord[];
  pushed: number;
  pulled: number;
  conflicts: number;
}

export function recordsToSheetValues(records: VocabularyRecord[]): string[][] {
  return [
    [...GOOGLE_SHEET_COLUMNS],
    ...[...records]
      .sort((a, b) => a.normalized_text.localeCompare(b.normalized_text))
      .map(recordToRow)
  ];
}

export function parseSheetValues(values: unknown[][]): ParsedSheetSnapshot {
  if (values.length === 0) {
    return { records: [], invalidRows: 0, dataRowCount: 0 };
  }

  const header = values[0].map((value) => String(value).trim());
  const columnIndex = new Map(header.map((name, index) => [name, index]));
  const hasAnyData = values.slice(1).some((row) => row.some((value) => String(value).trim()));

  if (hasAnyData && !columnIndex.has("id") && !columnIndex.has("normalized_text")) {
    throw new Error("同步試算表缺少 id 或 normalized_text 欄位，為避免覆寫資料已停止同步。");
  }

  const recordsByNormalizedText = new Map<string, VocabularyRecord>();
  let invalidRows = 0;

  for (const row of values.slice(1)) {
    if (!row.some((value) => String(value).trim())) {
      continue;
    }

    const record = rowToRecord(row, columnIndex);
    if (!record) {
      invalidRows += 1;
      continue;
    }

    const existing = recordsByNormalizedText.get(record.normalized_text);
    if (!existing || getUpdatedTime(record) >= getUpdatedTime(existing)) {
      recordsByNormalizedText.set(record.normalized_text, record);
    }
  }

  return {
    records: [...recordsByNormalizedText.values()],
    invalidRows,
    dataRowCount: Math.max(0, values.length - 1)
  };
}

export function mergeVocabularySnapshots(
  localRecords: VocabularyRecord[],
  remoteRecords: VocabularyRecord[]
): MergedVocabularySnapshot {
  const localByText = createNormalizedMap(localRecords);
  const remoteByText = createNormalizedMap(remoteRecords);
  const keys = new Set([...localByText.keys(), ...remoteByText.keys()]);
  const records: VocabularyRecord[] = [];
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;

  for (const key of keys) {
    const local = localByText.get(key);
    const remote = remoteByText.get(key);

    if (!local && remote) {
      records.push({ ...remote, sync_status: "synced" });
      pulled += 1;
      continue;
    }

    if (local && !remote) {
      records.push(local);
      pushed += 1;
      continue;
    }

    if (!local || !remote) {
      continue;
    }

    const canonicalId = local.id.localeCompare(remote.id) <= 0 ? local.id : remote.id;
    const equivalent = recordsAreEquivalent(local, remote);
    const localChanged = local.sync_status !== "synced";

    if (equivalent) {
      records.push({ ...local, id: canonicalId, sync_status: "synced" });
      continue;
    }

    if (localChanged) {
      conflicts += 1;
    }

    if (compareRecordVersions(remote, local) > 0) {
      records.push({ ...remote, id: canonicalId, sync_status: "synced" });
      pulled += 1;
    } else {
      records.push({ ...local, id: canonicalId });
      pushed += 1;
    }
  }

  return { records, pushed, pulled, conflicts };
}

function recordToRow(record: VocabularyRecord): string[] {
  const values: Record<(typeof GOOGLE_SHEET_COLUMNS)[number], string> = {
    id: record.id,
    text: record.text,
    normalized_text: record.normalized_text,
    type: record.type,
    part_of_speech: record.part_of_speech ?? "",
    meaning_zh: record.meaning_zh,
    meaning_en: record.meaning_en ?? "",
    user_note: record.user_note ?? "",
    pronunciation: record.pronunciation ?? "",
    source_sentence: record.source_sentence,
    source_context_before: record.source_context_before ?? "",
    source_context_after: record.source_context_after ?? "",
    page_url: record.page_url,
    page_title: record.page_title,
    domain: record.domain,
    created_at: record.created_at,
    updated_at: record.updated_at,
    last_seen_at: record.last_seen_at,
    lookup_count: String(record.lookup_count),
    seen_count: String(record.seen_count),
    remember_count: String(record.remember_count),
    forget_count: String(record.forget_count),
    quiz_correct_count: String(record.quiz_correct_count),
    quiz_wrong_count: String(record.quiz_wrong_count),
    status: record.status,
    review_priority: String(record.review_priority),
    next_review_at: record.next_review_at ?? "",
    last_reviewed_at: record.last_reviewed_at ?? "",
    review_interval_days:
      record.review_interval_days === undefined ? "" : String(record.review_interval_days),
    ease_factor: record.ease_factor === undefined ? "" : String(record.ease_factor),
    toeic_usefulness: record.toeic_usefulness,
    context_type: record.context_type,
    is_phrase: String(record.is_phrase),
    is_ignored: String(record.is_ignored)
  };

  return GOOGLE_SHEET_COLUMNS.map((column) => values[column]);
}

function rowToRecord(
  row: unknown[],
  columnIndex: Map<string, number>
): VocabularyRecord | undefined {
  const read = (column: string): string => {
    const index = columnIndex.get(column);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };
  const normalizedText = (read("normalized_text") || read("text")).toLowerCase();
  const text = read("text") || normalizedText;
  const id = read("id") || `sheet-${stableHash(normalizedText)}`;

  if (!normalizedText || !text) {
    return undefined;
  }

  const createdAt = normalizeDate(read("created_at"), new Date(0).toISOString());
  const updatedAt = normalizeDate(read("updated_at"), createdAt);
  const lastSeenAt = normalizeDate(read("last_seen_at"), updatedAt);

  return {
    id,
    text,
    normalized_text: normalizedText,
    type: read("type") === "lookup" ? "lookup" : "saved",
    part_of_speech: optional(read("part_of_speech")),
    meaning_zh: read("meaning_zh"),
    meaning_en: optional(read("meaning_en")),
    user_note: optional(read("user_note") || read("note")),
    pronunciation: optional(read("pronunciation")),
    source_sentence: read("source_sentence"),
    source_context_before: optional(read("source_context_before")),
    source_context_after: optional(read("source_context_after")),
    page_url: read("page_url"),
    page_title: read("page_title"),
    domain: read("domain"),
    created_at: createdAt,
    updated_at: updatedAt,
    last_seen_at: lastSeenAt,
    lookup_count: nonNegativeInteger(read("lookup_count"), 1),
    seen_count: nonNegativeInteger(read("seen_count"), 1),
    remember_count: nonNegativeInteger(read("remember_count"), 0),
    forget_count: nonNegativeInteger(read("forget_count"), 0),
    quiz_correct_count: nonNegativeInteger(read("quiz_correct_count"), 0),
    quiz_wrong_count: nonNegativeInteger(read("quiz_wrong_count"), 0),
    status: learningStatus(read("status")),
    review_priority: boundedNumber(read("review_priority"), 0, 100, 0),
    next_review_at: optionalDate(read("next_review_at")),
    last_reviewed_at: optionalDate(read("last_reviewed_at")),
    review_interval_days: optionalNumber(read("review_interval_days")),
    ease_factor: optionalNumber(read("ease_factor")),
    toeic_usefulness: toeicUsefulness(read("toeic_usefulness")),
    context_type: contextType(read("context_type")),
    is_phrase: booleanValue(read("is_phrase"), normalizedText.includes(" ")),
    is_ignored: booleanValue(read("is_ignored"), read("status") === "ignored"),
    sync_status: "synced"
  };
}

function createNormalizedMap(records: VocabularyRecord[]): Map<string, VocabularyRecord> {
  const map = new Map<string, VocabularyRecord>();
  for (const record of records.filter((item) => item.type === "saved")) {
    const existing = map.get(record.normalized_text);
    if (!existing || getUpdatedTime(record) >= getUpdatedTime(existing)) {
      map.set(record.normalized_text, record);
    }
  }
  return map;
}

function recordsAreEquivalent(a: VocabularyRecord, b: VocabularyRecord): boolean {
  const aRow = recordToRow(a);
  const bRow = recordToRow(b);
  return GOOGLE_SHEET_COLUMNS.every((column, index) => {
    if (column === "id") {
      return true;
    }
    return aRow[index] === bRow[index];
  });
}

function getUpdatedTime(record: VocabularyRecord): number {
  const time = new Date(record.updated_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareRecordVersions(a: VocabularyRecord, b: VocabularyRecord): number {
  const timeDifference = getUpdatedTime(a) - getUpdatedTime(b);
  if (timeDifference !== 0) {
    return timeDifference;
  }

  return recordFingerprint(a).localeCompare(recordFingerprint(b));
}

function recordFingerprint(record: VocabularyRecord): string {
  return recordToRow(record).slice(1).join("\u001f");
}

function normalizeDate(value: string, fallback: string): string {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

function optionalDate(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function nonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function boundedNumber(
  value: string,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function optionalNumber(value: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: string, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

function learningStatus(value: string): LearningStatus {
  return ["new", "learning", "weak", "familiar", "mastered", "ignored"].includes(value)
    ? (value as LearningStatus)
    : "new";
}

function toeicUsefulness(value: string): ToeicUsefulness {
  return ["High", "Medium", "Low", "Unknown"].includes(value)
    ? (value as ToeicUsefulness)
    : "Unknown";
}

function contextType(value: string): ContextType {
  return ["Technical", "Business", "General", "TOEIC-like", "Unknown"].includes(value)
    ? (value as ContextType)
    : "Unknown";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
