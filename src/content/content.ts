import {
  sendRuntimeMessage,
  type RuntimeMessage,
  type RuntimeResponseMap
} from "../core/messages";
import { t } from "../core/i18n";
import { escapeRegExp, getDomain, normalizeText } from "../core/normalize";
import { SETTINGS_KEY } from "../core/settings";
import { getLookupForms } from "../dictionary/word-forms";
import { extractSentenceAroundSelection } from "../core/sentence";
import type {
  ExtensionSettings,
  LookupResult,
  VocabularyRecord
} from "../core/types";
import styles from "./content.css?inline";

const ROOT_ATTRIBUTE = "data-lexitrace-root";
const HIGHLIGHT_ATTRIBUTE = "data-lexitrace-highlight";
const VOCABULARY_ID_ATTRIBUTE = "data-lexitrace-vocabulary-id";

let lookupPopup: HTMLElement | undefined;
let recallPopup: HTMLElement | undefined;
let pageBubble: HTMLElement | undefined;
let reviewPrompt: HTMLElement | undefined;
let hiddenHighlights = false;
let bubbleReviewQueue: VocabularyRecord[] = [];
let bubbleReviewIndex = 0;
let bubbleReviewShowAnswer = false;
let activeVocabulary: VocabularyRecord[] = [];
let settings: ExtensionSettings | undefined;
let uiHost: HTMLElement | undefined;
let uiRoot: ShadowRoot | undefined;
let lookupAnchorRect: DOMRect | undefined;
let recallAnchorRect: DOMRect | undefined;
let extensionContextActive = true;
let reviewPromptScheduled = false;

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
    chrome.storage.onChanged.addListener(handleStorageChange);

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

function handleSelectionEvent(): void {
  if (!extensionContextActive || !settings?.extensionEnabled) {
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
  }
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

  return Boolean(
    element?.closest(
      [
        `[${ROOT_ATTRIBUTE}]`,
        "script",
        "style",
        "input",
        "textarea",
        "select",
        "option",
        "pre",
        "code",
        "[contenteditable]",
        "[role='textbox']"
      ].join(",")
    )
  );
}

async function showLookupPopup(payload: {
  text: string;
  normalizedText: string;
  sourceSentence: string;
  rect: DOMRect;
}): Promise<void> {
  closePopups();

  lookupAnchorRect = payload.rect;
  lookupPopup = createPopupShell(payload.rect);
  lookupPopup.append(createTextElement("p", "lexitrace-popup__text", t("lookingUp")));
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

  renderLookupPopup(lookup);
}

function renderLookupPopup(lookup: LookupResult): void {
  if (!lookupPopup) {
    return;
  }

  lookupPopup.replaceChildren();

  const title = createTextElement("h2", "lexitrace-popup__title", lookup.selectedText);
  const meta = createTextElement(
    "div",
    "lexitrace-popup__meta",
    lookup.partOfSpeech ?? t("dictionaryLookup")
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
  positionPopupWithinViewport(lookupPopup, lookupAnchorRect);
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

  await sendMessage({
    type: "SAVE_VOCABULARY",
    payload: {
      lookup,
      intent,
      manualMeaningZh: meaningInput?.value.trim() || undefined,
      manualMeaningEn: hintInput?.value.trim() || undefined
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

  details.append(summary, meaningLabel, hintLabel);
  container.append(details);
}

async function refreshHighlights(): Promise<void> {
  hiddenHighlights = false;
  clearHighlights();
  removePageBubble();

  settings = settings ?? (await sendMessage({ type: "GET_SETTINGS" }));
  if (!settings.extensionEnabled || !settings.highlightsEnabled) {
    return;
  }

  activeVocabulary = (await sendMessage({ type: "LIST_ACTIVE_VOCABULARY" })).filter(
    (record) => !settings?.hideMasteredWords || record.status !== "mastered"
  );

  const sortedVocabulary = [...activeVocabulary].sort(
    (a, b) => b.normalized_text.length - a.normalized_text.length
  );

  if (sortedVocabulary.length === 0 || !document.body) {
    return;
  }

  const textNodes = collectTextNodes(document.body);
  let pageMatchCount = 0;
  const matchedVocabularyIds = new Set<string>();

  for (const node of textNodes) {
    pageMatchCount += highlightTextNode(node, sortedVocabulary, matchedVocabularyIds);
  }

  if (pageMatchCount > 0) {
    const pageVocabulary = activeVocabulary.filter((record) =>
      matchedVocabularyIds.has(record.id)
    );

    if (settings.pageVocabularyBubbleEnabled) {
      renderPageBubble(pageMatchCount, pageVocabulary);
    }

    schedulePassiveReviewPrompt(pageVocabulary);
  }

  if (matchedVocabularyIds.size > 0) {
    void sendMessage({
      type: "RECORD_PAGE_EXPOSURES",
      payload: { ids: [...matchedVocabularyIds] }
    })
      .then((records) => {
        activeVocabulary = mergeVocabularyRecords(activeVocabulary, records);
      })
      .catch(handleRuntimeFailure);
  }
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
  records: VocabularyRecord[],
  matchedVocabularyIds: Set<string>
): number {
  const text = node.nodeValue ?? "";
  const fragment = document.createDocumentFragment();
  let remaining = text;
  let count = 0;

  while (remaining.length > 0) {
    const match = findNextVocabularyMatch(remaining, records);

    if (!match) {
      fragment.append(document.createTextNode(remaining));
      break;
    }

    if (match.index > 0) {
      fragment.append(document.createTextNode(remaining.slice(0, match.index)));
    }

    const span = document.createElement("span");
    span.className = `lexitrace-highlight lexitrace-highlight--${match.record.status}`;
    span.setAttribute(HIGHLIGHT_ATTRIBUTE, "true");
    span.setAttribute(VOCABULARY_ID_ATTRIBUTE, match.record.id);
    span.textContent = match.text;
    fragment.append(span);
    matchedVocabularyIds.add(match.record.id);

    remaining = remaining.slice(match.index + match.text.length);
    count += 1;
  }

  if (count > 0) {
    node.replaceWith(fragment);
  }

  return count;
}

function findNextVocabularyMatch(
  text: string,
  records: VocabularyRecord[]
): { index: number; text: string; record: VocabularyRecord } | undefined {
  let best:
    | { index: number; text: string; record: VocabularyRecord }
    | undefined;

  for (const record of records) {
    const variants = record.is_phrase
      ? [record.normalized_text]
      : getLookupForms(record.normalized_text);

    for (const variant of variants) {
      const pattern = record.is_phrase
        ? escapeRegExp(variant)
        : `\b${escapeRegExp(variant)}\b`;
      const match = new RegExp(pattern, "i").exec(text);

      if (!match || match.index < 0) {
        continue;
      }

      const candidate = {
        index: match.index,
        text: match[0],
        record
      };

      if (
        !best ||
        candidate.index < best.index ||
        (candidate.index === best.index && candidate.text.length > best.text.length)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function clearHighlights(): void {
  document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTRIBUTE}]`).forEach((node) => {
    node.replaceWith(document.createTextNode(node.textContent ?? ""));
  });
  document.body?.normalize();
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
  if (settings?.recallFirstPopupEnabled === false) {
    renderRevealMode(record, highlight.textContent ?? record.text);
  } else {
    renderRecallMode(record, highlight.textContent ?? record.text);
  }
  appendToUiRoot(recallPopup);
  positionPopupWithinViewport(recallPopup, recallAnchorRect);
}

function renderRecallMode(record: VocabularyRecord, currentText: string): void {
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
    void updateRecall(record.id, "unsure", () => renderRevealMode(record, currentText)).catch(
      handleRuntimeFailure
    );
  });

  actions.append(hintButton, rememberedButton, unsureButton);
  recallPopup.append(actions);
  positionPopupWithinViewport(recallPopup, recallAnchorRect);
}

function renderRevealMode(record: VocabularyRecord, currentText: string): void {
  if (!recallPopup) {
    return;
  }

  recallPopup.replaceChildren();
  recallPopup.append(createTextElement("h2", "lexitrace-popup__title", record.text));
  appendSection(recallPopup, t("meaning"), record.meaning_zh || t("noSavedMeaning"));

  if (record.meaning_en) {
    appendSection(recallPopup, t("englishHint"), record.meaning_en);
  }

  appendSentenceSection(recallPopup, t("previousSentence"), record.source_sentence);

  const currentSentence = extractSentenceAroundSelection(
    document.body.innerText.slice(0, 4000),
    currentText
  );
  appendSentenceSection(recallPopup, t("currentSentence"), currentSentence);

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  const addReviewButton = createButton(t("addToReview"));
  addReviewButton.addEventListener("click", closePopups);

  const understoodButton = createButton(t("understood"), true);
  understoodButton.addEventListener("click", closePopups);

  actions.append(addReviewButton, understoodButton);
  recallPopup.append(actions);
  positionPopupWithinViewport(recallPopup, recallAnchorRect);
}

async function updateRecall(
  id: string,
  outcome: "remembered" | "unsure",
  afterUpdate?: () => void
): Promise<void> {
  const updatedRecord = await sendMessage({
    type: "RECORD_RECALL",
    payload: { id, outcome }
  });
  activeVocabulary = activeVocabulary.map((record) =>
    record.id === updatedRecord.id ? updatedRecord : record
  );

  if (afterUpdate) {
    afterUpdate();
    await refreshHighlights();
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
  const uniqueCount = pageVocabulary.length || matchCount;
  const dueCount = getDueReviewRecords(pageVocabulary).length;
  button.textContent =
    uniqueCount === 1 ? t("oneWordToRecall") : t("savedWordsOnPage", { count: uniqueCount });
  if (dueCount > 0) {
    button.textContent = `${button.textContent} · ${dueCount} ${t("dueReview")}`;
  }

  if (pageVocabulary.some((record) => record.toeic_usefulness === "High")) {
    button.classList.add("lexitrace-bubble__button--toeic");
  }

  const panel = document.createElement("div");
  panel.className = "lexitrace-bubble__panel";
  panel.hidden = true;

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
    panel.hidden = !panel.hidden;
  });

  panel.append(title, list, quickRecallButton, quizButton, hideButton);
  pageBubble.append(button, panel);
  appendToUiRoot(pageBubble);
}


function startBubbleReview(records: VocabularyRecord[], quizMode: boolean): void {
  const reviewRecords = records.filter((record) => record.status !== "mastered" && record.status !== "ignored");
  if (reviewRecords.length === 0) {
    return;
  }

  bubbleReviewQueue = reviewRecords;
  bubbleReviewIndex = 0;
  bubbleReviewShowAnswer = !quizMode;
  renderBubbleReviewCard(quizMode);
}

function renderBubbleReviewCard(quizMode: boolean): void {
  const record = bubbleReviewQueue[bubbleReviewIndex];
  if (!record) {
    closePopups();
    return;
  }

  closePopups();
  const centerRect = new DOMRect(window.innerWidth / 2 - 120, window.innerHeight / 2 - 80, 240, 120);
  recallPopup = createPopupShell(centerRect);
  recallPopup.replaceChildren(
    createTextElement("h2", "lexitrace-popup__title", `${t("reviewProgress", { current: bubbleReviewIndex + 1, total: bubbleReviewQueue.length })}`),
    createTextElement("div", "lexitrace-popup__meta", record.text)
  );

  appendSection(recallPopup, t("recall"), bubbleReviewShowAnswer ? (record.meaning_zh || t("noSavedMeaning")) : t("reviewThinkFirst"));

  const actions = document.createElement("div");
  actions.className = "lexitrace-popup__actions";

  if (!bubbleReviewShowAnswer) {
    const showAnswerButton = createButton(t("showAnswer"), true);
    showAnswerButton.addEventListener("click", () => {
      bubbleReviewShowAnswer = true;
      renderBubbleReviewCard(quizMode);
    });
    actions.append(showAnswerButton);
  }

  const unsureButton = createButton(t("unsure"));
  unsureButton.addEventListener("click", () => {
    void updateRecall(record.id, "unsure").catch(handleRuntimeFailure);
    bubbleReviewIndex += 1;
    bubbleReviewShowAnswer = !quizMode;
    renderBubbleReviewCard(quizMode);
  });

  const rememberedButton = createButton(t("remembered"), true);
  rememberedButton.addEventListener("click", () => {
    void updateRecall(record.id, "remembered").catch(handleRuntimeFailure);
    bubbleReviewIndex += 1;
    bubbleReviewShowAnswer = !quizMode;
    renderBubbleReviewCard(quizMode);
  });

  const closeButton = createButton(t("later"));
  closeButton.addEventListener("click", closePopups);

  actions.append(unsureButton, rememberedButton, closeButton);
  recallPopup.append(actions);
  appendToUiRoot(recallPopup);
  positionPopupWithinViewport(recallPopup, centerRect);
}

function removePageBubble(): void {
  pageBubble?.remove();
  pageBubble = undefined;
}

function schedulePassiveReviewPrompt(pageVocabulary: VocabularyRecord[]): void {
  if (
    reviewPromptScheduled ||
    !settings?.lightweightReviewPromptsEnabled ||
    document.hidden
  ) {
    return;
  }

  const dueRecords = getDueReviewRecords(pageVocabulary);
  if (dueRecords.length === 0 || Math.random() > getReviewPromptProbability()) {
    return;
  }

  reviewPromptScheduled = true;
  const record = dueRecords[0];
  window.setTimeout(() => {
    if (extensionContextActive && settings?.lightweightReviewPromptsEnabled) {
      renderReviewPrompt(record);
    }
  }, 4000);
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
  laterButton.addEventListener("click", closeReviewPrompt);

  const showAnswerButton = createButton(t("showAnswer"), true);
  showAnswerButton.addEventListener("click", () => revealReviewPromptAnswer(record));

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
  reviewPrompt?.remove();
  reviewPrompt = undefined;
}

function createPopupShell(rect: DOMRect): HTMLElement {
  const popup = document.createElement("section");
  popup.className = "lexitrace-popup";
  popup.setAttribute(ROOT_ATTRIBUTE, "true");

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
  lookupPopup?.remove();
  recallPopup?.remove();
  lookupPopup = undefined;
  recallPopup = undefined;
  lookupAnchorRect = undefined;
  recallAnchorRect = undefined;
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

  return new Date(record.next_review_at).getTime() <= Date.now();
}

function getReviewPromptProbability(): number {
  switch (settings?.reviewPromptFrequency) {
    case "High":
      return 1;
    case "Medium":
      return 0.65;
    case "Low":
    default:
      return 0.35;
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
