const $ = (id) => document.getElementById(id);
let uploaded = null;
let columns = [];
let datasets = [];
let profiles = [];
let models = [];
let selectedJob = null;
let pollToken = 0;
let preparationDirty = false;

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.detail || `HTTP ${response.status}`);
  return result;
}

function bind(id, event, action) {
  $(id).addEventListener(event, async (e) => {
    try { await action(e); } catch (error) { notice(error.message, true); }
  });
}

function options(select, values, placeholder) {
  select.replaceChildren();
  if (placeholder !== undefined) select.add(new Option(placeholder, ''));
  for (const [value, label] of values) select.add(new Option(label, value));
}

function showScreen(explore) {
  $('prepareScreen').hidden = explore;
  $('exploreScreen').hidden = !explore;
  $('prepareTab').classList.toggle('active', !explore);
  $('exploreTab').classList.toggle('active', explore);
}

function currentDataset() { return datasets.find((d) => d.id === $('dataset').value); }

function renderMapping(result) {
  columns = result.columns;
  $('delimiter').value = result.delimiter;
  $('mappingCard').hidden = false;
  $('caseColumns').replaceChildren();
  $('attributes').replaceChildren();
  for (const column of columns) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = column.name;
    label.append(input, document.createTextNode(column.name));
    $('caseColumns').append(label);
    const tr = document.createElement('tr');
    const keep = document.createElement('input'); keep.type = 'checkbox'; keep.dataset.column = column.name;
    keep.setAttribute('aria-label', `Keep ${column.name}`);
    const type = document.createElement('select');
    options(type, ['string', 'number', 'boolean'].map((v) => [v, v]));
    type.value = column.suggested_type; type.setAttribute('aria-label', `${column.name} type`);
    const scope = document.createElement('select');
    options(scope, [['case', 'Case (constant)'], ['event', 'Event (may change)']]);
    scope.setAttribute('aria-label', `${column.name} scope`);
    for (const content of [keep, column.name, type, scope, `${column.missing} / ${column.distinct}`]) {
      const cell = document.createElement('td');
      if (typeof content === 'string') cell.textContent = content; else cell.append(content);
      tr.append(cell);
    }
    $('attributes').append(tr);
  }
  for (const id of ['activity', 'category', 'timestamp', 'endTimestamp']) {
    options($(id), columns.map((c) => [c.name, c.name]), id === 'category' || id === 'endTimestamp' ? 'Not mapped' : 'Choose explicitly');
  }
  $('previewSummary').textContent = `${result.event_count.toLocaleString()} events. First ${result.rows.length} records shown; missing/distinct counts use the full CSV.`;
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const column of columns) { const th = document.createElement('th'); th.textContent = column.name; head.append(th); }
  table.append(head);
  for (const row of result.rows) {
    const tr = document.createElement('tr');
    for (const column of columns) { const td = document.createElement('td'); td.textContent = row[column.name]; tr.append(td); }
    table.append(tr);
  }
  $('previewTable').replaceChildren(table);
}

function profile() {
  const attrs = [...$('attributes').rows].filter((tr) => tr.querySelector('input').checked).map((tr) => ({
    column: tr.querySelector('input').dataset.column,
    type: tr.querySelectorAll('select')[0].value, scope: tr.querySelectorAll('select')[1].value
  }));
  return {
    delimiter: $('delimiter').value, case_columns: [...$('caseColumns').querySelectorAll('input:checked')].map((i) => i.value),
    activity: $('activity').value, activity_category: $('category').value,
    timestamp: $('timestamp').value, end_timestamp: $('endTimestamp').value,
    case_mode: $('caseMode').value, gap_minutes: Number($('gapMinutes').value),
    day_start_hour: Number($('dayHour').value), merge_gap_seconds: Number($('mergeGap').value),
    missing: $('missing').value, case_conflicts: $('conflicts').value, attributes: attrs,
    exclude_activities: $('excluded').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  };
}

function applyProfile(p) {
  if (!uploaded) throw new Error('Preview a CSV before applying a profile.');
  const known = new Set(columns.map((c) => c.name));
  const required = [...(p.case_columns || []), p.activity, p.timestamp,
    ...(p.attributes || []).map((a) => a.column), p.activity_category, p.end_timestamp].filter(Boolean);
  if (required.some((c) => !known.has(c))) throw new Error('This profile refers to columns not present in the previewed CSV.');
  if (p.delimiter !== $('delimiter').value) throw new Error('Profile delimiter differs from preview. Select its delimiter and preview again before loading it.');
  for (const input of $('caseColumns').querySelectorAll('input')) input.checked = p.case_columns?.includes(input.value) || false;
  const map = { activity: 'activity', category: 'activity_category', timestamp: 'timestamp', endTimestamp: 'end_timestamp',
    caseMode: 'case_mode', gapMinutes: 'gap_minutes', dayHour: 'day_start_hour', mergeGap: 'merge_gap_seconds',
    missing: 'missing', conflicts: 'case_conflicts' };
  for (const [id, key] of Object.entries(map)) if (p[key] !== undefined) $(id).value = p[key];
  $('excluded').value = (p.exclude_activities || []).join('\n');
  for (const tr of $('attributes').rows) {
    const input = tr.querySelector('input');
    const attr = p.attributes?.find((a) => a.column === input.dataset.column);
    input.checked = !!attr;
    if (attr) { tr.querySelectorAll('select')[0].value = attr.type; tr.querySelectorAll('select')[1].value = attr.scope; }
  }
  preparationDirty = true;
  updateStale();
}

function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

async function refreshProfiles() {
  profiles = await api('/api/profiles');
  options($('profiles'), profiles.map((p) => [p.id, p.name]), 'Choose a mapping profile');
}

async function refreshDatasets(preferred) {
  datasets = await api('/api/datasets');
  const selected = preferred || $('dataset').value;
  options($('dataset'), datasets.map((d) => [d.id, `${d.name} (${d.metadata.quality.cases} cases)`]), 'Choose a prepared dataset');
  if (datasets.some((d) => d.id === selected)) $('dataset').value = selected;
  await datasetChanged();
}

async function datasetChanged() {
  ++pollToken;
  const dataset = currentDataset();
  $('cohort').replaceChildren(); $('quality').replaceChildren();
  $('mine').disabled = !dataset;
  $('addFilter').disabled = !dataset?.schema.length;
  $('bundle').hidden = !dataset;
  if (dataset) {
    const quality = dataset.metadata.quality;
    for (const [key, label] of [['input_events', 'Source events'], ['normalized_events', 'Retained events'],
      ['cases', 'Complete cases'], ['excluded_groups', 'Excluded groups'], ['conflicting_cases', 'Conflicting cases'],
      ['removed_activity_events', 'Excluded events'], ['merged_events', 'Merged events']]) {
      const item = document.createElement('div'); item.className = 'count';
      const count = document.createElement('strong'); count.textContent = quality[key].toLocaleString();
      item.append(count, document.createTextNode(label)); $('quality').append(item);
    }
    $('bundle').href = `/api/datasets/${dataset.id}/bundle`;
    $('datasetExplanation').textContent = `Case grouping: ${dataset.metadata.profile.case_columns.join(' + ')}; ${dataset.metadata.profile.case_mode || 'group'}. Time: ${dataset.metadata.time_convention}. Retained attributes: ${dataset.schema.map((a) => `${a.column} (${a.type}, ${a.scope})`).join(', ') || 'none'}.`;
    for (const option of $('level').options) option.disabled = option.value !== 'activity' && !dataset.metadata.category_available;
    if (!dataset.metadata.category_available) $('level').value = 'activity';
  } else {
    $('datasetExplanation').textContent = 'Prepare an event log to enable complete-case population filtering and mining.';
  }
  selectedJob = null; $('viewer').hidden = true;
  await refreshModels();
  updateStale();
}

function addFilter() {
  const dataset = currentDataset();
  if (!dataset?.schema.length) return;
  const row = document.createElement('div'); row.className = 'filter-row';
  const column = document.createElement('select'); column.className = 'column'; column.setAttribute('aria-label', 'Population attribute');
  options(column, dataset.schema.map((a) => [a.column, `${a.column} (${a.scope})`]));
  const op = document.createElement('select'); op.className = 'operator'; op.setAttribute('aria-label', 'Population match');
  const value = document.createElement('div'); value.className = 'value';
  const quantifier = document.createElement('select'); quantifier.className = 'quantifier';
  quantifier.setAttribute('aria-label', 'Event-scope matching');
  options(quantifier, [['any', 'Any event in case'], ['all', 'All events in case']]);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
  remove.addEventListener('click', () => { row.remove(); updateStale(); });
  function renderValue() {
    const attr = dataset.schema.find((a) => a.column === column.value);
    value.replaceChildren();
    if (op.value === 'range') {
      for (const name of ['Lower bound', 'Upper bound']) {
        const label = document.createElement('label'); label.textContent = name;
        const input = document.createElement('input'); input.type = 'number'; input.step = 'any';
        label.append(input); value.append(label);
      }
    } else if (op.value === 'eq') {
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Attribute value');
      options(select, attr.values.filter((v) => v !== null).map((v) => [JSON.stringify(v), String(v)]), 'Choose value');
      value.append(select);
      if (attr.values_truncated) {
        const text = document.createElement('p'); text.className = 'help';
        text.textContent = 'First 500 values shown. Use a numeric range or a smaller prepared vocabulary for larger schemas.';
        value.append(text);
      }
    }
    updateStale();
  }
  function renderOperators() {
    const attr = dataset.schema.find((a) => a.column === column.value);
    options(op, [['eq', 'Equals'], ...(attr.type === 'number' ? [['range', 'Inclusive range']] : []), ['missing', 'Is missing']]);
    quantifier.hidden = attr.scope !== 'event';
    renderValue();
  }
  column.addEventListener('change', renderOperators);
  op.addEventListener('change', renderValue);
  row.append(column, op, value, quantifier, remove);
  row.addEventListener('change', updateStale); row.addEventListener('input', updateStale);
  $('cohort').append(row); renderOperators();
}

function cohort() {
  return [...$('cohort').children].map((row) => {
    const column = row.querySelector('.column').value;
    const attr = currentDataset().schema.find((a) => a.column === column);
    const op = row.querySelector('.operator').value;
    let value;
    if (op === 'eq') {
      const raw = row.querySelector('.value select').value;
      if (!raw) throw new Error(`Choose a value for ${column}.`);
      value = JSON.parse(raw);
    } else if (op === 'range') {
      value = [...row.querySelectorAll('.value input')].map((i) => {
        if (i.value === '') throw new Error(`Enter both range bounds for ${column}.`);
        return Number(i.value);
      });
    }
    return { column, op, ...(value !== undefined ? { value } : {}),
      ...(attr.scope === 'event' ? { quantifier: row.querySelector('.quantifier').value } : {}) };
  });
}

function configuration() {
  return { engine: $('engine').value, label_level: $('level').value, min_support: Number($('support').value),
    min_confidence: Number($('confidence').value), itemsets_support: Number($('itemsets').value),
    max_cardinality: Number($('cardinality').value) };
}

function signature(datasetId, config, filters) { return JSON.stringify([datasetId, config, filters]); }
function updateStale() {
  if (!selectedJob) { $('resultState').textContent = 'Apply a population and mine to create a model, or choose a saved run.'; return; }
  let matches = false;
  try {
    matches = signature(currentDataset()?.id, configuration(), cohort()) === signature(selectedJob.dataset_id, selectedJob.configuration, selectedJob.cohort);
  } catch { /* An incomplete filter cannot match a saved run. */ }
  const stale = !matches || preparationDirty;
  $('resultState').classList.toggle('stale', stale);
  $('resultState').textContent = stale
    ? 'Saved result - not current for the edited mapping, population, or engine settings. Prepare changed mappings, then Apply cohort and mine. The graph below still shows the saved run.'
    : 'Current result - matches the selected prepared dataset, population and mining settings.';
}

async function refreshModels(preferred) {
  const dataset = currentDataset();
  models = dataset ? await api(`/api/models?dataset_id=${dataset.id}`) : [];
  const previous = preferred || $('model').value;
  options($('model'), models.map((m) => [m.id, `${m.configuration.engine} / ${m.configuration.label_level} / ${m.population.cases} cases / ${m.id.slice(0, 8)}`]), 'Choose a saved mining run');
  if (models.some((m) => m.id === previous)) { $('model').value = previous; selectModel(); }
}

function selectModel() {
  selectedJob = models.find((m) => m.id === $('model').value) || null;
  options($('modelLevel'), selectedJob?.artifacts.map((a) => [a.level, a.level === 'activity' ? 'Activities' : 'Activity categories']) || []);
  renderModel();
}

function renderModel() {
  $('downloads').replaceChildren(); $('modelDetails').replaceChildren(); $('viewer').hidden = true;
  if (!selectedJob) { updateStale(); return; }
  const artifact = selectedJob.artifacts.find((a) => a.level === $('modelLevel').value);
  if (!artifact) return;
  const prefix = `/api/models/${selectedJob.id}/file/`;
  for (const [name, label] of [[artifact.csv, 'Model CSV'], [artifact.json, 'Model JSON'], ['metadata.json', 'Model & preparation metadata']]) {
    const link = document.createElement('a'); link.href = prefix + name; link.textContent = label; $('downloads').append(link);
  }
  const detail = document.createElement('p');
  detail.textContent = `${selectedJob.population.cases} complete cases; ${selectedJob.population.events} events; ${artifact.rule_count} rules. ${selectedJob.metadata.metrics}. Population: ${JSON.stringify(selectedJob.cohort)}.`;
  $('modelDetails').append(detail);
  const params = new URLSearchParams({ mine_model: selectedJob.id, label_level: artifact.level, s: `builtin:${prefix}${artifact.csv}` });
  $('viewer').src = `/visualization/constraint-visualization.html?${params}`;
  $('viewer').hidden = false;
  updateStale();
}

async function pollJob(job, token) {
  while (token === pollToken) {
    $('jobStatus').textContent = `${job.status}: ${job.progress || job.error || ''}`;
    if (job.status === 'failed') {
      const link = document.createElement('a'); link.href = job.log_url; link.textContent = 'Read local engine error log';
      $('jobStatus').append(' ', link);
      throw new Error(job.error);
    }
    if (job.status === 'complete') {
      await refreshModels(job.id);
      showScreen(true);
      notice(job.cached ? 'Using the exact cached mining run.' : 'Mining complete. Both label levels, when requested, used the same complete-case population.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await api(`/api/jobs/${job.id}`);
  }
}

bind('prepareTab', 'click', () => showScreen(false));
bind('exploreTab', 'click', () => showScreen(true));
bind('preview', 'click', async () => {
  const file = $('csvFile').files[0];
  if (!file) throw new Error('Choose an event-log CSV.');
  const body = new FormData(); body.append('file', file);
  const delimiter = $('delimiter').value;
  const response = await fetch(`/api/preview${delimiter ? `?delimiter=${encodeURIComponent(delimiter)}` : ''}`, { method: 'POST', body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'CSV preview failed.');
  uploaded = result; renderMapping(result); preparationDirty = true; updateStale();
  notice('Preview ready. Choose case columns and event roles explicitly.');
});
bind('prepare', 'click', async () => {
  if (!uploaded) throw new Error('Preview a CSV first.');
  $('prepare').disabled = true;
  try {
    const dataset = await api('/api/prepare', { upload_id: uploaded.upload_id, profile: profile() });
    preparationDirty = false;
    await refreshDatasets(dataset.id);
    notice('Complete cases prepared. Review the retained/excluded counts, then choose a population and mine.');
  } finally { $('prepare').disabled = false; }
});
bind('saveProfile', 'click', async () => {
  await api('/api/profiles', { name: $('profileName').value, profile: profile() });
  await refreshProfiles(); notice('Mapping profile saved on this computer.');
});
bind('loadProfile', 'click', () => {
  const saved = profiles.find((p) => p.id === $('profiles').value);
  if (!saved) throw new Error('Choose a saved profile.');
  applyProfile(saved.profile); notice('Profile loaded. Check the mapping and prepare again.');
});
bind('exportProfile', 'click', () => downloadJson(profile(), 'preparation-profile.json'));
bind('importProfile', 'change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  applyProfile(JSON.parse(await file.text())); notice('Imported mapping applied. Validate by preparing the CSV.');
});
bind('dataset', 'change', datasetChanged);
bind('addFilter', 'click', addFilter);
bind('mine', 'click', async () => {
  if (!currentDataset()) throw new Error('Choose a prepared dataset.');
  $('mine').disabled = true; const token = ++pollToken;
  try {
    const job = await api('/api/mine', { dataset_id: currentDataset().id, configuration: configuration(), cohort: cohort() });
    notice(`Mining ${job.population.cases} complete cases (${job.population.events} events).`);
    await pollJob(job, token);
  } finally { if (token === pollToken) $('mine').disabled = !currentDataset(); }
});
bind('model', 'change', selectModel);
bind('modelLevel', 'change', renderModel);
$('mappingCard').addEventListener('input', () => { preparationDirty = true; updateStale(); });
for (const id of ['level', 'engine', 'support', 'confidence', 'itemsets', 'cardinality']) bind(id, 'input', updateStale);
Promise.all([refreshDatasets(), refreshProfiles()]).catch((error) => notice(`Local backend unavailable: ${error.message}`, true));
