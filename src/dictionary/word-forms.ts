const IRREGULAR_LEMMAS: Readonly<Record<string, string>> = {
  am: "be",
  are: "be",
  been: "be",
  bought: "buy",
  brought: "bring",
  built: "build",
  came: "come",
  caught: "catch",
  children: "child",
  chose: "choose",
  chosen: "choose",
  did: "do",
  does: "do",
  done: "do",
  drove: "drive",
  driven: "drive",
  feet: "foot",
  felt: "feel",
  found: "find",
  gave: "give",
  geese: "goose",
  given: "give",
  gone: "go",
  got: "get",
  gotten: "get",
  grew: "grow",
  grown: "grow",
  had: "have",
  has: "have",
  held: "hold",
  is: "be",
  kept: "keep",
  knew: "know",
  known: "know",
  left: "leave",
  made: "make",
  men: "man",
  mice: "mouse",
  paid: "pay",
  people: "person",
  ran: "run",
  said: "say",
  saw: "see",
  seen: "see",
  sent: "send",
  spoke: "speak",
  spoken: "speak",
  taught: "teach",
  teeth: "tooth",
  thought: "think",
  took: "take",
  was: "be",
  went: "go",
  were: "be",
  women: "woman",
  written: "write",
  wrote: "write"
};

/**
 * Returns conservative English lemma candidates without shipping a multi-MB
 * linguistic model to every page. The matcher checks both directions, so only
 * the observed inflection needs to expose its likely base form.
 */
export function getLookupForms(normalizedText: string): string[] {
  const forms = new Set([normalizedText]);
  if (normalizedText.includes(" ") || !/^[a-z]+(?:'[a-z]+)?$/.test(normalizedText)) {
    return [...forms];
  }

  addForm(forms, IRREGULAR_LEMMAS[normalizedText]);
  addPluralForms(forms, normalizedText);
  addPastTenseForms(forms, normalizedText);
  addContinuousForms(forms, normalizedText);
  addComparisonForms(forms, normalizedText);
  return [...forms];
}

function addPluralForms(forms: Set<string>, value: string): void {
  if (value.endsWith("ies") && value.length > 4) {
    addForm(forms, `${value.slice(0, -3)}y`);
    return;
  }

  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(value) && value.length > 4) {
    addForm(forms, value.slice(0, -2));
    return;
  }

  if (
    value.endsWith("s") &&
    value.length > 3 &&
    !/(?:ss|us|is|ous|ics|ness|news|series)$/.test(value)
  ) {
    addForm(forms, value.slice(0, -1));
  }
}

function addPastTenseForms(forms: Set<string>, value: string): void {
  if (value.endsWith("ied") && value.length > 4) {
    addForm(forms, `${value.slice(0, -3)}y`);
    return;
  }

  if (!value.endsWith("ed") || value.length <= 4) {
    return;
  }

  const stem = value.slice(0, -2);
  addForm(forms, stem);
  addForm(forms, `${value.slice(0, -1)}`);
  addUndoubledForm(forms, stem);
}

function addContinuousForms(forms: Set<string>, value: string): void {
  if (!value.endsWith("ing") || value.length <= 5) {
    return;
  }

  const stem = value.slice(0, -3);
  addForm(forms, stem);
  addForm(forms, `${stem}e`);
  addUndoubledForm(forms, stem);
}

function addComparisonForms(forms: Set<string>, value: string): void {
  if (value.endsWith("iest") && value.length > 5) {
    addForm(forms, `${value.slice(0, -4)}y`);
  } else if (value.endsWith("ier") && value.length > 4) {
    addForm(forms, `${value.slice(0, -3)}y`);
  } else if (value.endsWith("est") && value.length > 5) {
    const stem = value.slice(0, -3);
    addForm(forms, stem);
    addUndoubledForm(forms, stem);
  } else if (value.endsWith("er") && value.length > 4) {
    const stem = value.slice(0, -2);
    addForm(forms, stem);
    addUndoubledForm(forms, stem);
  }
}

function addUndoubledForm(forms: Set<string>, value: string): void {
  const last = value.at(-1);
  const previous = value.at(-2);
  if (last && last === previous && /[b-df-hj-np-tv-z]/.test(last)) {
    addForm(forms, value.slice(0, -1));
  }
}

function addForm(forms: Set<string>, value: string | undefined): void {
  if (value && value.length > 1) {
    forms.add(value);
  }
}
