import type { LookupRequest, LookupResult } from "../core/types";
import { toTraditionalChinese } from "../core/chinese";
import type { DictionaryProvider } from "./provider";
import { classifyContext, classifyToeicUsefulness } from "./rules";
import { getLookupForms } from "./word-forms";

const ECDICT_MINI_CSV_URL =
  "https://cdn.jsdelivr.net/gh/skywind3000/ECDICT@master/ecdict.mini.csv";

interface EcdictEntry {
  word: string;
  phonetic?: string;
  definition?: string;
  translation?: string;
  pos?: string;
  tag?: string;
}

let dictionaryPromise: Promise<Map<string, EcdictEntry>> | undefined;

export class EcdictCdnProvider implements DictionaryProvider {
  async lookup(request: LookupRequest): Promise<LookupResult> {
    if (request.normalizedText.includes(" ")) {
      return createEmptyResult(request);
    }

    const dictionary = await loadDictionary();
    const matched = getLookupForms(request.normalizedText)
      .map((form) => ({ form, entry: dictionary.get(form) }))
      .find((item) => item.entry);
    const entry = matched?.entry;

    if (!entry?.translation) {
      return createEmptyResult(request);
    }

    return {
      selectedText: request.selectedText,
      normalizedText: request.normalizedText,
      provider: "ecdict_cdn",
      partOfSpeech: normalizePartOfSpeech(entry.pos),
      meaningZh: applyContextOverride(
        request,
        normalizeTranslation(entry.translation),
        matched?.form
      ),
      meaningEn: normalizeDefinition(entry.definition),
      pronunciation: entry.phonetic,
      sourceSentence: request.sourceSentence,
      pageUrl: request.pageUrl,
      pageTitle: request.pageTitle,
      domain: request.domain,
      toeicUsefulness:
        classifyToeicUsefulness(request.normalizedText, entry.tag),
      contextType: classifyContext(request),
      externalUrl: createExternalUrl(request.selectedText),
      found: true
    };
  }
}

async function loadDictionary(): Promise<Map<string, EcdictEntry>> {
  dictionaryPromise ??= fetch(ECDICT_MINI_CSV_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error("ECDICT CDN lookup failed.");
      }

      return response.text();
    })
    .then(parseDictionary);

  return dictionaryPromise;
}

function parseDictionary(csv: string): Map<string, EcdictEntry> {
  const rows = parseCsv(csv);
  const entries = new Map<string, EcdictEntry>();
  const header = rows.shift() ?? [];
  const index = Object.fromEntries(header.map((name, position) => [name, position]));

  for (const row of rows) {
    const word = row[index.word]?.trim().toLowerCase();

    if (!word) {
      continue;
    }

    entries.set(word, {
      word,
      phonetic: row[index.phonetic],
      definition: row[index.definition],
      translation: row[index.translation],
      pos: row[index.pos],
      tag: row[index.tag]
    });
  }

  return entries;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeTranslation(value: string): string {
  return toTraditionalChinese(
    value.replace(/\\n/g, "；").replace(/\s+/g, " ").trim()
  );
}

function normalizeDefinition(value?: string): string | undefined {
  return value?.replace(/\\n/g, "; ").replace(/\s+/g, " ").trim() || undefined;
}

function normalizePartOfSpeech(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const first = value.split("/")[0]?.split(":")[0];

  return first || undefined;
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

function applyContextOverride(
  request: LookupRequest,
  translation: string,
  matchedForm?: string
): string {
  const haystack = `${request.normalizedText} ${request.sourceSentence}`.toLowerCase();

  if (
    (request.normalizedText === "resolution" ||
      request.normalizedText === "resolutions" ||
      matchedForm === "resolution") &&
    /(new year|goal|goals|change|life)/.test(haystack)
  ) {
    return "決心；新年目標；下定決心要做的事";
  }

  return translation;
}
