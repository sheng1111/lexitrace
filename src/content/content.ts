import {
  sendRuntimeMessage,
  type RuntimeMessage,
  type RuntimeResponseMap
} from "../core/messages";
import { t } from "../core/i18n";
import { getDomain, normalizeText } from "../core/normalize";
import { SETTINGS_KEY } from "../core/settings";
import { extractSentenceAroundSelection } from "../core/sentence";
import type {
  ExtensionSettings,
  LookupResult,
  VocabularyRecord
} from "../core/types";
import {
  createClozeSentence,
  createVocabularyMatcher,
  findVocabularyMatches,
  type VocabularyMatcher
} from "./matching";
import styles from "./content.css?inline";

const ROOT_ATTRIBUTE = "data-lexitrace-root";
const HIGHLIGHT_ATTRIBUTE = "data-lexitrace-highlight";
const VOCABULARY_ID_ATTRIBUTE = "data-lexitrace-vocabulary-id";
const REVIEW_PROMPT_LAST_SHOWN_KEY = "lexitrace.reviewPromptLastShownAt";
const REVIEW_PROMPT_DISMISS_COUNT_KEY = "lexitrace.reviewPromptDismissCount";
const REVIEW_PROMPT_COOLDOWN_MS = 30 * 60 * 1000;

let lookupPopup: HTMLElement | undefined;
let recallPopup: HTMLElement | undefined;
let pageBubble: HTMLElement | undefined;
let reviewPrompt: HTMLElement | undefined;
let hiddenHighlights = false;
let bubbleReviewQueue: VocabularyRecord[] = [];
let bubbleReviewIndex = 0;
let bubbleReviewShowAnswer = false;
let bubbleReviewMode: "recall" | "cloze" = "recall";
let bubbleReviewAnswer:
  | { selected: string; correct: boolean }
  | undefined;
let bubbleReviewRememberedCount = 0;
let bubbleReviewOptions: string[] = [];
let bubbleReviewSaving = false;
let activeVocabulary: VocabularyRecord[] = [];
let settings: ExtensionSettings | undefined;
let uiHost: HTMLElement | undefined;
let uiRoot: ShadowRoot | undefined;
let lookupAnchorRect: DOMRect | undefined;
let recallAnchorRect: DOMRect | undefined;
let extensionContextActive = true;
let reviewPromptScheduled = false;
let lookupRequestVersion = 0;
let highlightRefreshVersion = 0;
let contentObserver: MutationObserver | undefined;
let contentRefreshTimer: number | undefined;
let suppressContentObserver = false;
let lastPageScrollAt = 0;
const exposedVocabularyIds = new Set<string>();

void boot();

async function sendMessage<T extends RuntimeMessage["type"]>(
  message: Extract<RuntimeMessage, { type: T }>
): Promise<RuntimeResponseMap[T]> {
  if (!extensionContextActive || !hasRuntimeContext()) {
    throw new Error("Extension context invalidated.");
  }

  try {
    return await sendRuntimeMessage(message);
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      shutdownInvalidatedContext();
    }

    throw error;
  }
}

async function boot(): Promise<void> {
  try {
    injectStyles();
    settings = await sendMessage({ type: "GET_SETTINGS" });

    document.addEventListener("mouseup", handleSelectionEvent);
    document.addEventListener("keyup", handleSelectionEvent);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    chrome.storage.onChanged.addListener(handleStorageChange);
    startContentObserver();

    if (!settings.extensionEnabled) {
      return;
    }

    await refreshHighlights();
  } catch (error) {
    handleRuntimeFailure(error);
  }
}

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== "local" || !changes[SETTINGS_KEY]?.newValue) {
    return;
  }

  settings = changes[SETTINGS_KEY].newValue as ExtensionSettings;
  startContentObserver();
  void refreshHighlights().catch(handleRuntimeFailure);
}

function handleRuntimeFailure(error: unknown): void {
  if (isContextInvalidatedError(error)) {
    shutdownInvalidatedContext();
    return;
  }

  console.warn("[LexiTrace] Content script runtime failure", error);
  closePopups();
}

function isContextInvalidatedError(error: unknown): boolean {
  if (!hasRuntimeContext()) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /Extension context invalidated|context invalidated|Receiving end does not exist/i.test(
    message
  );
}

function hasRuntimeContext(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function shutdownInvalidatedContext(): void {
  extensionContextActive = false;
  closePopups();
  removePageBubble();
  closeReviewPrompt();
  clearHighlights();
  uiHost?.remove();
  uiHost = undefined;
  uiRoot = undefined;

  document.removeEventListener("mouseup", handleSelectionEvent);
  document.removeEventListener("keyup", handleSelectionEvent);
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("click", handleDocumentClick, true);
  window.removeEventListener("resize", handleViewportChange);
  window.removeEventListener("scroll", handleViewportChange, true);

  contentObserver?.disconnect();
  contentObserver = undefined;
  if (contentRefreshTimer !== undefined) {
    window.clearTimeout(contentRefreshTimer);
    contentRefreshTimer = undefined;
  }

  try {
    chrome.storage?.onChanged?.removeListener(handleStorageChange);
  } catch {
    // The extension context is already gone; page cleanup above is enough.
  }
}

function injectStyles(): void {
  if (!document.getElementById("lexitrace-style")) {
    const pageStyle = document.createElement("style");
    pageStyle.id = "lexitrace-style";
    pageStyle.textContent = styles;
    document.documentElement.append(pageStyle);
  }

  if (uiRoot) {
    return;
  }

  uiHost = document.createElement("div");
  uiHost.id = "lexitrace-ui-root";
  uiHost.setAttribute(ROOT_ATTRIBUTE, "true");
  uiRoot = uiHost.attachShadow({ mode: "open" });

  const shadowStyle = document.createElement("style");
  shadowStyle.textContent = styles;
  uiRoot.append(shadowStyle);
  document.documentElement.append(uiHost);
}

function handleSelectionEvent(event: MouseEvent | KeyboardEvent): void {
  if (!extensionContextActive || !settings?.extensionEnabled) {
    return;
  }

  if (uiHost && event.composedPath().includes(uiHost)) {
    return;
  }

  window.setTimeout(() => {
    const payload = getSelectionPayload();

    if (!payload) {
      return;
    }

    void showLookupPopup(payload).catch(handleRuntimeFailure);
  }, 0);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closePopups();
    closeReviewPrompt();
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const target = event.target;
  const highlight = target instanceof HTMLElement
    ? target.closest<HTMLElement>(`[${HIGHLIGHT_ATTRIBUTE}]`)
    : null;
  if (highlight) {
    event.preventDefault();
    openRecallPopup(highlight);
  }
}

function handleViewportChange(event: Event): void {
  if (uiHost && event.composedPath().includes(uiHost)) {
    return;
  }

  if (event.type === "scroll") {
    lastPageScrollAt = Date.now();
  }
  closePopups();
}

function startContentObserver(): void {
  if (contentObserver || !document.body) {
    return;
  }

  contentObserver = new MutationObserver((mutations) => {
    if (
      suppressContentObserver ||
      hiddenHighlights ||
      !settings?.extensionEnabled ||
      !settings.highlightsEnabled ||
      !mutations.some(hasRelevantTextMutation)
    ) {
      return;
    }

    if (contentRefreshTimer !== undefined) {
      window.clearTimeout(contentRefreshTimer);
    }
    contentRefreshTimer = window.setTimeout(() => {
      contentRefreshTimer = undefined;
      void refreshHighlights().catch(handleRuntimeFailure);
    }, 450);
  });

  contentObserver.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function hasRelevantTextMutation(mutation: MutationRecord): boolean {
  if (mutation.type === "characterData") {
    return /[A-Za-z]/.test(mutation.target.nodeValue ?? "");
  }

  return [...mutation.addedNodes].some((node) =>
    /[A-Za-z]/.test(node.textContent ?? "")
  );
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target;
  const path = event.composedPath();

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const highlight = target.closest<HTMLElement>(`[${HIGHLIGHT_ATTRIBUTE}]`);
  if (highlight) {
    event.preventDefault();
    event.stopPropagation();
    openRecallPopup(highlight);
    return;
  }

  if (!uiHost || !path.includes(uiHost)) {
    closePopups();
  }
}

function getSelectionPayload():
  | {
      text: string;
      normalizedText: string;
      sourceSentence: string;
      rect: DOMRect;
    }
  | undefined {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();

  if (!isReasonableEnglishSelection(text) || isInsideBlockedElement(range.commonAncestorContainer)) {
    return undefined;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return undefined;
  }

  const containerText = range.commonAncestorContainer.textContent ?? text;

  return {
    text,
    normalizedText: normalizeText(text),
    sourceSentence: extractSentenceAroundSelection(containerText, text),
    rect
  };
}

function isReasonableEnglishSelection(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);

  return (
    words.length >= 1 &&
    words.length <= 8 &&
    normalized.length <= 96 &&
    /^[A-Za-z][A-Za-z\s'-]*$/.test(normalized)
  );
}

function isInsideBlockedElement(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const blockedSelectors = [
    `[${ROOT_ATTRIBUTE}]`,
    "script",
    "style",
    "input",
    "textarea",
    "select",
    "option",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']"
  ];

  if (settings?.disableInCodeBlocks !== false) {
    blockedSelectors.push("pre", "code");
  }

  return Boolean(
    element?.closest(blockedSelectors.join(","))
  );
}

async function showLookupPopup(payload: {
  text: string;
  normalizedText: string;
  sourceSentence: string;
  rect: DOMRect;
}): Promise<void> {
  closePopups();
  const requestVersion = ++lookupRequestVersion;

  lookupAnchorRect = payload.rect;
  lookupPopup = createPopupShell(payload.rect);
  lookupPopup.setAttribute("aria-busy", "true");
  lookupPopup.append(
    createTextElement("p", "lexitrace-popup__loading", t("lookingUp"))
  );
  appendToUiRoot(lookupPopup);
  positionPopupWithinViewport(lookupPopup, payload.rect);

  const lookup = await sendMessage({
    type: "LOOKUP_SELECTION",
    payload: {
      selectedText: payload.text,
      normalizedText: payload.normalizedText,
      sourceSentence: payload.sourceSentence,
      pageUrl: location.href,
      pageTitle: document.title,
      domain: getDomain(location.href)
    }
  });

  if (requestVersion !== lookupRequestVersion || !lookupPopup) {
    return;
  }

  renderLookupPopup(lookup);
}

function renderLookupPopup(lookup: LookupResult): void {
  if (!lookupPopup) {
    return;
  }

  lookupPopup.removeAttribute("aria-busy");
  lookupPopup.replaceChildren();

  const title = createTextElement("h2", "lexitrace-popup__title", lookup.selectedText);
  const meta = createTextElement(
    "div",
    "lexitrace-popup__meta",
    [lookup.partOfSpeech ?? t("dictionaryLookup"), lookup.pronunciation]
      .filter(Boolean)
      .join(" · ")
  );
  lookupPopup.append(title, meta);

  appendSection(
    lookupPopup,
    t("meaning"),
    lookup.meaningZh || t("noMeaning")
  );

  if (lookup.meaningEn) {
    appendSection(lookupPopup, t("englishHint"), lookup.meaningEn);
  }

  appendSentenceSection(lookupPopup, t("sourceSentence"), lookup.sourceSentence);
  appendBadges(lookupPopup, lookup);
  appendManualEditSection(lookupPopup, lookup);

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  if ("speechSynthesis" in window) {
    actions.append(createSpeakButton(lookup.selectedText));
  }

  if (lookup.externalUrl) {
    actions.append(createLinkButton(t("openDictionary"), lookup.externalUrl));
  }

  const understoodButton = createButton(t("understood"));
  understoodButton.addEventListener("click", () => {
    void saveLookup(lookup, "understood").catch(handleRuntimeFailure);
  });

  const saveButton = createButton(t("save"), true);
  saveButton.addEventListener("click", () => {
    void saveLookup(lookup, "save").catch(handleRuntimeFailure);
  });

  actions.append(understoodButton, saveButton);
  lookupPopup.append(actions);
  animateContentChange(lookupPopup);
  positionPopupWithinViewport(lookupPopup, lookupAnchorRect);

  if (settings?.defaultActionAfterLookup === "Save automatically") {
    void saveLookup(lookup, "save").catch(handleRuntimeFailure);
  } else if (settings?.defaultActionAfterLookup === "Understood automatically") {
    void saveLookup(lookup, "understood").catch(handleRuntimeFailure);
  }
}

async function saveLookup(
  lookup: LookupResult,
  intent: "save" | "understood"
): Promise<void> {
  const meaningInput = lookupPopup?.querySelector<HTMLTextAreaElement>(
    "[data-lexitrace-meaning-input]"
  );
  const hintInput = lookupPopup?.querySelector<HTMLTextAreaElement>(
    "[data-lexitrace-hint-input]"
  );
  const noteInput = lookupPopup?.querySelector<HTMLTextAreaElement>(
    "[data-lexitrace-note-input]"
  );
  const toeicSelect = lookupPopup?.querySelector<HTMLSelectElement>(
    "[data-lexitrace-toeic-select]"
  );
  const contextSelect = lookupPopup?.querySelector<HTMLSelectElement>(
    "[data-lexitrace-context-select]"
  );

  await sendMessage({
    type: "SAVE_VOCABULARY",
    payload: {
      lookup,
      intent,
      manualMeaningZh: meaningInput?.value.trim() || undefined,
      manualMeaningEn: hintInput?.value.trim() || undefined,
      userNote: noteInput?.value.trim() || undefined,
      manualToeicUsefulness: toeicSelect?.value as LookupResult["toeicUsefulness"] | undefined,
      manualContextType: contextSelect?.value as LookupResult["contextType"] | undefined
    }
  });

  closePopups();
  window.getSelection()?.removeAllRanges();
  await refreshHighlights();
}

function appendManualEditSection(container: HTMLElement, lookup: LookupResult): void {
  const details = document.createElement("details");
  details.className = "lexitrace-details";
  details.open = !lookup.meaningZh;

  const summary = document.createElement("summary");
  summary.textContent = t("editMeaning");

  const meaningLabel = document.createElement("label");
  meaningLabel.className = "lexitrace-field";
  meaningLabel.textContent = t("meaningEditLabel");

  const meaningHelp = createTextElement("span", "lexitrace-field__help", t("meaningEditHelp"));

  const meaningInput = document.createElement("textarea");
  meaningInput.className = "lexitrace-input";
  meaningInput.dataset.lexitraceMeaningInput = "true";
  meaningInput.value = lookup.meaningZh ?? "";
  meaningLabel.append(meaningHelp, meaningInput);

  const hintLabel = document.createElement("label");
  hintLabel.className = "lexitrace-field";
  hintLabel.textContent = t("hintEditLabel");

  const hintHelp = createTextElement("span", "lexitrace-field__help", t("hintEditHelp"));

  const hintInput = document.createElement("textarea");
  hintInput.className = "lexitrace-input";
  hintInput.dataset.lexitraceHintInput = "true";
  hintInput.value = lookup.meaningEn ?? "";
  hintLabel.append(hintHelp, hintInput);

  const noteLabel = document.createElement("label");
  noteLabel.className = "lexitrace-field";
  noteLabel.textContent = t("noteEditLabel");
  const noteHelp = createTextElement("span", "lexitrace-field__help", t("noteEditHelp"));
  const noteInput = document.createElement("textarea");
  noteInput.className = "lexitrace-input";
  noteInput.dataset.lexitraceNoteInput = "true";
  noteLabel.append(noteHelp, noteInput);

  const classification = document.createElement("div");
  classification.className = "lexitrace-classification";
  classification.append(
    createLookupSelect(
      t("toeicUsefulnessLabel"),
      "lexitraceToeicSelect",
      lookup.toeicUsefulness,
      ["High", "Medium", "Low", "Unknown"],
      (value) => translateUsefulness(value as LookupResult["toeicUsefulness"])
    ),
    createLookupSelect(
      t("contextTypeLabel"),
      "lexitraceContextSelect",
      lookup.contextType,
      ["Technical", "Business", "General", "TOEIC-like", "Unknown"],
      (value) => translateContext(value as LookupResult["contextType"])
    )
  );

  details.append(summary, meaningLabel, hintLabel, noteLabel, classification);
  container.append(details);
}

function createLookupSelect(
  labelText: string,
  dataKey: "lexitraceToeicSelect" | "lexitraceContextSelect",
  selectedValue: string,
  values: string[],
  getLabel: (value: string) => string
): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "lexitrace-field";
  label.textContent = labelText;
  const select = document.createElement("select");
  select.className = "lexitrace-select";
  select.dataset[dataKey] = "true";

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = getLabel(value);
    option.selected = value === selectedValue;
    select.append(option);
  }

  label.append(select);
  return label;
}

async function refreshHighlights(): Promise<void> {
  const refreshVersion = ++highlightRefreshVersion;
  suppressContentObserver = true;

  try {
    clearHighlights();

    settings = settings ?? (await sendMessage({ type: "GET_SETTINGS" }));
    if (refreshVersion !== highlightRefreshVersion) {
      return;
    }

    if (!settings.extensionEnabled || !settings.highlightsEnabled) {
      closePopups();
      closeReviewPrompt();
      removePageBubble();
      return;
    }

    if (hiddenHighlights) {
      if (!settings.pageVocabularyBubbleEnabled) {
        removePageBubble();
      }
      return;
    }

    removePageBubble();

    activeVocabulary = (await sendMessage({ type: "LIST_ACTIVE_VOCABULARY" })).filter(
      (record) => !settings?.hideMasteredWords || record.status !== "mastered"
    );
    if (refreshVersion !== highlightRefreshVersion) {
      return;
    }

    const sortedVocabulary = [...activeVocabulary].sort(
      (a, b) => b.normalized_text.length - a.normalized_text.length
    );
    const vocabularyMatcher = createVocabularyMatcher(sortedVocabulary);

    if (sortedVocabulary.length === 0 || !document.body) {
      return;
    }

    const textNodes = collectTextNodes(document.body);
    let pageMatchCount = 0;
    const matchedVocabularyIds = new Set<string>();

    for (let index = 0; index < textNodes.length; index += 1) {
      if (index > 0 && index % 120 === 0) {
        await yieldToMainThread();
        if (refreshVersion !== highlightRefreshVersion) {
          return;
        }
      }

      pageMatchCount += highlightTextNode(
        textNodes[index],
        vocabularyMatcher,
        matchedVocabularyIds
      );
    }

    if (pageMatchCount > 0) {
      const pageVocabulary = activeVocabulary.filter((record) =>
        matchedVocabularyIds.has(record.id)
      );

      if (settings.pageVocabularyBubbleEnabled) {
        renderPageBubble(pageMatchCount, pageVocabulary);
      }

      void schedulePassiveReviewPrompt(pageVocabulary);
    }

    const newExposureIds = [...matchedVocabularyIds].filter(
      (id) => !exposedVocabularyIds.has(id)
    );

    if (newExposureIds.length > 0) {
      newExposureIds.forEach((id) => exposedVocabularyIds.add(id));
      void sendMessage({
        type: "RECORD_PAGE_EXPOSURES",
        payload: { ids: newExposureIds }
      })
        .then((records) => {
          activeVocabulary = mergeVocabularyRecords(activeVocabulary, records);
        })
        .catch((error) => {
          newExposureIds.forEach((id) => exposedVocabularyIds.delete(id));
          handleRuntimeFailure(error);
        });
    }
  } finally {
    contentObserver?.takeRecords();
    if (refreshVersion === highlightRefreshVersion) {
      suppressContentObserver = false;
    }
  }
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim() || isInsideBlockedElement(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  return nodes;
}

function highlightTextNode(
  node: Text,
  matcher: VocabularyMatcher,
  matchedVocabularyIds: Set<string>
): number {
  const text = node.nodeValue ?? "";
  const matches = findVocabularyMatches(text, matcher);
  if (matches.length === 0) {
    return 0;
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of matches) {
    if (match.index > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    const span = document.createElement("span");
    span.className = `lexitrace-highlight lexitrace-highlight--${match.record.status}`;
    span.setAttribute(HIGHLIGHT_ATTRIBUTE, "true");
    span.setAttribute(VOCABULARY_ID_ATTRIBUTE, match.record.id);
    span.setAttribute("role", "button");
    span.setAttribute("aria-label", t("recallWord", { word: match.text }));
    span.tabIndex = 0;
    span.textContent = match.text;
    fragment.append(span);
    matchedVocabularyIds.add(match.record.id);
    cursor = match.index + match.text.length;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }
  node.replaceWith(fragment);

  return matches.length;
}

function clearHighlights(): void {
  const parents = new Set<Node>();
  document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTRIBUTE}]`).forEach((node) => {
    if (node.parentNode) {
      parents.add(node.parentNode);
    }
    node.replaceWith(document.createTextNode(node.textContent ?? ""));
  });
  parents.forEach((parent) => parent.normalize());
}

function openRecallPopup(highlight: HTMLElement): void {
  const id = highlight.getAttribute(VOCABULARY_ID_ATTRIBUTE);
  const record = activeVocabulary.find((item) => item.id === id);

  if (!record) {
    return;
  }

  closePopups();
  recallAnchorRect = highlight.getBoundingClientRect();
  recallPopup = createPopupShell(highlight.getBoundingClientRect());
  const currentText = highlight.textContent ?? record.text;
  const currentSentence = extractSentenceAroundSelection(
    highlight.parentElement?.textContent ?? currentText,
    currentText
  );
  if (settings?.recallFirstPopupEnabled === false) {
    renderRevealMode(record, currentSentence, false);
  } else {
    renderRecallMode(record, currentSentence);
  }
  appendToUiRoot(recallPopup);
  positionPopupWithinViewport(recallPopup, recallAnchorRect);
}

function renderRecallMode(record: VocabularyRecord, currentSentence: string): void {
  if (!recallPopup) {
    return;
  }

  recallPopup.replaceChildren();
  recallPopup.append(
    createTextElement("h2", "lexitrace-popup__title", record.text),
    createTextElement(
      "div",
      "lexitrace-popup__meta",
      t("lookedUpTimes", { count: record.lookup_count })
    )
  );

  appendSection(
    recallPopup,
    t("recall"),
    t("recallInstruction")
  );

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  const hintButton = createButton(t("showHint"));
  hintButton.addEventListener("click", () => {
    appendSection(
      recallPopup!,
      t("hint"),
      record.meaning_en || record.part_of_speech || record.meaning_zh.slice(0, 1)
    );
    hintButton.disabled = true;
  });

  const rememberedButton = createButton(t("remembered"), true);
  rememberedButton.addEventListener("click", () => {
    void updateRecall(record.id, "remembered").catch(handleRuntimeFailure);
  });

  const unsureButton = createButton(t("unsure"));
  unsureButton.addEventListener("click", () => {
    void updateRecall(record.id, "unsure", (updatedRecord) =>
      renderRevealMode(updatedRecord, currentSentence, true)
    ).catch(handleRuntimeFailure);
  });

  actions.append(hintButton, rememberedButton, unsureButton);
  recallPopup.append(actions);
  animateContentChange(recallPopup);
  positionPopupWithinViewport(recallPopup, recallAnchorRect);
}

function renderRevealMode(
  record: VocabularyRecord,
  currentSentence: string,
  outcomeRecorded: boolean
): void {
  if (!recallPopup) {
    return;
  }

  recallPopup.replaceChildren();
  recallPopup.append(createTextElement("h2", "lexitrace-popup__title", record.text));
  appendSection(recallPopup, t("meaning"), record.meaning_zh || t("noSavedMeaning"));

  if (record.meaning_en) {
    appendSection(recallPopup, t("englishHint"), record.meaning_en);
  }

  if (record.user_note) {
    appendSection(recallPopup, t("personalNote"), record.user_note);
  }

  appendSentenceSection(recallPopup, t("previousSentence"), record.source_sentence);

  appendSentenceSection(recallPopup, t("currentSentence"), currentSentence);
  appendSavedEditSection(recallPopup, record, currentSentence, outcomeRecorded);

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  if (outcomeRecorded) {
    const continueButton = createButton(t("continueReading"), true);
    continueButton.addEventListener("click", closePopups);
    actions.append(continueButton);
  } else {
    const addReviewButton = createButton(t("addToReview"));
    addReviewButton.addEventListener("click", () => {
      void updateRecall(record.id, "unsure").catch(handleRuntimeFailure);
    });

    const understoodButton = createButton(t("understood"), true);
    understoodButton.addEventListener("click", () => {
      void updateRecall(record.id, "remembered").catch(handleRuntimeFailure);
    });

    actions.append(addReviewButton, understoodButton);
  }
  recallPopup.append(actions);
  animateContentChange(recallPopup);
  positionPopupWithinViewport(recallPopup, recallAnchorRect);
}

function appendSavedEditSection(
  container: HTMLElement,
  record: VocabularyRecord,
  currentSentence: string,
  outcomeRecorded: boolean
): void {
  const details = document.createElement("details");
  details.className = "lexitrace-details";
  const summary = document.createElement("summary");
  summary.textContent = t("editSavedWord");

  const meaningLabel = document.createElement("label");
  meaningLabel.className = "lexitrace-field";
  meaningLabel.textContent = t("meaningEditLabel");
  const meaningInput = document.createElement("textarea");
  meaningInput.className = "lexitrace-input";
  meaningInput.value = record.meaning_zh;
  meaningLabel.append(meaningInput);

  const hintLabel = document.createElement("label");
  hintLabel.className = "lexitrace-field";
  hintLabel.textContent = t("hintEditLabel");
  const hintInput = document.createElement("textarea");
  hintInput.className = "lexitrace-input";
  hintInput.value = record.meaning_en ?? "";
  hintLabel.append(hintInput);

  const noteLabel = document.createElement("label");
  noteLabel.className = "lexitrace-field";
  noteLabel.textContent = t("noteEditLabel");
  const noteInput = document.createElement("textarea");
  noteInput.className = "lexitrace-input";
  noteInput.value = record.user_note ?? "";
  noteLabel.append(noteInput);

  const classification = document.createElement("div");
  classification.className = "lexitrace-classification";
  classification.append(
    createLookupSelect(
      t("toeicUsefulnessLabel"),
      "lexitraceToeicSelect",
      record.toeic_usefulness,
      ["High", "Medium", "Low", "Unknown"],
      (value) => translateUsefulness(value as LookupResult["toeicUsefulness"])
    ),
    createLookupSelect(
      t("contextTypeLabel"),
      "lexitraceContextSelect",
      record.context_type,
      ["Technical", "Business", "General", "TOEIC-like", "Unknown"],
      (value) => translateContext(value as LookupResult["contextType"])
    )
  );

  const status = createTextElement("span", "lexitrace-field__status", "");
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";
  const saveButton = createButton(t("saveChanges"), true);
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    status.textContent = t("settingsSaving");
    try {
      const toeicSelect = details.querySelector<HTMLSelectElement>(
        "[data-lexitrace-toeic-select]"
      );
      const contextSelect = details.querySelector<HTMLSelectElement>(
        "[data-lexitrace-context-select]"
      );
      const updated = await sendMessage({
        type: "UPDATE_VOCABULARY_DETAILS",
        payload: {
          id: record.id,
          meaningZh: meaningInput.value.trim(),
          meaningEn: hintInput.value.trim() || undefined,
          userNote: noteInput.value.trim() || undefined,
          toeicUsefulness: (toeicSelect?.value ?? record.toeic_usefulness) as VocabularyRecord["toeic_usefulness"],
          contextType: (contextSelect?.value ?? record.context_type) as VocabularyRecord["context_type"]
        }
      });
      activeVocabulary = activeVocabulary.map((item) =>
        item.id === updated.id ? updated : item
      );
      renderRevealMode(updated, currentSentence, outcomeRecorded);
    } catch (error) {
      saveButton.disabled = false;
      status.textContent = error instanceof Error ? error.message : t("settingsSaveFailed");
    }
  });
  actions.append(status, saveButton);
  details.append(summary, meaningLabel, hintLabel, noteLabel, classification, actions);
  container.append(details);
}

async function updateRecall(
  id: string,
  outcome: "remembered" | "unsure",
  afterUpdate?: (updatedRecord: VocabularyRecord) => void,
  mode: "recall" | "quiz" = "recall"
): Promise<void> {
  const updatedRecord = await sendMessage({
    type: "RECORD_RECALL",
    payload: { id, outcome, mode }
  });
  activeVocabulary = activeVocabulary.map((record) =>
    record.id === updatedRecord.id ? updatedRecord : record
  );

  if (afterUpdate) {
    afterUpdate(updatedRecord);
    await refreshHighlights();
    startContentObserver();
    return;
  }

  closePopups();
  closeReviewPrompt();
  await refreshHighlights();
}

function renderPageBubble(
  matchCount: number,
  pageVocabulary: VocabularyRecord[]
): void {
  removePageBubble();

  pageBubble = document.createElement("aside");
  pageBubble.className = "lexitrace-bubble";
  pageBubble.setAttribute(ROOT_ATTRIBUTE, "true");

  const button = document.createElement("button");
  button.className = "lexitrace-bubble__button";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  const uniqueCount = pageVocabulary.length || matchCount;
  const dueCount = getDueReviewRecords(pageVocabulary).length;
  const buttonLabel = createTextElement(
    "span",
    "lexitrace-bubble__summary",
    uniqueCount === 1
      ? t("oneSavedWordOnPage")
      : t("savedWordsOnPage", { count: uniqueCount })
  );
  button.append(buttonLabel);
  if (dueCount > 0) {
    button.append(
      createTextElement(
        "span",
        "lexitrace-bubble__due",
        t("dueReviewCount", { count: dueCount })
      )
    );
  }

  if (pageVocabulary.some((record) => record.toeic_usefulness === "High")) {
    button.classList.add("lexitrace-bubble__button--toeic");
  }

  const panel = document.createElement("div");
  panel.className = "lexitrace-bubble__panel";
  panel.setAttribute("aria-hidden", "true");
  panel.inert = true;

  const title = createTextElement("p", "lexitrace-bubble__title", t("pageVocabulary"));
  const list = document.createElement("div");
  list.className = "lexitrace-bubble__list";

  for (const record of pageVocabulary.slice(0, 8)) {
    const item = document.createElement("div");
    item.className = "lexitrace-bubble__item";
    item.append(
      createTextElement("span", "", record.text),
      createTextElement(
        "span",
        "",
        isReviewDue(record) ? t("dueReview") : translateStatus(record.status)
      )
    );
    list.append(item);
  }

  const hideButton = createButton(t("hideHighlights"));
  hideButton.addEventListener("click", () => {
    hiddenHighlights = true;
    clearHighlights();
    hideButton.disabled = true;
    hideButton.textContent = t("highlightsHidden");
  });

  const quickRecallButton = createButton(t("quickRecall"), true);
  quickRecallButton.addEventListener("click", () => {
    startBubbleReview(pageVocabulary, false);
  });

  const quizButton = createButton(t("startQuiz"));
  quizButton.addEventListener("click", () => {
    startBubbleReview(pageVocabulary, true);
  });

  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    panel.setAttribute("aria-hidden", String(expanded));
    panel.inert = expanded;
    pageBubble?.classList.toggle("lexitrace-bubble--expanded", !expanded);
  });

  const actions = document.createElement("div");
  actions.className = "lexitrace-bubble__actions";
  actions.append(quickRecallButton, quizButton, hideButton);
  panel.append(title, list, actions);
  pageBubble.append(button, panel);
  appendToUiRoot(pageBubble);
}


function startBubbleReview(records: VocabularyRecord[], quizMode: boolean): void {
  const maximum = quizMode
    ? settings?.pageReviewQuestionCount ?? 3
    : settings?.quickReviewQuestionCount ?? 1;
  const reviewRecords = [...records]
    .filter((record) => record.status !== "mastered" && record.status !== "ignored")
    .sort((a, b) => {
      const dueDifference = Number(isReviewDue(b)) - Number(isReviewDue(a));
      return dueDifference || b.review_priority - a.review_priority;
    })
    .slice(0, maximum);
  if (reviewRecords.length === 0) {
    return;
  }

  closePopups();
  bubbleReviewQueue = reviewRecords;
  bubbleReviewIndex = 0;
  bubbleReviewMode = quizMode ? "cloze" : "recall";
  bubbleReviewShowAnswer = false;
  bubbleReviewAnswer = undefined;
  bubbleReviewOptions = [];
  bubbleReviewRememberedCount = 0;
  bubbleReviewSaving = false;
  renderBubbleReviewCard();
}

function renderBubbleReviewCard(): void {
  const record = bubbleReviewQueue[bubbleReviewIndex];
  const centerRect = new DOMRect(
    window.innerWidth / 2 - 180,
    window.innerHeight / 2 - 120,
    360,
    240
  );

  if (!recallPopup) {
    recallAnchorRect = centerRect;
    recallPopup = createPopupShell(centerRect);
    recallPopup.classList.add("lexitrace-popup--review");
    appendToUiRoot(recallPopup);
  }

  if (!record) {
    renderBubbleReviewComplete();
    return;
  }

  recallPopup.replaceChildren(
    createTextElement(
      "div",
      "lexitrace-popup__progress",
      t("reviewProgress", {
        current: bubbleReviewIndex + 1,
        total: bubbleReviewQueue.length
      })
    )
  );

  if (bubbleReviewMode === "cloze") {
    renderClozeReviewCard(record);
  } else {
    renderRecallReviewCard(record);
  }

  animateContentChange(recallPopup);
  positionPopupWithinViewport(recallPopup, centerRect);
}

function renderRecallReviewCard(record: VocabularyRecord): void {
  if (!recallPopup) {
    return;
  }

  recallPopup.append(
    createTextElement("h2", "lexitrace-popup__review-word", record.text),
    createTextElement(
      "p",
      "lexitrace-popup__review-instruction",
      bubbleReviewShowAnswer ? t("checkYourRecall") : t("reviewThinkFirst")
    )
  );

  if (record.source_sentence) {
    appendSentenceSection(
      recallPopup,
      t("sourceSentence"),
      createClozeSentence(record.source_sentence, record.text)
    );
  }

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  if (!bubbleReviewShowAnswer) {
    const laterButton = createButton(t("later"));
    laterButton.addEventListener("click", closePopups);
    const showAnswerButton = createButton(t("showAnswer"), true);
    showAnswerButton.addEventListener("click", () => {
      bubbleReviewShowAnswer = true;
      renderBubbleReviewCard();
    });
    actions.append(laterButton, showAnswerButton);
  } else {
    appendSection(recallPopup, t("meaning"), record.meaning_zh || t("noSavedMeaning"));
    if (record.meaning_en) {
      appendSection(recallPopup, t("englishHint"), record.meaning_en);
    }

    const unsureButton = createButton(t("unsure"));
    unsureButton.disabled = bubbleReviewSaving;
    unsureButton.addEventListener("click", () => {
      void submitBubbleRecall(record, "unsure");
    });
    const rememberedButton = createButton(t("remembered"), true);
    rememberedButton.disabled = bubbleReviewSaving;
    rememberedButton.addEventListener("click", () => {
      void submitBubbleRecall(record, "remembered");
    });
    actions.append(unsureButton, rememberedButton);
  }

  recallPopup.append(actions);
}

function renderClozeReviewCard(record: VocabularyRecord): void {
  if (!recallPopup) {
    return;
  }

  const clozeSentence = createClozeSentence(record.source_sentence, record.text);
  const hasCloze = clozeSentence !== record.source_sentence;
  recallPopup.append(
    createTextElement("h2", "lexitrace-popup__review-title", t("clozeQuiz")),
    createTextElement(
      "p",
      "lexitrace-popup__review-instruction",
      hasCloze ? t("chooseMissingWord") : t("chooseMatchingWord")
    )
  );

  if (hasCloze) {
    appendSentenceSection(recallPopup, t("sourceSentence"), clozeSentence);
  } else {
    appendSection(recallPopup, t("meaning"), record.meaning_zh || record.meaning_en || t("noSavedMeaning"));
  }

  if (bubbleReviewOptions.length === 0) {
    bubbleReviewOptions = buildQuizOptions(record);
  }

  const options = document.createElement("div");
  options.className = "lexitrace-quiz-options";
  for (const option of bubbleReviewOptions) {
    const optionButton = createButton(option);
    optionButton.classList.add("lexitrace-quiz-option");
    optionButton.disabled = Boolean(bubbleReviewAnswer) || bubbleReviewSaving;

    if (bubbleReviewAnswer) {
      if (normalizeText(option) === record.normalized_text) {
        optionButton.classList.add("lexitrace-quiz-option--correct");
      } else if (option === bubbleReviewAnswer.selected) {
        optionButton.classList.add("lexitrace-quiz-option--wrong");
      }
    }

    optionButton.addEventListener("click", () => {
      void submitClozeAnswer(record, option);
    });
    options.append(optionButton);
  }
  recallPopup.append(options);

  if (!bubbleReviewAnswer) {
    const actions = document.createElement("div");
    actions.className = "lexitrace-popup__actions";
    const laterButton = createButton(t("later"));
    laterButton.addEventListener("click", closePopups);
    actions.append(laterButton);
    recallPopup.append(actions);
    return;
  }

  const feedback = createTextElement(
    "p",
    bubbleReviewAnswer.correct
      ? "lexitrace-quiz-feedback lexitrace-quiz-feedback--correct"
      : "lexitrace-quiz-feedback lexitrace-quiz-feedback--wrong",
    bubbleReviewAnswer.correct
      ? t("quizCorrect")
      : t("quizWrong", { word: record.text, meaning: record.meaning_zh || record.meaning_en || t("noSavedMeaning") })
  );
  feedback.setAttribute("role", "status");
  recallPopup.append(feedback);

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";
  const nextButton = createButton(
    bubbleReviewIndex + 1 >= bubbleReviewQueue.length
      ? t("finishReview")
      : t("nextQuestion"),
    true
  );
  nextButton.disabled = bubbleReviewSaving;
  nextButton.addEventListener("click", advanceBubbleReview);
  actions.append(nextButton);
  recallPopup.append(actions);
}

async function submitBubbleRecall(
  record: VocabularyRecord,
  outcome: "remembered" | "unsure"
): Promise<void> {
  if (bubbleReviewSaving) {
    return;
  }

  bubbleReviewSaving = true;
  renderBubbleReviewCard();
  try {
    await updateRecall(record.id, outcome, () => undefined);
    if (outcome === "remembered") {
      bubbleReviewRememberedCount += 1;
    }
    advanceBubbleReview();
  } catch (error) {
    bubbleReviewSaving = false;
    handleRuntimeFailure(error);
  }
}

async function submitClozeAnswer(
  record: VocabularyRecord,
  selected: string
): Promise<void> {
  if (bubbleReviewAnswer || bubbleReviewSaving) {
    return;
  }

  const correct = normalizeText(selected) === record.normalized_text;
  bubbleReviewAnswer = { selected, correct };
  bubbleReviewSaving = true;
  renderBubbleReviewCard();

  try {
    await updateRecall(
      record.id,
      correct ? "remembered" : "unsure",
      () => undefined,
      "quiz"
    );
    if (correct) {
      bubbleReviewRememberedCount += 1;
    }
    bubbleReviewSaving = false;
    renderBubbleReviewCard();
  } catch (error) {
    bubbleReviewSaving = false;
    handleRuntimeFailure(error);
  }
}

function advanceBubbleReview(): void {
  bubbleReviewIndex += 1;
  bubbleReviewShowAnswer = false;
  bubbleReviewAnswer = undefined;
  bubbleReviewOptions = [];
  bubbleReviewSaving = false;
  renderBubbleReviewCard();
}

function renderBubbleReviewComplete(): void {
  if (!recallPopup) {
    return;
  }

  recallPopup.replaceChildren(
    createTextElement("p", "lexitrace-popup__progress", t("reviewComplete")),
    createTextElement("h2", "lexitrace-popup__review-title", t("reviewCompleteTitle")),
    createTextElement(
      "p",
      "lexitrace-popup__review-instruction",
      t("reviewCompleteSummary", {
        remembered: bubbleReviewRememberedCount,
        total: bubbleReviewQueue.length
      })
    )
  );
  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";
  const doneButton = createButton(t("continueReading"), true);
  doneButton.addEventListener("click", closePopups);
  actions.append(doneButton);
  recallPopup.append(actions);
  animateContentChange(recallPopup);
}

function buildQuizOptions(record: VocabularyRecord): string[] {
  const distractors = activeVocabulary
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        candidate.status !== "ignored" &&
        normalizeText(candidate.text) !== record.normalized_text
    )
    .sort((a, b) => b.review_priority - a.review_priority)
    .map((candidate) => candidate.text);
  const fallbackDistractors = ["confirm", "allocate", "postpone", "maintain"];
  const unique = [record.text];
  const seen = new Set([record.normalized_text]);

  for (const candidate of [...distractors, ...fallbackDistractors]) {
    const normalizedCandidate = normalizeText(candidate);
    if (!seen.has(normalizedCandidate)) {
      seen.add(normalizedCandidate);
      unique.push(candidate);
    }
    if (unique.length === 4) {
      break;
    }
  }

  for (let index = unique.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [unique[index], unique[swapIndex]] = [unique[swapIndex], unique[index]];
  }

  return unique;
}

function removePageBubble(): void {
  removeWithExitAnimation(pageBubble);
  pageBubble = undefined;
}

async function schedulePassiveReviewPrompt(
  pageVocabulary: VocabularyRecord[]
): Promise<void> {
  if (
    reviewPromptScheduled ||
    !settings?.lightweightReviewPromptsEnabled ||
    document.hidden
  ) {
    return;
  }

  reviewPromptScheduled = true;
  const dueRecords = getDueReviewRecords(pageVocabulary);
  if (dueRecords.length === 0) {
    return;
  }

  let lastShownAt = 0;
  let dismissCount = 0;
  try {
    const promptState = await chrome.storage.local.get([
      REVIEW_PROMPT_LAST_SHOWN_KEY,
      REVIEW_PROMPT_DISMISS_COUNT_KEY
    ]);
    lastShownAt = Number(promptState[REVIEW_PROMPT_LAST_SHOWN_KEY] ?? 0);
    dismissCount = Number(promptState[REVIEW_PROMPT_DISMISS_COUNT_KEY] ?? 0);
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      return;
    }
  }

  if (
    Date.now() - lastShownAt < REVIEW_PROMPT_COOLDOWN_MS ||
    Math.random() > getReviewPromptProbability(dismissCount)
  ) {
    return;
  }

  const record = dueRecords[0];
  attemptReviewPrompt(record, 0);
}

function attemptReviewPrompt(record: VocabularyRecord, attempt: number): void {
  window.setTimeout(() => {
    if (!extensionContextActive || !settings?.lightweightReviewPromptsEnabled) {
      reviewPromptScheduled = false;
      return;
    }

    if (canShowReviewPrompt()) {
      renderReviewPrompt(record);
      void chrome.storage.local
        .set({ [REVIEW_PROMPT_LAST_SHOWN_KEY]: Date.now() })
        .catch(() => undefined);
      return;
    }

    if (attempt < 2) {
      attemptReviewPrompt(record, attempt + 1);
    } else {
      reviewPromptScheduled = false;
    }
  }, attempt === 0 ? 4000 : 2500);
}

function canShowReviewPrompt(): boolean {
  const selection = window.getSelection();
  const activeElement = document.activeElement;
  const isTyping =
    activeElement instanceof HTMLElement &&
    (activeElement.matches("input, textarea, [role='textbox']") ||
      activeElement.isContentEditable);

  return Boolean(
    !document.hidden &&
    !lookupPopup &&
    !recallPopup &&
    !reviewPrompt &&
    !isTyping &&
    (!selection || selection.isCollapsed) &&
    Date.now() - lastPageScrollAt > 1400
  );
}

function renderReviewPrompt(record: VocabularyRecord): void {
  closeReviewPrompt();

  reviewPrompt = document.createElement("aside");
  reviewPrompt.className = "lexitrace-review-prompt";
  reviewPrompt.setAttribute(ROOT_ATTRIBUTE, "true");

  reviewPrompt.append(
    createTextElement("p", "lexitrace-review-prompt__eyebrow", t("reviewPromptTitle")),
    createTextElement("h2", "lexitrace-review-prompt__word", record.text),
    createTextElement("p", "lexitrace-review-prompt__copy", t("reviewPromptDesc"))
  );

  if (record.source_sentence) {
    reviewPrompt.append(
      createTextElement("p", "lexitrace-review-prompt__sentence", record.source_sentence)
    );
  }

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  const laterButton = createButton(t("later"));
  laterButton.addEventListener("click", () => {
    void recordReviewPromptDismissal();
    closeReviewPrompt();
  });

  const showAnswerButton = createButton(t("showAnswer"), true);
  showAnswerButton.addEventListener("click", () => {
    void chrome.storage.local
      .set({ [REVIEW_PROMPT_DISMISS_COUNT_KEY]: 0 })
      .catch(() => undefined);
    revealReviewPromptAnswer(record);
  });

  actions.append(laterButton, showAnswerButton);
  reviewPrompt.append(actions);
  appendToUiRoot(reviewPrompt);
}

function revealReviewPromptAnswer(record: VocabularyRecord): void {
  if (!reviewPrompt) {
    return;
  }

  reviewPrompt.replaceChildren(
    createTextElement("p", "lexitrace-review-prompt__eyebrow", t("meaning")),
    createTextElement("h2", "lexitrace-review-prompt__word", record.text),
    createTextElement("p", "lexitrace-review-prompt__copy", record.meaning_zh || t("noSavedMeaning"))
  );

  if (record.meaning_en) {
    reviewPrompt.append(
      createTextElement("p", "lexitrace-review-prompt__sentence", record.meaning_en)
    );
  }

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  const unsureButton = createButton(t("unsure"));
  unsureButton.addEventListener("click", () => {
    void updateRecall(record.id, "unsure").catch(handleRuntimeFailure);
  });

  const rememberedButton = createButton(t("remembered"), true);
  rememberedButton.addEventListener("click", () => {
    void updateRecall(record.id, "remembered").catch(handleRuntimeFailure);
  });

  actions.append(unsureButton, rememberedButton);
  reviewPrompt.append(actions);
}

function closeReviewPrompt(): void {
  removeWithExitAnimation(reviewPrompt);
  reviewPrompt = undefined;
}

async function recordReviewPromptDismissal(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(REVIEW_PROMPT_DISMISS_COUNT_KEY);
    const current = Number(result[REVIEW_PROMPT_DISMISS_COUNT_KEY] ?? 0);
    await chrome.storage.local.set({
      [REVIEW_PROMPT_DISMISS_COUNT_KEY]: Math.min(8, current + 1)
    });
  } catch {
    // Prompt preference is best-effort; vocabulary data is unaffected.
  }
}

function createPopupShell(rect: DOMRect): HTMLElement {
  const popup = document.createElement("section");
  popup.className = "lexitrace-popup";
  popup.setAttribute(ROOT_ATTRIBUTE, "true");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-live", "polite");

  const popupWidth = Math.min(440, window.innerWidth - 24);
  const maxLeft = Math.max(12, window.innerWidth - popupWidth - 12);
  const left = Math.min(Math.max(12, rect.left), maxLeft);
  const top =
    rect.bottom + 10 < window.innerHeight - 240
      ? rect.bottom + 10
      : Math.max(12, rect.top - 360);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  return popup;
}

function positionPopupWithinViewport(
  popup: HTMLElement,
  anchorRect?: DOMRect
): void {
  const margin = 12;
  const anchor = anchorRect ?? popup.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = Math.min(popupRect.width || 440, window.innerWidth - margin * 2);
  const popupHeight = Math.min(
    popupRect.height || 360,
    window.innerHeight - margin * 2
  );
  const spaceBelow = window.innerHeight - anchor.bottom - margin;
  const spaceAbove = anchor.top - margin;
  const preferBelow = spaceBelow >= Math.min(popupHeight, 320) || spaceBelow >= spaceAbove;
  const rawTop = preferBelow
    ? anchor.bottom + 10
    : anchor.top - popupHeight - 10;
  const rawLeft = anchor.left;
  const top = clamp(rawTop, margin, window.innerHeight - popupHeight - margin);
  const left = clamp(rawLeft, margin, window.innerWidth - popupWidth - margin);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.maxHeight = `${window.innerHeight - margin * 2}px`;
}

function appendSection(container: HTMLElement, label: string, value: string): void {
  const section = document.createElement("section");
  section.className = "lexitrace-popup__section";
  section.append(
    createTextElement("div", "lexitrace-popup__label", label),
    createTextElement("p", "lexitrace-popup__text", value)
  );
  container.append(section);
}

function appendSentenceSection(container: HTMLElement, label: string, value: string): void {
  const section = document.createElement("section");
  section.className = "lexitrace-popup__section";
  section.append(
    createTextElement("div", "lexitrace-popup__label", label),
    createTextElement("p", "lexitrace-popup__sentence", value || t("noSentence"))
  );
  container.append(section);
}

function appendBadges(container: HTMLElement, lookup: LookupResult): void {
  if (!settings?.showToeicBadge && !settings?.showContextBadge) {
    return;
  }

  const badges = document.createElement("div");
  badges.className = "lexitrace-popup__badges";

  if (settings?.showToeicBadge) {
    badges.append(
      createTextElement("span", "lexitrace-popup__badge", `${t("toeic")}：${translateUsefulness(lookup.toeicUsefulness)}`)
    );
  }

  if (settings?.showContextBadge) {
    badges.append(
      createTextElement("span", "lexitrace-popup__badge", `${t("context")}：${translateContext(lookup.contextType)}`)
    );
  }

  container.append(badges);
}

function createButton(label: string, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary
    ? "lexitrace-button lexitrace-button--primary"
    : "lexitrace-button";
  button.textContent = label;
  return button;
}

function createLinkButton(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "lexitrace-button lexitrace-button--link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function closePopups(): void {
  lookupRequestVersion += 1;
  removeWithExitAnimation(lookupPopup);
  removeWithExitAnimation(recallPopup);
  lookupPopup = undefined;
  recallPopup = undefined;
  lookupAnchorRect = undefined;
  recallAnchorRect = undefined;
}

function createSpeakButton(text: string): HTMLButtonElement {
  const button = createButton(t("speak"));
  button.addEventListener("click", () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  });
  return button;
}

function animateContentChange(element: HTMLElement): void {
  element.classList.remove("lexitrace-content-changed");
  void element.offsetWidth;
  element.classList.add("lexitrace-content-changed");
}

function removeWithExitAnimation(element?: HTMLElement): void {
  if (!element?.isConnected) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.remove();
    return;
  }

  element.classList.add("lexitrace-is-closing");
  window.setTimeout(() => element.remove(), 160);
}

function appendToUiRoot(element: HTMLElement): void {
  if (!uiRoot) {
    injectStyles();
  }

  uiRoot?.append(element);
}

function translateStatus(status: VocabularyRecord["status"]): string {
  switch (status) {
    case "new":
      return t("statusNew");
    case "learning":
      return t("statusLearning");
    case "weak":
      return t("statusWeak");
    case "familiar":
      return t("statusFamiliar");
    case "mastered":
      return t("statusMastered");
    case "ignored":
      return t("statusIgnored");
  }
}

function mergeVocabularyRecords(
  current: VocabularyRecord[],
  updates: VocabularyRecord[]
): VocabularyRecord[] {
  if (updates.length === 0) {
    return current;
  }

  const updateMap = new Map(updates.map((record) => [record.id, record]));
  return current.map((record) => updateMap.get(record.id) ?? record);
}

function getDueReviewRecords(records: VocabularyRecord[]): VocabularyRecord[] {
  return records
    .filter(isReviewDue)
    .sort((a, b) => b.review_priority - a.review_priority);
}

function isReviewDue(record: VocabularyRecord): boolean {
  if (record.status === "mastered" || record.status === "ignored") {
    return false;
  }

  if (!record.next_review_at) {
    return record.status === "new" || record.status === "weak";
  }

  const nextReviewTime = new Date(record.next_review_at).getTime();
  return Number.isNaN(nextReviewTime) || nextReviewTime <= Date.now();
}

function getReviewPromptProbability(dismissCount = 0): number {
  const dismissalMultiplier = 1 / (1 + Math.max(0, dismissCount) * 0.6);
  switch (settings?.reviewPromptFrequency) {
    case "High":
      return 1 * dismissalMultiplier;
    case "Medium":
      return 0.65 * dismissalMultiplier;
    case "Low":
    default:
      return 0.35 * dismissalMultiplier;
  }
}

function translateUsefulness(value: LookupResult["toeicUsefulness"]): string {
  switch (value) {
    case "High":
      return t("usefulnessHigh");
    case "Medium":
      return t("usefulnessMedium");
    case "Low":
      return t("usefulnessLow");
    case "Unknown":
      return t("usefulnessUnknown");
  }
}

function translateContext(value: LookupResult["contextType"]): string {
  switch (value) {
    case "Technical":
      return t("contextTechnical");
    case "Business":
      return t("contextBusiness");
    case "General":
      return t("contextGeneral");
    case "TOEIC-like":
      return t("contextToeicLike");
    case "Unknown":
      return t("contextUnknown");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
