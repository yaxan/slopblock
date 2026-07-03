import { parseDecisionExportResponse } from "../common/decisionExport";
import { summarizeContentDecisions } from "../common/decisionSummary";
import { QUICK_RULE_TOGGLES, quickToggleMode, setQuickToggleMode } from "../common/ruleToggles";
import { normalizeSettings } from "../common/settings";
import { loadSettings, saveSettings } from "../common/storage";
import type {
  Aggressiveness,
  ContentDecision,
  ContentMessage,
  ContentStats,
  FilterMode,
  SlopBlockSettings
} from "../common/types";

const enabledInput = element<HTMLInputElement>("enabled");
const aggressivenessGroup = element<HTMLDivElement>("aggressivenessGroup");
const filterModeGroup = element<HTMLDivElement>("filterModeGroup");
const showReasonsInput = element<HTMLInputElement>("showReasons");
const deepScanInput = element<HTMLInputElement>("deepScan");
const pageSummaryNode = element<HTMLDivElement>("pageSummary");
const quickRuleTogglesNode = element<HTMLDivElement>("quickRuleToggles");
const statusNode = element<HTMLElement>("status");

let settings: SlopBlockSettings;

void init();

async function init(): Promise<void> {
  settings = await loadSettings();
  render();
  bindEvents();
  void refreshPageSummary(false);
}

function render(): void {
  enabledInput.checked = settings.enabled;
  checkRadio(aggressivenessGroup, settings.aggressiveness);
  checkRadio(filterModeGroup, settings.filterMode);
  showReasonsInput.checked = settings.showReasons;
  deepScanInput.checked = settings.deepScan;
  renderQuickRuleToggles();
}

function checkRadio(group: HTMLElement, value: string): void {
  for (const input of group.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
    input.checked = input.value === value;
  }
}

function radioValue(group: HTMLElement): string | undefined {
  return group.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value;
}

function bindEvents(): void {
  enabledInput.addEventListener("change", () => updateAndSave({ enabled: enabledInput.checked }));
  showReasonsInput.addEventListener("change", () => updateAndSave({ showReasons: showReasonsInput.checked }));
  deepScanInput.addEventListener("change", () => updateAndSave({ deepScan: deepScanInput.checked }));
  aggressivenessGroup.addEventListener("change", () =>
    updateAndSave({ aggressiveness: radioValue(aggressivenessGroup) as Aggressiveness })
  );
  filterModeGroup.addEventListener("change", () =>
    updateAndSave({ filterMode: radioValue(filterModeGroup) as FilterMode })
  );

  quickRuleTogglesNode.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.quickRuleToggleId) {
      return;
    }

    const toggle = QUICK_RULE_TOGGLES.find((candidate) => candidate.id === target.dataset.quickRuleToggleId);
    if (!toggle) {
      return;
    }

    void updateAndSave(setQuickToggleMode(settings, toggle, target.checked ? "filter" : "off"));
  });

  quickRuleTogglesNode.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const modeButton = target.closest<HTMLButtonElement>("button[data-mode]");
    const container = modeButton?.closest<HTMLElement>("[data-quick-toggle-id]");
    if (!modeButton || !container) {
      return;
    }

    const toggle = QUICK_RULE_TOGGLES.find((candidate) => candidate.id === container.dataset.quickToggleId);
    if (!toggle) {
      return;
    }

    void updateAndSave(setQuickToggleMode(settings, toggle, modeButton.dataset.mode as "off" | "filter" | "block"));
  });
  pageSummaryNode.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const disableButton = target.closest<HTMLButtonElement>("button[data-disable-rule-id]");
    if (disableButton?.dataset.disableRuleId) {
      void disableRuleFromPopup(disableButton.dataset.disableRuleId);
      return;
    }

    const allowButton = target.closest<HTMLButtonElement>("button[data-allow-item-id]");
    if (allowButton?.dataset.allowItemId) {
      void allowItemFromPopup(allowButton.dataset.allowItemId);
      return;
    }

    const allowTermButton = target.closest<HTMLButtonElement>("button[data-allow-term]");
    if (allowTermButton?.dataset.allowTerm) {
      void allowTermFromPopup(allowTermButton.dataset.allowTerm);
    }
  });

  element<HTMLButtonElement>("showHidden").addEventListener("click", () =>
    sendActiveTabMessage({ type: "SLOPBLOCK_SET_SHOW_HIDDEN", showHidden: true }).then(() => scheduleSummaryRefresh())
  );
  element<HTMLButtonElement>("hideFiltered").addEventListener("click", () =>
    sendActiveTabMessage({ type: "SLOPBLOCK_SET_SHOW_HIDDEN", showHidden: false }).then(() => scheduleSummaryRefresh())
  );
  element<HTMLButtonElement>("rescan").addEventListener("click", () =>
    sendActiveTabMessage({ type: "SLOPBLOCK_RESCAN" }).then(() => scheduleSummaryRefresh())
  );
  element<HTMLButtonElement>("refreshSummary").addEventListener("click", () => refreshPageSummary(true));
  element<HTMLButtonElement>("copyDiagnostics").addEventListener("click", () => copyDiagnostics());
}

async function updateAndSave(patch: Partial<SlopBlockSettings>): Promise<void> {
  settings = normalizeSettings({ ...settings, ...patch });
  await saveSettings(settings);
  render();
  scheduleSummaryRefresh();
  setStatus("Saved locally.");
}

async function disableRuleFromPopup(ruleId: string): Promise<void> {
  settings = normalizeSettings({
    ...settings,
    disabledRuleIds: [...settings.disabledRuleIds, ruleId]
  });
  await saveSettings(settings);
  render();
  scheduleSummaryRefresh();
  setStatus(`Disabled ${ruleId}.`);
}

async function allowItemFromPopup(itemId: string): Promise<void> {
  settings = normalizeSettings({
    ...settings,
    customAllowItemIds: [...settings.customAllowItemIds, itemId]
  });
  await saveSettings(settings);
  render();
  scheduleSummaryRefresh();
  setStatus(`Allowed item ${itemId}.`);
}

async function allowTermFromPopup(term: string): Promise<void> {
  settings = normalizeSettings({
    ...settings,
    customAllowTerms: [...settings.customAllowTerms, term]
  });
  await saveSettings(settings);
  render();
  scheduleSummaryRefresh();
  setStatus(`Allowed title "${term}".`);
}

function renderQuickRuleToggles(): void {
  quickRuleTogglesNode.replaceChildren(
    ...QUICK_RULE_TOGGLES.map((toggle) => {
      const mode = quickToggleMode(settings, toggle);
      const row = document.createElement(toggle.kind === "vendor" ? "div" : "label");
      row.className = `quick-toggle${toggle.kind === "vendor" ? " quick-toggle-vendor" : ""}`;
      row.title = `Rules: ${toggle.ruleIds.join(", ")}`;
      if (toggle.kind === "vendor") {
        row.dataset.quickToggleId = toggle.id;
      }

      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = toggle.label;
      const description = document.createElement("span");
      description.textContent = toggle.description;
      text.append(title, description);

      if (toggle.kind === "vendor") {
        const seg = document.createElement("div");
        seg.className = "tri-seg";
        seg.setAttribute("role", "group");
        seg.setAttribute("aria-label", `${toggle.label} mode`);
        for (const [value, segLabel] of [
          ["off", "Off"],
          ["filter", "Filter"],
          ["block", "Hide all"]
        ] as const) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.mode = value;
          button.textContent = segLabel;
          button.setAttribute("aria-pressed", String(mode === value || (value === "filter" && mode === "partial")));
          if (mode === value || (value === "filter" && mode === "partial")) {
            button.classList.add("is-active");
          }
          seg.append(button);
        }
        row.append(text, seg);
        return row;
      }

      const switchWrap = document.createElement("span");
      switchWrap.className = "toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = mode === "filter";
      input.indeterminate = mode === "partial";
      input.dataset.quickRuleToggleId = toggle.id;
      const track = document.createElement("span");
      track.className = "toggle-track";
      switchWrap.append(input, track);

      row.append(text, switchWrap);
      return row;
    })
  );
}

async function sendActiveTabMessage(message: ContentMessage): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active Marketplace tab found.");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, message);
    setStatus("Updated current tab.");
  } catch {
    setStatus("Open a Facebook Marketplace tab to use this control.");
  }
}

async function copyDiagnostics(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active Marketplace tab found.");
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "SLOPBLOCK_EXPORT_DECISIONS" } satisfies ContentMessage);
    const parsed = parseDecisionExportResponse(response);
    if (!parsed) {
      setStatus("Marketplace response was incomplete. Rescan the page and try again.");
      return;
    }

    await copyText(JSON.stringify(parsed, null, 2));
    setStatus("Copied local diagnostics JSON.");
  } catch {
    setStatus("Open a Facebook Marketplace tab to copy diagnostics.");
  }
}

async function refreshPageSummary(showErrors: boolean): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    renderSummaryUnavailable("No active Marketplace tab found.");
    if (showErrors) {
      setStatus("No active Marketplace tab found.");
    }
    return;
  }

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: "SLOPBLOCK_EXPORT_DECISIONS"
    } satisfies ContentMessage)) as unknown;
    const parsed = parseDecisionExportResponse(response);
    if (!parsed) {
      renderSummaryUnavailable("Marketplace response was incomplete. Rescan the page and refresh summary.");
      if (showErrors) {
        setStatus("Marketplace response was incomplete. Rescan the page and try again.");
      }
      return;
    }

    renderPageSummary(parsed.stats, parsed.decisions, parsed.showHidden);
    if (showErrors) {
      setStatus("Current-page summary refreshed.");
    }
  } catch {
    renderSummaryUnavailable("Open a Facebook Marketplace tab to see current-page filtering.");
    if (showErrors) {
      setStatus("Open a Facebook Marketplace tab to refresh summary.");
    }
  }
}

function scheduleSummaryRefresh(delay = 250): void {
  window.setTimeout(() => {
    void refreshPageSummary(false);
  }, delay);
}

function renderPageSummary(stats: ContentStats | undefined, decisions: ContentDecision[], showHidden: boolean): void {
  const summary = summarizeContentDecisions(decisions, stats);
  const statGrid = document.createElement("div");
  statGrid.className = "stat-grid";
  statGrid.replaceChildren(
    renderStat("Scanned", summary.scanned),
    renderStat("Hidden", summary.hidden),
    renderStat("Dimmed", summary.dimmed),
    renderStat("Labeled", summary.labeled)
  );

  const blocks: HTMLElement[] = [statGrid];
  if (showHidden) {
    const note = document.createElement("p");
    note.className = "panel-note";
    note.textContent = "Hidden listings are currently previewed on the page.";
    blocks.push(note);
  }

  blocks.push(renderTopRules(summary.topRules));
  blocks.push(renderHiddenExamples(summary.hiddenExamples));
  pageSummaryNode.replaceChildren(...blocks);
}

function renderSummaryUnavailable(message: string): void {
  const note = document.createElement("p");
  note.className = "panel-note";
  note.textContent = message;
  pageSummaryNode.replaceChildren(note);
}

function renderStat(label: string, value: number): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "stat";
  const number = document.createElement("strong");
  number.textContent = String(value);
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(number, text);
  return wrapper;
}

function renderTopRules(rules: ReturnType<typeof summarizeContentDecisions>["topRules"]): HTMLElement {
  const block = document.createElement("section");
  block.className = "summary-block";
  const title = document.createElement("div");
  title.className = "summary-title";
  title.textContent = "Filtered because";

  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "No filtered rules on the current page.";
    block.append(title, empty);
    return block;
  }

  const list = document.createElement("ul");
  list.className = "summary-list";
  list.replaceChildren(
    ...rules.map((rule) => {
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = rule.reason;
      const details = document.createElement("span");
      details.textContent = `${rule.count} listing${rule.count === 1 ? "" : "s"} · ${rule.category}`;
      const code = document.createElement("code");
      code.textContent = rule.ruleId;
      item.append(heading, details, code);
      if (!rule.ruleId.startsWith("block-all-")) {
        const actions = document.createElement("div");
        actions.className = "summary-actions";
        const disableButton = document.createElement("button");
        disableButton.type = "button";
        disableButton.textContent = "Turn off";
        disableButton.dataset.disableRuleId = rule.controlRuleId;
        disableButton.title = `Stop filtering for "${rule.reason}" everywhere (${rule.controlRuleId})`;
        actions.append(disableButton);
        item.append(actions);
      }
      return item;
    })
  );

  block.append(title, list);
  return block;
}

function renderHiddenExamples(examples: ReturnType<typeof summarizeContentDecisions>["hiddenExamples"]): HTMLElement {
  const block = document.createElement("section");
  block.className = "summary-block";
  const title = document.createElement("div");
  title.className = "summary-title";
  title.textContent = "Hidden on this page";

  if (!examples.length) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "Nothing is hidden in the current scan.";
    block.append(title, empty);
    return block;
  }

  const list = document.createElement("ul");
  list.className = "summary-list";
  list.replaceChildren(
    ...examples.map((example) => {
      const item = document.createElement("li");
      const heading = example.url ? document.createElement("a") : document.createElement("strong");
      heading.textContent = example.title;
      if (example.url && heading instanceof HTMLAnchorElement) {
        heading.href = example.url;
        heading.target = "_blank";
        heading.rel = "noreferrer";
      }

      const details = document.createElement("span");
      details.textContent = `${example.priceText || "No price"} · score ${example.score}`;
      const reasons = document.createElement("code");
      reasons.textContent = example.reasons.join(" + ") || "hidden";
      item.append(heading, details, reasons);

      if (example.idHint || example.allowTerm) {
        const actions = document.createElement("div");
        actions.className = "summary-actions";
        const allowButton = document.createElement("button");
        allowButton.type = "button";
        if (example.idHint) {
          allowButton.textContent = "Show anyway";
          allowButton.dataset.allowItemId = example.idHint;
          allowButton.title = "Always show this exact listing";
        } else if (example.allowTerm) {
          allowButton.textContent = "Show anyway";
          allowButton.dataset.allowTerm = example.allowTerm;
          allowButton.title = `Always show listings titled "${example.allowTerm}"`;
        }
        actions.append(allowButton);
        item.append(actions);
      }

      return item;
    })
  );

  block.append(title, list);
  return block;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("Clipboard copy failed");
    }
  }
}

function setStatus(message: string): void {
  statusNode.textContent = message;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing #${id}`);
  }

  return node as T;
}
