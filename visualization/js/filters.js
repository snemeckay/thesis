// Placeholder: Filter rendering and application logic
import {
  CATEGORICAL_FIELDS,
  NUMERIC_FIELDS,
  prettifyFieldName,
  describeFilterField,
  fmt
} from './utils.js';
import { safeCreateIcons } from './ui.js';

export function initializeFilterState(records, state) {
  state.filters.activityQuery = "";
  state.dom.activitySearch.value = "";

  state.filters.categorical = {};
  state.filters.categoricalAllValues = {};
  for (const field of CATEGORICAL_FIELDS) {
    const values = [...new Set(records.map((r) => r[field] || "unknown"))].sort((a, b) => a.localeCompare(b));
    state.filters.categorical[field] = new Set(values);
    state.filters.categoricalAllValues[field] = values;
  }

  state.filters.numeric = {};
  for (const field of NUMERIC_FIELDS) {
    const values = records.map((r) => r[field]).filter((v) => typeof v === "number");
    const min = values.length ? Math.min(...values) : null;
    const max = values.length ? Math.max(...values) : null;
    state.filters.numeric[field] = {
      min,
      max,
      currentMin: min,
      currentMax: max
    };
  }
}

export function resetFiltersState(state) {
  state.filters = {
    activityQuery: "",
    categorical: {},
    categoricalAllValues: {},
    numeric: {}
  };
  state.selectedElement = null;
  state.dom.activitySearch.value = "";
}

export function renderFilters(state, warnings = []) {
  renderFilterMetrics(state, 0, 0, 0);
  renderSourceChoice(state);
  renderCategoricalFilters(state);
  renderNumericFilters(state);
  renderActiveChips(state);

  if (warnings.length) {
    const warningEl = document.createElement("div");
    warningEl.className = "note";
    warningEl.textContent = warnings.join(" ");
    state.dom.categoricalFilters.prepend(warningEl);
  }
}

export function renderSourceChoice(state) {
  const field = "source";
  const allValues = getAllCategoricalValues(state, field);
  const selected = state.filters.categorical[field] || new Set(allValues);

  state.dom.sourceChoiceGroup.innerHTML = "";

  const makeBtn = (label, isActive, onClick, valueKey) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isActive ? "active" : "";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(isActive));
    btn.dataset.value = valueKey;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  };

  const allActive = selected.size === allValues.length;
  state.dom.sourceChoiceGroup.appendChild(
    makeBtn("All sources", allActive, () => {
      state.filters.categorical[field] = new Set(allValues);
      renderSourceChoice(state);
      if (state._onFilterChange) state._onFilterChange();
    }, "__all__")
  );

  allValues.forEach((value) => {
    const isActive = selected.size === 1 && selected.has(value);
    state.dom.sourceChoiceGroup.appendChild(
      makeBtn(value, isActive, () => {
        state.filters.categorical[field] = new Set([value]);
        renderSourceChoice(state);
        if (state._onFilterChange) state._onFilterChange();
      }, value)
    );
  });
}

export function renderCategoricalFilters(state) {
  state.dom.categoricalFilters.innerHTML = "";
  for (const field of CATEGORICAL_FIELDS) {
    if (field === "source") continue;
    const section = document.createElement("section");
    section.className = "filter-section";

    const title = document.createElement("h4");
    title.textContent = prettifyFieldName(field);

    const list = document.createElement("div");
    list.className = "checkbox-list";

    const values = [...(state.filters.categorical[field] || [])].sort((a, b) => a.localeCompare(b));
    const allValues = getAllCategoricalValues(state, field);

    allValues.forEach((value, idx) => {
      const id = `filter-${field}-${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "checkbox-item";
      wrap.setAttribute("for", id);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = values.includes(value);
      input.addEventListener("change", () => {
        const activeSet = state.filters.categorical[field];
        if (input.checked) {
          activeSet.add(value);
        } else {
          activeSet.delete(value);
        }
        if (state._onFilterChange) state._onFilterChange();
      });

      const text = document.createElement("span");
      text.textContent = value;

      wrap.append(input, text);
      list.appendChild(wrap);
    });

    const hint = document.createElement("div");
    hint.className = "helper";
    hint.textContent = `${describeFilterField(field)}`;

    section.append(title, list, hint);
    state.dom.categoricalFilters.appendChild(section);
  }
}

export function renderNumericFilters(state) {
  state.dom.numericFilters.innerHTML = "";
  const unavailableFields = [];

  for (const field of NUMERIC_FIELDS) {
    const cfg = state.filters.numeric[field];
    if (!cfg || cfg.min === null || cfg.max === null) {
      unavailableFields.push(field);
      continue;
    }

    const section = document.createElement("section");
    section.className = "filter-section";

    const title = document.createElement("h4");
    title.textContent = `${prettifyFieldName(field)} range`;

    const grid = document.createElement("div");
    grid.className = "range-grid";

    const dualRange = document.createElement("div");
    dualRange.className = "dual-range";

    const sliderMeta = document.createElement("div");
    sliderMeta.className = "range-meta";

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.step = field.includes("count") ? "1" : "0.001";
    minInput.value = cfg.currentMin ?? "";
    minInput.setAttribute("aria-label", `${prettifyFieldName(field)} minimum`);

    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.step = field.includes("count") ? "1" : "0.001";
    maxInput.value = cfg.currentMax ?? "";
    maxInput.setAttribute("aria-label", `${prettifyFieldName(field)} maximum`);

    const sliderStep = field.includes("count") ? 1 : Math.max((cfg.max - cfg.min) / 200, 0.001);

    const minSlider = document.createElement("input");
    minSlider.type = "range";
    minSlider.min = String(cfg.min);
    minSlider.max = String(cfg.max);
    minSlider.step = String(sliderStep);
    minSlider.value = String(cfg.currentMin ?? cfg.min);
    minSlider.setAttribute("aria-label", `${prettifyFieldName(field)} minimum slider`);

    const maxSlider = document.createElement("input");
    maxSlider.type = "range";
    maxSlider.min = String(cfg.min);
    maxSlider.max = String(cfg.max);
    maxSlider.step = String(sliderStep);
    maxSlider.value = String(cfg.currentMax ?? cfg.max);
    maxSlider.setAttribute("aria-label", `${prettifyFieldName(field)} maximum slider`);

    minSlider.style.zIndex = "2";
    maxSlider.style.zIndex = "3";

    const syncFromConfig = () => {
      minInput.value = cfg.currentMin ?? "";
      maxInput.value = cfg.currentMax ?? "";
      minSlider.value = String(cfg.currentMin ?? cfg.min);
      maxSlider.value = String(cfg.currentMax ?? cfg.max);
      const span = (cfg.max - cfg.min) || 1;
      const minPct = ((cfg.currentMin - cfg.min) / span) * 100;
      const maxPct = ((cfg.currentMax - cfg.min) / span) * 100;
      dualRange.style.setProperty("--min-pct", `${Math.max(0, Math.min(100, minPct))}%`);
      dualRange.style.setProperty("--max-pct", `${Math.max(0, Math.min(100, maxPct))}%`);
      sliderMeta.innerHTML = `<span>${fmt(cfg.currentMin)}</span><span>${fmt(cfg.currentMax)}</span>`;
    };

    const clampBounds = () => {
      if (cfg.currentMin === null || cfg.currentMin === undefined) cfg.currentMin = cfg.min;
      if (cfg.currentMax === null || cfg.currentMax === undefined) cfg.currentMax = cfg.max;
      if (cfg.currentMin < cfg.min) cfg.currentMin = cfg.min;
      if (cfg.currentMax > cfg.max) cfg.currentMax = cfg.max;
      if (cfg.currentMin > cfg.currentMax) {
        const middle = (cfg.currentMin + cfg.currentMax) / 2;
        cfg.currentMin = Math.min(middle, cfg.max);
        cfg.currentMax = Math.max(middle, cfg.min);
      }
    };

    minInput.addEventListener("change", () => {
      cfg.currentMin = minInput.value === "" ? null : Number(minInput.value);
      clampBounds();
      syncFromConfig();
      if (state._onFilterChange) state._onFilterChange();
    });

    maxInput.addEventListener("change", () => {
      cfg.currentMax = maxInput.value === "" ? null : Number(maxInput.value);
      clampBounds();
      syncFromConfig();
      if (state._onFilterChange) state._onFilterChange();
    });

    minSlider.addEventListener("input", () => {
      cfg.currentMin = Number(minSlider.value);
      if (cfg.currentMin > cfg.currentMax) cfg.currentMax = cfg.currentMin;
      syncFromConfig();
      if (state._onFilterChange) state._onFilterChange();
    });

    maxSlider.addEventListener("input", () => {
      cfg.currentMax = Number(maxSlider.value);
      if (cfg.currentMax < cfg.currentMin) cfg.currentMin = cfg.currentMax;
      syncFromConfig();
      if (state._onFilterChange) state._onFilterChange();
    });

    syncFromConfig();

    grid.append(minInput, maxInput);
    dualRange.append(minSlider, maxSlider);

    const hint = document.createElement("div");
    hint.className = "helper";
    hint.textContent = `${describeFilterField(field)}`;

    section.append(title, grid, dualRange, sliderMeta, hint);
    state.dom.numericFilters.appendChild(section);
  }

  if (unavailableFields.length > 0) {
    const note = document.createElement("div");
    note.className = "helper";
    note.textContent = `Unavailable for this source (all values missing): ${unavailableFields.map(prettifyFieldName).join(", ")}.`;
    state.dom.numericFilters.prepend(note);
  }
}

export function getAllCategoricalValues(state, field) {
  return [...new Set(state.records.map((r) => r[field] || "unknown"))].sort((a, b) => a.localeCompare(b));
}

export function applyFilters(records, filters) {
  return records.filter((r) => {
    if (filters.activityQuery) {
      const any = r.activityList.some((name) => name.toLowerCase().includes(filters.activityQuery));
      if (!any) return false;
    }

    for (const [field, selected] of Object.entries(filters.categorical)) {
      if (!selected || selected.size === 0) return false;
      const value = r[field] || "unknown";
      if (!selected.has(value)) return false;
    }

    for (const [field, cfg] of Object.entries(filters.numeric)) {
      const isNarrowed =
        cfg.currentMin !== null && cfg.currentMin !== undefined && cfg.min !== null && cfg.currentMin > cfg.min ||
        cfg.currentMax !== null && cfg.currentMax !== undefined && cfg.max !== null && cfg.currentMax < cfg.max;
      if (!isNarrowed) continue;

      const value = r[field];
      if (cfg.currentMin !== null && cfg.currentMin !== undefined) {
        if (value === null || value < cfg.currentMin) return false;
      }
      if (cfg.currentMax !== null && cfg.currentMax !== undefined) {
        if (value === null || value > cfg.currentMax) return false;
      }
    }

    return true;
  });
}

export function renderFilterMetrics(state, matchingConstraints, nodeCount, edgeCount) {
  state.dom.filterMetrics.innerHTML = `
    <div class="metric"><div class="label">Matching constraints</div><div class="value">${matchingConstraints.toLocaleString()}</div></div>
    <div class="metric"><div class="label">Visible activities</div><div class="value">${nodeCount.toLocaleString()}</div></div>
    <div class="metric"><div class="label">Visible edges</div><div class="value">${edgeCount.toLocaleString()}</div></div>
  `;
}

export function renderActiveChips(state) {
  state.dom.activeChips.innerHTML = "";
  const chips = [];

  if (state.filters.activityQuery) {
    chips.push({ key: "activity", text: `Activity: ${state.filters.activityQuery}` });
  }

  for (const field of CATEGORICAL_FIELDS) {
    const selected = state.filters.categorical[field];
    const all = getAllCategoricalValues(state, field);
    if (!selected || selected.size === all.length) continue;
    chips.push({ key: field, text: `${prettifyFieldName(field)}: ${selected.size}/${all.length}` });
  }

  for (const field of NUMERIC_FIELDS) {
    const cfg = state.filters.numeric[field];
    if (!cfg) continue;
    const changed = cfg.currentMin !== cfg.min || cfg.currentMax !== cfg.max;
    if (!changed) continue;
    chips.push({ key: field, text: `${prettifyFieldName(field)}: ${fmt(cfg.currentMin)}..${fmt(cfg.currentMax)}` });
  }

  if (chips.length === 0) {
    state.dom.activeChips.innerHTML = "<span class=\"muted\">No active narrowing filters.</span>";
    return;
  }

  for (const chip of chips) {
    const chipEl = document.createElement("span");
    chipEl.className = "chip";

    const text = document.createElement("span");
    text.textContent = chip.text;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.ariaLabel = `Clear ${chip.key} filter`;
    removeBtn.innerHTML = "<i data-lucide='x'></i>";
    removeBtn.addEventListener("click", () => clearChipFilter(state, chip.key));

    chipEl.append(text, removeBtn);
    state.dom.activeChips.appendChild(chipEl);
  }

  safeCreateIcons();
}

export function clearChipFilter(state, key) {
  if (key === "activity") {
    state.filters.activityQuery = "";
    state.dom.activitySearch.value = "";
  } else if (CATEGORICAL_FIELDS.includes(key)) {
    state.filters.categorical[key] = new Set(getAllCategoricalValues(state, key));
    if (key === "source") renderSourceChoice(state);
    renderCategoricalFilters(state);
  } else if (NUMERIC_FIELDS.includes(key)) {
    const cfg = state.filters.numeric[key];
    cfg.currentMin = cfg.min;
    cfg.currentMax = cfg.max;
    renderNumericFilters(state);
  }

  if (state._onFilterChange) state._onFilterChange();
}
