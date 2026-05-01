import type { LookupRequest, LookupResult } from "../core/types";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";
import { getLookupForms } from "./word-forms";

interface DatamuseWord {
  word: string;
  tags?: string[];
  defs?: string[];
}

export class DatamuseProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    if (request.normalizedText.includes(" ")) {
      return createEmptyResult(request);
    }

    const exact = await lookupExactWord(request.normalizedText);
    const definition = exact?.defs?.[0];

    if (!exact || !definition) {
      return createEmptyResult(request);
    }

    const [partOfSpeech, ...definitionParts] = definition.split("\t");

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: "datamuse_api",
      partOfSpeech: normalizePartOfSpeech(partOfSpeech),
      meaningEn: definitionParts.join(" ").trim() || definition,
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

async function lookupExactWord(normalizedText: string): Promise<DatamuseWord | undefined> {
  for (const form of getLookupForms(normalizedText)) {
    const response = await fetch(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(form)}&md=dp&max=1`
    );

    if (!response.ok) {
      continue;
    }

    const results = (await response.json()) as DatamuseWord[];
    const exact = results.find((item) => item.word.toLowerCase() === form);

    if (exact) {
      return exact;
    }
  }

  return undefined;
}

function normalizePartOfSpeech(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const mapping: Record<string, string> = {
    n: "noun",
    v: "verb",
    adj: "adjective",
    adv: "adverb"
  };

  return mapping[value] ?? value;
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
