export function extractSentenceAroundSelection(
  containerText: string,
  selectedText: string,
  selectionOffset?: number
): string {
  const cleanText = containerText.replace(/\s+/g, " ").trim();
  const cleanSelection = selectedText.replace(/\s+/g, " ").trim();
  if (!cleanSelection) return "";
  const index = selectionOffset === undefined
    ? cleanText.toLowerCase().indexOf(cleanSelection.toLowerCase())
    : containerText.slice(0, selectionOffset).replace(/\s+/g, " ").trimStart().length;

  if (index < 0) {
    return cleanSelection;
  }

  const protectedText = cleanText.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\.|\b(?:[A-Za-z]\.){2,}|\b[A-Z]\.(?=\s+[A-Z])|\d\.(?=\d)/g,
    (match) => match.replace(/\./g, "\u0000"));
  const boundaries = [0];
  for (const match of protectedText.matchAll(/[.!?。！？]+["'”’)]*(?:\s+|$)/g)) {
    boundaries.push(match.index! + match[0].length);
  }
  boundaries.push(cleanText.length);
  const start = boundaries.filter((value) => value <= index).at(-1) ?? 0;
  const end = boundaries.find((value) => value >= index + cleanSelection.length) ?? cleanText.length;

  return cleanText.slice(start, end).trim();
}
