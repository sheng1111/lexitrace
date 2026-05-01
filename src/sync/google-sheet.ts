import type { ExtensionSettings, VocabularyRecord } from "../core/types";
import { listVocabulary, putVocabulary } from "../storage/db";

interface GoogleSheetSyncPayload {
  source: "lexitrace";
  schemaVersion: 1;
  exportedAt: string;
  records: VocabularyRecord[];
}

export async function syncVocabularyToGoogleSheet(
  settings: ExtensionSettings
): Promise<{ pushed: number; failed: number }> {
  if (!settings.googleSheetSyncEnabled || settings.syncMode === "Off") {
    return { pushed: 0, failed: 0 };
  }

  if (!settings.googleSheetEndpointUrl) {
    throw new Error("Google Sheet endpoint URL is required.");
  }

  const records = (await listVocabulary()).filter(
    (record) =>
      record.type === "saved" &&
      !record.is_ignored &&
      ["local_only", "pending", "failed"].includes(record.sync_status)
  );

  if (records.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  const payload: GoogleSheetSyncPayload = {
    source: "lexitrace",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records
  };

  const response = await fetch(settings.googleSheetEndpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await markRecords(records, "failed");
    return { pushed: 0, failed: records.length };
  }

  await markRecords(records, "synced");
  return { pushed: records.length, failed: 0 };
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
