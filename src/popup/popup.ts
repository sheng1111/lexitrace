import { sendRuntimeMessage } from "../core/messages";
import { t } from "../core/i18n";
import "./popup.css";

const popupRoot = document.getElementById("lexitrace-popup-root");

if (!popupRoot) {
  throw new Error("Popup root not found");
}

const root = popupRoot;

void render();

async function render(): Promise<void> {
  const records = await sendRuntimeMessage({ type: "EXPORT_VOCABULARY_JSON" });

  const wrapper = document.createElement("div");
  wrapper.className = "popup";

  const title = document.createElement("h1");
  title.textContent = t("appTitle");

  const summary = document.createElement("p");
  summary.textContent = t("popupRecordCount", { count: records.length });

  const dueCount = records.filter(isDueForReview).length;
  const dueSummary = document.createElement("p");
  dueSummary.textContent = t("popupDueCount", { count: dueCount });

  const description = document.createElement("p");
  description.textContent = t("popupHint");

  const actions = document.createElement("div");
  actions.className = "popup-actions";

  const optionsButton = document.createElement("button");
  optionsButton.className = "button button-primary";
  optionsButton.type = "button";
  optionsButton.textContent = t("openSettings");
  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  actions.append(optionsButton);
  wrapper.append(title, summary, dueSummary, description, actions);
  root.replaceChildren(wrapper);
}

function isDueForReview(record: { next_review_at?: string; status: string }): boolean {
  if (record.status === "mastered" || record.status === "ignored") {
    return false;
  }

  if (!record.next_review_at) {
    return record.status === "new" || record.status === "weak";
  }

  return new Date(record.next_review_at).getTime() <= Date.now();
}
