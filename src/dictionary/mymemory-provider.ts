import type { LookupRequest, LookupResult } from "../core/types";
import { toTraditionalChinese } from "../core/chinese";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
    match?: number;
  };
  responseStatus?: number;
}

export class MyMemoryProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        request.selectedText
      )}&langpair=en|zh-TW`
    );

    if (!response.ok) {
      return createEmptyResult(request);
    }

    const data = (await response.json()) as MyMemoryResponse;
    const translatedText = data.responseData?.translatedText?.trim();

    if (!translatedText || translatedText.toLowerCase() === request.normalizedText) {
      return createEmptyResult(request);
    }

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: "mymemory_translation_api",
      meaningZh: toTraditionalChinese(translatedText),
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
