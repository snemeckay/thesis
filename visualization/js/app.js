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
  filterGraphRecords
} from './filters.js';
import { readUrlState, applyInitialUrlFilters, persistUrlState } from './url_state.js';
import { 
  buildGraphElements, 
  renderGraph, 
  runLayout, 
  layoutOptions,
  renderDetails, 
  renderNoSourceState, 
  renderErrorState 
} from './graph.js';
import { initializeTooltips } from './tooltipManager.js';

// Global state object
export const state = {
  builtInSources: [],
  uploadedSources: [],
  allSources: [],
  mode: 'single', // 'single', 'compare', or 'merged'
  activeSourceId: null,
  compareSelection: {
    aSourceId: null,
    bSourceId: null
  },
  records: [],
  recordGroups: [],
  filteredRecords: [],
  filters: {
    activityQuery: "",
    ruleTypeOperator: "or",
    categorical: {},
    numeric: {}
  },
  cy: null,
  selectedElement: null,
  selectedRecords: null,
  selectedContext: "",
  loadedSummaryText: "",
  searchDebounce: null,
  ui: {
    filtersCollapsed: false,
    detailsCollapsed: false
  },
  initialUrlState: null,
  dom: {}
};

state.showStatus = (msg) => showStatus(msg);
state.clearGraphMessage = () => clearGraphMessage();
state.renderGraphMessage = (msg, isError = false) => renderGraphMessage(msg, isError);
state.renderDetails = () => renderDetails(state);

let sourceLoadVersion = 0;

function beginSourceLoad() {
  const version = ++sourceLoadVersion;
  const { mode, activeSourceId } = state;
  const { aSourceId, bSourceId } = state.compareSelection;
  return () => version === sourceLoadVersion && state.mode === mode &&
    (mode === 'single'
      ? state.activeSourceId === activeSourceId
      : state.compareSelection.aSourceId === aSourceId &&
        state.compareSelection.bSourceId === bSourceId);
}

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheDom();
  state.dom = dom;
  state.initialUrlState = readUrlState();
  if (state.initialUrlState?.s) {
    state.activeSourceId = state.initialUrlState.s;
  }
  updateModeVisibility();
  refreshCompareLabels();

  state._onFilterChange = invokeApplyFiltersAndRender;
  state._onSourceChoiceChange = handleSourceChoiceSelection;

  try {
    applyInitialTheme();
    bindStaticEvents();
    safeCreateIcons();
    // Initialize tooltips and helper UI
    initializeTooltips();
  } catch (err) {
    console.error("[init] UI setup error (non-fatal):", err);
  }

  // Data loading
  try {
    const hasSources = await refreshBuiltInSources("Discovering available CSV sources...");
    if (!hasSources) return;
    await loadSelectedSourcesSingleMode();
  } catch (err) {
    console.error("[init] Data load error:", err);
    showStatus("Initialization failed: " + (err?.message || String(err)));
  }
}

function bindStaticEvents() {
  // Radio button group for visualization mode
  dom.modeRadioSingle.addEventListener("change", async (e) => {
    if (!e.target.checked) return;
    state.mode = 'single';
    clearComparePreviewGraphs();
    updateModeVisibility();
    resetFiltersState(state);
    await loadSelectedSourcesSingleMode();
  });

  dom.modeRadioCompare.addEventListener("change", async (e) => {
    if (!e.target.checked) return;
    state.mode = 'compare';
    updateModeVisibility();
    ensureCompareSelection();
    refreshCompareLabels();
    resetFiltersState(state);
    await renderComparePreviewGraphs();
  });

  dom.modeRadioMerged.addEventListener("change", async (e) => {
    if (!e.target.checked) return;
    state.mode = 'merged';
    clearComparePreviewGraphs();
    updateModeVisibility();
    ensureCompareSelection();
    resetFiltersState(state);
    await renderMergedComparisonGraph();
  });

  dom.reloadBuiltins.addEventListener("click", async () => {
    const hasSources = await refreshBuiltInSources("Refreshing built-in sources...");
    if (!hasSources) return;
    resetFiltersState(state);
    if (state.mode === 'compare') {
      await renderComparePreviewGraphs();
    } else if (state.mode === 'merged') {
      await renderMergedComparisonGraph();
    } else {
      await loadSelectedSourcesSingleMode();
    }
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
    initializeFilterState(state.records, state);
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

  dom.layoutSelect.addEventListener("change", () => runVisibleLayouts(dom.layoutSelect.value));
  dom.relayoutBtn.addEventListener("click", () => runVisibleLayouts(dom.layoutSelect.value));
  dom.fitBtn.addEventListener("click", () => {
    visibleGraphInstances().forEach((cy) => cy.fit(undefined, 30));
  });
  dom.zoomInBtn.addEventListener("click", () => {
    visibleGraphInstances().forEach((cy) => {
      cy.zoom(cy.zoom() * 1.15);
      cy.center();
    });
  });
  dom.zoomOutBtn.addEventListener("click", () => {
    visibleGraphInstances().forEach((cy) => {
      cy.zoom(cy.zoom() * 0.87);
      cy.center();
    });
  });
  dom.resetSelectionBtn.addEventListener("click", clearSelection);
  dom.exportPngBtn.addEventListener("click", async () => {
    await exportGraphPng();
  });
  dom.downloadFilteredBtn.addEventListener("click", () => {
    downloadFilteredConstraintsCsv();
  });

  syncPanelToggleUI(state);
}

function visibleGraphInstances() {
  return state.mode === 'compare'
    ? [state.compareCyA, state.compareCyB].filter(Boolean)
    : [state.cy].filter(Boolean);
}

function clearSelection() {
  state.selectedElement = null;
  state.selectedRecords = null;
  state.selectedContext = "";
  [state.cy, state.compareCyA, state.compareCyB].filter(Boolean)
    .forEach((cy) => cy.elements().unselect());
  renderDetails(state);
}

function runVisibleLayouts(layoutName) {
  if (state.mode !== 'compare') {
    runLayout(state, layoutName);
    return;
  }
  visibleGraphInstances().forEach((cy) => {
    const layout = cy.layout(layoutOptions(layoutName));
    layout.on('layoutstop', () => placeAllUnaryLabelsOnCy(cy));
    layout.run();
  });
}

async function refreshBuiltInSources(statusMessage = "Refreshing built-in sources...") {
  const previousId = state.activeSourceId;
  const previousA = state.compareSelection.aSourceId;
  const previousB = state.compareSelection.bSourceId;

  showStatus(statusMessage);
  await discoverAvailableCsvFiles(state);

  if (state.allSources.length === 0) {
    renderNoSourceState(state);
    return false;
  }

  const stillExists = previousId && state.allSources.some((s) => s.id === previousId);
  state.activeSourceId = stillExists ? previousId : null;

  const allIds = new Set(state.allSources.map((s) => s.id));
  state.compareSelection.aSourceId = allIds.has(previousA)
    ? previousA
    : (state.allSources[0]?.id || null);

  if (allIds.has(previousB)) {
    state.compareSelection.bSourceId = previousB;
  } else {
    const fallbackB = state.allSources.find((s) => s.id !== state.compareSelection.aSourceId)?.id
      || state.compareSelection.aSourceId
      || null;
    state.compareSelection.bSourceId = fallbackB;
  }

  ensureCompareSelection();
  refreshCompareLabels();
  return true;
}

function ensureCompareSelection() {
  const ids = state.allSources.map((s) => s.id);
  const set = new Set(ids);
  const preferred = pickPreferredComparePair();

  if (!state.compareSelection.aSourceId || !set.has(state.compareSelection.aSourceId)) {
    state.compareSelection.aSourceId = preferred.aSourceId || ids[0] || null;
  }

  if (
    !state.compareSelection.bSourceId ||
    !set.has(state.compareSelection.bSourceId) ||
    state.compareSelection.bSourceId === state.compareSelection.aSourceId
  ) {
    state.compareSelection.bSourceId = preferred.bSourceId || ids.find((id) => id !== state.compareSelection.aSourceId)
      || state.compareSelection.aSourceId
      || null;
  }
}

function pickPreferredComparePair() {
  const findSourceId = (predicate) => state.allSources.find(predicate)?.id || null;
  const norm = (source) => `${source.label} ${source.filename} ${source.path}`.toLowerCase();

  const declareId = findSourceId((source) => {
    const text = norm(source);
    return text.includes('declare4py') || text.includes('declare_constraints');
  });

  const discoverId = findSourceId((source) => {
    const text = norm(source);
    return text.includes('discover') || text.includes('dcr_constraints');
  });

  if (declareId && discoverId && declareId !== discoverId) {
    return { aSourceId: declareId, bSourceId: discoverId };
  }

  const fallbackA = state.allSources[0]?.id || null;
  const fallbackB = state.allSources.find((s) => s.id !== fallbackA)?.id || fallbackA;
  return { aSourceId: fallbackA, bSourceId: fallbackB };
}

async function handleSourceChoiceSelection(selection) {
  const isComparePayload = selection && typeof selection === 'object';
  const value = isComparePayload ? selection.value : selection;
  const slot = isComparePayload ? selection.slot : null;

  if (state.mode === 'single') {
    state.activeSourceId = value === '__all__' ? null : value;
    resetFiltersState(state);
    await loadSelectedSourcesSingleMode();
    return;
  }

  // Compare mode: exactly two selected sources, no "all" mode.
  if (value === '__all__') return;

  if (slot === 'a') {
    if (value === state.compareSelection.bSourceId) {
      const oldA = state.compareSelection.aSourceId;
      state.compareSelection.aSourceId = value;
      state.compareSelection.bSourceId = oldA;
    } else {
      state.compareSelection.aSourceId = value;
    }
  } else if (slot === 'b') {
    if (value === state.compareSelection.aSourceId) {
      const oldB = state.compareSelection.bSourceId;
      state.compareSelection.bSourceId = value;
      state.compareSelection.aSourceId = oldB;
    } else {
      state.compareSelection.bSourceId = value;
    }
  } else {
    // Backward compatible fallback (if a plain source id is passed)
    state.compareSelection.aSourceId = value;
  }

  ensureCompareSelection();
  refreshCompareLabels();
  resetFiltersState(state);
  if (state.mode === 'merged') {
    await renderMergedComparisonGraph();
  } else {
    await renderComparePreviewGraphs();
  }
}

function sourceLabelById(id) {
  return state.allSources.find((s) => s.id === id)?.label || null;
}

function refreshCompareLabels() {
  const labelA = sourceLabelById(state.compareSelection.aSourceId);
  const labelB = sourceLabelById(state.compareSelection.bSourceId);
  dom.compareGraphLabelA.textContent = labelA || "No dataset selected.";
  dom.compareGraphLabelB.textContent = labelB || "No dataset selected.";
}

function updateModeVisibility() {
  const isCompare = state.mode === 'compare';
  const isMerged = state.mode === 'merged';
  dom.compareGraphShell.hidden = !isCompare;
  dom.cyContainer.hidden = isCompare;
  dom.mergedLegend.hidden = !isMerged;
  dom.compareControlsHint.hidden = !isCompare;
  if (isCompare || isMerged) clearGraphMessage();
}

async function loadSelectedSourcesSingleMode() {
  if (state.mode !== 'single') return;
  const isCurrentLoad = beginSourceLoad();
  const selectedSources = state.activeSourceId
    ? state.allSources.filter((s) => s.id === state.activeSourceId)
    : state.allSources;

  if (!selectedSources.length) {
    state.loadedSummaryText = "";
    renderNoSourceState(state);
    return;
  }

  const sourceHint = state.activeSourceId
    ? (selectedSources[0]?.filename || 'selected source')
    : `${selectedSources.length} sources`;
  showStatus(`Loading ${sourceHint}...`);
  clearGraphMessage();
  state.selectedElement = null;
  renderDetails(state);

  let recordsBySource;
  try {
    recordsBySource = await Promise.all(
      selectedSources.map((s) => loadRecordsForSourceId(s.id))
    );
  } catch (err) {
    if (!isCurrentLoad()) return;
    renderErrorState(state, err.message);
    return;
  }
  if (!isCurrentLoad()) return;
  state.records = recordsBySource.flat();
  state.recordGroups = recordsBySource;

  if (state.activeSourceId) {
    const source = selectedSources[0];
    state.loadedSummaryText = `Loaded ${state.records.length.toLocaleString()} constraints from ${source.filename}.`;
  } else {
    state.loadedSummaryText = `Loaded ${state.records.length.toLocaleString()} constraints from ${selectedSources.length.toLocaleString()} sources.`;
  }

  if (state.records.length === 0) {
    renderFilters(state);
    invokeApplyFiltersAndRender();
    renderGraphMessage("Source loaded, but it contains no constraint rows.");
    showStatus("No rows in selected source.");
    return;
  }

  initializeFilterState(state.records, state);
  applyInitialUrlFilters(state);
  renderFilters(state);
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
    ensureCompareSelection();

    if (!state.compareSelection.aSourceId) {
      state.compareSelection.aSourceId = descriptor.id;
    }
    if (!state.compareSelection.bSourceId) {
      state.compareSelection.bSourceId = descriptor.id;
    }
    refreshCompareLabels();

    resetFiltersState(state);
    if (state.mode === 'compare') {
      await renderComparePreviewGraphs();
    } else if (state.mode === 'merged') {
      await renderMergedComparisonGraph();
    } else {
      await loadSelectedSourcesSingleMode();
    }

    showStatus(`Uploaded source active: ${file.name}.`);
  } catch {
    renderErrorState(state, "Upload failed. Please provide a UTF-8 CSV file with the expected schema.");
  }
}

async function loadRecordsForSourceId(sourceId) {
  const source = state.allSources.find((s) => s.id === sourceId);
  if (!source) throw new Error(`Source not found: ${sourceId}`);
  const csvText = await loadCsvText(source.path, true, state);
  if (!csvText) throw new Error(`Could not load file "${source.filename || source.path}". Check that the file is accessible.`);
  const parsed = parseConstraintsCsv(csvText, source.filename);
  if (!parsed.ok) throw new Error(`Failed to parse "${source.filename}": ${parsed.error}`);
  return parsed.records || [];
}

async function renderComparePreviewGraphs() {
  if (state.mode !== 'compare') return;
  ensureCompareSelection();
  const isCurrentLoad = beginSourceLoad();
  const { aSourceId, bSourceId } = state.compareSelection;
  let recordsA, recordsB;
  try {
    [recordsA, recordsB] = await Promise.all([
      loadRecordsForSourceId(aSourceId),
      loadRecordsForSourceId(bSourceId)
    ]);
  } catch (err) {
    if (!isCurrentLoad()) return;
    renderErrorState(state, err.message);
    return;
  }

  if (!isCurrentLoad()) return;

  const combinedRecords = [...recordsA, ...recordsB];
  state.records = combinedRecords;
  const filtersUninitialized =
    Object.keys(state.filters.categorical || {}).length === 0 &&
    Object.keys(state.filters.numeric || {}).length === 0;

  if (filtersUninitialized) {
    initializeFilterState(state.records, state);
    renderFilters(state);
  }

  const labelA = sourceLabelById(state.compareSelection.aSourceId) || 'No dataset selected.';
  const labelB = sourceLabelById(state.compareSelection.bSourceId) || 'No dataset selected.';
  const resultA = filterGraphRecords(recordsA, state.filters, combinedRecords);
  const resultB = filterGraphRecords(recordsB, state.filters, combinedRecords);
  const filteredA = resultA.records;
  const filteredB = resultB.records;
  dom.compareGraphLabelA.textContent = `${labelA} · ${filteredA.length.toLocaleString()}/${recordsA.length.toLocaleString()} rows`;
  dom.compareGraphLabelB.textContent = `${labelB} · ${filteredB.length.toLocaleString()}/${recordsB.length.toLocaleString()} rows`;

  // Keep metrics/chips meaningful in compare mode too.
  state.filteredRecords = [...filteredA, ...filteredB];
  const graphCombined = buildGraphElements(state.filteredRecords, [...resultA.activities, ...resultB.activities]);
  renderFilterMetrics(state, state.filteredRecords.length, graphCombined.nodes.length, graphCombined.edges.length);
  renderActiveChips(state);

  clearSelection();
  renderComparePreviewGraph('A', filteredA, resultA.activities);
  renderComparePreviewGraph('B', filteredB, resultB.activities);
}

function clearComparePreviewGraphs() {
  clearSelection();
  if (state.compareCyA) {
    state.compareCyA.destroy();
    state.compareCyA = null;
  }
  if (state.compareCyB) {
    state.compareCyB.destroy();
    state.compareCyB = null;
  }
}

function previewGraphStyle() {
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  return [
    {
      selector: "node[isUnaryLabel != 'true']",
      style: {
        'background-color': '#4c5a6d',
        label: 'data(label)',
        'font-size': 10,
        'text-wrap': 'ellipsis',
        'text-max-width': 120,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 8,
        color: textColor,
        width: 22,
        height: 22,
        'border-width': 1,
        'border-color': '#ffffff',
        'pie-size': '0%'
      }
    },
    {
      selector: "node[hasUnary = 'true']",
      style: {
        'border-color': '#ffffff',
        'border-width': 1,
        'pie-size': '80%',
        'pie-1-background-color': 'data(u1Color)',
        'pie-1-background-size': 'data(u1Size)',
        'pie-2-background-color': 'data(u2Color)',
        'pie-2-background-size': 'data(u2Size)',
        'pie-3-background-color': 'data(u3Color)',
        'pie-3-background-size': 'data(u3Size)',
        'pie-4-background-color': 'data(u4Color)',
        'pie-4-background-size': 'data(u4Size)'
      }
    },
    {
      selector: "node[isUnaryLabel = 'true']",
      style: {
        'background-opacity': 0,
        'border-width': 0,
        width: 1,
        height: 1,
        label: 'data(label)',
        color: 'data(labelColor)',
        'font-size': 8,
        'text-wrap': 'none',
        'text-max-width': 160,
        'text-valign': 'center',
        'text-halign': 'center',
        'z-index': 999,
        events: 'no'
      }
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'line-color': 'data(edgeColor)',
        'target-arrow-color': 'data(edgeColor)',
        label: 'data(label)',
        'font-size': 8,
        'text-rotation': 'autorotate',
        'text-background-color': surface,
        'text-background-opacity': 0.82,
        'text-background-padding': 2,
        'text-wrap': 'none',
        color: textColor,
        width: 1.8
      }
    },
    {
      selector: 'edge[directionUncertain = "true"]',
      style: {
        'line-style': 'dashed',
        'target-arrow-shape': 'none'
      }
    },
    {
      selector: 'edge.strong',
      style: { width: 3, 'line-opacity': 0.95 }
    },
    {
      selector: 'edge.medium',
      style: { width: 2.2, 'line-opacity': 0.82 }
    },
    {
      selector: 'edge.weak',
      style: { width: 1.4, 'line-opacity': 0.6 }
    },
    {
      selector: "edge[comparisonStatus = 'both']",
      style: {
        'line-color': '#0f766e',
        'target-arrow-color': '#0f766e'
      }
    },
    {
      selector: "edge[comparisonStatus = 'only_a']",
      style: {
        'line-color': '#2563eb',
        'target-arrow-color': '#2563eb'
      }
    },
    {
      selector: "edge[comparisonStatus = 'only_b']",
      style: {
        'line-color': '#dc2626',
        'target-arrow-color': '#dc2626'
      }
    }
  ];
}

function renderComparePreviewGraph(side, records, activities = []) {
  const key = side === 'A' ? 'compareCyA' : 'compareCyB';
  const container = side === 'A' ? dom.cyCompareA : dom.cyCompareB;
  const graph = buildGraphElements(records, activities);

  const elements = [
    ...graph.nodes,
    ...graph.edges
  ];

  if (!state[key]) {
    state[key] = cytoscape({
      container,
      elements,
      style: previewGraphStyle(),
      layout: layoutOptions(dom.layoutSelect.value),
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: false
    });
    state[key].scratch('_detailsRecords', records);

    state[key].on('layoutstop', () => {
      placeAllUnaryLabelsOnCy(state[key]);
    });
    state[key].on("position", "node[isUnaryLabel != 'true']", (event) => {
      placeUnaryLabelsForActivityOnCy(state[key], event.target);
    });
    state[key].on('select', 'node, edge', (event) => {
      const otherCy = side === 'A' ? state.compareCyB : state.compareCyA;
      otherCy?.elements().unselect();
      state.selectedElement = event.target;
      state.selectedRecords = state[key].scratch('_detailsRecords');
      state.selectedContext = `Model ${side}`;
      renderDetails(state);
    });
    state[key].on('unselect', 'node, edge', () => {
      if (state.selectedContext !== `Model ${side}`) return;
      const selected = state[key].$('node:selected, edge:selected').first();
      state.selectedElement = selected.nonempty() ? selected : null;
      if (!state.selectedElement) {
        state.selectedRecords = null;
        state.selectedContext = "";
      }
      renderDetails(state);
    });
    setTimeout(() => placeAllUnaryLabelsOnCy(state[key]), 0);
    return;
  }

  const cy = state[key];
  cy.scratch('_detailsRecords', records);
  cy.batch(() => {
    cy.elements().remove();
    cy.add(elements);
  });
  const layout = cy.layout(layoutOptions(dom.layoutSelect.value));
  layout.on('layoutstop', () => placeAllUnaryLabelsOnCy(cy));
  layout.run();
}

/**
 * Merge constraints from both models and tag with comparison status.
 * Creates a "comparisonStatus" field on each record: 'both', 'only_a', or 'only_b'
 */
function mergeAndTagConstraints(recordsA, recordsB) {
  // Create a key for binary constraints: "activity1|activity2|rule_type|category"
  const makeKey = (r) => {
    if (r.isUnary) {
      return `UNARY|${r.activities}|${r.rule_type}|${r.category}`;
    }
    const a = r.activityA || '';
    const b = r.activityB || '';
    return `${a}|${b}|${r.rule_type}|${r.category}`;
  };

  // Create maps for quick lookup
  const keysA = new Set(recordsA.map(makeKey));
  const keysB = new Set(recordsB.map(makeKey));

  // Tag records from A
  const taggedA = recordsA.map((r) => ({
    ...r,
    comparisonStatus: keysB.has(makeKey(r)) ? 'both' : 'only_a'
  }));

  // Tag records from B (only include those not in A or mark as both if already in A)
  const taggedB = recordsB.map((r) => ({
    ...r,
    comparisonStatus: keysA.has(makeKey(r)) ? 'both' : 'only_b'
  }));

  // Merge: include all from A + only the unique ones from B
  const merged = [
    ...taggedA,
    ...taggedB.filter((r) => !keysA.has(makeKey(r)))
  ];

  return merged;
}

async function renderMergedComparisonGraph() {
  if (state.mode !== 'merged') return;
  ensureCompareSelection();
  const isCurrentLoad = beginSourceLoad();
  const { aSourceId, bSourceId } = state.compareSelection;
  let recordsA, recordsB;
  try {
    [recordsA, recordsB] = await Promise.all([
      loadRecordsForSourceId(aSourceId),
      loadRecordsForSourceId(bSourceId)
    ]);
  } catch (err) {
    if (!isCurrentLoad()) return;
    renderErrorState(state, err.message);
    return;
  }

  if (!isCurrentLoad()) return;

  const combinedRecords = [...recordsA, ...recordsB];
  state.records = combinedRecords;
  const merged = mergeAndTagConstraints(recordsA, recordsB);
  const filtersUninitialized =
    Object.keys(state.filters.categorical || {}).length === 0 &&
    Object.keys(state.filters.numeric || {}).length === 0;

  if (filtersUninitialized) {
    initializeFilterState(state.records, state);
    renderFilters(state);
  }

  const labelA = sourceLabelById(state.compareSelection.aSourceId) || 'No dataset selected.';
  const labelB = sourceLabelById(state.compareSelection.bSourceId) || 'No dataset selected.';
  
  let filtered;
  let activities = [];
  const activityStatuses = new Map();
  if (state.filters.ruleTypeOperator === 'and') {
    const resultA = filterGraphRecords(recordsA, state.filters, combinedRecords);
    const resultB = filterGraphRecords(recordsB, state.filters, combinedRecords);
    filtered = mergeAndTagConstraints(resultA.records, resultB.records);
    const activitiesB = new Set(resultB.activities);
    resultA.activities.forEach(name => activityStatuses.set(name, activitiesB.has(name) ? 'both' : 'only_a'));
    resultB.activities.forEach(name => {
      if (!activityStatuses.has(name)) activityStatuses.set(name, 'only_b');
    });
    activities = [...activityStatuses.keys()];
  } else {
    filtered = filterGraphRecords(merged, state.filters).records;
  }
  state.filteredRecords = filtered;

  const graph = buildGraphElements(filtered, activities, activityStatuses);
  renderFilterMetrics(state, filtered.length, graph.nodes.length, graph.edges.length);
  renderActiveChips(state);

  showStatus(`Combined comparison: ${labelA} ↔ ${labelB}`);
  clearGraphMessage();

  if (filtered.length === 0 && graph.nodes.length === 0) {
    renderGraph(state, graph.nodes, graph.edges);
    renderGraphMessage("No constraints match current filters. Try broadening the selected values.");
    renderDetails(state);
    return;
  }

  renderGraph(state, graph.nodes, graph.edges);
  renderDetails(state);

  if (graph.edges.length === 0 && graph.nodes.length > 0) {
    const hasBinaryConstraint = filtered.some((r) => !r.isUnary);
    if (hasBinaryConstraint) {
      renderGraphMessage("Only unary or isolated constraints are visible. Select a node to inspect unary rules.");
    } else if (filtered.length === 0) {
      renderGraphMessage("Matching activities remain isolated because their other endpoints do not match every selected rule type.");
    }
  }
}

function invokeApplyFiltersAndRender() {
  // In compare mode, apply filters to both preview graphs instead of the single active source
  if (state.mode === 'compare') {
    // Re-render compare previews (they will apply `state.filters` internally)
    void renderComparePreviewGraphs();
    return;
  }

  if (state.mode === 'merged') {
    void renderMergedComparisonGraph();
    return;
  }

  const results = state.recordGroups.map(records => filterGraphRecords(records, state.filters, state.records));
  const filtered = results.flatMap(result => result.records);
  const activities = results.flatMap(result => result.activities);
  state.filteredRecords = filtered;

  const graph = buildGraphElements(filtered, activities);
  renderFilterMetrics(state, filtered.length, graph.nodes.length, graph.edges.length);
  renderActiveChips(state);

  if (filtered.length === 0 && graph.nodes.length === 0) {
    renderGraph(state, graph.nodes, graph.edges);
    renderGraphMessage("No constraints match current filters. Try broadening the selected values.");
    renderDetails(state);
    showStatus(state.loadedSummaryText || "No source loaded.");
    persistUrlState(state);
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
    } else if (filtered.length === 0) {
      renderGraphMessage("Matching activities remain isolated because their other endpoints do not match every selected rule type.");
    } else {
      clearGraphMessage();
    }
  }

  persistUrlState(state);
}

function getActiveSourceBaseName() {
  const source = state.allSources.find((s) => s.id === state.activeSourceId);
  if (!source?.filename) return "constraints";
  return source.filename.replace(/\.csv$/i, "");
}

async function exportGraphPng() {
  if (!state.cy) {
    showStatus("No graph available to export.");
    return;
  }

  try {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const bg = isDark ? "#1e1e2e" : "#ffffff";
    const blob = await state.cy.png({ output: "blob-promise", scale: 2, full: true, bg });
    const fileName = `${getActiveSourceBaseName()}-graph.png`;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    URL.revokeObjectURL(url);
    showStatus(`Graph exported as ${fileName}.`);
  } catch (err) {
    console.error("[exportGraphPng] Export failed:", err);
    showStatus("Graph export failed.");
  }
}

function downloadFilteredConstraintsCsv() {
  const rows = state.filteredRecords || [];
  if (rows.length === 0) {
    showStatus("No filtered constraints to download.");
    return;
  }

  const columns = getCsvColumns(rows);
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const fileName = `${getActiveSourceBaseName()}-filtered-constraints.csv`;
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  URL.revokeObjectURL(url);
  showStatus(`Filtered constraints exported (${rows.length.toLocaleString()} rows).`);
}

function getCsvColumns(rows) {
  const seen = new Set();
  const ordered = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(key);
    }
  }

  return ordered;
}

function toCsv(rows, columns) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const header = columns.map(escapeCell).join(",");
  const body = rows.map((row) => columns.map((key) => escapeCell(row[key])).join(",")).join("\r\n");
  return `${header}\r\n${body}`;
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function placeAllUnaryLabelsOnCy(cy) {
  if (!cy) return;
  const activityNodes = cy.nodes("[isUnaryLabel != 'true']");
  activityNodes.forEach((n) => placeUnaryLabelsForActivityOnCy(cy, n));
}

function placeUnaryLabelsForActivityOnCy(cy, activityNode) {
  if (!cy || !activityNode || activityNode.empty?.()) return;
  const activityId = activityNode.id();
  const labels = cy.nodes(`[parentActivityId = '${activityId}']`);
  if (!labels || labels.length === 0) return;

  const baseX = activityNode.position('x');
  const baseY = activityNode.position('y');
  const nodeHalfHeight = (typeof activityNode.height === 'function' ? activityNode.height() : 20) / 2;
  const startOffset = nodeHalfHeight + 26;
  const rowGap = 9;

  labels.forEach((lbl) => {
    const order = Number(lbl.data('labelOrder') || 0);
    lbl.unlock();
    lbl.position({ x: baseX, y: baseY + startOffset + (order * rowGap) });
    lbl.lock();
  });
}
