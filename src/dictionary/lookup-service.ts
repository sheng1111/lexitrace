import type { LookupRequest, LookupResult } from "../core/types";
import { DatamuseProvider } from "./datamuse-provider";
import { EcdictCdnProvider } from "./ecdict-cdn-provider";
import { FreeDictionaryProvider } from "./free-dictionary-provider";
import { GoogleTranslateProvider } from "./google-translate-provider";
import { LocalDictionaryProvider } from "./local-provider";
import { MyMemoryProvider } from "./mymemory-provider";
import { WiktapiProvider } from "./wiktapi-provider";

const ecdictProvider = new EcdictCdnProvider();
const freeDictionaryProvider = new FreeDictionaryProvider();
const wiktapiProvider = new WiktapiProvider();
const datamuseProvider = new DatamuseProvider();
const googleTranslateProvider = new GoogleTranslateProvider();
const myMemoryProvider = new MyMemoryProvider();
const localDictionaryProvider = new LocalDictionaryProvider();
const lookupCache = new Map<string, Promise<LookupResult>>();

export async function lookupWord(
  request: LookupRequest,
  options: { useUnofficialGoogleTranslate?: boolean } = {}
): Promise<LookupResult> {
  const cacheKey = createCacheKey(request, options);
  const cached = lookupCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const lookupPromise = lookupWordWithoutCache(request, options);
  lookupCache.set(cacheKey, lookupPromise);
  return lookupPromise;
}

async function lookupWordWithoutCache(
  request: LookupRequest,
  options: { useUnofficialGoogleTranslate?: boolean }
): Promise<LookupResult> {
  const [googleTranslate, ecdict, freeDictionary, wiktapi, datamuse, local] = await Promise.all([
    options.useUnofficialGoogleTranslate
      ? tryLookup(() => googleTranslateProvider.lookup(request), 2200)
      : Promise.resolve(undefined),
    tryLookup(() => ecdictProvider.lookup(request), 2500),
    tryLookup(() => freeDictionaryProvider.lookup(request), 1800),
    tryLookup(() => wiktapiProvider.lookup(request), 2200),
    tryLookup(() => datamuseProvider.lookup(request), 1800),
    tryLookup(() => localDictionaryProvider.lookup(request), 200)
  ]);

  const firstPass = await mergeLookupResults(
    request,
    options.useUnofficialGoogleTranslate
      ? [googleTranslate, ecdict, freeDictionary, wiktapi, datamuse, local]
      : [ecdict, freeDictionary, wiktapi, datamuse, local]
  );

  if (firstPass.meaningZh) {
    return firstPass;
  }

  const translation = await tryLookup(() => myMemoryProvider.lookup(request), 2500);

  return mergeLookupResults(request, [
    ecdict,
    translation,
    freeDictionary,
    wiktapi,
    datamuse,
    local
  ]);
}

async function tryLookup(
  lookup: () => Promise<LookupResult>,
  timeoutMs: number
): Promise<LookupResult | undefined> {
  try {
    const result = await withTimeout(lookup(), timeoutMs);
    return result.found ? result : undefined;
  } catch (error) {
    console.warn("[LexiTrace] Dictionary provider failed", error);
    return undefined;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(new Error(`Lookup timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => globalThis.clearTimeout(timeout));
  });
}

function mergeLookupResults(
  request: LookupRequest,
  results: Array<LookupResult | undefined>
): Promise<LookupResult> | LookupResult {
  const found = results.filter((result): result is LookupResult => Boolean(result));
  const primary = found[0];
  const english = found.find((result) => result.meaningEn);

  if (!primary) {
    return localDictionaryProvider.lookup(request);
  }

  return {
    ...primary,
    meaningZh: primary.meaningZh ?? found.find((result) => result.meaningZh)?.meaningZh,
    meaningEn: primary.meaningEn ?? english?.meaningEn,
    partOfSpeech: primary.partOfSpeech ?? english?.partOfSpeech,
    pronunciation: primary.pronunciation ?? english?.pronunciation,
    found: true
  };
}

function createCacheKey(
  request: LookupRequest,
  options: { useUnofficialGoogleTranslate?: boolean }
): string {
  return [
    options.useUnofficialGoogleTranslate ? "google_unofficial" : "standard",
    request.normalizedText,
    request.domain,
    request.sourceSentence.slice(0, 160)
  ].join("|");
}
