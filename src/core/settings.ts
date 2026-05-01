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
  googleSheetAuthMode: "oauth",
  googleSheetEndpointUrl: "",
  syncMode: "Off",
  recallFirstPopupEnabled: true,
  quickReviewQuestionCount: 1,
  pageReviewQuestionCount: 3,
  hideMasteredWords: true
};

export const SETTINGS_KEY = "lexitrace.settings";

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined)
  };
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
