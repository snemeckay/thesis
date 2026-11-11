import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverAvailableCsvFiles, normalizeConstraintRecord } from '../js/data.js';
import { renderDetails } from '../js/graph.js';
import { isBoundModelView, modelDownloadName, modelViewerUrl, updateWorkspaceSelection } from '../js/workspace.js';
import { dom as uiDom, applyInitialTheme, toggleTheme } from '../js/ui.js';

test('local model metadata retains all endpoint categories without changing constraint arity', () => {
  const normalized = normalizeConstraintRecord({
    rule_id: 'a', rule_type: 'RESPONSE', activities: 'Pay|Rest', category: 'binary',
    activity_categories: '[["Work","<Other>"],["Leisure"]]',
    label_level: 'activity', model_id: 'local-model', dataset_id: 'local-dataset',
    extra_study_metadata: 'preserved'
  }, 'local.csv');
  assert.equal(normalized.category, 'binary');
  assert.deepEqual(normalized.activityCategoryLists, [['Work', '<Other>'], ['Leisure']]);
  assert.equal(normalized.extra_study_metadata, 'preserved');
  const state = {
    selectedElement: { isNode: () => false, isEdge: () => true, data: () => 'a' },
    selectedRecords: [normalized], filteredRecords: [normalized], dom: { detailsPanel: {} }
  };
  renderDetails(state);
  assert.match(state.dom.detailsPanel.innerHTML, /Endpoint activity categories/);
  assert.match(state.dom.detailsPanel.innerHTML, /Pay: Work, &lt;Other&gt;/);
  assert.match(state.dom.detailsPanel.innerHTML, /Constraint category \(arity\)/);
  assert.match(state.dom.detailsPanel.innerHTML, /local-model/);
});

test('malformed endpoint category metadata is rejected instead of selecting a category', () => {
  const raw = { rule_id: 'a', rule_type: 'RESPONSE', activities: 'Pay|Rest', category: 'binary' };
  assert.throws(() => normalizeConstraintRecord({ ...raw, activity_categories: '[["Work"]]' }, 'local.csv'), /one per activity/);
  assert.throws(() => normalizeConstraintRecord({ ...raw, activity_categories: '{"Pay":"Work"}' }, 'local.csv'), /category lists/);
});

test('embedded mining viewer uses only the selected artifact, never sample substitutes', async () => {
  const oldLocation = globalThis.location;
  const oldFetch = globalThis.fetch;
  const model = 'a'.repeat(64);
  const calls = [];
  try {
    globalThis.location = { search: `?mine_model=${model}&embedded=1&label_level=category` };
    globalThis.fetch = async (path) => {
      calls.push(path);
      return { ok: true, json: async () => ({
        status: 'complete', configuration: { engine: 'discover' }, population: { cases: 2 },
        artifacts: [{ level: 'activity', csv: 'activity_dcr_constraints.csv' },
          { level: 'category', csv: 'category_dcr_constraints.csv' }]
      }) };
    };
    const state = { uploadedSources: [] };
    await discoverAvailableCsvFiles(state);
    assert.deepEqual(calls, [`/api/jobs/${model}`]);
    assert.equal(state.allSources.length, 1);
    assert.match(state.allSources[0].path, /category_dcr_constraints\.csv$/);
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(discoverAvailableCsvFiles({ uploadedSources: [] }), /unavailable/);
  } finally {
    globalThis.location = oldLocation;
    globalThis.fetch = oldFetch;
  }
});

test('full-page switcher carries the selected model, label and automatic CSV source', () => {
  const job = { id: 'a'.repeat(64), dataset_id: 'b'.repeat(64), output_name: 'Study',
    artifacts: [{ level: 'activity', csv: 'activity_dcr_constraints.csv' },
      { level: 'category', csv: 'category_dcr_constraints.csv' }] };
  const url = new URL(modelViewerUrl(job, 'category'), 'http://127.0.0.1');
  assert.equal(url.searchParams.get('mine_model'), job.id);
  assert.equal(url.searchParams.get('dataset'), job.dataset_id);
  assert.equal(url.searchParams.get('label_level'), 'category');
  assert.equal(url.searchParams.get('embedded'), null);
  assert.equal(isBoundModelView(url.searchParams), false);
  assert.equal(url.searchParams.get('s'), `builtin:/api/models/${job.id}/file/category_dcr_constraints.csv`);
  assert.equal(modelDownloadName(job, job.artifacts[1]), 'Study_category.csv');
  assert.throws(() => modelViewerUrl(job, 'missing'), /not available/);
});

test('workspace URLs select the mined source while keeping original datasets and other label models available', async () => {
  const oldLocation = globalThis.location;
  const oldFetch = globalThis.fetch;
  const job = { id: 'a'.repeat(64), dataset_id: 'b'.repeat(64), output_name: 'My study',
    status: 'complete', configuration: { engine: 'discover' }, population: { cases: 2 },
    artifacts: [{ level: 'activity', csv: 'activity_dcr_constraints.csv' },
      { level: 'category', csv: 'category_dcr_constraints.csv' }] };
  try {
    globalThis.location = { search: new URL(modelViewerUrl(job, 'category'), 'http://127.0.0.1').search };
    const calls = [];
    globalThis.fetch = async (path) => {
      calls.push(path);
      if (path.startsWith('/api/jobs/')) return { ok: true, json: async () => job };
      if (path.endsWith('.json')) return { ok: true, json: async () => ({ sources: [] }) };
      return { ok: true, text: async () => 'rule_id,rule_type,activities,source\ns,EXISTENCE,A,discover\n' };
    };
    const state = { uploadedSources: [] };
    await discoverAvailableCsvFiles(state);
    assert.equal(calls[0], `/api/jobs/${job.id}`);
    assert.ok(calls.includes('../output/preprocessed_declare4py_constraints.csv'));
    assert.ok(calls.includes('../output/preprocessed_dcr_constraints.csv'));
    assert.equal(state.allSources.length, 4);
    const selectedId = new URLSearchParams(globalThis.location.search).get('s');
    assert.equal(state.allSources.find(s => s.id === selectedId).filename, 'My study_category.csv');
    assert.equal(state.miningJob, job);
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(discoverAvailableCsvFiles({ uploadedSources: [] }), /unavailable/);
  } finally {
    globalThis.location = oldLocation;
    globalThis.fetch = oldFetch;
  }
});

test('workspace download and label controls follow the selected source, including uploaded CSVs', async () => {
  const oldLocation = globalThis.location;
  const oldDocument = globalThis.document;
  const job = { id: 'a'.repeat(64), dataset_id: 'b'.repeat(64),
    artifacts: [{ level: 'activity', csv: 'activity.csv' }, { level: 'category', csv: 'category.csv' }] };
  const local = { id: 'local', path: `/api/models/${job.id}/file/category.csv`, filename: 'Study_category.csv', kind: 'builtin' };
  const sample = { id: 'sample', path: '../output/sample.csv', filename: 'sample.csv', kind: 'builtin' };
  const uploaded = { id: 'uploaded', path: 'uploaded/already-mined.csv', filename: 'already-mined.csv',
    kind: 'upload', uploadText: 'rule_id,rule_type,activities\nu,EXISTENCE,A\n' };
  const elements = {
    workspaceLevel: { parentElement: {}, value: '' }, prepareTab: {}, exploreTab: {},
    downloadModel: { setAttribute(name, value) { this[name] = value; } }
  };
  const state = { workspaceNavigationReady: true, miningJob: job, mode: 'single',
    activeSourceId: local.id, allSources: [local, sample, uploaded] };
  try {
    globalThis.location = { pathname: '/visualization/constraint-visualization.html',
      search: `?workspace=1&mine_model=${job.id}&label_level=activity` };
    globalThis.document = { getElementById: id => elements[id] };
    updateWorkspaceSelection(state);
    assert.equal(elements.downloadModel.href, local.path);
    assert.equal(elements.downloadModel.download, local.filename);
    assert.equal(elements.workspaceLevel.value, 'category');
    assert.equal(elements.workspaceLevel.parentElement.hidden, false);
    assert.match(elements.prepareTab.href, /label_level=category/);
    state.activeSourceId = sample.id;
    updateWorkspaceSelection(state);
    assert.equal(elements.downloadModel.href, sample.path);
    assert.equal(elements.workspaceLevel.parentElement.hidden, true);
    state.activeSourceId = uploaded.id;
    updateWorkspaceSelection(state);
    const blobUrl = elements.downloadModel.href;
    assert.equal(await (await fetch(blobUrl)).text(), uploaded.uploadText);
    assert.equal(elements.downloadModel.download, uploaded.filename);
    state.mode = 'compare';
    updateWorkspaceSelection(state);
    assert.equal(elements.downloadModel.hidden, true);
    assert.equal(state.workspaceDownloadBlob, null);
    await assert.rejects(fetch(blobUrl));
  } finally {
    if (state.workspaceDownloadBlob) URL.revokeObjectURL(state.workspaceDownloadBlob);
    globalThis.location = oldLocation;
    globalThis.document = oldDocument;
  }
});
test('node details show all selected-model category metadata with escaping', () => {
  const normalized = normalizeConstraintRecord({
    rule_id: 'a', rule_type: 'EXISTENCE', activities: 'Pay', category: 'unary',
    activity_categories: '[["Work","<Other>"]]'
  }, 'local.csv');
  const state = {
    selectedElement: { isNode: () => true, data: () => 'Pay' },
    selectedRecords: [normalized], filteredRecords: [normalized], dom: { detailsPanel: {} }
  };
  renderDetails(state);
  assert.match(state.dom.detailsPanel.innerHTML, /Activity categories in this model/);
  assert.match(state.dom.detailsPanel.innerHTML, /&lt;Other&gt;/);
  assert.match(state.dom.detailsPanel.innerHTML, /Work/);
});

test('theme survives screen switching and updates already-rendered SVG icons', () => {
  const previous = {
    document: globalThis.document, window: globalThis.window, storage: globalThis.sessionStorage,
    lucide: globalThis.lucide, themeToggle: uiDom.themeToggle
  };
  const attributes = new Map();
  const storage = new Map();
  const iconAttributes = new Map();
  try {
    globalThis.document = { documentElement: {
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: (key) => attributes.get(key)
    } };
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    globalThis.sessionStorage = { getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value) };
    globalThis.lucide = { createIcons: () => {} };
    uiDom.themeToggle = { querySelector: (selector) => {
      assert.equal(selector, 'i, svg');
      return { setAttribute: (key, value) => iconAttributes.set(key, value) };
    } };
    applyInitialTheme();
    assert.equal(attributes.get('data-theme'), 'dark', 'Default remains dark even on a light OS theme');
    assert.equal(iconAttributes.get('data-lucide'), 'sun');
    toggleTheme();
    assert.equal(attributes.get('data-theme'), 'light');
    assert.equal(iconAttributes.get('data-lucide'), 'moon');
    applyInitialTheme();
    assert.equal(attributes.get('data-theme'), 'light');
    toggleTheme();
    assert.equal(attributes.get('data-theme'), 'dark');
    assert.equal(storage.get('research-mining-theme'), 'dark');
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.sessionStorage = previous.storage;
    globalThis.lucide = previous.lucide;
    uiDom.themeToggle = previous.themeToggle;
  }
});
