import { normalizeText } from "../core/normalize";
import type { VocabularyRecord } from "../core/types";
import { getLookupForms } from "../dictionary/word-forms";

export interface VocabularyMatch {
  index: number;
  text: string;
  record: VocabularyRecord;
}

export interface VocabularyMatcher {
  readonly wordRecordsByForm: ReadonlyMap<string, readonly VocabularyRecord[]>;
  readonly phrases: readonly CompiledPhrase[];
}

const ENGLISH_TOKEN_PATTERN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
const lookupFormsCache = new Map<string, ReadonlySet<string>>();
const MAX_FORM_CACHE_SIZE = 5000;

/**
 * Finds the earliest saved word or phrase without matching inside a larger word.
 * For single words, the token is lemmatized so a saved base form can match a
 * natural inflection on the page (for example, "mitigate" and "mitigated").
 */
export function findNextVocabularyMatch(
  text: string,
  records: VocabularyRecord[]
): VocabularyMatch | undefined {
  return findVocabularyMatches(text, createVocabularyMatcher(records))[0];
}

/** Builds the reusable lookup index used while every text node on a page is scanned. */
export function createVocabularyMatcher(
  records: readonly VocabularyRecord[]
): VocabularyMatcher {
  const wordRecordsByForm = new Map<string, VocabularyRecord[]>();
  const phrases: CompiledPhrase[] = [];

  for (const record of records) {
    if (record.is_phrase) {
      phrases.push({
        record,
        pattern: createBoundedPattern(record.normalized_text, "gi")
      });
      continue;
    }

    for (const form of getCachedLookupForms(record.normalized_text)) {
      const matchingRecords = wordRecordsByForm.get(form);
      if (matchingRecords) {
        matchingRecords.push(record);
      } else {
        wordRecordsByForm.set(form, [record]);
      }
    }
  }

  return { wordRecordsByForm, phrases };
}

/**
 * Finds every non-overlapping match in one tokenization pass. When a word and a
 * phrase begin together, the longer match wins, matching the page-highlighting
 * behavior of the original repeated search.
 */
export function findVocabularyMatches(
  text: string,
  matcher: VocabularyMatcher
): VocabularyMatch[] {
  const candidates: VocabularyMatch[] = [];

  for (const token of collectWordTokens(text)) {
    const matchingRecords = new Map<string, VocabularyRecord>();
    for (const form of token.forms) {
      for (const record of matcher.wordRecordsByForm.get(form) ?? []) {
        matchingRecords.set(record.id, record);
      }
    }

    for (const record of matchingRecords.values()) {
      candidates.push({ index: token.index, text: token.text, record });
    }
  }

  for (const phrase of matcher.phrases) {
    phrase.pattern.lastIndex = 0;
    for (const match of text.matchAll(phrase.pattern)) {
      candidates.push({
        index: match.index + match[1].length,
        text: match[2],
        record: phrase.record
      });
    }
  }

  candidates.sort(
    (a, b) =>
      a.index - b.index ||
      b.text.length - a.text.length
  );

  const matches: VocabularyMatch[] = [];
  let nextAvailableIndex = 0;
  for (const candidate of candidates) {
    if (candidate.index < nextAvailableIndex) {
      continue;
    }
    matches.push(candidate);
    nextAvailableIndex = candidate.index + candidate.text.length;
  }

  return matches;
}

export function createClozeSentence(sentence: string, answer: string): string {
  const normalizedAnswer = normalizeText(answer);
  if (!sentence.trim() || !normalizedAnswer) {
    return sentence;
  }

  if (normalizedAnswer.includes(" ")) {
    const match = findBoundedText(sentence, normalizedAnswer);
    return match
      ? `${sentence.slice(0, match.index)}______${sentence.slice(match.index + match.text.length)}`
      : sentence;
  }

  const answerForms = getCachedLookupForms(normalizedAnswer);
  for (const token of collectWordTokens(sentence)) {
    if (
      token.forms.has(normalizedAnswer) ||
      answerForms.has(token.normalized)
    ) {
      return `${sentence.slice(0, token.index)}______${sentence.slice(token.index + token.text.length)}`;
    }
  }

  return sentence;
}

interface WordToken {
  index: number;
  text: string;
  normalized: string;
  forms: ReadonlySet<string>;
}

interface CompiledPhrase {
  record: VocabularyRecord;
  pattern: RegExp;
}

function collectWordTokens(text: string): WordToken[] {
  return [...text.matchAll(ENGLISH_TOKEN_PATTERN)].map((match) => {
    const token = match[0];
    const normalized = normalizeText(token);
    return {
      index: match.index,
      text: token,
      normalized,
      forms: getCachedLookupForms(normalized)
    };
  });
}

function findBoundedText(
  text: string,
  normalizedValue: string
): { index: number; text: string } | undefined {
  const match = createBoundedPattern(normalizedValue, "i").exec(text);

  if (!match) {
    return undefined;
  }

  return {
    index: match.index + match[1].length,
    text: match[2]
  };
}

function createBoundedPattern(value: string, flags: string): RegExp {
  const flexibleWhitespace = value
    .split(" ")
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(
    `(^|[^A-Za-z])(${flexibleWhitespace})(?=$|[^A-Za-z])`,
    flags
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCachedLookupForms(value: string): ReadonlySet<string> {
  const cached = lookupFormsCache.get(value);
  if (cached) {
    return cached;
  }

  if (lookupFormsCache.size >= MAX_FORM_CACHE_SIZE) {
    lookupFormsCache.clear();
  }

  const forms = new Set(getLookupForms(value));
  lookupFormsCache.set(value, forms);
  return forms;
}
