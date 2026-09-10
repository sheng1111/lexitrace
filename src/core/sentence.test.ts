import { describe, expect, it } from "vitest";
import { extractSentenceAroundSelection as extract } from "./sentence";

describe("selection context", () => {
  it("uses the selected occurrence instead of the first matching word", () => {
    const text = "The report is ready. Please send the report tomorrow.";
    expect(extract(text, "report", text.lastIndexOf("report"))).toBe("Please send the report tomorrow.");
  });
  it("preserves titles, decimal values and abbreviations", () => {
    expect(extract("Hello. Dr. Lee paid 3.50 at the U.S. office. Goodbye.", "paid"))
      .toBe("Dr. Lee paid 3.50 at the U.S. office.");
  });
  it("preserves semicolons and closing quotation marks", () => {
    expect(extract('He said, "Please wait; we need approval." Then left.', "approval"))
      .toBe('He said, "Please wait; we need approval."');
  });
  it("maps DOM offsets through repeated whitespace", () => {
    const text = "  First report.\n\n  Second   report is ready.";
    expect(extract(text, "report", text.lastIndexOf("report"))).toBe("Second report is ready.");
  });
  it("retains all selected sentences and never returns unrelated context", () => {
    expect(extract("One. Two. Three.", "Two. Three.")).toBe("Two. Three.");
    expect(extract("Unrelated text.", "missing")).toBe("missing");
    expect(extract("Text.", "")).toBe("");
  });
});
