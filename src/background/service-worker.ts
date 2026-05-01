import type { RuntimeMessage } from "../core/messages";
import { getSettings, updateSettings } from "../core/settings";
import { lookupWord } from "../dictionary/lookup-service";
import {
  createOrUpdateVocabulary,
  listActiveVocabulary,
  listVocabulary,
  putVocabulary,
  recordPageExposures,
  recordRecallOutcome
} from "../storage/db";
import { syncVocabularyToGoogleSheet } from "../sync/google-sheet";
import {
  enableGoogleSheetOAuthSync,
  syncVocabularyToOAuthSheet
} from "../sync/google-sheet-oauth";

chrome.runtime.onInstalled.addListener(() => {
  void getSettings();
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error("[LexiTrace] Runtime message failed", error);
        sendResponse({
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }
);

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case "LOOKUP_SELECTION":
      return lookupWord(message.payload, {
        useUnofficialGoogleTranslate:
          (await getSettings()).unofficialGoogleTranslateEnabled
      });

    case "SAVE_VOCABULARY":
      return saveVocabulary(message.payload);

    case "LIST_ACTIVE_VOCABULARY":
      return listActiveVocabulary();

    case "RECORD_PAGE_EXPOSURES":
      return recordPageExposures(message.payload.ids);

    case "RECORD_RECALL":
      return recordRecallOutcome(message.payload.id, message.payload.outcome);

    case "GET_SETTINGS":
      return getSettings();

    case "UPDATE_SETTINGS":
      return updateSettings(message.payload);

    case "EXPORT_VOCABULARY_JSON":
      return listVocabulary();

    case "ENABLE_GOOGLE_SHEET_OAUTH_SYNC":
      return enableGoogleSheetOAuthSync();

    case "DISABLE_GOOGLE_SHEET_SYNC":
      return updateSettings({
        googleSheetSyncEnabled: false,
        googleSheetId: undefined,
        googleSheetName: undefined,
        googleSheetUrl: undefined,
        syncMode: "Off",
        storageMode: "Local only"
      });

    case "SYNC_PENDING_VOCABULARY":
      return syncPendingVocabulary();

    default:
      return assertNever(message);
  }
}

async function syncPendingVocabulary(): Promise<{ pushed: number; failed: number }> {
  const settings = await getSettings();

  if (settings.googleSheetAuthMode === "oauth") {
    return syncVocabularyToOAuthSheet(settings);
  }

  return syncVocabularyToGoogleSheet(settings);
}

async function saveVocabulary(
  payload: Extract<RuntimeMessage, { type: "SAVE_VOCABULARY" }>["payload"]
): Promise<unknown> {
  let record = await createOrUpdateVocabulary(payload);
  const settings = await getSettings();

  if (
    payload.intent === "save" &&
    settings.googleSheetSyncEnabled &&
    settings.syncMode !== "Off" &&
    hasConfiguredGoogleSheetSync(settings) &&
    record.sync_status !== "synced"
  ) {
    record = await putVocabulary({
      ...record,
      sync_status: "pending"
    });
  }

  if (
    payload.intent === "save" &&
    settings.googleSheetSyncEnabled &&
    settings.syncMode === "Auto" &&
    hasConfiguredGoogleSheetSync(settings)
  ) {
    void syncPendingVocabulary().catch((error: unknown) => {
      console.error("[LexiTrace] Auto sync failed", error);
    });
  }

  return record;
}

function hasConfiguredGoogleSheetSync(
  settings: Awaited<ReturnType<typeof getSettings>>
): boolean {
  return settings.googleSheetAuthMode === "oauth"
    ? Boolean(settings.googleSheetId)
    : Boolean(settings.googleSheetEndpointUrl);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled runtime message: ${JSON.stringify(value)}`);
}
