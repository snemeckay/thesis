// Main application initialization, state management, and event binding
import { dom, cacheDom, safeCreateIcons, applyInitialTheme, toggleTheme, toggleSidePanel, syncPanelToggleUI, showStatus, clearGraphMessage, renderGraphMessage } from './ui.js';
import { 
  discoverAvailableCsvFiles, 
  parseConstraintsCsv, 
  loadCsvText, 
  createSourceDescriptor, 
  dedupeSources 
} from './data.js';
import { 
  initializeFilterState, 
  resetFiltersState, 
  renderFilters, 
  renderFilterMetrics, 
  renderActiveChips,
  applyFilters
} from './filters.js';
import { 
  buildGraphElements, 
  renderGraph, 
  runLayout, 
  renderDetails, 
  renderNoSourceState, 
  renderErrorState 
} from './graph_unary.js';

// Global state object
export const state = {
  builtInSources: [],
  uploadedSources: [],
  allSources: [],
  activeSourceId: null,
  records: [],
  filteredRecords: [],
  filters: {
    activityQuery: "",
    categorical: {},
    numeric: {}
  },
  cy: null,
  selectedElement: null,
  loadedSummaryText: "",
  searchDebounce: null,
  ui: {
    filtersCollapsed: false,
    detailsCollapsed: false
  },
  dom: {}
};

state.showStatus = (msg) => showStatus(msg);
state.clearGraphMessage = () => clearGraphMessage();
state.renderGraphMessage = (msg, isError = false) => renderGraphMessage(msg, isError);
state.renderDetails = () => renderDetails(state);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  state.dom = dom;

  state._onFilterChange = invokeApplyFiltersAndRender;

  try {
    applyInitialTheme();
    bindStaticEvents();
    safeCreateIcons();
  } catch (err) {
    console.error("[init] UI setup error (non-fatal):", err);
  }

  // Data loading
  try {
    const hasSources = await refreshBuiltInSources("Discovering available CSV sources...");
    if (!hasSources) return;
    await loadSelectedSource();
  } catch (err) {
    console.error("[init] Data load error:", err);
    showStatus("Initialization failed: " + (err?.message || String(err)));
  }
}

function bindStaticEvents() {
  dom.sourceSelect.addEventListener("change", async (e) => {
    state.activeSourceId = e.target.value;
    resetFiltersState(state);
    await loadSelectedSource();
  });

  dom.reloadBuiltins.addEventListener("click", async () => {
    const hasSources = await refreshBuiltInSources("Refreshing built-in sources...");
    if (!hasSources) return;
    resetFiltersState(state);
    await loadSelectedSource();
  });

  dom.uploadInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleUploadedCsv(file);
    event.target.value = "";
  });

  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.toggleFiltersPanel.addEventListener("click", () => toggleSidePanel(state, "filters"));
  dom.toggleDetailsPanel.addEventListener("click", () => toggleSidePanel(state, "details"));
  dom.resetFilters.addEventListener("click", () => {
    resetFiltersState(state);
    renderFilters(state);
    invokeApplyFiltersAndRender();
  });

  dom.activitySearch.addEventListener("input", (event) => {
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(() => {
      state.filters.activityQuery = event.target.value.trim().toLowerCase();
      invokeApplyFiltersAndRender();
    }, 220);
  });

  dom.layoutSelect.addEventListener("change", () => runLayout(state, dom.layoutSelect.value));
  dom.relayoutBtn.addEventListener("click", () => runLayout(state, dom.layoutSelect.value));
  dom.fitBtn.addEventListener("click", () => {
    if (!state.cy) return;
    state.cy.fit(undefined, 30);
  });
  dom.zoomInBtn.addEventListener("click", () => {
    if (!state.cy) return;
    state.cy.zoom(state.cy.zoom() * 1.15);
    state.cy.center();
  });
  dom.zoomOutBtn.addEventListener("click", () => {
    if (!state.cy) return;
    state.cy.zoom(state.cy.zoom() * 0.87);
    state.cy.center();
  });
  dom.resetSelectionBtn.addEventListener("click", () => {
    state.selectedElement = null;
    state.cy?.elements().unselect();
    renderDetails(state);
  });

  syncPanelToggleUI(state);
}

async function refreshBuiltInSources(statusMessage = "Refreshing built-in sources...") {
  const previousId = state.activeSourceId;

  showStatus(statusMessage);
  await discoverAvailableCsvFiles(state);
  populateSourceSelector();

  if (state.allSources.length === 0) {
    renderNoSourceState(state);
    return false;
  }

  const stillExists = previousId && state.allSources.some((s) => s.id === previousId);
  state.activeSourceId = stillExists ? previousId : state.allSources[0].id;
  dom.sourceSelect.value = state.activeSourceId;
  return true;
}

function populateSourceSelector() {
  const oldValue = state.activeSourceId;
  dom.sourceSelect.innerHTML = "";

  for (const source of state.allSources) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.label;
    dom.sourceSelect.appendChild(option);
  }

  if (oldValue && state.allSources.some((s) => s.id === oldValue)) {
    state.activeSourceId = oldValue;
  } else {
    state.activeSourceId = state.allSources[0]?.id || null;
  }

  dom.sourceSelect.disabled = state.allSources.length === 0;
  if (state.activeSourceId) {
    dom.sourceSelect.value = state.activeSourceId;
  }
}

async function loadSelectedSource() {
  const source = state.allSources.find((s) => s.id === state.activeSourceId);
  if (!source) {
    state.loadedSummaryText = "";
    renderNoSourceState(state);
    return;
  }

  showStatus(`Loading ${source.filename}...`);
  clearGraphMessage();
  state.selectedElement = null;
  renderDetails(state);

  const csvText = await loadCsvText(source.path, false, state);
  if (!csvText) {
    state.loadedSummaryText = "";
    renderErrorState(state, `Unable to load ${source.filename}. Use the local server and open visualization/constraint-visualization.html via http://localhost:8000.`);
    return;
  }

  const parsed = parseConstraintsCsv(csvText, source.filename);
  if (!parsed.ok) {
    state.loadedSummaryText = "";
    renderErrorState(state, parsed.error || "Failed to parse CSV.");
    return;
  }

  state.records = parsed.records;
  state.loadedSummaryText = `Loaded ${state.records.length.toLocaleString()} constraints from ${source.filename}.`;

  if (state.records.length === 0) {
    renderFilters(state, parsed.warnings || []);
    invokeApplyFiltersAndRender();
    renderGraphMessage("Valid CSV loaded, but it contains no constraint rows.");
    showStatus("No rows in selected source.");
    return;
  }

  initializeFilterState(state.records, state);
  renderFilters(state, parsed.warnings || []);
  invokeApplyFiltersAndRender();
  showStatus(state.loadedSummaryText);
}

async function handleUploadedCsv(file) {
  showStatus(`Reading uploaded file ${file.name}...`);
  try {
    const text = await file.text();
    const parsed = parseConstraintsCsv(text, file.name);

    if (!parsed.ok) {
      renderErrorState(state, `Upload rejected: ${parsed.error}`);
      return;
    }

    const path = `uploaded/${file.name}`;
    const descriptor = createSourceDescriptor(path, "upload", text);
    descriptor.uploadText = text;
    descriptor.filename = file.name;

    state.uploadedSources = dedupeSources([...state.uploadedSources, descriptor]);
    state.allSources = [...state.builtInSources, ...state.uploadedSources];
    populateSourceSelector();

    state.activeSourceId = descriptor.id;
    dom.sourceSelect.value = descriptor.id;

    resetFiltersState(state);
    await loadSelectedSource();

    showStatus(`Uploaded source active: ${file.name}.`);
  } catch {
    renderErrorState(state, "Upload failed. Please provide a UTF-8 CSV file with the expected schema.");
  }
}

function invokeApplyFiltersAndRender() {
  const filtered = applyFilters(state.records, state.filters);
  state.filteredRecords = filtered;

  const graph = buildGraphElements(filtered);
  renderFilterMetrics(state, filtered.length, graph.nodes.length, graph.edges.length);
  renderActiveChips(state);

  if (filtered.length === 0) {
    renderGraph(state, graph.nodes, graph.edges);
    renderGraphMessage("No constraints match current filters. Try broadening the selected values.");
    renderDetails(state);
    showStatus(state.loadedSummaryText || "No source loaded.");
    return;
  }

  clearGraphMessage();
  renderGraph(state, graph.nodes, graph.edges);
  renderDetails(state);
  showStatus(state.loadedSummaryText || "No source loaded.");

  if (graph.edges.length === 0 && graph.nodes.length > 0) {
    const hasBinaryConstraint = filtered.some((r) => !r.isUnary);
    if (hasBinaryConstraint) {
      renderGraphMessage("Only unary or isolated constraints are visible. Select a node to inspect unary rules.");
    } else {
      clearGraphMessage();
    }
  }
}
