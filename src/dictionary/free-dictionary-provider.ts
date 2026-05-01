import type { LookupRequest, LookupResult } from "../core/types";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";
import { getLookupForms } from "./word-forms";

interface FreeDictionaryEntry {
  phonetic?: string;
  phonetics?: Array<{
    text?: string;
    audio?: string;
  }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
    }>;
  }>;
}

export class FreeDictionaryProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    const entries = await lookupEntries(request);

    const firstEntry = entries[0];
    const firstMeaning = firstEntry?.meanings?.[0];
    const firstDefinition = firstMeaning?.definitions?.[0];
    const phonetic =
      firstEntry?.phonetic ??
      firstEntry?.phonetics?.find((item) => item.text)?.text;

    if (!firstDefinition?.definition) {
      return createEmptyResult(request);
    }

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: "open_dictionary_api",
      partOfSpeech: firstMeaning?.partOfSpeech,
      meaningEn: firstDefinition.definition,
      pronunciation: phonetic,
      sourceSentence: request.sourceSentence,
      pageUrl: request.pageUrl,
      pageTitle: request.pageTitle,
      domain: request.domain,
      toeicUsefulness: classifyToeicUsefulness(request.normalizedText),
      contextType: classifyContext(request),
      externalUrl: createExternalUrl(request.selectedText),
      found: true
    };
  }
}

async function lookupEntries(request: LookupRequest): Promise<FreeDictionaryEntry[]> {
  for (const form of getLookupForms(request.normalizedText)) {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(form)}`
    );

    if (response.ok) {
      return response.json() as Promise<FreeDictionaryEntry[]>;
    }
  }

  return [];
}

function createEmptyResult(request: LookupRequest): LookupResult {
  return {
    selectedText: request.selectedText,
    normalizedText: request.normalizedText,
    provider: "external_dictionary_link",
    sourceSentence: request.sourceSentence,
    pageUrl: request.pageUrl,
    pageTitle: request.pageTitle,
    domain: request.domain,
    toeicUsefulness: classifyToeicUsefulness(request.normalizedText),
    contextType: classifyContext(request),
    externalUrl: createExternalUrl(request.selectedText),
    found: false
  };
}

function createExternalUrl(text: string): string {
  return `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(
    text
  )}`;
}
