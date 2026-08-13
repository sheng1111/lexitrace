import type {
  ExtensionSettings,
  GoogleSheetSyncResult,
  VocabularyRecord
} from "../core/types";
import { getSettings, updateSettings } from "../core/settings";
import {
  listVocabulary,
  reconcileSavedVocabularySnapshot,
  setVocabularySyncStatus
} from "../storage/db";
import {
  GOOGLE_SHEET_COLUMNS,
  mergeVocabularySnapshots,
  parseSheetValues,
  recordsToSheetValues
} from "./google-sheet-codec";

const OAUTH_CLIENT_ID_PLACEHOLDER = "__REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID__";
const SHEET_NAME = "LexiTrace Sync Data";
const TAB_NAME = "Vocabulary";
const VALUES_RANGE = `${TAB_NAME}!A1:ZZ`;

interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: { title?: string } }>;
}

export async function enableGoogleSheetOAuthSync(): Promise<ExtensionSettings> {
  ensureOAuthClientConfigured();

  const currentSettings = await getSettings();
  const token = await getAuthToken(true);
  const created = await createSpreadsheet(token);
  await initializeVocabularySheet(created.token, created.spreadsheet.spreadsheetId);
  const next = await saveConnectedSheet(
    created.spreadsheet,
    preferredConnectedSyncMode(currentSettings)
  );
  await syncVocabularyToOAuthSheet(next);
  return getSettings();
}

export async function connectExistingGoogleSheet(
  sheetUrlOrId: string
): Promise<ExtensionSettings> {
  ensureOAuthClientConfigured();
  const currentSettings = await getSettings();
  const spreadsheetId = extractSpreadsheetId(sheetUrlOrId);
  const token = await getAuthToken(true);
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  await ensureVocabularySheet(token, metadata);
  const next = await saveConnectedSheet(
    metadata,
    preferredConnectedSyncMode(currentSettings)
  );
  await syncVocabularyToOAuthSheet(next);
  return getSettings();
}

export async function syncVocabularyToOAuthSheet(
  settings: ExtensionSettings,
  interactiveAuth = false
): Promise<GoogleSheetSyncResult> {
  ensureOAuthClientConfigured();

  if (!settings.googleSheetSyncEnabled || !settings.googleSheetId) {
    throw new Error("Google Sheet 尚未連結，請先啟用或連結既有試算表。");
  }

  const localRecords = (await listVocabulary()).filter(
    (record) => record.type === "saved"
  );
  const pendingRecords = localRecords.filter(
    (record) => record.sync_status !== "synced"
  );

  try {
    const initialToken = await getAuthToken(interactiveAuth);
    const remoteRead = await readRemoteSnapshot(
      initialToken,
      settings.googleSheetId
    );
    const remoteSnapshot = remoteRead.snapshot;

    if (remoteSnapshot.invalidRows > 0) {
      throw new Error(
        `同步試算表有 ${remoteSnapshot.invalidRows} 列無法辨識。為避免資料遺失，請先修正或移除這些列。`
      );
    }

    const merged = mergeVocabularySnapshots(
      localRecords,
      remoteSnapshot.records
    );
    const syncedRecords = merged.records.map((record) => ({
      ...record,
      sync_status: "synced" as const
    }));

    await writeRemoteSnapshot(
      remoteRead.token,
      settings.googleSheetId,
      syncedRecords,
      remoteSnapshot.dataRowCount
    );
    const pending = await reconcileSavedVocabularySnapshot(
      syncedRecords,
      localRecords
    );
    await updateSettings({
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined
    });

    return {
      pushed: merged.pushed,
      pulled: merged.pulled,
      conflicts: merged.conflicts,
      pending,
      failed: 0
    };
  } catch (error) {
    await setVocabularySyncStatus(
      pendingRecords.map((record) => record.id),
      "failed"
    );
    const message = error instanceof Error ? error.message : "同步 Google Sheet 失敗。";
    await updateSettings({ lastSyncError: message });
    throw error;
  }
}

export function extractSpreadsheetId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
  const id = urlMatch?.[1] ?? trimmed;

  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) {
    throw new Error("請貼上有效的 Google Sheet 網址或試算表 ID。");
  }

  return id;
}

function ensureOAuthClientConfigured(): void {
  const oauth2 = chrome.runtime.getManifest().oauth2;

  if (!oauth2?.client_id || oauth2.client_id === OAUTH_CLIENT_ID_PLACEHOLDER) {
    throw new Error("需要先在 manifest 設定 Google OAuth client ID。");
  }
}

async function saveConnectedSheet(
  spreadsheet: SpreadsheetMetadata,
  syncMode: ExtensionSettings["syncMode"]
): Promise<ExtensionSettings> {
  return updateSettings({
    googleSheetSyncEnabled: true,
    googleSheetId: spreadsheet.spreadsheetId,
    googleSheetName: spreadsheet.properties?.title || SHEET_NAME,
    googleSheetUrl:
      spreadsheet.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
    syncMode,
    storageMode: "Google Sheet optional sync",
    lastSyncError: undefined
  });
}

function preferredConnectedSyncMode(
  settings: ExtensionSettings
): ExtensionSettings["syncMode"] {
  return settings.syncMode === "Auto" ? "Auto" : "Manual";
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

async function createSpreadsheet(token: string): Promise<{
  token: string;
  spreadsheet: SpreadsheetMetadata;
}> {
  const { response, token: nextToken } = await fetchGoogleApi(
    token,
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify({
        properties: { title: SHEET_NAME },
        sheets: [{ properties: { title: TAB_NAME } }]
      })
    },
    "建立 Google Sheet 失敗。"
  );

  if (!response.ok) {
    throw await createGoogleApiError(response, "建立 Google Sheet 失敗。");
  }

  return {
    token: nextToken,
    spreadsheet: (await response.json()) as SpreadsheetMetadata
  };
}

async function getSpreadsheetMetadata(
  token: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const { response } = await fetchGoogleApi(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    { method: "GET" },
    "無法開啟指定的 Google Sheet。"
  );

  if (!response.ok) {
    throw await createGoogleApiError(response, "無法開啟指定的 Google Sheet。");
  }

  return response.json() as Promise<SpreadsheetMetadata>;
}

async function ensureVocabularySheet(
  token: string,
  spreadsheet: SpreadsheetMetadata
): Promise<void> {
  const hasVocabularyTab = spreadsheet.sheets?.some(
    (sheet) => sheet.properties?.title === TAB_NAME
  );

  if (!hasVocabularyTab) {
    const { response } = await fetchGoogleApi(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: TAB_NAME } } }]
        })
      },
      "建立 Vocabulary 工作表失敗。"
    );
    if (!response.ok) {
      throw await createGoogleApiError(response, "建立 Vocabulary 工作表失敗。");
    }
    await initializeVocabularySheet(token, spreadsheet.spreadsheetId);
  }
}

async function initializeVocabularySheet(
  token: string,
  spreadsheetId: string
): Promise<void> {
  const { response } = await fetchGoogleApi(
    token,
    valuesUpdateUrl(spreadsheetId),
    {
      method: "PUT",
      body: JSON.stringify({ values: [[...GOOGLE_SHEET_COLUMNS]] })
    },
    "初始化 Google Sheet 欄位失敗。"
  );

  if (!response.ok) {
    throw await createGoogleApiError(response, "初始化 Google Sheet 欄位失敗。");
  }
}

async function readRemoteSnapshot(
  token: string,
  spreadsheetId: string
): Promise<{
  snapshot: ReturnType<typeof parseSheetValues>;
  token: string;
}> {
  const { response, token: nextToken } = await fetchGoogleApi(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      VALUES_RANGE
    )}?majorDimension=ROWS`,
    { method: "GET" },
    "讀取 Google Sheet 失敗。"
  );

  if (!response.ok) {
    throw await createGoogleApiError(response, "讀取 Google Sheet 失敗。");
  }

  const body = (await response.json()) as { values?: unknown[][] };
  return {
    snapshot: parseSheetValues(body.values ?? []),
    token: nextToken
  };
}

async function writeRemoteSnapshot(
  token: string,
  spreadsheetId: string,
  records: VocabularyRecord[],
  previousDataRowCount: number
): Promise<string> {
  const values = recordsToSheetValues(records);
  const staleRowCount = Math.max(0, previousDataRowCount - records.length);
  for (let index = 0; index < staleRowCount; index += 1) {
    values.push(GOOGLE_SHEET_COLUMNS.map(() => ""));
  }

  const { response, token: nextToken } = await fetchGoogleApi(
    token,
    valuesUpdateUrl(spreadsheetId),
    {
      method: "PUT",
      body: JSON.stringify({ values })
    },
    "寫入 Google Sheet 失敗。"
  );

  if (!response.ok) {
    throw await createGoogleApiError(response, "寫入 Google Sheet 失敗。");
  }

  return nextToken;
}

function valuesUpdateUrl(spreadsheetId: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    `${TAB_NAME}!A1`
  )}?valueInputOption=RAW`;
}

async function fetchGoogleApi(
  token: string,
  url: string,
  init: RequestInit,
  errorTitle: string
): Promise<{ response: Response; token: string }> {
  const response = await fetchWithToken(token, url, init);

  if (response.status !== 401 && response.status !== 403) {
    return { response, token };
  }

  await removeCachedAuthToken(token);
  const refreshedToken = await getAuthToken(false);
  const refreshedResponse = await fetchWithToken(refreshedToken, url, init);

  if (!refreshedResponse.ok) {
    throw await createGoogleApiError(refreshedResponse, errorTitle);
  }

  return { response: refreshedResponse, token: refreshedToken };
}

function fetchWithToken(
  token: string,
  url: string,
  init: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
}

async function removeCachedAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function createGoogleApiError(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  let apiMessage = "";
  let reason = "";

  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
      };
    };
    apiMessage = body.error?.message ?? "";
    reason =
      body.error?.status ??
      body.error?.errors?.map((item) => item.reason).filter(Boolean).join(", ") ??
      "";
  } catch {
    try {
      apiMessage = await response.text();
    } catch {
      apiMessage = "";
    }
  }

  const hint = createTroubleshootingHint(response.status, `${apiMessage} ${reason}`);
  return new Error(
    [fallbackMessage, `HTTP ${response.status}`, reason, apiMessage, hint]
      .filter(Boolean)
      .join(" ")
  );
}

function createTroubleshootingHint(status: number, details: string): string {
  const text = details.toLowerCase();

  if (text.includes("api has not been used") || text.includes("disabled")) {
    return "請到 Google Cloud Console 啟用 Google Sheets API，等待幾分鐘後重試。";
  }

  if (text.includes("insufficient authentication scopes")) {
    return "請重新載入擴充功能並重新授權 Google Sheets 權限。";
  }

  if (text.includes("access blocked") || text.includes("not completed")) {
    return "如果 OAuth consent screen 還在 Testing，請把目前登入的 Google 帳號加入 Test users。";
  }

  if (status === 401 || status === 403) {
    return "請確認 OAuth client 類型是 Chrome Extension，且綁定目前安裝版本的 Extension ID。";
  }

  return "";
}
