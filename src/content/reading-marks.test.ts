import { describe, expect, it } from "vitest";
import { locateReadingMark, type ReadingMark } from "./reading-marks";

describe("persistent reading mark anchors", () => {
  const mark: ReadingMark = { id: "1", url: "https://example.com", text: "report", start: 7,
    before: "Second ", after: " is ready." };
  it("restores the intended occurrence after reload or insertion", () => {
    expect(locateReadingMark("First report. Second report is ready.", mark)).toBe(21);
    expect(locateReadingMark("New heading. First report. Second report is ready.", mark)).toBe(34);
  });
  it("does not mark an unrelated occurrence after text changes", () => {
    expect(locateReadingMark("First report. Second report is missing.", mark)).toBeUndefined();
  });
  it("does not guess when the quote and context are duplicated", () => {
    expect(locateReadingMark("Second report is ready. Second report is ready.", mark)).toBeUndefined();
  });
});
