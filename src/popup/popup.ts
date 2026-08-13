import { t } from "../core/i18n";
import { normalizeText } from "../core/normalize";
import { sendRuntimeMessage } from "../core/messages";
import { buildToeicFoundationPlan } from "../core/toeic-learning";
import type { VocabularyRecord } from "../core/types";
import "./popup.css";

const popupRoot = document.getElementById("lexitrace-popup-root");

if (!popupRoot) {
  throw new Error("Popup root not found");
}

const root = popupRoot;
let records: VocabularyRecord[] = [];
let reviewQueue: VocabularyRecord[] = [];
let reviewIndex = 0;
let showHint = false;
let showAnswer = false;
let savingOutcome = false;
let rememberedCount = 0;
let reviewMode: "general" | "toeic-foundation" = "general";

void loadDashboard();

async function loadDashboard(): Promise<void> {
  renderLoading();
  try {
    records = await sendRuntimeMessage({ type: "EXPORT_VOCABULARY_JSON" });
    renderDashboard();
  } catch (error) {
    renderError(error);
  }
}

function renderLoading(): void {
  const wrapper = createElement("div", "popup popup--loading");
  wrapper.setAttribute("aria-live", "polite");
  wrapper.append(
    createElement("span", "loading-indicator"),
    createText("p", "loading-copy", t("loadingVocabulary"))
  );
  root.replaceChildren(wrapper);
}

function renderDashboard(): void {
  const active = getActiveRecords(records);
  const due = active.filter(isDueForReview).sort(compareReviewPriority);
  const learningCount = active.filter((record) => record.status !== "mastered").length;
  const toeicPlan = buildToeicFoundationPlan(active);

  const wrapper = createElement("div", "popup");
  const header = createHeader();
  const intro = createElement("section", "dashboard-intro");
  intro.append(
    createText(
      "p",
      "dashboard-eyebrow",
      due.length > 0 ? t("readyToRecall") : t("readingCompanion")
    ),
    createText(
      "h2",
      "dashboard-title",
      due.length > 0
        ? t("dueWordsTitle", { count: due.length })
        : active.length > 0
          ? t("keepWordsFresh")
          : t("startFromReading")
    ),
    createText(
      "p",
      "dashboard-copy",
      active.length > 0 ? t("popupHint") : t("emptyVocabularyHint")
    )
  );

  const stats = createElement("div", "stats");
  stats.append(
    createStat(t("savedVocabulary"), active.length),
    createStat(t("learningVocabulary"), learningCount),
    createStat(t("dueToday"), due.length, due.length > 0)
  );

  const actions = createElement("div", "dashboard-actions");
  if (active.length > 0) {
    const reviewButton = createButton(
      due.length > 0
        ? t("startDueReview", { count: Math.min(5, due.length) })
        : t("randomRecall"),
      true
    );
    reviewButton.addEventListener("click", () => startReview(due.length > 0 ? due : active));
    actions.append(reviewButton);
  }

  const optionsButton = createButton(t("openSettings"));
  optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  actions.append(optionsButton);

  wrapper.append(header, intro, stats);
  if (due.length > 0) {
    wrapper.append(createDuePreview(due));
  }
  if (toeicPlan.queue.length > 0) {
    wrapper.append(createToeicFoundationCard(toeicPlan));
  }
  wrapper.append(actions);
  root.replaceChildren(wrapper);
}

function createToeicFoundationCard(
  plan: ReturnType<typeof buildToeicFoundationPlan>
): HTMLElement {
  const section = createElement("section", "toeic-foundation");
  const copy = createElement("div", "toeic-foundation__copy");
  copy.append(
    createText("p", "toeic-foundation__eyebrow", t("toeicFoundationEyebrow")),
    createText("h3", "toeic-foundation__title", t("toeicFoundationTitle")),
    createText("p", "toeic-foundation__desc", t("toeicFoundationDesc"))
  );

  const metrics = createElement("div", "toeic-foundation__metrics");
  metrics.append(
    createText(
      "span",
      "toeic-foundation__metric",
      t("toeicFoundationAttention", { count: plan.needsAttentionCount })
    ),
    createText(
      "span",
      "toeic-foundation__metric",
      plan.quizAccuracy === undefined
        ? t("toeicFoundationNoAccuracy")
        : t("toeicFoundationAccuracy", { accuracy: plan.quizAccuracy })
    )
  );

  const startButton = createButton(
    t("startToeicFoundation", { count: plan.queue.length }),
    true
  );
  startButton.addEventListener("click", () =>
    startReview(plan.queue, "toeic-foundation")
  );

  section.append(copy, metrics, startButton);
  return section;
}

function createHeader(): HTMLElement {
  const header = createElement("header", "popup-header");
  const brand = createElement("div", "brand");
  brand.append(
    createText("span", "brand-mark", "L"),
    createText("h1", "brand-name", t("appTitle"))
  );
  header.append(brand, createText("span", "local-badge", t("localFirst")));
  return header;
}

function createStat(label: string, value: number, accent = false): HTMLElement {
  const stat = createElement("div", accent ? "stat stat--accent" : "stat");
  stat.append(
    createText("strong", "stat-value", String(value)),
    createText("span", "stat-label", label)
  );
  return stat;
}

function createDuePreview(due: VocabularyRecord[]): HTMLElement {
  const section = createElement("section", "due-preview");
  const heading = createElement("div", "section-heading");
  heading.append(
    createText("h3", "section-title", t("nextToRecall")),
    createText("span", "section-meta", t("upToFive"))
  );
  const list = createElement("div", "word-list");
  for (const record of due.slice(0, 3)) {
    const item = createElement("div", "word-row");
    const word = createElement("div", "word-copy");
    word.append(
      createText("strong", "word-name", record.text),
      createText("span", "word-hint", record.meaning_en || record.part_of_speech || t("recallFirst"))
    );
    item.append(word, createText("span", "status-dot", translateStatus(record.status)));
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function startReview(
  candidates: VocabularyRecord[],
  mode: "general" | "toeic-foundation" = "general"
): void {
  reviewQueue = [...candidates].sort(compareReviewPriority).slice(0, 5);
  reviewMode = mode;
  reviewIndex = 0;
  showHint = false;
  showAnswer = false;
  savingOutcome = false;
  rememberedCount = 0;
  renderReviewCard();
}

function renderReviewCard(): void {
  const record = reviewQueue[reviewIndex];
  if (!record) {
    renderReviewComplete();
    return;
  }

  const wrapper = createElement("div", "popup popup--review");
  const topbar = createElement("div", "review-topbar");
  const backButton = createButton(t("back"));
  backButton.classList.add("button--quiet");
  backButton.addEventListener("click", renderDashboard);
  topbar.append(
    backButton,
    createText(
      "span",
      "review-progress",
      t("reviewProgress", { current: reviewIndex + 1, total: reviewQueue.length })
    )
  );

  const card = createElement("section", "review-card");
  card.append(
    createText(
      "p",
      "review-eyebrow",
      reviewMode === "toeic-foundation"
        ? t("toeicFoundationReview")
        : t("recallBeforeReveal")
    ),
    createText("h2", "review-word", record.text)
  );

  if (reviewMode === "toeic-foundation") {
    const badges = createElement("div", "review-badges");
    badges.append(
      createText(
        "span",
        "review-badge review-badge--toeic",
        `TOEIC ${record.toeic_usefulness}`
      ),
      createText("span", "review-badge", record.context_type)
    );
    card.append(badges);
  }

  if (record.source_sentence) {
    card.append(createText("p", "review-sentence", createCloze(record)));
  }

  if (showHint && !showAnswer) {
    const hint = createText(
      "p",
      "review-hint",
      record.meaning_en || record.part_of_speech || record.meaning_zh.slice(0, 1) || t("noSavedMeaning")
    );
    hint.setAttribute("role", "status");
    card.append(hint);
  }

  if (showAnswer) {
    const answer = createElement("div", "review-answer");
    answer.append(
      createText("span", "answer-label", t("meaning")),
      createText("p", "answer-meaning", record.meaning_zh || t("noSavedMeaning"))
    );
    if (record.meaning_en) {
      answer.append(createText("p", "answer-hint", record.meaning_en));
    }
    card.append(answer);
  }

  const actions = createElement("div", "review-actions");
  if (!showAnswer) {
    const hintButton = createButton(t("showHint"));
    hintButton.disabled = showHint;
    hintButton.addEventListener("click", () => {
      showHint = true;
      renderReviewCard();
    });
    const revealButton = createButton(t("showAnswer"), true);
    revealButton.addEventListener("click", () => {
      showAnswer = true;
      renderReviewCard();
    });
    actions.append(hintButton, revealButton);
  } else {
    const unsureButton = createButton(t("unsure"));
    unsureButton.disabled = savingOutcome;
    unsureButton.addEventListener("click", () => void submitOutcome(record, "unsure"));
    const rememberedButton = createButton(t("remembered"), true);
    rememberedButton.disabled = savingOutcome;
    rememberedButton.addEventListener("click", () => void submitOutcome(record, "remembered"));
    actions.append(unsureButton, rememberedButton);
  }

  wrapper.append(topbar, card, actions);
  root.replaceChildren(wrapper);
}

async function submitOutcome(
  record: VocabularyRecord,
  outcome: "remembered" | "unsure"
): Promise<void> {
  if (savingOutcome) {
    return;
  }

  savingOutcome = true;
  renderReviewCard();
  try {
    const updated = await sendRuntimeMessage({
      type: "RECORD_RECALL",
      payload: { id: record.id, outcome }
    });
    records = records.map((item) => item.id === updated.id ? updated : item);
    if (outcome === "remembered") {
      rememberedCount += 1;
    }
    reviewIndex += 1;
    showHint = false;
    showAnswer = false;
    savingOutcome = false;
    renderReviewCard();
  } catch (error) {
    savingOutcome = false;
    renderError(error, () => renderReviewCard());
  }
}

function renderReviewComplete(): void {
  const wrapper = createElement("div", "popup popup--complete");
  const mark = createText("span", "complete-mark", "L");
  wrapper.append(
    mark,
    createText(
      "p",
      "dashboard-eyebrow",
      reviewMode === "toeic-foundation"
        ? t("toeicFoundationComplete")
        : t("reviewComplete")
    ),
    createText("h2", "dashboard-title", t("reviewCompleteTitle")),
    createText(
      "p",
      "dashboard-copy",
      t("reviewCompleteSummary", { remembered: rememberedCount, total: reviewQueue.length })
    )
  );
  const actions = createElement("div", "dashboard-actions");
  const doneButton = createButton(t("backToOverview"), true);
  doneButton.addEventListener("click", renderDashboard);
  actions.append(doneButton);
  wrapper.append(actions);
  root.replaceChildren(wrapper);
}

function renderError(error: unknown, retry: () => void = loadDashboard): void {
  const wrapper = createElement("div", "popup popup--error");
  wrapper.append(
    createText("p", "dashboard-eyebrow", t("somethingWentWrong")),
    createText(
      "h2",
      "dashboard-title",
      error instanceof Error ? error.message : t("unknownError")
    ),
    createText("p", "dashboard-copy", t("localDataSafe"))
  );
  const retryButton = createButton(t("retry"), true);
  retryButton.addEventListener("click", retry);
  const actions = createElement("div", "dashboard-actions");
  actions.append(retryButton);
  wrapper.append(actions);
  root.replaceChildren(wrapper);
}

function getActiveRecords(allRecords: VocabularyRecord[]): VocabularyRecord[] {
  return allRecords.filter(
    (record) =>
      record.type === "saved" &&
      !record.is_ignored &&
      record.status !== "ignored"
  );
}

function isDueForReview(record: VocabularyRecord): boolean {
  if (record.status === "mastered" || record.status === "ignored") {
    return false;
  }

  if (!record.next_review_at) {
    return record.status === "new" || record.status === "weak";
  }

  const nextReviewTime = new Date(record.next_review_at).getTime();
  return Number.isNaN(nextReviewTime) || nextReviewTime <= Date.now();
}

function compareReviewPriority(a: VocabularyRecord, b: VocabularyRecord): number {
  return Number(isDueForReview(b)) - Number(isDueForReview(a)) ||
    b.review_priority - a.review_priority ||
    new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime();
}

function createCloze(record: VocabularyRecord): string {
  const escaped = record.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, "i");
  return record.source_sentence.replace(pattern, (_match, prefix: string) => `${prefix}______`);
}

function translateStatus(status: VocabularyRecord["status"]): string {
  const keys = {
    new: "statusNew",
    learning: "statusLearning",
    weak: "statusWeak",
    familiar: "statusFamiliar",
    mastered: "statusMastered",
    ignored: "statusIgnored"
  } as const;
  return t(keys[status]);
}

function createButton(label: string, primary = false): HTMLButtonElement {
  const button = createElement("button", primary ? "button button--primary" : "button");
  button.type = "button";
  button.textContent = label;
  return button;
}

function createText<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text: string
): HTMLElementTagNameMap[K] {
  const element = createElement(tagName, className);
  element.textContent = text;
  return element;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}
