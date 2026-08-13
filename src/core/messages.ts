import type {
  ExtensionSettings,
  GoogleSheetSyncResult,
  LookupRequest,
  LookupResult,
  RecallOutcome,
  SaveVocabularyInput,
  UpdateVocabularyDetailsInput,
  VocabularyRecord
} from "./types";

export type RuntimeMessage =
  | { type: "LOOKUP_SELECTION"; payload: LookupRequest }
  | { type: "SAVE_VOCABULARY"; payload: SaveVocabularyInput }
  | { type: "UPDATE_VOCABULARY_DETAILS"; payload: UpdateVocabularyDetailsInput }
  | { type: "LIST_ACTIVE_VOCABULARY" }
  | { type: "RECORD_PAGE_EXPOSURES"; payload: { ids: string[] } }
  | {
      type: "RECORD_RECALL";
      payload: {
        id: string;
        outcome: RecallOutcome;
        mode?: "recall" | "quiz";
      };
    }
  | { type: "GET_SETTINGS" }
  | { type: "UPDATE_SETTINGS"; payload: Partial<ExtensionSettings> }
  | { type: "EXPORT_VOCABULARY_JSON" }
  | { type: "ENABLE_GOOGLE_SHEET_OAUTH_SYNC" }
  | { type: "CONNECT_GOOGLE_SHEET"; payload: { sheetUrlOrId: string } }
  | { type: "DISABLE_GOOGLE_SHEET_SYNC" }
  | { type: "SYNC_PENDING_VOCABULARY" };

export interface RuntimeResponseMap {
  LOOKUP_SELECTION: LookupResult;
  SAVE_VOCABULARY: VocabularyRecord;
  UPDATE_VOCABULARY_DETAILS: VocabularyRecord;
  LIST_ACTIVE_VOCABULARY: VocabularyRecord[];
  RECORD_PAGE_EXPOSURES: VocabularyRecord[];
  RECORD_RECALL: VocabularyRecord;
  GET_SETTINGS: ExtensionSettings;
  UPDATE_SETTINGS: ExtensionSettings;
  EXPORT_VOCABULARY_JSON: VocabularyRecord[];
  ENABLE_GOOGLE_SHEET_OAUTH_SYNC: ExtensionSettings;
  CONNECT_GOOGLE_SHEET: ExtensionSettings;
  DISABLE_GOOGLE_SHEET_SYNC: ExtensionSettings;
  SYNC_PENDING_VOCABULARY: GoogleSheetSyncResult;
}

export function sendRuntimeMessage<T extends RuntimeMessage["type"]>(
  message: Extract<RuntimeMessage, { type: T }>
): Promise<RuntimeResponseMap[T]> {
  return chrome.runtime.sendMessage(message).then((response: unknown) => {
    if (
      response &&
      typeof response === "object" &&
      "error" in response &&
      typeof response.error === "string"
    ) {
      throw new Error(response.error);
    }

    return response as RuntimeResponseMap[T];
  });
}
