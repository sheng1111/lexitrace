import type { LookupRequest, LookupResult } from "../core/types";
import { toTraditionalChinese } from "../core/chinese";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";
import { getLookupForms } from "./word-forms";

interface WiktapiResponse {
  entries?: WiktapiEntry[];
}

interface WiktapiEntry {
  lang?: string;
  lang_code?: string;
  pos?: string;
  senses?: WiktapiSense[];
  sounds?: Array<{
    ipa?: string;
    text?: string;
  }>;
}

interface WiktapiSense {
  glosses?: string[];
  translations?: WiktapiTranslation[];
}

interface WiktapiTranslation {
  word?: string;
  lang?: string;
  lang_code?: string;
  code?: string;
}

export class WiktapiProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    const lookup = await lookupEntry(request.normalizedText);

    if (!lookup) {
      return createEmptyResult(request);
    }

    const firstSense = lookup.entry.senses?.find((sense) => sense.glosses?.[0]);
    const chineseTranslations = collectChineseTranslations(lookup.entry);

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: "wiktapi",
      partOfSpeech: lookup.entry.pos,
      meaningZh: chineseTranslations,
      meaningEn: firstSense?.glosses?.[0],
      pronunciation: lookup.entry.sounds?.find((sound) => sound.ipa)?.ipa,
      sourceSentence: request.sourceSentence,
      pageUrl: request.pageUrl,
      pageTitle: request.pageTitle,
      domain: request.domain,
      toeicUsefulness: classifyToeicUsefulness(request.normalizedText),
      contextType: classifyContext(request),
      externalUrl: createExternalUrl(lookup.form),
      found: true
    };
  }
}

async function lookupEntry(
  normalizedText: string
): Promise<{ form: string; entry: WiktapiEntry } | undefined> {
  for (const form of getLookupForms(normalizedText)) {
    const response = await fetch(
      `https://api.wiktapi.dev/v1/en/word/${encodeURIComponent(form)}?lang=en`
    );

    if (!response.ok) {
      continue;
    }

    const data = (await response.json()) as WiktapiResponse;
    const entry = data.entries?.find((item) => item.senses?.some((sense) => sense.glosses?.[0]));

    if (entry) {
      return { form, entry };
    }
  }

  return undefined;
}

function collectChineseTranslations(entry: WiktapiEntry): string | undefined {
  const terms = new Set<string>();

  for (const sense of entry.senses ?? []) {
    for (const translation of sense.translations ?? []) {
      const language = `${translation.lang_code ?? ""} ${translation.code ?? ""} ${
        translation.lang ?? ""
      }`.toLowerCase();

      if (!/(zh|zho|cmn|chinese|mandarin)/.test(language) || !translation.word) {
        continue;
      }

      terms.add(toTraditionalChinese(translation.word));
    }
  }

  return terms.size > 0 ? [...terms].slice(0, 4).join("；") : undefined;
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
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(text)}`;
}
