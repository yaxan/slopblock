import { RULE_CATEGORIES } from "../common/categories";
import { DEFAULT_RULES, DYNAMIC_RULE_CONTROLS } from "../common/defaultRules";
import { QUICK_RULE_TOGGLES, quickToggleMode, setQuickToggleMode } from "../common/ruleToggles";
import { scoreListing } from "../common/scoring";
import { DEFAULT_SETTINGS, normalizeSettings, parseTerms, serializeTerms } from "../common/settings";
import { loadSettings, resetSettings, saveSettings } from "../common/storage";
import type { ListingSnapshot, RuleCategoryId, RuleControlDefinition, SlopBlockSettings } from "../common/types";

const customBlockTerms = element<HTMLTextAreaElement>("customBlockTerms");
const customVendorTerms = element<HTMLTextAreaElement>("customVendorTerms");
const customAllowTerms = element<HTMLTextAreaElement>("customAllowTerms");
const customAllowItemIds = element<HTMLTextAreaElement>("customAllowItemIds");
const showReasonsInput = element<HTMLInputElement>("showReasons");
const deepScanInput = element<HTMLInputElement>("deepScan");
const categoriesNode = element<HTMLDivElement>("categories");
const quickRuleTogglesNode = element<HTMLDivElement>("quickRuleToggles");
const rulesNode = element<HTMLDivElement>("rules");
const ruleSearchInput = element<HTMLInputElement>("ruleSearch");
const settingsJson = element<HTMLTextAreaElement>("settingsJson");
const testTitleInput = element<HTMLInputElement>("testTitle");
const testPriceInput = element<HTMLInputElement>("testPrice");
const testTextInput = element<HTMLTextAreaElement>("testText");
const testResultNode = element<HTMLDivElement>("testResult");
const statusNode = element<HTMLElement>("status");

const CONTROLLED_RULES: RuleControlDefinition[] = [
  ...DEFAULT_RULES.map((rule) => ({
    id: rule.id,
    category: rule.category,
    reason: rule.reason,
    weight: rule.weight,
    confidence: rule.confidence,
    description: describeRule(rule),
    patternSummary: summarizePattern(rule.pattern)
  })),
  ...DYNAMIC_RULE_CONTROLS
];

let settings: SlopBlockSettings = DEFAULT_SETTINGS;
let termSaveTimer: number | undefined;
let statusTimer: number | undefined;

void init();

async function init(): Promise<void> {
  settings = await loadSettings();
  render();
  bindEvents();
}

function render(): void {
  customBlockTerms.value = serializeTerms(settings.customBlockTerms);
  customVendorTerms.value = serializeTerms(settings.customVendorTerms);
  customAllowTerms.value = serializeTerms(settings.customAllowTerms);
  customAllowItemIds.value = serializeTerms(settings.customAllowItemIds);
  showReasonsInput.checked = settings.showReasons;
  deepScanInput.checked = settings.deepScan;
  renderCategories();
  renderQuickRuleToggles();
  renderRules();
}

/** Persist current settings immediately; every control auto-saves. */
async function persist(message = "Saved"): Promise<void> {
  settings = normalizeSettings(settings);
  await saveSettings(settings);
  setStatus(message);
}

function bindEvents(): void {
  showReasonsInput.addEventListener("change", () => {
    settings = { ...settings, showReasons: showReasonsInput.checked };
    void persist();
  });

  deepScanInput.addEventListener("change", () => {
    settings = { ...settings, deepScan: deepScanInput.checked };
    void persist(deepScanInput.checked ? "Deep scan on" : "Deep scan off");
  });

  categoriesNode.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.categoryId) {
      return;
    }

    const categoryId = target.dataset.categoryId as RuleCategoryId;
    settings = {
      ...settings,
      enabledCategories: {
        ...settings.enabledCategories,
        [categoryId]: target.checked
      }
    };
    renderRules();
    void persist(target.checked ? "Rule group enabled" : "Rule group disabled");
  });

  rulesNode.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.ruleId) {
      return;
    }

    const ruleId = target.dataset.ruleId;
    settings = {
      ...settings,
      disabledRuleIds: target.checked
        ? settings.disabledRuleIds.filter((storedRuleId) => storedRuleId !== ruleId)
        : [...settings.disabledRuleIds, ruleId]
    };
    void persist(target.checked ? `Enabled ${ruleId}` : `Disabled ${ruleId}`);
  });

  ruleSearchInput.addEventListener("input", () => renderRules());

  quickRuleTogglesNode.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.quickRuleToggleId) {
      return;
    }

    const toggle = QUICK_RULE_TOGGLES.find((candidate) => candidate.id === target.dataset.quickRuleToggleId);
    if (!toggle) {
      return;
    }

    settings = setQuickToggleMode(settings, toggle, target.checked ? "filter" : "off");
    renderQuickRuleToggles();
    renderRules();
    void persist(target.checked ? `${toggle.label}: filtering` : `${toggle.label}: off`);
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

    const mode = modeButton.dataset.mode as "off" | "filter" | "block";
    settings = setQuickToggleMode(settings, toggle, mode);
    renderQuickRuleToggles();
    renderRules();
    void persist(
      mode === "block" ? `${toggle.label}: hiding all` : mode === "filter" ? `${toggle.label}: filtering` : `${toggle.label}: off`
    );
  });

  for (const textarea of [customBlockTerms, customVendorTerms, customAllowTerms, customAllowItemIds]) {
    textarea.addEventListener("input", () => {
      window.clearTimeout(termSaveTimer);
      termSaveTimer = window.setTimeout(() => void saveTerms(), 600);
    });
    textarea.addEventListener("blur", () => {
      window.clearTimeout(termSaveTimer);
      void saveTerms();
    });
  }

  element<HTMLButtonElement>("exportSettings").addEventListener("click", () => {
    settingsJson.value = JSON.stringify(settings, null, 2);
    setStatus("Settings exported below — copy the JSON anywhere");
  });
  element<HTMLButtonElement>("importSettings").addEventListener("click", async () => {
    try {
      settings = normalizeSettings(JSON.parse(settingsJson.value));
      await saveSettings(settings);
      render();
      setStatus("Imported and saved");
    } catch {
      setStatus("Import failed — paste valid SlopBlock settings JSON");
    }
  });
  element<HTMLButtonElement>("runRuleTest").addEventListener("click", () => runRuleTest());
  element<HTMLButtonElement>("clearRuleTest").addEventListener("click", () => {
    testTitleInput.value = "";
    testPriceInput.value = "";
    testTextInput.value = "";
    testResultNode.replaceChildren();
  });

  element<HTMLButtonElement>("reset").addEventListener("click", async () => {
    if (!window.confirm("Reset every SlopBlock setting, rule toggle, and custom term to defaults?")) {
      return;
    }

    settings = await resetSettings();
    render();
    setStatus("Everything reset to defaults");
  });
}

async function saveTerms(): Promise<void> {
  settings = {
    ...settings,
    customBlockTerms: parseTerms(customBlockTerms.value),
    customVendorTerms: parseTerms(customVendorTerms.value),
    customAllowTerms: parseTerms(customAllowTerms.value),
    customAllowItemIds: parseTerms(customAllowItemIds.value)
  };
  await persist("Terms saved");
}

function renderCategories(): void {
  categoriesNode.replaceChildren(
    ...RULE_CATEGORIES.map((category) => {
      const label = document.createElement("label");
      label.className = "category";

      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = category.label;
      const description = document.createElement("span");
      description.textContent = category.description;
      body.append(title, description);

      label.append(body, renderSwitch(settings.enabledCategories[category.id], { categoryId: category.id }));
      return label;
    })
  );
}

function renderQuickRuleToggles(): void {
  quickRuleTogglesNode.replaceChildren(
    ...QUICK_RULE_TOGGLES.map((toggle) => {
      const mode = quickToggleMode(settings, toggle);
      const row = document.createElement(toggle.kind === "vendor" ? "div" : "label");
      row.className = `quick-toggle${toggle.kind === "vendor" ? " quick-toggle-vendor" : ""}`;
      row.title = `Rules: ${toggle.ruleIds.join(", ")}`;
      if (toggle.kind === "vendor") {
        (row as HTMLElement).dataset.quickToggleId = toggle.id;
      }

      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = toggle.label;
      const description = document.createElement("span");
      description.textContent = toggle.description;
      body.append(title, description);

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
          const active = mode === value || (value === "filter" && mode === "partial");
          button.setAttribute("aria-pressed", String(active));
          if (active) {
            button.classList.add("is-active");
          }
          seg.append(button);
        }
        row.append(body, seg);
        return row;
      }

      row.append(body, renderSwitch(mode === "filter", { quickRuleToggleId: toggle.id, indeterminate: mode === "partial" }));
      return row;
    })
  );
}

function renderSwitch(
  checked: boolean,
  options: { categoryId?: string; quickRuleToggleId?: string; ruleId?: string; disabled?: boolean; indeterminate?: boolean }
): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  if (options.indeterminate) {
    input.indeterminate = true;
  }
  if (options.disabled) {
    input.disabled = true;
  }
  if (options.categoryId) {
    input.dataset.categoryId = options.categoryId;
  }
  if (options.quickRuleToggleId) {
    input.dataset.quickRuleToggleId = options.quickRuleToggleId;
  }
  if (options.ruleId) {
    input.dataset.ruleId = options.ruleId;
  }
  const track = document.createElement("span");
  track.className = "toggle-track";
  wrap.append(input, track);
  return wrap;
}

function renderRules(): void {
  const query = ruleSearchInput.value.trim().toLowerCase();
  const groupedRules = new Map<RuleCategoryId, RuleControlDefinition[]>();

  for (const rule of CONTROLLED_RULES) {
    const searchable = `${rule.id} ${rule.reason} ${rule.description} ${rule.category}`.toLowerCase();
    if (query && !searchable.includes(query)) {
      continue;
    }

    groupedRules.set(rule.category, [...(groupedRules.get(rule.category) ?? []), rule]);
  }

  const groups = RULE_CATEGORIES.flatMap((category) => {
    const rules = groupedRules.get(category.id);
    if (!rules?.length) {
      return [];
    }

    const wrapper = document.createElement("section");
    wrapper.className = "rule-group";
    const heading = document.createElement("h3");
    heading.textContent = category.label;
    const list = document.createElement("div");
    list.className = "rule-list";
    list.replaceChildren(...rules.map(renderRule));
    wrapper.append(heading, list);
    return [wrapper];
  });

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "rule-description";
    empty.textContent = "No rules match that search.";
    rulesNode.replaceChildren(empty);
    return;
  }

  rulesNode.replaceChildren(...groups);
}

function renderRule(rule: RuleControlDefinition): HTMLElement {
  const categoryEnabled = settings.enabledCategories[rule.category] !== false;
  const ruleEnabled = !settings.disabledRuleIds.includes(rule.id);
  const label = document.createElement("label");
  label.className = `rule${categoryEnabled ? "" : " is-muted"}`;
  label.title = categoryEnabled ? "" : "This rule group is currently disabled.";

  const body = document.createElement("div");
  const title = document.createElement("p");
  title.className = "rule-title";
  title.textContent = rule.reason;
  const meta = document.createElement("p");
  meta.className = "rule-meta";
  meta.textContent = `${rule.confidence} confidence · weight ${rule.weight} · ${rule.id}`;
  const description = document.createElement("p");
  description.className = "rule-description";
  description.textContent = rule.description;
  body.append(title, meta, description);

  if (rule.patternSummary) {
    const pattern = document.createElement("code");
    pattern.className = "rule-pattern";
    pattern.textContent = rule.patternSummary;
    body.append(pattern);
  }

  label.append(body, renderSwitch(ruleEnabled, { ruleId: rule.id, disabled: !categoryEnabled }));
  return label;
}

function runRuleTest(): void {
  const visibleText = testTextInput.value.trim();
  const title = testTitleInput.value.trim() || visibleText.split(/\r?\n/).find(Boolean) || "";
  const listing: ListingSnapshot = {
    title,
    priceText: testPriceInput.value.trim(),
    locationText: "",
    visibleText
  };
  const result = scoreListing(listing, settings);

  const verdict = document.createElement("div");
  verdict.className = "test-verdict";
  const pill = document.createElement("span");
  pill.className = `pill pill-${result.action}`;
  pill.textContent = result.action.toUpperCase();
  const scoreText = document.createElement("strong");
  scoreText.textContent = `score ${result.score}`;
  const explanation = document.createElement("span");
  explanation.textContent =
    result.action === "allow"
      ? "— this listing stays fully visible"
      : result.action === "label"
        ? "— visible, with a small reason badge"
        : result.action === "dim"
          ? "— visible but grayed out"
          : "— removed from the page";
  verdict.append(pill, scoreText, explanation);

  if (!result.matches.length) {
    const empty = document.createElement("p");
    empty.textContent = "No rules matched.";
    testResultNode.replaceChildren(verdict, empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "test-match-list";
  list.replaceChildren(
    ...result.matches.map((match) => {
      const item = document.createElement("li");
      const titleNode = document.createElement("div");
      titleNode.textContent = `${match.weight > 0 ? "+" : ""}${match.weight} · ${match.reason} (${match.category})`;
      const meta = document.createElement("code");
      meta.textContent = `${match.ruleId} · ${match.confidence}${match.sample ? ` · matched "${match.sample}"` : ""}`;
      item.append(titleNode, meta);
      return item;
    })
  );

  testResultNode.replaceChildren(verdict, list);
}

function describeRule(rule: (typeof DEFAULT_RULES)[number]): string {
  return `Matches visible listing text for ${rule.reason}.`;
}

function summarizePattern(pattern: RegExp): string {
  return `/${pattern.source}/${pattern.flags}`;
}

function setStatus(message: string): void {
  statusNode.textContent = message;
  statusNode.classList.add("is-visible");
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => statusNode.classList.remove("is-visible"), 1800);
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing #${id}`);
  }

  return node as T;
}
