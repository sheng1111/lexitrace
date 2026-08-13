import { isPhrase, normalizeUrl } from "../core/normalize";
import type {
  RecallOutcome,
  SaveVocabularyInput,
  UpdateVocabularyDetailsInput,
  VocabularyRecord
} from "../core/types";

const DB_NAME = "lexitrace";
const DB_VERSION = 1;
const VOCABULARY_STORE = "vocabulary";
const PAGE_STORE = "pages";
const REVIEW_STORE = "reviews";
const METADATA_STORE = "metadata";

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(VOCABULARY_STORE)) {
        const store = db.createObjectStore(VOCABULARY_STORE, { keyPath: "id" });
        store.createIndex("normalized_text", "normalized_text", { unique: true });
        store.createIndex("status", "status");
        store.createIndex("page_url", "page_url");
        store.createIndex("updated_at", "updated_at");
        store.createIndex("sync_status", "sync_status");
      }

      if (!db.objectStoreNames.contains(PAGE_STORE)) {
        const store = db.createObjectStore(PAGE_STORE, { keyPath: "id" });
        store.createIndex("normalized_url", "normalized_url", { unique: true });
        store.createIndex("domain", "domain");
        store.createIndex("last_seen_at", "last_seen_at");
      }

      if (!db.objectStoreNames.contains(REVIEW_STORE)) {
        const store = db.createObjectStore(REVIEW_STORE, { keyPath: "id" });
        store.createIndex("vocabulary_id", "vocabulary_id");
        store.createIndex("created_at", "created_at");
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getVocabularyStore(
  mode: IDBTransactionMode
): Promise<IDBObjectStore> {
  const db = await openDatabase();
  return db.transaction(VOCABULARY_STORE, mode).objectStore(VOCABULARY_STORE);
}

export async function getVocabularyByNormalizedText(
  normalizedText: string
): Promise<VocabularyRecord | undefined> {
  const store = await getVocabularyStore("readonly");
  return requestToPromise(
    store.index("normalized_text").get(normalizedText) as IDBRequest<
      VocabularyRecord | undefined
    >
  );
}

export async function getVocabularyById(
  id: string
): Promise<VocabularyRecord | undefined> {
  const store = await getVocabularyStore("readonly");
  return requestToPromise(store.get(id) as IDBRequest<VocabularyRecord | undefined>);
}

export async function putVocabulary(
  record: VocabularyRecord
): Promise<VocabularyRecord> {
  const store = await getVocabularyStore("readwrite");
  await requestToPromise(store.put(record));
  return record;
}

export async function listVocabulary(): Promise<VocabularyRecord[]> {
  const store = await getVocabularyStore("readonly");
  return requestToPromise(store.getAll() as IDBRequest<VocabularyRecord[]>);
}

export async function listActiveVocabulary(): Promise<VocabularyRecord[]> {
  const records = await listVocabulary();
  return records.filter(
    (record) =>
      record.type === "saved" &&
      !record.is_ignored &&
      record.status !== "ignored"
  );
}

export async function createOrUpdateVocabulary(
  input: SaveVocabularyInput
): Promise<VocabularyRecord> {
  const now = new Date().toISOString();
  const existing = await getVocabularyByNormalizedText(input.lookup.normalizedText);
  const isActiveSave = input.intent === "save";

  if (existing) {
    const becameSaved = isActiveSave && existing.type !== "saved";
    return putVocabulary({
      ...existing,
      type: isActiveSave ? "saved" : existing.type,
      part_of_speech: input.lookup.partOfSpeech ?? existing.part_of_speech,
      meaning_zh:
        input.manualMeaningZh ??
        input.lookup.meaningZh ??
        existing.meaning_zh ??
        "",
      meaning_en:
        input.manualMeaningEn ?? input.lookup.meaningEn ?? existing.meaning_en,
      user_note: input.userNote ?? existing.user_note,
      source_sentence: input.lookup.sourceSentence || existing.source_sentence,
      page_url: input.lookup.pageUrl || existing.page_url,
      page_title: input.lookup.pageTitle || existing.page_title,
      domain: input.lookup.domain || existing.domain,
      updated_at: now,
      last_seen_at: now,
      lookup_count: existing.lookup_count + 1,
      seen_count: existing.seen_count + 1,
      status: becameSaved ? "new" : existing.status,
      review_priority: isActiveSave
        ? Math.max(existing.review_priority, 50)
        : existing.review_priority,
      next_review_at:
        isActiveSave && !existing.next_review_at
          ? scheduleInitialReview(now)
          : existing.next_review_at,
      review_interval_days:
        isActiveSave && existing.review_interval_days === undefined
          ? 1
          : existing.review_interval_days,
      ease_factor:
        isActiveSave && existing.ease_factor === undefined ? 2.3 : existing.ease_factor,
      toeic_usefulness:
        input.manualToeicUsefulness ?? input.lookup.toeicUsefulness,
      context_type: input.manualContextType ?? input.lookup.contextType,
      is_phrase: isPhrase(input.lookup.normalizedText),
      sync_status: existing.sync_status === "synced" ? "pending" : existing.sync_status
    });
  }

  const record: VocabularyRecord = {
    id: crypto.randomUUID(),
    text: input.lookup.selectedText,
    normalized_text: input.lookup.normalizedText,
    type: isActiveSave ? "saved" : "lookup",
    part_of_speech: input.lookup.partOfSpeech,
    meaning_zh: input.manualMeaningZh ?? input.lookup.meaningZh ?? "",
    meaning_en: input.manualMeaningEn ?? input.lookup.meaningEn,
    pronunciation: input.lookup.pronunciation,
    user_note: input.userNote,
    source_sentence: input.lookup.sourceSentence,
    page_url: input.lookup.pageUrl,
    page_title: input.lookup.pageTitle,
    domain: input.lookup.domain,
    created_at: now,
    updated_at: now,
    last_seen_at: now,
    lookup_count: 1,
    seen_count: 1,
    remember_count: 0,
    forget_count: 0,
    quiz_correct_count: 0,
    quiz_wrong_count: 0,
    status: isActiveSave ? "new" : "familiar",
    review_priority: isActiveSave ? 50 : 0,
    next_review_at: isActiveSave ? scheduleInitialReview(now) : undefined,
    review_interval_days: isActiveSave ? 1 : undefined,
    ease_factor: isActiveSave ? 2.3 : undefined,
    toeic_usefulness:
      input.manualToeicUsefulness ?? input.lookup.toeicUsefulness,
    context_type: input.manualContextType ?? input.lookup.contextType,
    is_phrase: isPhrase(input.lookup.normalizedText),
    is_ignored: false,
    sync_status: "local_only"
  };

  return putVocabulary(record);
}

export async function recordRecallOutcome(
  id: string,
  outcome: RecallOutcome,
  mode: "recall" | "quiz" = "recall"
): Promise<VocabularyRecord> {
  const existing = await getVocabularyById(id);

  if (!existing) {
    throw new Error(`Vocabulary record not found: ${id}`);
  }

  const now = new Date().toISOString();
  const remembered = outcome === "remembered";
  const nextSchedule = scheduleNextReview(existing, remembered, now);

  const next: VocabularyRecord = {
    ...existing,
    updated_at: now,
    last_seen_at: now,
    remember_count: existing.remember_count + (remembered ? 1 : 0),
    forget_count: existing.forget_count + (remembered ? 0 : 1),
    quiz_correct_count:
      existing.quiz_correct_count + (mode === "quiz" && remembered ? 1 : 0),
    quiz_wrong_count:
      existing.quiz_wrong_count + (mode === "quiz" && !remembered ? 1 : 0),
    status: remembered
      ? nextRememberedStatus(existing.status)
      : "weak",
    review_priority: remembered
      ? Math.max(0, existing.review_priority - 20)
      : Math.min(100, existing.review_priority + 25),
    last_reviewed_at: now,
    next_review_at: nextSchedule.nextReviewAt,
    review_interval_days: nextSchedule.intervalDays,
    ease_factor: nextSchedule.easeFactor,
    sync_status: existing.sync_status === "synced" ? "pending" : existing.sync_status
  };

  return putVocabulary(next);
}

export async function setVocabularySyncStatus(
  ids: string[],
  syncStatus: VocabularyRecord["sync_status"]
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(VOCABULARY_STORE, "readwrite");
    const store = transaction.objectStore(VOCABULARY_STORE);

    for (const id of uniqueIds) {
      const request = store.get(id) as IDBRequest<VocabularyRecord | undefined>;
      request.onsuccess = () => {
        if (request.result) {
          store.put({ ...request.result, sync_status: syncStatus });
        }
      };
      request.onerror = () => transaction.abort();
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("更新同步狀態失敗。"));
  });
}

export async function reconcileSavedVocabularySnapshot(
  records: VocabularyRecord[],
  baselineRecords: VocabularyRecord[]
): Promise<number> {
  const db = await openDatabase();
  const baselineByText = new Map(
    baselineRecords.map((record) => [record.normalized_text, record])
  );

  let preservedLocalChanges = 0;

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(VOCABULARY_STORE, "readwrite");
    const store = transaction.objectStore(VOCABULARY_STORE);
    const request = store.getAll() as IDBRequest<VocabularyRecord[]>;

    request.onsuccess = () => {
      const nextByText = new Map(
        records.map((record) => [record.normalized_text, record])
      );

      for (const existing of request.result) {
        if (existing.type === "saved") {
          store.delete(existing.id);

          const baseline = baselineByText.get(existing.normalized_text);
          if (!baseline || !recordsMatchExactly(existing, baseline)) {
            nextByText.set(existing.normalized_text, existing);
            preservedLocalChanges += 1;
          }
        }
      }

      for (const record of nextByText.values()) {
        store.put(record);
      }
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("同步本機資料失敗。"));
  });

  return preservedLocalChanges;
}

function recordsMatchExactly(a: VocabularyRecord, b: VocabularyRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function updateVocabularyDetails(
  input: UpdateVocabularyDetailsInput
): Promise<VocabularyRecord> {
  const existing = await getVocabularyById(input.id);
  if (!existing) {
    throw new Error(`Vocabulary record not found: ${input.id}`);
  }

  return putVocabulary({
    ...existing,
    meaning_zh: input.meaningZh,
    meaning_en: input.meaningEn,
    user_note: input.userNote,
    toeic_usefulness: input.toeicUsefulness,
    context_type: input.contextType,
    updated_at: new Date().toISOString(),
    sync_status: existing.sync_status === "synced" ? "pending" : existing.sync_status
  });
}

export async function recordPageExposures(ids: string[]): Promise<VocabularyRecord[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const now = new Date().toISOString();
  const updated: VocabularyRecord[] = [];

  for (const id of uniqueIds) {
    const existing = await getVocabularyById(id);

    if (!existing || existing.type !== "saved" || existing.is_ignored) {
      continue;
    }

    updated.push(
      await putVocabulary({
        ...existing,
        updated_at: now,
        last_seen_at: now,
        seen_count: existing.seen_count + 1,
        review_priority: Math.min(100, existing.review_priority + 2),
        sync_status: existing.sync_status === "synced" ? "pending" : existing.sync_status
      })
    );
  }

  return updated;
}

function nextRememberedStatus(status: VocabularyRecord["status"]): VocabularyRecord["status"] {
  switch (status) {
    case "weak":
      return "learning";
    case "new":
      return "learning";
    case "learning":
      return "familiar";
    case "familiar":
      return "mastered";
    default:
      return status;
  }
}

function scheduleInitialReview(now: string): string {
  return addDays(now, 1);
}

function scheduleNextReview(
  record: VocabularyRecord,
  remembered: boolean,
  now: string
): { nextReviewAt: string; intervalDays: number; easeFactor: number } {
  const currentInterval = record.review_interval_days ?? 1;
  const currentEase = record.ease_factor ?? 2.3;

  if (!remembered) {
    return {
      nextReviewAt: addMinutes(now, 30),
      intervalDays: 0,
      easeFactor: Math.max(1.3, currentEase - 0.2)
    };
  }

  const intervalDays =
    currentInterval <= 0
      ? 1
      : currentInterval < 3
        ? 3
        : currentInterval < 7
          ? 7
          : Math.min(60, Math.round(currentInterval * currentEase));
  const easeFactor = Math.min(2.8, currentEase + 0.08);

  return {
    nextReviewAt: addDays(now, intervalDays),
    intervalDays,
    easeFactor
  };
}

function addDays(value: string, days: number): string {
  return addMinutes(value, days * 24 * 60);
}

function addMinutes(value: string, minutes: number): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function vocabularyToJson(records: VocabularyRecord[]): string {
  return JSON.stringify(records, null, 2);
}

export function getNormalizedPageUrl(value: string): string {
  return normalizeUrl(value);
}
