export interface ReadingMark {
  id: string;
  url: string;
  text: string;
  start: number;
  before: string;
  after: string;
}

// Only restore an unambiguous quote; changed pages must not mark the wrong occurrence.
export function locateReadingMark(text: string, mark: ReadingMark): number | undefined {
  const matches: number[] = [];
  let cursor = 0;
  while (mark.text && cursor <= text.length) {
    const index = text.indexOf(mark.text, cursor);
    if (index < 0) break;
    if ((!mark.before || text.slice(Math.max(0, index - mark.before.length), index) === mark.before) &&
      (!mark.after || text.slice(index + mark.text.length, index + mark.text.length + mark.after.length) === mark.after)) {
      matches.push(index);
    }
    cursor = index + 1;
  }
  return matches.length === 1 ? matches[0] : undefined;
}
