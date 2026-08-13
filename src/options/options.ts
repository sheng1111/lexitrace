import { sendRuntimeMessage } from "../core/messages";
import { t } from "../core/i18n";
import type { ExtensionSettings } from "../core/types";
import "./options.css";

const optionsRoot = document.getElementById("lexitrace-options-root");

if (!optionsRoot) {
  throw new Error("Options root not found");
}

const root = optionsRoot;
let settingControlId = 0;
let saveStatusTimer: number | undefined;
let settingsSaveQueue: Promise<void> = Promise.resolve();
let saveRequestVersion = 0;

void render();

async function render(): Promise<void> {
  const settings = await sendRuntimeMessage({ type: "GET_SETTINGS" });
  root.replaceChildren(createSettingsPage(settings));
}

function createSettingsPage(settings: ExtensionSettings): HTMLElement {
  const page = document.createElement("div");
  page.className = "settings-page";

  const header = document.createElement("header");
  header.className = "settings-header";
  const brand = document.createElement("div");
  brand.className = "settings-brand";
  brand.append(
    createText("span", "settings-brand-mark", "L"),
    createText("span", "settings-eyebrow", t("settingsEyebrow"))
  );
  const titleRow = document.createElement("div");
  titleRow.className = "settings-title-row";
  const titleCopy = document.createElement("div");
  titleCopy.append(
    createText("h1", "settings-title", t("appTitle")),
    createText("p", "settings-subtitle", t("appSubtitle"))
  );
  const saveStatus = createText("span", "settings-save-status", "");
  saveStatus.id = "lexitrace-settings-save-status";
  saveStatus.setAttribute("role", "status");
  titleRow.append(titleCopy, saveStatus);
  header.append(brand, titleRow);

  const grid = document.createElement("div");
  grid.className = "settings-grid";
  grid.append(
    createGeneralSection(settings),
    createLookupSection(settings),
    createReviewSection(settings),
    createSyncSection(settings),
    createExportSection()
  );

  page.append(header, grid);
  return page;
}

function createGeneralSection(settings: ExtensionSettings): HTMLElement {
  const section = createSection(t("settingsGeneral"));
  section.append(
    createCheckboxRow(
      t("enableExtension"),
      t("enableExtensionDesc"),
      settings.extensionEnabled,
      (value) => updateAndRender({ extensionEnabled: value })
    ),
    createCheckboxRow(
      t("enableHighlights"),
      t("enableHighlightsDesc"),
      settings.highlightsEnabled,
      (value) => updateAndRender({ highlightsEnabled: value })
    ),
    createCheckboxRow(
      t("pageVocabularyBubble"),
      t("pageVocabularyBubbleDesc"),
      settings.pageVocabularyBubbleEnabled,
      (value) => updateAndRender({ pageVocabularyBubbleEnabled: value })
    )
  );
  return section;
}

function createLookupSection(settings: ExtensionSettings): HTMLElement {
  const section = createSection(t("settingsLookup"));
  section.append(
    createText("p", "settings-copy", t("lookupProviderDesc")),
    createSelectRow(
      t("defaultLookupAction"),
      t("defaultLookupActionDesc"),
      settings.defaultActionAfterLookup,
      [
        { value: "Ask" as const, label: t("defaultActionAsk") },
        { value: "Save automatically" as const, label: t("defaultActionSave") },
        { value: "Understood automatically" as const, label: t("defaultActionUnderstood") }
      ],
      (value) => updateAndRender({ defaultActionAfterLookup: value })
    ),
    createCheckboxRow(
      t("showToeicBadge"),
      t("showToeicBadgeDesc"),
      settings.showToeicBadge,
      (value) => updateAndRender({ showToeicBadge: value })
    ),
    createCheckboxRow(
      t("showContextBadge"),
      t("showContextBadgeDesc"),
      settings.showContextBadge,
      (value) => updateAndRender({ showContextBadge: value })
    ),
    createCheckboxRow(
      t("disableInCodeBlocks"),
      t("disableInCodeBlocksDesc"),
      settings.disableInCodeBlocks,
      (value) => updateAndRender({ disableInCodeBlocks: value })
    ),
    createCheckboxRow(
      t("unofficialGoogleTranslate"),
      t("unofficialGoogleTranslateDesc"),
      settings.unofficialGoogleTranslateEnabled,
      (value) => updateAndRender({ unofficialGoogleTranslateEnabled: value })
    )
  );
  return section;
}

function createReviewSection(settings: ExtensionSettings): HTMLElement {
  const section = createSection(t("settingsReview"));
  section.append(
    createCheckboxRow(
      t("recallFirstPopup"),
      t("recallFirstPopupDesc"),
      settings.recallFirstPopupEnabled,
      (value) => updateAndRender({ recallFirstPopupEnabled: value })
    ),
    createCheckboxRow(
      t("lightweightReviewPrompts"),
      t("lightweightReviewPromptsDesc"),
      settings.lightweightReviewPromptsEnabled,
      (value) => updateAndRender({ lightweightReviewPromptsEnabled: value })
    ),
    createSelectRow(
      t("reviewPromptFrequency"),
      t("reviewPromptFrequencyDesc"),
      settings.reviewPromptFrequency,
      [
        { value: "Low" as const, label: t("frequencyLow") },
        { value: "Medium" as const, label: t("frequencyMedium") },
        { value: "High" as const, label: t("frequencyHigh") }
      ],
      (value) => updateAndRender({ reviewPromptFrequency: value })
    ),
    createSelectRow(
      t("pageReviewQuestionCount"),
      t("pageReviewQuestionCountDesc"),
      settings.pageReviewQuestionCount,
      [
        { value: 1 as const, label: t("questionCount", { count: 1 }) },
        { value: 2 as const, label: t("questionCount", { count: 2 }) },
        { value: 3 as const, label: t("questionCount", { count: 3 }) }
      ],
      (value) => updateAndRender({ pageReviewQuestionCount: value })
    ),
    createCheckboxRow(
      t("hideMasteredWords"),
      t("hideMasteredWordsDesc"),
      settings.hideMasteredWords,
      (value) => updateAndRender({ hideMasteredWords: value })
    )
  );
  return section;
}

function createSyncSection(settings: ExtensionSettings): HTMLElement {
  const section = createSection(t("settingsSync"));
  const status = createText(
    "p",
    "status-line",
    settings.lastSyncError
      ? t("lastSyncError", { message: settings.lastSyncError })
      : settings.lastSyncAt
        ? t("lastSync", { time: formatDateTime(settings.lastSyncAt) })
        : t("syncNotYet")
  );

  section.append(createText("p", "settings-copy", t("syncIntro")));

  const actions = document.createElement("div");
  actions.className = "settings-actions";

  if (!settings.googleSheetSyncEnabled) {
    const enableButton = document.createElement("button");
    enableButton.className = "button button-primary";
    enableButton.type = "button";
    enableButton.textContent = t("enableGoogleSheetSync");
    enableButton.addEventListener("click", async () => {
      enableButton.disabled = true;
      status.textContent = t("syncing");
      try {
        const next = await sendRuntimeMessage({ type: "ENABLE_GOOGLE_SHEET_OAUTH_SYNC" });
        root.replaceChildren(createSettingsPage(next));
      } catch (error) {
        enableButton.disabled = false;
        status.textContent =
          error instanceof Error ? error.message : t("oauthSetupRequired");
      }
    });
    actions.append(enableButton);
    section.append(actions, createExistingSheetConnector(status), status);
    return section;
  }

  section.append(
    createText("p", "sync-state-title", t("googleSheetEnabled")),
    createText(
      "p",
      "status-line",
      t("googleSheetFile", { name: settings.googleSheetName ?? "LexiTrace Sync Data" })
    )
  );

  const syncButton = createActionButton(t("syncNow"), true);
  syncButton.addEventListener("click", async () => {
    syncButton.disabled = true;
    status.textContent = t("syncing");
    try {
      const result = await sendRuntimeMessage({ type: "SYNC_PENDING_VOCABULARY" });
      status.textContent = t("syncResult", {
        pushed: result.pushed,
        pulled: result.pulled,
        conflicts: result.conflicts,
        pending: result.pending,
        failed: result.failed
      });
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : t("syncFailedLocalSafe");
    } finally {
      syncButton.disabled = false;
    }
  });

  const openButton = createActionButton(t("openGoogleSheet"));
  openButton.disabled = !settings.googleSheetUrl;
  openButton.addEventListener("click", () => {
    if (settings.googleSheetUrl) {
      window.open(settings.googleSheetUrl, "_blank", "noreferrer");
    }
  });

  const changeButton = createActionButton(t("createNewSyncSheet"));
  changeButton.addEventListener("click", async () => {
    changeButton.disabled = true;
    status.textContent = t("syncing");
    try {
      const next = await sendRuntimeMessage({ type: "ENABLE_GOOGLE_SHEET_OAUTH_SYNC" });
      root.replaceChildren(createSettingsPage(next));
    } catch (error) {
      changeButton.disabled = false;
      status.textContent =
        error instanceof Error ? error.message : t("oauthSetupRequired");
    }
  });

  const disableButton = createActionButton(t("disableSync"));
  disableButton.addEventListener("click", async () => {
    disableButton.disabled = true;
    try {
      const next = await sendRuntimeMessage({ type: "DISABLE_GOOGLE_SHEET_SYNC" });
      root.replaceChildren(createSettingsPage(next));
    } catch (error) {
      disableButton.disabled = false;
      status.textContent =
        error instanceof Error ? error.message : t("settingsSaveFailed");
    }
  });

  actions.append(syncButton, openButton, changeButton, disableButton);
  section.append(
    createSelectRow(
      t("syncMode"),
      t("syncModeDesc"),
      settings.syncMode,
      [
        { value: "Manual" as const, label: t("syncModeManual") },
        { value: "Auto" as const, label: t("syncModeAuto") }
      ],
      (value) => updateAndRender({ syncMode: value })
    ),
    actions,
    createExistingSheetConnector(status),
    status
  );
  return section;
}

function createExportSection(): HTMLElement {
  const section = createSection(t("settingsExport"));
  const status = createText("p", "status-line", "");

  const actions = document.createElement("div");
  actions.className = "settings-actions";

  const exportButton = document.createElement("button");
  exportButton.className = "button button-primary";
  exportButton.type = "button";
  exportButton.textContent = t("exportJson");
  exportButton.addEventListener("click", async () => {
    const records = await sendRuntimeMessage({ type: "EXPORT_VOCABULARY_JSON" });
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lexitrace-vocabulary-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = t("exportCreated");
  });

  actions.append(exportButton);
  section.append(actions, status);
  return section;
}

function createSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "settings-section";
  section.append(createText("h2", "", title));
  return section;
}

function createCheckboxRow(
  title: string,
  description: string,
  checked: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const input = document.createElement("input");
  input.className = "setting-checkbox";
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return createSettingRow(title, description, input);
}

function createSelectRow<T extends string | number>(
  title: string,
  description: string,
  value: T,
  options: Array<T | { value: T; label: string }>,
  onChange: (value: T) => void
): HTMLElement {
  const select = document.createElement("select");
  select.className = "setting-select";

  for (const item of options) {
    const optionValue = typeof item === "object" ? item.value : item;
    const option = document.createElement("option");
    option.value = String(optionValue);
    option.textContent = typeof item === "object" ? item.label : String(item);
    option.selected = optionValue === value;
    select.append(option);
  }

  select.addEventListener("change", () => {
    const selected = options.find((item) => {
      const optionValue = typeof item === "object" ? item.value : item;
      return String(optionValue) === select.value;
    });
    if (selected !== undefined) {
      onChange(typeof selected === "object" ? selected.value : selected);
    }
  });
  return createSettingRow(title, description, select);
}

function createSettingRow(
  title: string,
  description: string,
  control: HTMLElement
): HTMLElement {
  const row = document.createElement("div");
  row.className = "setting-row";

  settingControlId += 1;
  const controlId = `lexitrace-setting-${settingControlId}`;
  const descriptionId = `${controlId}-description`;
  control.id = controlId;
  control.setAttribute("aria-describedby", descriptionId);

  const label = document.createElement("label");
  label.className = "setting-label";
  label.htmlFor = controlId;
  const descriptionElement = createText("span", "", description);
  descriptionElement.id = descriptionId;
  label.append(createText("strong", "", title), descriptionElement);

  row.append(label, control);
  return row;
}

async function saveSettings(
  patch: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  return sendRuntimeMessage({ type: "UPDATE_SETTINGS", payload: patch });
}

async function updateAndRender(patch: Partial<ExtensionSettings>): Promise<void> {
  const requestVersion = ++saveRequestVersion;
  showSaveStatus(t("settingsSaving"), "saving");
  const saveTask = settingsSaveQueue.then(() => saveSettings(patch));
  settingsSaveQueue = saveTask.then(
    () => undefined,
    () => undefined
  );

  try {
    await saveTask;
    if (requestVersion === saveRequestVersion) {
      showSaveStatus(t("settingsSaved"), "saved");
    }
  } catch (error) {
    if (requestVersion !== saveRequestVersion) {
      return;
    }
    showSaveStatus(
      error instanceof Error ? error.message : t("settingsSaveFailed"),
      "error"
    );
    const current = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    root.replaceChildren(createSettingsPage(current));
  }
}

function showSaveStatus(
  message: string,
  state: "saving" | "saved" | "error"
): void {
  if (saveStatusTimer !== undefined) {
    window.clearTimeout(saveStatusTimer);
  }

  const status = document.getElementById("lexitrace-settings-save-status");
  if (!status) {
    return;
  }

  status.textContent = message;
  status.dataset.state = state;
  if (state !== "saving") {
    saveStatusTimer = window.setTimeout(() => {
      status.textContent = "";
      delete status.dataset.state;
    }, 2200);
  }
}

function createExistingSheetConnector(status: HTMLElement): HTMLElement {
  const details = document.createElement("details");
  details.className = "advanced-section";

  const summary = document.createElement("summary");
  summary.textContent = t("connectExistingSheet");

  const copy = createText("p", "status-line", t("connectExistingSheetDesc"));
  const form = document.createElement("div");
  form.className = "sync-connect-form";
  const input = document.createElement("input");
  input.className = "setting-input";
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = t("sheetUrlPlaceholder");
  input.setAttribute("aria-label", t("sheetUrlLabel"));
  const connectButton = createActionButton(t("connectSheet"), true);
  connectButton.addEventListener("click", async () => {
    const sheetUrlOrId = input.value.trim();
    if (!sheetUrlOrId) {
      status.textContent = t("sheetUrlRequired");
      input.focus();
      return;
    }

    connectButton.disabled = true;
    input.disabled = true;
    status.textContent = t("connectingSheet");
    try {
      const next = await sendRuntimeMessage({
        type: "CONNECT_GOOGLE_SHEET",
        payload: { sheetUrlOrId }
      });
      root.replaceChildren(createSettingsPage(next));
    } catch (error) {
      connectButton.disabled = false;
      input.disabled = false;
      status.textContent = error instanceof Error ? error.message : t("syncFailedLocalSafe");
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      connectButton.click();
    }
  });
  form.append(input, connectButton);
  details.append(summary, copy, form);

  return details;
}

function createActionButton(label: string, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = primary ? "button button-primary" : "button";
  button.type = "button";
  button.textContent = label;
  return button;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function createText<K extends keyof HTMLElementTagNameMap>(
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
