import { describe, expect, it } from "vitest";
import { classifyContext, isTechnicalDomain } from "./rules";

describe("context classification", () => {
  it.each([
    ["Google shipped a new model", "Technical"],
    ["The package shipped yesterday", "Business"],
    ["Install the software package", "Technical"],
    ["We modelled the trip", "General"]
  ])("classifies %s as %s", (sourceSentence, expected) => {
    expect(classifyContext({
      normalizedText: "", sourceSentence, pageUrl: "", pageTitle: "", domain: ""
    })).toBe(expected);
  });
  it("matches hostname boundaries", () => {
    expect(isTechnicalDomain("news.smol.ai")).toBe(true);
    expect(isTechnicalDomain("notgithub.com")).toBe(false);
    expect(isTechnicalDomain("github.com.example.org")).toBe(false);
  });
});
