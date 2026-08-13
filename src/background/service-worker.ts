import type { RuntimeMessage } from "../core/messages";
import type { GoogleSheetSyncResult, VocabularyRecord } from "../core/types";
import { getSettings, updateSettings } from "../core/settings";
import { lookupWord } from "../dictionary/lookup-service";
import {
  createOrUpdateVocabulary,
  listActiveVocabulary,
  listVocabulary,
  recordPageExposures,
  recordRecallOutcome,
  setVocabularySyncStatus,
  updateVocabularyDetails as updateStoredVocabularyDetails
} from "../storage/db";
import {
  connectExistingGoogleSheet,
  enableGoogleSheetOAuthSync,
  syncVocabularyToOAuthSheet
} from "../sync/google-sheet-oauth";

const AUTO_SYNC_ALARM = "lexitrace.autoSync";
const AUTO_SYNC_POLL_ALARM = "lexitrace.autoSyncPoll";
const AUTO_SYNC_RETRY_MINUTES = 5;
const AUTO_SYNC_POLL_MINUTES = 15;
let syncInFlight: Promise<GoogleSheetSyncResult> | undefined;

chrome.runtime.onInstalled.addListener(() => {
  void initializeAutoSyncAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeAutoSyncAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_SYNC_ALARM && alarm.name !== AUTO_SYNC_POLL_ALARM) {
    return;
  }
  void syncPendingVocabulary().catch((error: unknown) => {
    console.error("[LexiTrace] Auto sync failed", error);
    void getSettings()
      .then(scheduleAutoSyncRetryIfNeeded)
      .catch((retryError: unknown) => {
        console.error("[LexiTrace] Could not schedule sync retry", retryError);
      });
  });
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

    case "UPDATE_VOCABULARY_DETAILS":
      return updateVocabularyDetailsAndSync(message.payload);

    case "LIST_ACTIVE_VOCABULARY":
      return listActiveVocabulary();

    case "RECORD_PAGE_EXPOSURES":
      return recordPageExposuresAndSync(message.payload.ids);

    case "RECORD_RECALL":
      return recordRecallAndSync(
        message.payload.id,
        message.payload.outcome,
        message.payload.mode
      );

    case "GET_SETTINGS":
      return getSettings();

    case "UPDATE_SETTINGS":
      return updateSettingsAndSchedule(message.payload);

    case "EXPORT_VOCABULARY_JSON":
      return listVocabulary();

    case "ENABLE_GOOGLE_SHEET_OAUTH_SYNC":
      return enableGoogleSheetSyncAndSchedule();

    case "CONNECT_GOOGLE_SHEET":
      return connectGoogleSheetAndSchedule(message.payload.sheetUrlOrId);

    case "DISABLE_GOOGLE_SHEET_SYNC":
      await clearAutoSyncAlarms();
      return updateSettings({
        googleSheetSyncEnabled: false,
        googleSheetId: undefined,
        googleSheetName: undefined,
        googleSheetUrl: undefined,
        syncMode: "Off",
        storageMode: "Local only",
        lastSyncError: undefined
      });

    case "SYNC_PENDING_VOCABULARY":
      return syncPendingVocabulary(true);

    default:
      return assertNever(message);
  }
}

async function enableGoogleSheetSyncAndSchedule(): Promise<
  Awaited<ReturnType<typeof enableGoogleSheetOAuthSync>>
> {
  await clearAutoSyncAlarms();
  try {
    const settings = await enableGoogleSheetOAuthSync();
    await scheduleAutoSyncIfNeeded(settings);
    return settings;
  } catch (error) {
    await scheduleAutoSyncIfNeeded(await getSettings());
    throw error;
  }
}

async function connectGoogleSheetAndSchedule(
  sheetUrlOrId: string
): Promise<Awaited<ReturnType<typeof connectExistingGoogleSheet>>> {
  await clearAutoSyncAlarms();
  try {
    const settings = await connectExistingGoogleSheet(sheetUrlOrId);
    await scheduleAutoSyncIfNeeded(settings);
    return settings;
  } catch (error) {
    await scheduleAutoSyncIfNeeded(await getSettings());
    throw error;
  }
}

async function syncPendingVocabulary(
  interactiveAuth = false
): Promise<GoogleSheetSyncResult> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = getSettings()
    .then((settings) => syncVocabularyToOAuthSheet(settings, interactiveAuth))
    .finally(() => {
      syncInFlight = undefined;
    });
  return syncInFlight;
}

async function saveVocabulary(
  payload: Extract<RuntimeMessage, { type: "SAVE_VOCABULARY" }>["payload"]
): Promise<unknown> {
  let record = await createOrUpdateVocabulary(payload);
  const settings = await getSettings();

  if (payload.intent === "save") {
    record = await markPendingIfSyncEnabled(record, settings);
    await scheduleAutoSyncIfNeeded(settings);
  }

  return record;
}

async function updateVocabularyDetailsAndSync(
  payload: Extract<RuntimeMessage, { type: "UPDATE_VOCABULARY_DETAILS" }>["payload"]
): Promise<unknown> {
  let record = await updateStoredVocabularyDetails(payload);
  const settings = await getSettings();

  record = await markPendingIfSyncEnabled(record, settings);
  await scheduleAutoSyncIfNeeded(settings);

  return record;
}

async function recordRecallAndSync(
  id: string,
  outcome: "remembered" | "unsure",
  mode?: "recall" | "quiz"
): Promise<VocabularyRecord> {
  let record = await recordRecallOutcome(id, outcome, mode);
  const settings = await getSettings();
  record = await markPendingIfSyncEnabled(record, settings);
  await scheduleAutoSyncIfNeeded(settings);
  return record;
}

async function recordPageExposuresAndSync(ids: string[]): Promise<VocabularyRecord[]> {
  const records = await recordPageExposures(ids);
  const settings = await getSettings();
  const next = await Promise.all(
    records.map((record) => markPendingIfSyncEnabled(record, settings))
  );
  await scheduleAutoSyncIfNeeded(settings);
  return next;
}

async function markPendingIfSyncEnabled(
  record: VocabularyRecord,
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<VocabularyRecord> {
  if (
    !settings.googleSheetSyncEnabled ||
    settings.syncMode === "Off" ||
    !hasConfiguredGoogleSheetSync(settings) ||
    record.sync_status === "pending"
  ) {
    return record;
  }

  await setVocabularySyncStatus([record.id], "pending");
  return { ...record, sync_status: "pending" };
}

async function updateSettingsAndSchedule(
  patch: Extract<RuntimeMessage, { type: "UPDATE_SETTINGS" }>["payload"]
): Promise<Awaited<ReturnType<typeof updateSettings>>> {
  const next = await updateSettings(patch);
  if (next.syncMode === "Auto") {
    await scheduleAutoSyncIfNeeded(next);
  } else {
    await clearAutoSyncAlarms();
  }
  return next;
}

async function scheduleAutoSyncIfNeeded(
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<void> {
  if (
    settings.googleSheetSyncEnabled &&
    settings.syncMode === "Auto" &&
    hasConfiguredGoogleSheetSync(settings)
  ) {
    await chrome.alarms.create(AUTO_SYNC_ALARM, { delayInMinutes: 0.5 });
    await ensureAutoSyncPollAlarm();
  }
}

async function initializeAutoSyncAlarms(): Promise<void> {
  const settings = await getSettings();
  if (
    settings.googleSheetSyncEnabled &&
    settings.syncMode === "Auto" &&
    hasConfiguredGoogleSheetSync(settings)
  ) {
    await ensureAutoSyncPollAlarm();
    await chrome.alarms.create(AUTO_SYNC_ALARM, { delayInMinutes: 0.5 });
  } else {
    await clearAutoSyncAlarms();
  }
}

async function ensureAutoSyncPollAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(AUTO_SYNC_POLL_ALARM);
  if (!existing) {
    await chrome.alarms.create(AUTO_SYNC_POLL_ALARM, {
      delayInMinutes: AUTO_SYNC_POLL_MINUTES,
      periodInMinutes: AUTO_SYNC_POLL_MINUTES
    });
  }
}

async function clearAutoSyncAlarms(): Promise<void> {
  await Promise.all([
    chrome.alarms.clear(AUTO_SYNC_ALARM),
    chrome.alarms.clear(AUTO_SYNC_POLL_ALARM)
  ]);
}

async function scheduleAutoSyncRetryIfNeeded(
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<void> {
  if (
    settings.googleSheetSyncEnabled &&
    settings.syncMode === "Auto" &&
    hasConfiguredGoogleSheetSync(settings)
  ) {
    await chrome.alarms.create(AUTO_SYNC_ALARM, {
      delayInMinutes: AUTO_SYNC_RETRY_MINUTES
    });
  }
}

function hasConfiguredGoogleSheetSync(
  settings: Awaited<ReturnType<typeof getSettings>>
): boolean {
  return Boolean(settings.googleSheetId);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled runtime message: ${JSON.stringify(value)}`);
}
