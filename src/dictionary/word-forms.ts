import lemmatizer from "wink-lemmatizer";

export function getLookupForms(normalizedText: string): string[] {
  const forms = new Set([normalizedText]);

  if (normalizedText.includes(" ")) {
    return [...forms];
  }

  addLemma(forms, lemmatizer.noun(normalizedText));
  addLemma(forms, lemmatizer.verb(normalizedText));
  addLemma(forms, lemmatizer.adjective(normalizedText));

  if (normalizedText.endsWith("ies") && normalizedText.length > 4) {
    forms.add(`${normalizedText.slice(0, -3)}y`);
  }

  if (normalizedText.endsWith("es") && normalizedText.length > 3) {
    forms.add(normalizedText.slice(0, -2));
  }

  if (normalizedText.endsWith("s") && normalizedText.length > 3) {
    forms.add(normalizedText.slice(0, -1));
  }

  if (normalizedText.endsWith("ing") && normalizedText.length > 5) {
    forms.add(normalizedText.slice(0, -3));
    forms.add(`${normalizedText.slice(0, -3)}e`);
  }

  if (normalizedText.endsWith("ed") && normalizedText.length > 4) {
    forms.add(normalizedText.slice(0, -2));
    forms.add(`${normalizedText.slice(0, -1)}`);
  }

  return [...forms];
}

function addLemma(forms: Set<string>, lemma: string): void {
  if (lemma && lemma.length > 1) {
    forms.add(lemma);
  }
}
