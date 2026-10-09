import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LookupRequest } from "../core/types";
import { getVocabularyById, putVocabulary } from "../storage/db";
import { mergeVocabularySnapshots, parseSheetValues, recordsToSheetValues } from "../sync/google-sheet-codec";

function request(sentence: string, patch: Partial<LookupRequest> = {}): LookupRequest {
  return {
    selectedText: "shipped", normalizedText: "shipped",
    sourceSentence: sentence, pageUrl: "https://news.smol.ai/article",
    pageTitle: "AI news", domain: "news.smol.ai", ...patch
  };
}

describe("contextual lookup integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("ecdict.mini.csv")) {
        return new Response("word,translation,pos\nshipped,已出貨,v\nship,運送,v\nresolution,解析度,n");
      }
      if (url.includes("translate.googleapis.com")) {
        return new Response(JSON.stringify([[["已出貨", "shipped"]]]));
      }
      return new Response("", { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])("selects the release sense with Google translation enabled=%s", async (enabled) => {
    const { lookupWord } = await import("./lookup-service");
    const result = await lookupWord(request("Google shipped a new model"), {
      useUnofficialGoogleTranslate: enabled
    });
    expect(result).toMatchObject({
      meaningZh: "已推出；已發布", contextType: "Technical", partOfSpeech: "verb",
      provider: enabled ? "unofficial_google_translate_api" : "ecdict_cdn"
    });
    expect(result.meaningEn).toContain("release");
  });

  it("keeps physical shipping even on a technical news domain", async () => {
    const { lookupWord } = await import("./lookup-service");
    expect(await lookupWord(request("The package shipped yesterday"), {
      useUnofficialGoogleTranslate: true
    })).toMatchObject({ meaningZh: "已出貨；已寄送", contextType: "Business" });
  });

  it.each([
    ["Google shipped", "已推出；已發布"],
    ["Google shipped a software package", "已推出；已發布"],
    ["Google shipped new phones", "已出貨；已寄送"],
    ["Google shipped a model car", "已出貨；已寄送"],
    ["The package shipped yesterday; Google announced a new model", "已出貨；已寄送"]
  ])("selects the sense in %s", async (sentence, meaningZh) => {
    const { lookupWord } = await import("./lookup-service");
    expect((await lookupWord(request(sentence))).meaningZh).toBe(meaningZh);
  });

  it("supports ship inflections without online providers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const { lookupWord } = await import("./lookup-service");
    for (const word of ["ship", "ships", "shipping", "shipped"]) {
      const result = await lookupWord(request(`Teams ${word} new features`, {
        selectedText: word, normalizedText: word
      }));
      expect(result.provider).toBe("local_dictionary");
      expect(result.meaningZh).toMatch(/推出.*發布/);
    }
  });

  it("retains resolution overrides outside ECDICT", async () => {
    const { lookupWord } = await import("./lookup-service");
    expect((await lookupWord(request("My new year resolution", {
      selectedText: "resolution", normalizedText: "resolution"
    }), { useUnofficialGoogleTranslate: true })).meaningZh).toContain("決心");
  });

  it("isolates full sentence context and reuses identical lookups", async () => {
    const { lookupWord } = await import("./lookup-service");
    const prefix = "Yesterday ".repeat(20);
    const tech = request(`${prefix}Google shipped a new model`);
    const first = await lookupWord(tech);
    const calls = vi.mocked(fetch).mock.calls.length;
    expect(await lookupWord(tech)).toBe(first);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    expect((await lookupWord(request(`${prefix}The package shipped yesterday`))).meaningZh).toContain("出貨");
    expect(first.meaningZh).toContain("推出");
  });

  it("isolates page metadata and delimiter characters in cache keys", async () => {
    const { lookupWord } = await import("./lookup-service");
    const first = await lookupWord(request("Google shipped", { pageTitle: "First" }));
    const second = await lookupWord(request("Google shipped", {
      pageTitle: "Second", pageUrl: "https://news.smol.ai/other"
    }));
    expect(first.pageTitle).toBe("First");
    expect(second.pageTitle).toBe("Second");
    const a = await lookupWord(request("sentence", { domain: "a|b" }));
    const b = await lookupWord(request("b|sentence", { domain: "a" }));
    expect(a.domain).toBe("a|b");
    expect(b.domain).toBe("a");
  });

  it("does not rewrite a saved or Sheet-synced learning record during lookup", async () => {
    const legacy = parseSheetValues([
      ["id", "text", "normalized_text", "meaning_zh", "source_sentence", "updated_at", "note", "remember_count"],
      ["saved-shipped", "shipped", "shipped", "已出貨", "Google shipped", "2026-09-13T00:00:00.000Z", "個人筆記", "5"]
    ]).records[0];
    await putVocabulary(legacy);
    const { lookupWord } = await import("./lookup-service");
    expect((await lookupWord(request("Google shipped a new model"))).meaningZh).toContain("推出");
    expect(await getVocabularyById(legacy.id)).toEqual(legacy);
    const merged = mergeVocabularySnapshots([legacy], [legacy]);
    expect(parseSheetValues(recordsToSheetValues(merged.records)).records[0]).toMatchObject({
      meaning_zh: "已出貨", user_note: "個人筆記", remember_count: 5,
      updated_at: "2026-09-13T00:00:00.000Z"
    });
  });
});
