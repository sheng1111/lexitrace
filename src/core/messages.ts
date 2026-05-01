import type {
  ExtensionSettings,
  LookupRequest,
  LookupResult,
  RecallOutcome,
  SaveVocabularyInput,
  VocabularyRecord
} from "./types";

export type RuntimeMessage =
  | { type: "LOOKUP_SELECTION"; payload: LookupRequest }
  | { type: "SAVE_VOCABULARY"; payload: SaveVocabularyInput }
  | { type: "LIST_ACTIVE_VOCABULARY" }
  | { type: "RECORD_PAGE_EXPOSURES"; payload: { ids: string[] } }
  | { type: "RECORD_RECALL"; payload: { id: string; outcome: RecallOutcome } }
  | { type: "GET_SETTINGS" }
  | { type: "UPDATE_SETTINGS"; payload: Partial<ExtensionSettings> }
  | { type: "EXPORT_VOCABULARY_JSON" }
  | { type: "ENABLE_GOOGLE_SHEET_OAUTH_SYNC" }
  | { type: "DISABLE_GOOGLE_SHEET_SYNC" }
  | { type: "SYNC_PENDING_VOCABULARY" };

export interface RuntimeResponseMap {
  LOOKUP_SELECTION: LookupResult;
  SAVE_VOCABULARY: VocabularyRecord;
  LIST_ACTIVE_VOCABULARY: VocabularyRecord[];
  RECORD_PAGE_EXPOSURES: VocabularyRecord[];
  RECORD_RECALL: VocabularyRecord;
  GET_SETTINGS: ExtensionSettings;
  UPDATE_SETTINGS: ExtensionSettings;
  EXPORT_VOCABULARY_JSON: VocabularyRecord[];
  ENABLE_GOOGLE_SHEET_OAUTH_SYNC: ExtensionSettings;
  DISABLE_GOOGLE_SHEET_SYNC: ExtensionSettings;
  SYNC_PENDING_VOCABULARY: { pushed: number; failed: number };
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
