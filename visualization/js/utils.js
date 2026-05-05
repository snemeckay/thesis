// ============================================================================
// Constants
// ============================================================================

export const EXPECTED_COLUMNS = [
  "rule_id", "rule_type", "activities", "support", "confidence", "cardinality", "category",
  "trace_count", "support_count", "violation_count", "activation_count", "fulfillment_count", "activation_trace_count",
  "source"
];

export const REQUIRED_COLUMNS = ["rule_id", "rule_type", "activities"];

export const NUMERIC_FIELDS = [
  "support", "confidence", "support_count", "violation_count",
  "activation_count", "fulfillment_count", "activation_trace_count"
];

export const CATEGORICAL_FIELDS = ["rule_type", "category"];

export const EDGE_COLOR_PALETTE = [
  "#2f6f9f", "#3b7f6f", "#8b6f47", "#7a5c91", "#9a5a5a", "#5e7f3f", "#6f6f8e", "#7f5b3f"
];

export const DEFAULT_BUILTIN_CSV_PATHS = [
  "../output/preprocessed_declare4py_constraints.csv",
  "../output/preprocessed_dcr_constraints.csv"
];

export const DOM_BINDINGS = {
  modeRadioSingle: "modeRadioSingle",
  modeRadioCompare: "modeRadioCompare",
  modeRadioMerged: "modeRadioMerged",
  sourceFilterSection: "sourceFilterSection",
  sourceChoiceGroup: "sourceChoiceGroup",
  mainLayout: "main-content",
  filtersPanel: "filtersPanel",
  detailsPanelWrap: "detailsPanelWrap",
  toggleFiltersPanel: "toggleFiltersPanel",
  toggleDetailsPanel: "toggleDetailsPanel",
  uploadInput: "uploadInput",
  reloadBuiltins: "reloadBuiltins",
  themeToggle: "themeToggle",
  layoutSelect: "layoutSelect",
  relayoutBtn: "relayoutBtn",
  fitBtn: "fitBtn",
  zoomInBtn: "zoomInBtn",
  zoomOutBtn: "zoomOutBtn",
  resetSelectionBtn: "resetSelectionBtn",
  exportPngBtn: "exportPngBtn",
  downloadFilteredBtn: "downloadFilteredBtn",
  resetFilters: "resetFilters",
  activitySearch: "activitySearch",
  filterMetrics: "filterMetrics",
  categoricalFilters: "categoricalFilters",
  numericFilters: "numericFilters",
  activeChips: "activeChips",
  statusText: "statusText",
  graphMessage: "graphMessage",
  mergedLegend: "mergedLegend",
  compareGraphShell: "compareGraphShell",
  compareGraphLabelA: "compareGraphLabelA",
  compareGraphLabelB: "compareGraphLabelB",
  cyCompareA: "cyCompareA",
  cyCompareB: "cyCompareB",
  detailsPanel: "detailsPanel",
  cyContainer: "cy"
};

// ============================================================================
// Utilities
// ============================================================================

export function prettifyFieldName(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortTemplateLabel(template) {
  const text = String(template || "").trim().replace(/_/g, " ");
  if (text.length <= 16) return text;
  return text.slice(0, 13) + "…";
}

export function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(text).replace(/[&<>"']/g, (c) => map[c]);
}

export function fmt(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    if (value < 0.01) return value.toExponential(2);
    return Number(value.toFixed(3)).toString();
  }
  return String(value);
}

export function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

export function describeFilterField(field) {
  const descriptions = {
    source: "Origin of the constraint row (tool, pipeline, or dataset label)",
    rule_type: "Constraint template family",
    category: "Relation arity and semantics",
    support: "Fraction of traces satisfying the constraint",
    confidence: "Reliability of the rule relative to its activations",
    support_count: "Number of traces where the rule is satisfied",
    violation_count: "Number of traces violating the rule",
    activation_count: "Number of activation events considered",
    fulfillment_count: "Number of activations that were fulfilled",
    activation_trace_count: "Number of traces containing at least one activation"
  };
  return descriptions[field] || "Field-level constraint metadata.";
}

export function edgeColorForRelation(relationKey, palette = EDGE_COLOR_PALETTE) {
  const known = {
    existence: "#2f6f9f",
    absence: "#8b6f47",
    init: "#5e7f3f",
    end: "#6f6f8e",
    exactly: "#7a5c91",
    response: "#3b7f6f",
    precedence: "#9a5a5a",
    responded_existence: "#2f6f9f",
    choice: "#7f5b3f",
    exclusive_choice: "#7a5c91"
  };

  if (known[relationKey]) return known[relationKey];
  const idx = Math.abs(hashString(relationKey)) % palette.length;
  return palette[idx];
}

export function brightenHexColor(hex, factor = 0.2) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round((num >> 16) + (255 - (num >> 16)) * factor));
  const g = Math.min(255, Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * factor));
  const b = Math.min(255, Math.round((num & 255) + (255 - (num & 255)) * factor));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}
