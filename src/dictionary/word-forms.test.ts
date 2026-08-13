import { describe, expect, it } from "vitest";
import { getLookupForms } from "./word-forms";

describe("getLookupForms", () => {
  it.each([
    ["mitigated", "mitigate"],
    ["planning", "plan"],
    ["companies", "company"],
    ["boxes", "box"],
    ["earlier", "early"],
    ["written", "write"],
    ["people", "person"]
  ])("maps %s to the likely base form %s", (word, base) => {
    expect(getLookupForms(word)).toContain(base);
  });

  it.each(["news", "analysis", "business", "continuous"])(
    "does not strip a lexical trailing s from %s",
    (word) => {
      expect(getLookupForms(word)).not.toContain(word.slice(0, -1));
    }
  );

  it("does not transform phrases or non-word identifiers", () => {
    expect(getLookupForms("in order")).toEqual(["in order"]);
    expect(getLookupForms("word2")).toEqual(["word2"]);
  });
});
