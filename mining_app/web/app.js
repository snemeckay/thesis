import { dom, applyInitialTheme, toggleTheme, safeCreateIcons } from '/visualization/js/ui.js';
import { modelDownloadName, modelFileUrl, modelViewerUrl } from '/visualization/js/workspace.js';

const $ = (id) => document.getElementById(id);
let uploaded = null;
let columns = [];
let datasets = [];
let profiles = [];
let models = [];
let selectedJob = null;
let pollToken = 0;
let preparationDirty = false;
let activeJobId = null;
let restoring = true;
const workspaceKey = 'research-mining-workspace';
const profileMigrationNotice = 'Additional columns are no longer retained in new preparations. Existing prepared datasets and models are unchanged. Check the mapping and prepare again.';

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

function saveWorkspace() {
  if (restoring) return;
  sessionStorage.setItem(workspaceKey, JSON.stringify({
    dataset_id: currentDataset()?.id, model_id: selectedJob?.id, model_level: $('modelLevel').value,
    configuration: configuration(), output_name: $('outputName').value,
    uploaded, profile: uploaded ? profile() : null, preparation_dirty: preparationDirty, active_job_id: activeJobId
  }));
}

function saveWorkspaceSafely() {
  try { saveWorkspace(); } catch (error) { notice(`Could not retain this tab's preparation settings: ${error.message}`, true); }
}

function currentDataset() { return datasets.find((d) => d.id === $('dataset').value); }

const caseMethods = {
  group: 'one sequence with all events together',
  calendar_day: 'calendar days',
  gap: 'inactivity sessions',
  behavioural_day: 'behavioural days (estimated sleep)'
};

function updateCaseSettings() {
  const mode = $('caseMode').value;
  $('gapSettings').hidden = mode !== 'gap';
  $('gapMinutes').disabled = mode !== 'gap';
  $('daySettings').hidden = mode !== 'calendar_day';
  $('dayHour').disabled = mode !== 'calendar_day';
  $('behaviouralHelp').hidden = mode !== 'behavioural_day';
  $('endTimestamp').required = mode === 'behavioural_day';
  $('endTimestampRequirement').textContent = mode === 'behavioural_day' ? '(required for behavioural days)' : '(optional)';
  const explanation = {
    group: 'All events for each participant/group stay in one sequence, even across multiple days.',
    calendar_day: 'A separate sequence for each day within each participant/group, split at the hour below.',
    gap: 'A new sequence starts when inactivity exceeds the threshold below, separately within each participant/group.',
    behavioural_day: 'Treats long inactivity breaks as possible sleep periods and uses them to separate each participant/group into days, rather than splitting at midnight.'
  };
  $('caseMethodHelp').textContent = explanation[mode];
}

function renderMapping(result) {
  columns = result.columns;
  $('delimiter').value = result.delimiter;
  $('mappingCard').hidden = false;
  for (const id of ['profiles', 'loadProfile', 'importProfile']) $(id).disabled = false;
  $('profileLoadHelp').hidden = true;
  $('caseColumns').replaceChildren();
  for (const column of columns) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = column.name;
    const name = document.createElement('span'); name.textContent = column.name;
    label.append(input, name);
    $('caseColumns').append(label);
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
  updateCaseSettings();
}

function profile() {
  return {
    delimiter: $('delimiter').value, case_columns: [...$('caseColumns').querySelectorAll('input:checked')].map((i) => i.value),
    activity: $('activity').value, activity_category: $('category').value,
    timestamp: $('timestamp').value, end_timestamp: $('endTimestamp').value,
    case_mode: $('caseMode').value, gap_minutes: Number($('gapMinutes').value),
    day_start_hour: Number($('dayHour').value), merge_gap_seconds: Number($('mergeGap').value),
    missing: $('missing').value, case_conflicts: 'error', attributes: [],
    exclude_activities: $('excluded').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  };
}

function applyProfile(p) {
  if (!uploaded) throw new Error('Preview a CSV before applying a profile.');
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Profile JSON must contain a mapping object.');
  if (p.attributes !== undefined && !Array.isArray(p.attributes)) throw new Error('Profile attributes must be a list.');
  const migrated = !!p.attributes?.length || p.missing === 'keep_attributes';
  const known = new Set(columns.map((c) => c.name));
  const required = [...(p.case_columns || []), p.activity, p.timestamp,
    p.activity_category, p.end_timestamp].filter(Boolean);
  if (required.some((c) => !known.has(c))) throw new Error('This profile refers to columns not present in the previewed CSV.');
  if (p.delimiter !== $('delimiter').value) throw new Error('Profile delimiter differs from preview. Select its delimiter and preview again before loading it.');
  for (const input of $('caseColumns').querySelectorAll('input')) input.checked = p.case_columns?.includes(input.value) || false;
  const map = { activity: 'activity', category: 'activity_category', timestamp: 'timestamp', endTimestamp: 'end_timestamp',
    caseMode: 'case_mode', gapMinutes: 'gap_minutes', dayHour: 'day_start_hour', mergeGap: 'merge_gap_seconds',
    missing: 'missing' };
  for (const [id, key] of Object.entries(map)) if (p[key] !== undefined) $(id).value = p[key];
  if (p.missing === 'keep_attributes') $('missing').value = 'error';
  $('excluded').value = (p.exclude_activities || []).join('\n');
  preparationDirty = true;
  updateCaseSettings();
  updateStale();
  saveWorkspaceSafely();
  return migrated;
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
  $('quality').replaceChildren();
  $('mine').disabled = !dataset;
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
    $('datasetExplanation').textContent = `Participant/group: ${dataset.metadata.profile.case_columns.join(' + ')}. Sequences: ${caseMethods[dataset.metadata.profile.case_mode || 'group']}. Time: ${dataset.metadata.time_convention}.`;
    for (const option of $('level').options) option.disabled = option.value !== 'activity' && !dataset.metadata.category_available;
    if (!dataset.metadata.category_available) $('level').value = 'activity';
  } else {
    $('datasetExplanation').textContent = 'Prepare an event log to enable mining.';
  }
  selectedJob = null;
  await refreshModels();
  updateStale();
  saveWorkspaceSafely();
}

function configuration() {
  return { engine: $('engine').value, label_level: $('level').value, min_support: Number($('support').value),
    min_confidence: Number($('confidence').value), itemsets_support: Number($('itemsets').value),
    max_cardinality: Number($('cardinality').value) };
}

function signature(datasetId, config, filters) { return JSON.stringify([datasetId, config, filters]); }
function updateStale() {
  if (!selectedJob) { $('resultState').textContent = 'Mine the dataset to create a model, or choose a saved run.'; return; }
  const matches = signature(currentDataset()?.id, configuration(), []) === signature(selectedJob.dataset_id, selectedJob.configuration, selectedJob.cohort || []);
  const stale = !matches || preparationDirty || (selectedJob.output_name &&
    $('outputName').value.trim().replace(/\.csv$/i, '') !== selectedJob.output_name);
  $('resultState').classList.toggle('stale', stale);
  $('resultState').textContent = selectedJob.cohort?.length
    ? 'Saved result from a population-restricted run. New runs here use all prepared cases. Downloads and Visualize retain this saved run and its original population.'
    : stale
      ? 'Saved result - not current for the edited mapping, engine settings or file name. Prepare changed mappings, then Mine dataset. Downloads and Visualize still use the selected saved run.'
      : 'Current result - matches the selected prepared dataset and mining settings.';
}

async function refreshModels(preferred) {
  const dataset = currentDataset();
  models = dataset ? await api(`/api/models?dataset_id=${dataset.id}`) : [];
  const previous = preferred || $('model').value;
  options($('model'), models.map((m) => [m.id, `${m.output_name || m.id.slice(0, 8)} / ${m.configuration.engine} / ${m.configuration.label_level} / ${m.population.cases} cases`]), 'Choose a saved mining run');
  if (models.some((m) => m.id === previous)) { $('model').value = previous; selectModel(); }
  else renderModel();
}

function selectModel() {
  selectedJob = models.find((m) => m.id === $('model').value) || null;
  options($('modelLevel'), selectedJob?.artifacts.map((a) => [a.level, a.level === 'activity' ? 'Activities' : 'Activity categories']) || []);
  renderModel();
}

function renderModel() {
  $('downloads').replaceChildren(); $('modelDetails').replaceChildren();
  $('exploreTab').href = '/visualization/constraint-visualization.html?workspace=1';
  if (!selectedJob) { updateStale(); return; }
  const artifact = selectedJob.artifacts.find((a) => a.level === $('modelLevel').value);
  if (!artifact) return;
  for (const [extension, label] of [['csv', 'Download mined CSV'], ['json', 'Model JSON']]) {
    const link = document.createElement('a'); link.href = modelFileUrl(selectedJob, artifact, extension);
    link.textContent = `${label} (${modelDownloadName(selectedJob, artifact, extension)})`; $('downloads').append(link);
  }
  const metadata = document.createElement('a');
  metadata.href = `/api/models/${selectedJob.id}/file/metadata.json`;
  metadata.textContent = 'Model & preparation metadata'; $('downloads').append(metadata);
  const detail = document.createElement('p');
  detail.textContent = `Complete cases: ${selectedJob.population.cases}; events: ${selectedJob.population.events}; rules: ${artifact.rule_count}. ${selectedJob.metadata.metrics}. ${selectedJob.cohort?.length ? 'Original population definition is included in the model metadata.' : 'Includes all prepared cases.'}`;
  $('modelDetails').append(detail);
  $('exploreTab').href = modelViewerUrl(selectedJob, artifact.level);
  updateStale();
  saveWorkspaceSafely();
}

async function pollJob(job, token) {
  while (token === pollToken) {
    $('jobStatus').textContent = `${job.status}: ${job.progress || job.error || ''}`;
    if (job.status === 'failed') {
      activeJobId = null; saveWorkspaceSafely();
      const link = document.createElement('a'); link.href = job.log_url; link.textContent = 'Read local engine error log';
      $('jobStatus').append(' ', link);
      throw new Error(job.error);
    }
    if (job.status === 'complete') {
      activeJobId = null;
      await refreshModels(job.id);
      saveWorkspaceSafely();
      notice(job.cached ? 'Using the exact cached mining run. Download below or switch to Visualize.' : 'Mining complete. Download below or switch to Visualize; your selected CSV loads automatically.');
      $('resultsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await api(`/api/jobs/${job.id}`);
  }
}

bind('themeToggle', 'click', toggleTheme);
bind('exploreTab', 'click', saveWorkspace);
bind('preview', 'click', async () => {
  const file = $('csvFile').files[0];
  if (!file) throw new Error('Choose an event-log CSV.');
  const body = new FormData(); body.append('file', file);
  const delimiter = $('delimiter').value;
  const response = await fetch(`/api/preview${delimiter ? `?delimiter=${encodeURIComponent(delimiter)}` : ''}`, { method: 'POST', body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'CSV preview failed.');
  uploaded = result; renderMapping(result); preparationDirty = true; updateStale(); saveWorkspaceSafely();
  $('uploadHint').textContent = '';
  notice('Preview ready. Choose participant/group columns, a sequence-splitting method and event roles.');
});
bind('prepare', 'click', async () => {
  if (!uploaded) throw new Error('Preview a CSV first.');
  $('prepare').disabled = true;
  try {
    const dataset = await api('/api/prepare', { upload_id: uploaded.upload_id, profile: profile() });
    preparationDirty = false;
    await refreshDatasets(dataset.id);
    notice('Complete cases prepared. Review the retained/excluded counts, then mine the dataset.');
  } finally { $('prepare').disabled = false; }
});
bind('saveProfile', 'click', async () => {
  await api('/api/profiles', { name: $('profileName').value, profile: profile() });
  await refreshProfiles(); notice('Mapping profile saved on this computer.');
});
bind('loadProfile', 'click', () => {
  const saved = profiles.find((p) => p.id === $('profiles').value);
  if (!saved) throw new Error('Choose a saved profile.');
  const migrated = applyProfile(saved.profile);
  notice(migrated ? profileMigrationNotice : 'Profile loaded. Check the mapping and prepare again.');
});
bind('exportProfile', 'click', () => downloadJson(profile(), 'preparation-profile.json'));
bind('importProfile', 'change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const migrated = applyProfile(JSON.parse(await file.text()));
  notice(migrated ? profileMigrationNotice : 'Imported mapping applied. Validate by preparing the CSV.');
});
bind('dataset', 'change', datasetChanged);
bind('mine', 'click', async () => {
  if (!currentDataset()) throw new Error('Choose a prepared dataset.');
  if (!$('outputName').reportValidity()) return;
  $('mine').disabled = true; const token = ++pollToken;
  $('jobStatus').textContent = 'Validating the dataset and engine...';
  try {
    const job = await api('/api/mine', { dataset_id: currentDataset().id, configuration: configuration(), cohort: [], output_name: $('outputName').value });
    activeJobId = job.id; saveWorkspaceSafely();
    notice(`Mining ${job.population.cases} complete cases (${job.population.events} events).`);
    await pollJob(job, token);
  } catch (error) {
    if (token === pollToken && !$('jobStatus').querySelector('a')) $('jobStatus').textContent = `Not mined: ${error.message}`;
    throw error;
  } finally { if (token === pollToken) $('mine').disabled = !currentDataset(); }
});
bind('model', 'change', selectModel);
bind('modelLevel', 'change', renderModel);
$('mappingCard').addEventListener('input', () => { preparationDirty = true; updateCaseSettings(); updateStale(); });
bind('caseMode', 'change', updateCaseSettings);
for (const id of ['level', 'engine', 'support', 'confidence', 'itemsets', 'cardinality', 'outputName']) bind(id, 'input', updateStale);
document.addEventListener('input', saveWorkspaceSafely);
document.addEventListener('change', saveWorkspaceSafely);

function applyConfiguration(config) {
  const controls = { engine: 'engine', level: 'label_level', support: 'min_support',
    confidence: 'min_confidence', itemsets: 'itemsets_support', cardinality: 'max_cardinality' };
  for (const [id, key] of Object.entries(controls)) if (config[key] !== undefined) $(id).value = config[key];
}

async function initialize() {
  dom.themeToggle = $('themeToggle');
  applyInitialTheme(); safeCreateIcons();
  let saved = null;
  const stored = sessionStorage.getItem(workspaceKey);
  if (stored) {
    try { saved = JSON.parse(stored); } catch (error) {
      notice(`Saved tab settings are unreadable: ${error.message}. Choose your dataset again.`, true);
      sessionStorage.removeItem(workspaceKey);
    }
  }
  const params = new URLSearchParams(location.search);
  const datasetId = params.get('dataset') || saved?.dataset_id;
  const matchingSaved = saved && saved.dataset_id === datasetId ? saved : null;
  await Promise.all([refreshDatasets(datasetId), refreshProfiles()]);
  let migratedProfile = false;
  if (matchingSaved?.uploaded) {
    uploaded = matchingSaved.uploaded; renderMapping(uploaded);
    if (matchingSaved.profile) migratedProfile = applyProfile(matchingSaved.profile);
    preparationDirty = matchingSaved.preparation_dirty || migratedProfile;
    $('uploadHint').textContent = 'Your previous preview and mapping are restored. Choose a new CSV only to replace that upload.';
  }
  const modelId = params.get('model') || matchingSaved?.model_id;
  const job = models.find((m) => m.id === modelId);
  if (matchingSaved?.configuration) applyConfiguration(matchingSaved.configuration);
  else if (job) applyConfiguration(job.configuration);
  $('outputName').value = matchingSaved?.output_name ?? job?.output_name ?? '';
  if (job) {
    $('model').value = job.id; selectModel();
    $('modelLevel').value = params.get('label_level') || matchingSaved?.model_level || job.artifacts[0].level;
    renderModel();
  }
  restoring = false; updateStale(); saveWorkspaceSafely();
  const migrationNotices = [
    ...(migratedProfile ? [profileMigrationNotice] : []),
    ...(matchingSaved?.cohort?.length ? ['Previous population filters are no longer applied here. New mining runs use all cases in the selected prepared dataset; saved runs keep their original results.'] : [])
  ];
  if (migrationNotices.length) {
    notice(migrationNotices.join(' '));
  }
  if (matchingSaved?.active_job_id) {
    const running = await api(`/api/jobs/${matchingSaved.active_job_id}`);
    if (running.dataset_id === currentDataset()?.id) {
      activeJobId = running.id; $('mine').disabled = true;
      const token = ++pollToken;
      try { await pollJob(running, token); }
      finally { if (token === pollToken) $('mine').disabled = !currentDataset(); }
    }
  }
}

initialize().catch((error) => {
  restoring = false;
  notice(`Could not restore the local workspace: ${error.message}`, true);
});
