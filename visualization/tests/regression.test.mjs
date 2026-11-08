import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyFilters, filterGraphRecords, initializeFilterState, resetFiltersState } from '../js/filters.js';
import { explainConstraintText } from '../js/constraint_explanations.js';
import { discoverAvailableCsvFiles, normalizeConstraintRecord } from '../js/data.js';
import { buildGraphElements, renderDetails } from '../js/graph.js';
import { readUrlState, applyInitialUrlFilters, persistUrlState } from '../js/url_state.js';
import { isBoundModelView, modelDownloadName, modelViewerUrl } from '../js/workspace.js';
import { dom as uiDom, applyInitialTheme, toggleTheme } from '../js/ui.js';

const filters = (activityQuery = '') => ({ activityQuery, categorical: {}, numeric: {} });
const record = (rule_id, activity, overrides = {}) => ({
  rule_id, rule_type: 'EXISTENCE', activityList: [activity],
  activityA: activity, activityB: activity, activities: activity,
  isUnary: true, category: 'unary', source_file: 'sample.csv',
  support: 0.8, confidence: 0.9, ...overrides
});

test('exact names exclude longer names, while partial queries retain substring matching', () => {
  const records = [record('a', 'Pay'), record('b', 'Payment')];
  assert.deepEqual(applyFilters(records, filters('pay')).map(r => r.rule_id), ['a']);
  assert.equal(applyFilters(records, filters('pa')).length, 2);
  assert.equal(applyFilters(records, filters()).length, 2);
  assert.equal(applyFilters(records, filters('missing')).length, 0);
});

test('comparison models share exact matching even when one lacks the exact activity', () => {
  const a = [record('a', 'Pay'), record('b', 'Payment')];
  const b = [record('c', 'Payment')];
  const vocabulary = [...a, ...b];
  assert.equal(applyFilters(a, filters('pay'), vocabulary).length, 1);
  assert.equal(applyFilters(b, filters('pay'), vocabulary).length, 0);
  assert.equal(applyFilters(b, filters('pa'), vocabulary).length, 1);
  assert.equal(applyFilters([], filters('pay'), vocabulary).length, 0);
});

test('activity searches match either endpoint and remain case-insensitive', () => {
  const binary = record('a', 'Start', {
    activityList: ['Start', 'Pay'], activityB: 'Pay', isUnary: false
  });
  assert.equal(applyFilters([binary], filters('pay')).length, 1);
  assert.equal(applyFilters([record('b', 'PAY')], filters('pay')).length, 1);
});

test('rule types use OR, other groups use AND, and numeric endpoints are inclusive', () => {
  const records = [
    record('a', 'Pay', { support: 0.3 }),
    record('b', 'Pay', { rule_type: 'END', support: 0.9 }),
    record('c', 'Pay', { rule_type: 'RESPONSE', category: 'binary' }),
    record('d', 'Pay', { support: 0.2 }),
    record('e', 'Pay', { support: null })
  ];
  const f = {
    activityQuery: 'pay',
    categorical: { rule_type: new Set(['existence', 'end']), category: new Set(['unary']) },
    numeric: { support: { min: 0, max: 1, currentMin: 0.3, currentMax: 0.9 } }
  };
  assert.deepEqual(applyFilters(records, f).map(r => r.rule_id), ['a', 'b']);
  f.categorical.rule_type.clear();
  assert.equal(applyFilters(records, f).length, 0);
});

const andFilters = (...types) => ({
  ...filters(), ruleTypeOperator: 'and',
  categorical: { rule_type: new Set(types) }
});

test('AND keeps activities having both unary rule types in separate source rows', () => {
  const records = [
    record('a', 'Pay'), record('b', 'Pay', { rule_type: 'END' }),
    record('c', 'Start'), record('d', 'Finish', { rule_type: 'END' })
  ];
  const result = filterGraphRecords(records, andFilters('existence', 'end'));
  assert.deepEqual(result.activities, ['Pay']);
  assert.deepEqual(result.records.map(r => r.rule_id), ['a', 'b']);
});

test('AND retains eligible isolated nodes but hides edges to ineligible endpoints', () => {
  const records = [
    record('a', 'Pay', { rule_type: 'RESPONSE', activityList: ['Pay', 'Start'], activityB: 'Start', isUnary: false }),
    record('b', 'Pay', { rule_type: 'PRECEDENCE', activityList: ['Pay', 'Finish'], activityB: 'Finish', isUnary: false })
  ];
  const result = filterGraphRecords(records, andFilters('response', 'precedence'));
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.activities, ['Pay']);
  const graph = buildGraphElements(result.records, result.activities);
  assert.equal(graph.edges.length, 0);
  assert.deepEqual(graph.nodes.map(n => n.data.originalName), ['Pay']);
});

test('AND preserves edges when both endpoints qualify', () => {
  const records = ['RESPONSE', 'PRECEDENCE'].map((rule_type, index) =>
    record(String(index), 'Pay', { rule_type, activityList: ['Pay', 'Start'], activityB: 'Start', isUnary: false })
  );
  const result = filterGraphRecords(records, andFilters('response', 'precedence'));
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.activities, ['Pay', 'Start']);
  assert.equal(buildGraphElements(result.records, result.activities).edges.length, 2);
});

test('AND qualification uses the full source while numeric filters narrow displayed rows', () => {
  const records = [
    record('a', 'Pay', { support: 0.9 }),
    record('b', 'Pay', { rule_type: 'END', support: 0.2 }),
    record('c', 'Start', { support: 0.9 })
  ];
  const f = andFilters('existence', 'end');
  f.numeric.support = { min: 0.2, max: 0.9, currentMin: 0.8, currentMax: 0.9 };
  const result = filterGraphRecords(records, f);
  assert.deepEqual(result.activities, ['Pay']);
  assert.deepEqual(result.records.map(r => r.rule_id), ['a']);
  f.activityQuery = 'start';
  assert.deepEqual(filterGraphRecords(records, f), { records: [], activities: [] });
});

test('AND does not combine evidence from different model inputs', () => {
  const a = [record('a', 'Pay')];
  const b = [record('b', 'Pay', { rule_type: 'END' })];
  const f = andFilters('existence', 'end');
  assert.deepEqual(filterGraphRecords(a, f, [...a, ...b]), { records: [], activities: [] });
  assert.deepEqual(filterGraphRecords(b, f, [...a, ...b]), { records: [], activities: [] });
});

test('AND supports a single type, empty selections and missing required types', () => {
  const records = [record('a', 'Pay')];
  assert.equal(filterGraphRecords(records, andFilters('existence')).records.length, 1);
  assert.deepEqual(filterGraphRecords(records, andFilters()), { records: [], activities: [] });
  assert.deepEqual(filterGraphRecords(records, andFilters('existence', 'end')), { records: [], activities: [] });
});

test('isolated combined-model nodes retain comparison colors and status', () => {
  const statuses = new Map([['Pay', 'only_a'], ['Start', 'both'], ['Finish', 'only_b']]);
  const graph = buildGraphElements([], [...statuses.keys()], statuses);
  assert.deepEqual(graph.nodes.map(n => n.data.comparisonStatus), ['only_a', 'both', 'only_b']);
  assert.equal(graph.nodes[0].data.nodeColor, '#2563eb');
  assert.equal(graph.nodes[2].data.nodeColor, '#dc2626');
});

test('URL round trips restore AND, normalized rule types and explicit empty selections', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { search: '', pathname: '/visualization/constraint-visualization.html', hash: '' },
    history: { replaceState(_state, _title, url) { globalThis.window.location.search = new URL(url, 'http://localhost').search; } }
  };
  try {
    const records = [
      record('a', 'Pay'), record('b', 'Pay', { rule_type: 'END' }),
      record('c', 'Start', { rule_type: 'INIT' })
    ];
    const makeState = () => ({
      records, filters: { ...andFilters('existence', 'end'), categoricalAllValues: { rule_type: ['existence', 'end', 'init'] } },
      dom: { activitySearch: { value: '' } }
    });
    const state = makeState();
    persistUrlState(state);
    const restored = makeState();
    restored.filters.ruleTypeOperator = 'or';
    restored.filters.categorical.rule_type = new Set(['existence', 'end', 'init']);
    restored.initialUrlState = readUrlState();
    applyInitialUrlFilters(restored);
    assert.equal(restored.filters.ruleTypeOperator, 'and');
    assert.deepEqual([...restored.filters.categorical.rule_type], ['existence', 'end']);
    state.filters.categorical.rule_type.clear();
    persistUrlState(state);
    restored.initialUrlState = readUrlState();
    applyInitialUrlFilters(restored);
    assert.equal(restored.filters.categorical.rule_type.size, 0);
    state.filters.ruleTypeOperator = 'or';
    persistUrlState(state);
    assert.equal(new URLSearchParams(globalThis.window.location.search).has('rt'), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('suggestions are unique, sorted and refreshed for the current records', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({}) };
  try {
    const suggestions = { options: [], replaceChildren(...options) { this.options = options; } };
    const state = { filters: {}, dom: { activitySearch: { value: 'old' }, activitySuggestions: suggestions } };
    initializeFilterState([record('a', 'Pay'), record('b', 'Start'), record('c', 'Pay')], state);
    assert.deepEqual(suggestions.options.map(o => o.value), ['Pay', 'Start']);
    assert.equal(state.dom.activitySearch.value, '');
    initializeFilterState([record('d', 'Finish')], state);
    assert.deepEqual(suggestions.options.map(o => o.value), ['Finish']);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('filter reset clears all selection context and cancels pending search', async () => {
  let fired = false;
  const state = {
    selectedElement: {}, selectedRecords: [{}], selectedContext: 'Model A',
    dom: { activitySearch: { value: 'pay' } },
    searchDebounce: setTimeout(() => { fired = true; }, 10)
  };
  resetFiltersState(state);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fired, false);
  assert.equal(state.selectedElement, null);
  assert.equal(state.selectedRecords, null);
  assert.equal(state.selectedContext, '');
  assert.equal(state.filters.ruleTypeOperator, 'or');
});

test('existence explanations describe the actual cardinality', () => {
  assert.match(explainConstraintText(record('a', 'Pay')), /at least once/);
  assert.match(explainConstraintText(record('b', 'Pay', { cardinality: 2 })), /at least 2 times/);
  assert.match(explainConstraintText(record('c', 'Pay', { cardinality: null })), /at least once/);
});

test('absence explanations describe the actual cardinality', () => {
  assert.match(explainConstraintText(record('a', 'Pay', { rule_type: 'ABSENCE' })), /not to appear/);
  assert.match(explainConstraintText(record('b', 'Pay', { rule_type: 'ABSENCE', cardinality: 2 })), /fewer than 2 times/);
});

test('CSV normalization retains numeric occurrence bounds', () => {
  const normalized = normalizeConstraintRecord({
    rule_id: 'a', rule_type: 'EXISTENCE', activities: 'Pay',
    cardinality: '2', category: 'unary', support: '0.8'
  }, 'sample.csv');
  assert.equal(normalized.cardinality, 2);
  assert.match(explainConstraintText(normalized), /at least 2 times/);
});

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
  assert.equal(isBoundModelView(url.searchParams), true);
  assert.equal(url.searchParams.get('s'), `builtin:/api/models/${job.id}/file/category_dcr_constraints.csv`);
  assert.equal(modelDownloadName(job, job.artifacts[1]), 'Study_category.csv');
  assert.throws(() => modelViewerUrl(job, 'missing'), /not available/);
});

test('workspace model URLs select a single source without loading sample files', async () => {
  const oldLocation = globalThis.location;
  const oldFetch = globalThis.fetch;
  const job = { id: 'a'.repeat(64), dataset_id: 'b'.repeat(64), output_name: 'My study',
    status: 'complete', configuration: { engine: 'discover' }, population: { cases: 2 },
    artifacts: [{ level: 'activity', csv: 'activity_dcr_constraints.csv' },
      { level: 'category', csv: 'category_dcr_constraints.csv' }] };
  try {
    globalThis.location = { search: new URL(modelViewerUrl(job, 'category'), 'http://127.0.0.1').search };
    const calls = [];
    globalThis.fetch = async (path) => { calls.push(path); return { ok: true, json: async () => job }; };
    const state = { uploadedSources: [] };
    await discoverAvailableCsvFiles(state);
    assert.deepEqual(calls, [`/api/jobs/${job.id}`]);
    assert.equal(state.allSources.length, 1);
    assert.equal(state.allSources[0].filename, 'My study_category.csv');
    assert.equal(state.miningJob, job);
  } finally {
    globalThis.location = oldLocation;
    globalThis.fetch = oldFetch;
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
    toggleTheme();
    assert.equal(attributes.get('data-theme'), 'dark');
    assert.equal(iconAttributes.get('data-lucide'), 'sun');
    applyInitialTheme();
    assert.equal(attributes.get('data-theme'), 'dark');
    toggleTheme();
    assert.equal(attributes.get('data-theme'), 'light');
    assert.equal(storage.get('research-mining-theme'), 'light');
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.sessionStorage = previous.storage;
    globalThis.lucide = previous.lucide;
    uiDom.themeToggle = previous.themeToggle;
  }
});
test('comparison details use only the selected model records and escape their contents', () => {
  const a = record('same-id', 'Pay', { support: 0.1, source_file: 'A.csv' });
  const b = record('same-id', 'Pay', { support: 0.8, source_file: '<B>.csv' });
  const state = {
    selectedElement: { isNode: () => false, isEdge: () => true, data: () => 'same-id' },
    selectedRecords: [b], selectedContext: 'Model B', filteredRecords: [a, b],
    dom: { detailsPanel: {} }
  };
  renderDetails(state);
  assert.match(state.dom.detailsPanel.innerHTML, /Selected in Model B/);
  assert.match(state.dom.detailsPanel.innerHTML, /0\.8 \(80%\)/);
  assert.match(state.dom.detailsPanel.innerHTML, /&lt;B&gt;\.csv/);
  assert.doesNotMatch(state.dom.detailsPanel.innerHTML, /A\.csv/);
});

test('removed elements cannot render stale details', () => {
  const state = {
    selectedElement: { removed: () => true }, selectedRecords: [],
    filteredRecords: [], dom: { detailsPanel: {} }
  };
  renderDetails(state);
  assert.match(state.dom.detailsPanel.innerHTML, /Select a node or edge/);
});

test('an explicitly empty selected-model record set does not fall back to other models', () => {
  const state = {
    selectedElement: { isNode: () => false, isEdge: () => true, data: () => 'a' },
    selectedRecords: [], filteredRecords: [record('a', 'Pay')], dom: { detailsPanel: {} }
  };
  renderDetails(state);
  assert.match(state.dom.detailsPanel.innerHTML, /metadata is not available/);
});

test('bundled DisCoveR metrics follow the current pipeline count mapping', () => {
  const csv = readFileSync(new URL('../../output/preprocessed_dcr_constraints.csv', import.meta.url), 'utf8');
  assert.ok(!csv.includes('"'), 'The bundled fixture uses unquoted CSV cells');
  const [header, ...lines] = csv.trim().split(/\r?\n/).map(line => line.split(','));
  assert.ok(lines.length > 0);
  for (const cells of lines) {
    assert.equal(cells.length, header.length);
    const row = Object.fromEntries(header.map((field, index) => [field, cells[index]]));
    const total = Number(row.trace_count);
    const activated = Number(row.activation_trace_count);
    const fulfilled = Number(row.fulfillment_count);
    const violations = activated - fulfilled;
    assert.equal(Number(row.violation_count), violations, row.rule_id);
    assert.equal(Number(row.support_count), total - violations, row.rule_id);
    assert.ok(Math.abs(Number(row.support) - (total - violations) / total) <= 0.000001, row.rule_id);
    assert.ok(Math.abs(Number(row.confidence) - (activated ? fulfilled / activated : 0)) <= 0.000001, row.rule_id);
  }
});
