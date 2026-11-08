// UI/DOM helpers, theme management, panel collapse, status messages
import { DOM_BINDINGS } from './utils.js';

export const dom = {};

export function cacheDom() {
  for (const [key, id] of Object.entries(DOM_BINDINGS)) {
    dom[key] = getRequiredElement(id);
  }
}

export function getRequiredElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return element;
}

export function safeCreateIcons() {
  try {
    if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  } catch (e) {
    console.warn("[ui] lucide.createIcons failed:", e);
  }
}

export function applyInitialTheme() {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const saved = sessionStorage.getItem("research-mining-theme");
  document.documentElement.setAttribute("data-theme", saved === "light" || saved === "dark" ? saved : prefersDark ? "dark" : "light");
  updateThemeIcon();
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", current === "dark" ? "light" : "dark");
  sessionStorage.setItem("research-mining-theme", document.documentElement.getAttribute("data-theme"));
  updateThemeIcon();
}

export function updateThemeIcon() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const icon = dom.themeToggle.querySelector("i, svg");
  icon.setAttribute("data-lucide", dark ? "sun" : "moon");
  safeCreateIcons();
}

export function toggleSidePanel(state, side) {
  if (side === "filters") {
    state.ui.filtersCollapsed = !state.ui.filtersCollapsed;
  } else if (side === "details") {
    state.ui.detailsCollapsed = !state.ui.detailsCollapsed;
  }
  syncPanelToggleUI(state);
}

export function syncPanelToggleUI(state) {
  dom.mainLayout.classList.toggle("filters-collapsed", state.ui.filtersCollapsed);
  dom.mainLayout.classList.toggle("details-collapsed", state.ui.detailsCollapsed);

  dom.filtersPanel.classList.toggle("is-collapsed", state.ui.filtersCollapsed);
  dom.detailsPanelWrap.classList.toggle("is-collapsed", state.ui.detailsCollapsed);

  dom.toggleFiltersPanel.setAttribute("aria-expanded", String(!state.ui.filtersCollapsed));
  dom.toggleDetailsPanel.setAttribute("aria-expanded", String(!state.ui.detailsCollapsed));

  dom.toggleFiltersPanel.setAttribute(
    "aria-label",
    state.ui.filtersCollapsed ? "Expand filters panel" : "Collapse filters panel"
  );
  dom.toggleDetailsPanel.setAttribute(
    "aria-label",
    state.ui.detailsCollapsed ? "Expand details panel" : "Collapse details panel"
  );

  const filterIcon = dom.toggleFiltersPanel.querySelector("i, svg");
  filterIcon.setAttribute("data-lucide", state.ui.filtersCollapsed ? "chevrons-right" : "chevrons-left");

  const detailsIcon = dom.toggleDetailsPanel.querySelector("i, svg");
  detailsIcon.setAttribute("data-lucide", state.ui.detailsCollapsed ? "chevrons-left" : "chevrons-right");

  safeCreateIcons();
  state.cy?.resize();
  state.cy?.fit(undefined, 30);
}

export function showStatus(message) {
  dom.statusText.textContent = message;
}

export function clearGraphMessage() {
  dom.graphMessage.hidden = true;
  dom.graphMessage.textContent = "";
  dom.graphMessage.className = "empty";
}

export function renderGraphMessage(message, isError = false) {
  dom.graphMessage.hidden = false;
  dom.graphMessage.className = isError ? "error" : "empty";
  dom.graphMessage.textContent = message;
}
