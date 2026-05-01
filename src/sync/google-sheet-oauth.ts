import type { ExtensionSettings, VocabularyRecord } from "../core/types";
import { updateSettings } from "../core/settings";
import { listVocabulary, putVocabulary } from "../storage/db";

const OAUTH_CLIENT_ID_PLACEHOLDER = "__REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID__";
const SHEET_NAME = "LexiTrace Sync Data";
const TAB_NAME = "Vocabulary";

const COLUMNS = [
  "id",
  "text",
  "normalized_text",
  "meaning_zh",
  "meaning_en",
  "source_sentence",
  "page_title",
  "page_url",
  "domain",
  "status",
  "review_priority",
  "next_review_at",
  "last_reviewed_at",
  "review_interval_days",
  "ease_factor",
  "toeic_usefulness",
  "context_type",
  "lookup_count",
  "remember_count",
  "forget_count",
  "quiz_correct_count",
  "quiz_wrong_count",
  "created_at",
  "updated_at",
  "last_seen_at",
  "note"
];

export async function enableGoogleSheetOAuthSync(): Promise<ExtensionSettings> {
  ensureOAuthClientConfigured();

  const token = await getAuthToken(true);
  const spreadsheet = await createSpreadsheet(token);
  await initializeVocabularySheet(token, spreadsheet.spreadsheetId);

  return updateSettings({
    googleSheetSyncEnabled: true,
    googleSheetAuthMode: "oauth",
    googleSheetId: spreadsheet.spreadsheetId,
    googleSheetName: SHEET_NAME,
    googleSheetUrl: spreadsheet.spreadsheetUrl,
    syncMode: "Manual",
    storageMode: "Google Sheet optional sync",
    lastSyncAt: new Date().toISOString()
  });
}

export async function syncVocabularyToOAuthSheet(
  settings: ExtensionSettings
): Promise<{ pushed: number; failed: number }> {
  ensureOAuthClientConfigured();

  if (!settings.googleSheetId) {
    throw new Error("Google Sheet 尚未建立，請先啟用 Google Sheet 同步。");
  }

  const savedRecords = (await listVocabulary()).filter(
    (record) => record.type === "saved" && !record.is_ignored
  );
  const pendingRecords = savedRecords.filter(
    (record) =>
      ["local_only", "pending", "failed"].includes(record.sync_status)
  );

  if (pendingRecords.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  const token = await getAuthToken(false);
  const values = [COLUMNS, ...savedRecords.map(recordToRow)];
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${settings.googleSheetId}/values/${encodeURIComponent(
      `${TAB_NAME}!A1`
    )}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values })
    }
  );

  if (!response.ok) {
    await markRecords(pendingRecords, "failed");
    return { pushed: 0, failed: pendingRecords.length };
  }

  await markRecords(pendingRecords, "synced");
  await updateSettings({ lastSyncAt: new Date().toISOString() });
  return { pushed: pendingRecords.length, failed: 0 };
}

function ensureOAuthClientConfigured(): void {
  const oauth2 = chrome.runtime.getManifest().oauth2;

  if (!oauth2?.client_id || oauth2.client_id === OAUTH_CLIENT_ID_PLACEHOLDER) {
    throw new Error("需要先在 manifest 設定 Google OAuth client ID。");
  }
}

async function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const error = chrome.runtime.lastError;
      const token = typeof result === "string" ? result : result?.token;

      if (error || !token) {
        reject(new Error(error?.message ?? "Google 授權失敗。"));
        return;
      }

      resolve(token);
    });
  });
}

async function createSpreadsheet(
  token: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: {
        title: SHEET_NAME
      },
      sheets: [
        {
          properties: {
            title: TAB_NAME
          }
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error("建立 Google Sheet 失敗。");
  }

  return response.json() as Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
  }>;
}

async function initializeVocabularySheet(
  token: string,
  spreadsheetId: string
): Promise<void> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      `${TAB_NAME}!A1`
    )}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values: [COLUMNS] })
    }
  );

  if (!response.ok) {
    throw new Error("初始化 Google Sheet 欄位失敗。");
  }
}

function recordToRow(record: VocabularyRecord): string[] {
  return [
    record.id,
    record.text,
    record.normalized_text,
    record.meaning_zh,
    record.meaning_en ?? "",
    record.source_sentence,
    record.page_title,
    record.page_url,
    record.domain,
    record.status,
    String(record.review_priority),
    record.next_review_at ?? "",
    record.last_reviewed_at ?? "",
    record.review_interval_days === undefined ? "" : String(record.review_interval_days),
    record.ease_factor === undefined ? "" : String(record.ease_factor),
    record.toeic_usefulness,
    record.context_type,
    String(record.lookup_count),
    String(record.remember_count),
    String(record.forget_count),
    String(record.quiz_correct_count),
    String(record.quiz_wrong_count),
    record.created_at,
    record.updated_at,
    record.last_seen_at,
    record.user_note ?? ""
  ];
}

async function markRecords(
  records: VocabularyRecord[],
  syncStatus: VocabularyRecord["sync_status"]
): Promise<void> {
  await Promise.all(
    records.map((record) =>
      putVocabulary({
        ...record,
        sync_status: syncStatus
      })
    )
  );
}
