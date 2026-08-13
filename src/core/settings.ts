import type { ExtensionSettings } from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  extensionEnabled: true,
  highlightsEnabled: true,
  pageVocabularyBubbleEnabled: true,
  lightweightReviewPromptsEnabled: true,
  reviewPromptFrequency: "Low",
  defaultActionAfterLookup: "Ask",
  showToeicBadge: true,
  showContextBadge: true,
  unofficialGoogleTranslateEnabled: false,
  disableInCodeBlocks: true,
  storageMode: "Local only",
  googleSheetSyncEnabled: false,
  syncMode: "Off",
  recallFirstPopupEnabled: true,
  quickReviewQuestionCount: 1,
  pageReviewQuestionCount: 3,
  hideMasteredWords: true
};

export const SETTINGS_KEY = "lexitrace.settings";

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = (result[SETTINGS_KEY] ?? {}) as Record<string, unknown>;
  // Strip the retired endpoint-based sync settings once, then keep only OAuth state.
  const {
    googleSheetAuthMode: _legacyAuthMode,
    googleSheetEndpointUrl: _legacyEndpointUrl,
    ...currentSettings
  } = stored;
  const migratedSettings =
    _legacyAuthMode === "apps_script"
      ? {
          ...currentSettings,
          googleSheetSyncEnabled: false,
          googleSheetId: undefined,
          googleSheetName: undefined,
          googleSheetUrl: undefined,
          syncMode: "Off",
          storageMode: "Local only"
        }
      : currentSettings;
  const next = {
    ...DEFAULT_SETTINGS,
    ...(migratedSettings as Partial<ExtensionSettings>)
  };

  if (_legacyAuthMode !== undefined || _legacyEndpointUrl !== undefined) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  }

  return next;
}

export async function updateSettings(
  patch: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const next = {
    ...(await getSettings()),
    ...patch
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
