export function extractSentenceAroundSelection(
  containerText: string,
  selectedText: string
): string {
  const cleanText = containerText.replace(/\s+/g, " ").trim();
  const cleanSelection = selectedText.replace(/\s+/g, " ").trim();
  const index = cleanText.toLowerCase().indexOf(cleanSelection.toLowerCase());

  if (index < 0) {
    return cleanText.slice(0, 240);
  }

  const before = cleanText.slice(0, index);
  const after = cleanText.slice(index + cleanSelection.length);
  const sentenceStart = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("?"),
    before.lastIndexOf("!"),
    before.lastIndexOf(";")
  );
  const sentenceEndCandidates = [after.indexOf("."), after.indexOf("?"), after.indexOf("!")].filter(
    (position) => position >= 0
  );
  const sentenceEnd =
    sentenceEndCandidates.length > 0 ? Math.min(...sentenceEndCandidates) : -1;

  const start = sentenceStart >= 0 ? sentenceStart + 1 : 0;
  const end =
    sentenceEnd >= 0
      ? index + cleanSelection.length + sentenceEnd + 1
      : Math.min(cleanText.length, index + cleanSelection.length + 160);

  return cleanText.slice(start, end).trim();
}

