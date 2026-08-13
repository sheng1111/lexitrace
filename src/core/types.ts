export type LearningStatus =
  | "new"
  | "learning"
  | "weak"
  | "familiar"
  | "mastered"
  | "ignored";

export type ToeicUsefulness = "High" | "Medium" | "Low" | "Unknown";

export type ContextType =
  | "Technical"
  | "Business"
  | "General"
  | "TOEIC-like"
  | "Unknown";

export type SyncStatus =
  | "local_only"
  | "pending"
  | "synced"
  | "failed";

export type LookupProviderType =
  | "local_dictionary"
  | "ecdict_cdn"
  | "open_dictionary_api"
  | "wiktapi"
  | "datamuse_api"
  | "mymemory_translation_api"
  | "unofficial_google_translate_api"
  | "external_dictionary_link"
  | "ai_api_key"
  | "cloud_ai_service"
  | "browser_local_ai";

export interface LookupRequest {
  selectedText: string;
  normalizedText: string;
  sourceSentence: string;
  pageUrl: string;
  pageTitle: string;
  domain: string;
}

export interface LookupResult {
  selectedText: string;
  normalizedText: string;
  provider: LookupProviderType;
  partOfSpeech?: string;
  meaningZh?: string;
  meaningEn?: string;
  pronunciation?: string;
  sourceSentence: string;
  pageUrl: string;
  pageTitle: string;
  domain: string;
  toeicUsefulness: ToeicUsefulness;
  contextType: ContextType;
  externalUrl?: string;
  found: boolean;
}

export interface VocabularyRecord {
  id: string;
  text: string;
  normalized_text: string;
  type: "lookup" | "saved";
  part_of_speech?: string;
  meaning_zh: string;
  meaning_en?: string;
  user_note?: string;
  pronunciation?: string;
  source_sentence: string;
  source_context_before?: string;
  source_context_after?: string;
  page_url: string;
  page_title: string;
  domain: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  lookup_count: number;
  seen_count: number;
  remember_count: number;
  forget_count: number;
  quiz_correct_count: number;
  quiz_wrong_count: number;
  status: LearningStatus;
  review_priority: number;
  next_review_at?: string;
  last_reviewed_at?: string;
  review_interval_days?: number;
  ease_factor?: number;
  toeic_usefulness: ToeicUsefulness;
  context_type: ContextType;
  is_phrase: boolean;
  is_ignored: boolean;
  sync_status: SyncStatus;
}

export interface PageRecord {
  id: string;
  url: string;
  normalized_url: string;
  title: string;
  domain: string;
  first_seen_at: string;
  last_seen_at: string;
  vocabulary_ids: string[];
  lookup_count_on_page: number;
}

export interface ReviewRecord {
  id: string;
  vocabulary_id: string;
  review_type: "meaning_choice" | "source_cloze" | "recall";
  question: string;
  options: string[];
  correct_answer: string;
  user_answer?: string;
  is_correct?: boolean;
  created_at: string;
  answered_at?: string;
  source:
    | "page_bubble"
    | "lightweight_prompt"
    | "recall_popup"
    | "manual_review";
}

export interface ExtensionSettings {
  extensionEnabled: boolean;
  highlightsEnabled: boolean;
  pageVocabularyBubbleEnabled: boolean;
  lightweightReviewPromptsEnabled: boolean;
  reviewPromptFrequency: "Low" | "Medium" | "High";
  defaultActionAfterLookup: "Ask" | "Save automatically" | "Understood automatically";
  showToeicBadge: boolean;
  showContextBadge: boolean;
  unofficialGoogleTranslateEnabled: boolean;
  disableInCodeBlocks: boolean;
  storageMode: "Local only" | "Google Sheet optional sync";
  googleSheetSyncEnabled: boolean;
  googleSheetId?: string;
  googleSheetName?: string;
  googleSheetUrl?: string;
  syncMode: "Off" | "Manual" | "Auto";
  lastSyncAt?: string;
  lastSyncError?: string;
  recallFirstPopupEnabled: boolean;
  quickReviewQuestionCount: 1;
  pageReviewQuestionCount: 1 | 2 | 3;
  hideMasteredWords: boolean;
}

export interface SaveVocabularyInput {
  lookup: LookupResult;
  intent: "save" | "understood";
  manualMeaningZh?: string;
  manualMeaningEn?: string;
  userNote?: string;
  manualToeicUsefulness?: ToeicUsefulness;
  manualContextType?: ContextType;
}

export interface GoogleSheetSyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  pending: number;
  failed: number;
}

export interface UpdateVocabularyDetailsInput {
  id: string;
  meaningZh: string;
  meaningEn?: string;
  userNote?: string;
  toeicUsefulness: ToeicUsefulness;
  contextType: ContextType;
}

export type RecallOutcome = "remembered" | "unsure";
