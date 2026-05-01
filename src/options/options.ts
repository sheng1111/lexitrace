import { sendRuntimeMessage } from "../core/messages";
import { t } from "../core/i18n";
import type { ExtensionSettings } from "../core/types";
import "./options.css";

const optionsRoot = document.getElementById("lexitrace-options-root");

if (!optionsRoot) {
  throw new Error("Options root not found");
}

const root = optionsRoot;

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
  header.append(
    createText("h1", "settings-title", t("appTitle")),
    createText("p", "settings-subtitle", t("appSubtitle"))
  );

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
    settings.lastSyncAt ? t("lastSync", { time: formatDateTime(settings.lastSyncAt) }) : ""
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
      status.textContent = t("syncing");
      try {
        const next = await sendRuntimeMessage({ type: "ENABLE_GOOGLE_SHEET_OAUTH_SYNC" });
        root.replaceChildren(createSettingsPage(next));
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : t("oauthSetupRequired");
      }
    });
    actions.append(enableButton);
    section.append(actions, status, createAdvancedSyncSection(settings));
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
    status.textContent = t("syncing");
    try {
      const result = await sendRuntimeMessage({ type: "SYNC_PENDING_VOCABULARY" });
      const lastSyncAt = new Date().toISOString();
      await saveSettings({ lastSyncAt });
      status.textContent = t("syncResult", {
        pushed: result.pushed,
        failed: result.failed
      });
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : t("syncFailedLocalSafe");
    }
  });

  const openButton = createActionButton(t("openGoogleSheet"));
  openButton.disabled = !settings.googleSheetUrl;
  openButton.addEventListener("click", () => {
    if (settings.googleSheetUrl) {
      window.open(settings.googleSheetUrl, "_blank", "noreferrer");
    }
  });

  const changeButton = createActionButton(t("changeSyncSheet"));
  changeButton.addEventListener("click", async () => {
    status.textContent = t("syncing");
    try {
      const next = await sendRuntimeMessage({ type: "ENABLE_GOOGLE_SHEET_OAUTH_SYNC" });
      root.replaceChildren(createSettingsPage(next));
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : t("oauthSetupRequired");
    }
  });

  const disableButton = createActionButton(t("disableSync"));
  disableButton.addEventListener("click", async () => {
    const next = await sendRuntimeMessage({ type: "DISABLE_GOOGLE_SHEET_SYNC" });
    root.replaceChildren(createSettingsPage(next));
  });

  actions.append(syncButton, openButton, changeButton, disableButton);
  section.append(actions, status, createAdvancedSyncSection(settings));
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

function createSelectRow<T extends string>(
  title: string,
  description: string,
  value: T,
  options: Array<T | { value: T; label: string }>,
  onChange: (value: T) => void
): HTMLElement {
  const select = document.createElement("select");
  select.className = "setting-select";

  for (const item of options) {
    const optionValue = typeof item === "string" ? item : item.value;
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = typeof item === "string" ? item : item.label;
    option.selected = optionValue === value;
    select.append(option);
  }

  select.addEventListener("change", () => onChange(select.value as T));
  return createSettingRow(title, description, select);
}

function createTextRow(
  title: string,
  description: string,
  value: string,
  onChange: (value: string) => void
): HTMLElement {
  const input = document.createElement("input");
  input.className = "setting-input";
  input.type = "url";
  input.value = value;
  input.placeholder = t("syncEndpointPlaceholder");
  input.addEventListener("change", () => onChange(input.value.trim()));
  return createSettingRow(title, description, input);
}

function createSettingRow(
  title: string,
  description: string,
  control: HTMLElement
): HTMLElement {
  const row = document.createElement("div");
  row.className = "setting-row";

  const label = document.createElement("div");
  label.className = "setting-label";
  label.append(createText("strong", "", title), createText("span", "", description));

  row.append(label, control);
  return row;
}

async function saveSettings(
  patch: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  return sendRuntimeMessage({ type: "UPDATE_SETTINGS", payload: patch });
}

async function updateAndRender(patch: Partial<ExtensionSettings>): Promise<void> {
  const settings = await saveSettings(patch);
  root.replaceChildren(createSettingsPage(settings));
}

function createAdvancedSyncSection(settings: ExtensionSettings): HTMLElement {
  const details = document.createElement("details");
  details.className = "advanced-section";

  const summary = document.createElement("summary");
  summary.textContent = t("advancedSync");

  details.append(
    summary,
    createText("p", "status-line", t("advancedSyncDesc")),
    createSelectRow(
      t("syncMode"),
      t("syncModeDesc"),
      settings.syncMode,
      [
        { value: "Off" as const, label: t("syncModeOff") },
        { value: "Manual" as const, label: t("syncModeManual") },
        { value: "Auto" as const, label: t("syncModeAuto") }
      ],
      (value) => updateAndRender({ syncMode: value })
    ),
    createTextRow(
      t("syncEndpoint"),
      t("advancedSyncDesc"),
      settings.googleSheetEndpointUrl,
      (value) =>
        updateAndRender({
          googleSheetAuthMode: "apps_script",
          googleSheetEndpointUrl: value
        })
    )
  );

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
