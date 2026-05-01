import type { LookupRequest, LookupResult } from "../core/types";
import { toTraditionalChinese } from "../core/chinese";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";

type GoogleTranslateResponse = [
  Array<[string, string, unknown, unknown, number?]>,
  string?,
  unknown?
];

export class GoogleTranslateProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    const response = await fetch(createTranslateUrl(request.selectedText));

    if (!response.ok) {
      return createEmptyResult(request);
    }

    const data = (await response.json()) as GoogleTranslateResponse;
    const translatedText = data[0]
      ?.map((segment) => segment[0])
      .join("")
      .trim();

    if (!translatedText || translatedText.toLowerCase() === request.normalizedText) {
      return createEmptyResult(request);
    }

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: "unofficial_google_translate_api",
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

function createTranslateUrl(text: string): string {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: "zh-TW",
    dt: "t",
    q: text
  });

  return `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
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
  return `https://translate.google.com/?sl=en&tl=zh-TW&text=${encodeURIComponent(
    text
  )}&op=translate`;
}
