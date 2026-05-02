import { getAllCategoricalValues } from './filters.js';

export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const s = params.get("s") || null;
  const q = (params.get("q") || "").trim().toLowerCase();

  let c = {};
  const cRaw = params.get("c");
  if (cRaw) {
    try {
      const parsed = JSON.parse(cRaw);
      if (parsed && typeof parsed === "object") c = parsed;
    } catch { /* ignore malformed categorical param */ }
  }

  let n = {};
  const nRaw = params.get("n");
  if (nRaw) {
    try {
      const parsed = JSON.parse(nRaw);
      if (parsed && typeof parsed === "object") n = parsed;
    } catch { /* ignore malformed numeric param */ }
  }

  return { s, q, c, n };
}

export function applyInitialUrlFilters(state) {
  const snapshot = state.initialUrlState;
  if (!snapshot) return;

  if (snapshot.q) {
    state.filters.activityQuery = snapshot.q;
    state.dom.activitySearch.value = snapshot.q;
  }

  if (snapshot.c && typeof snapshot.c === "object") {
    for (const [field, rawValues] of Object.entries(snapshot.c)) {
      if (!Array.isArray(rawValues)) continue;
      if (!state.filters.categorical[field]) continue;

      const allowed = new Set(getAllCategoricalValues(state, field));
      const values = rawValues.filter((v) => typeof v === "string" && allowed.has(v));
      if (values.length > 0) {
        state.filters.categorical[field] = new Set(values);
      }
    }
  }

  if (snapshot.n && typeof snapshot.n === "object") {
    for (const [field, rawRange] of Object.entries(snapshot.n)) {
      const cfg = state.filters.numeric[field];
      if (!cfg || !Array.isArray(rawRange) || rawRange.length !== 2) continue;
      if (!Number.isFinite(cfg.min) || !Number.isFinite(cfg.max)) continue;

      const minVal = Number(rawRange[0]);
      const maxVal = Number(rawRange[1]);
      if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) continue;

      const clampedMin = Math.max(cfg.min, Math.min(cfg.max, minVal));
      const clampedMax = Math.max(cfg.min, Math.min(cfg.max, maxVal));
      cfg.currentMin = Math.min(clampedMin, clampedMax);
      cfg.currentMax = Math.max(clampedMin, clampedMax);
    }
  }

  state.initialUrlState = null;
}

export function persistUrlState(state) {
  const params = new URLSearchParams(window.location.search);
  params.delete("s");
  params.delete("q");
  params.delete("c");
  params.delete("n");

  if (state.activeSourceId) {
    params.set("s", state.activeSourceId);
  }

  if (state.filters.activityQuery) {
    params.set("q", state.filters.activityQuery);
  }

  const categorical = {};
  for (const [field, selectedSet] of Object.entries(state.filters.categorical || {})) {
    const allValues = state.filters.categoricalAllValues?.[field] ?? getAllCategoricalValues(state, field);
    const selected = [...(selectedSet || [])];
    if (selected.length === 0 || selected.length === allValues.length) continue;
    categorical[field] = selected;
  }
  if (Object.keys(categorical).length > 0) {
    params.set("c", JSON.stringify(categorical));
  }

  const numeric = {};
  for (const [field, cfg] of Object.entries(state.filters.numeric || {})) {
    if (!cfg || cfg.min === null || cfg.max === null) continue;
    if (cfg.currentMin === cfg.min && cfg.currentMax === cfg.max) continue;
    numeric[field] = [cfg.currentMin, cfg.currentMax];
  }
  if (Object.keys(numeric).length > 0) {
    params.set("n", JSON.stringify(numeric));
  }

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  window.history.replaceState(null, "", nextUrl);
}