// Shared full-page navigation for preparation and the existing graph viewer.
export function isBoundModelView(params) {
  return params.has('mine_model') && params.get('embedded') === '1';
}

export function modelFileUrl(job, artifact, extension = 'csv') {
  return `/api/models/${job.id}/file/${encodeURIComponent(artifact[extension])}`;
}

export function modelViewerUrl(job, level) {
  const artifact = job.artifacts.find((a) => a.level === level);
  if (!artifact) throw new Error('The selected label model is not available in this mining run.');
  const params = new URLSearchParams({
    workspace: '1', mine_model: job.id, dataset: job.dataset_id,
    label_level: artifact.level, s: `builtin:${modelFileUrl(job, artifact)}`
  });
  return `/visualization/constraint-visualization.html?${params}`;
}

export function modelDownloadName(job, artifact, extension = 'csv') {
  if (!job.output_name) return artifact[extension];
  const suffix = job.artifacts.length > 1 ? `_${artifact.level}` : '';
  return `${job.output_name}${suffix}.${extension}`;
}

export function initializeWorkspaceNavigation(state) {
  const job = state.miningJob;
  const params = new URLSearchParams(location.search);
  if (job && !job.artifacts.some((a) => a.level === params.get('label_level'))) {
    throw new Error('Choose an available activity or category model.');
  }
  const levels = document.getElementById('workspaceLevel');
  levels.replaceChildren();
  for (const item of job?.artifacts || []) {
    levels.add(new Option(item.level === 'activity' ? 'Activities' : 'Categories', item.level));
  }
  if (job) levels.addEventListener('change', () => location.assign(modelViewerUrl(job, levels.value)));
  state.workspaceNavigationReady = true;
  updateWorkspaceSelection(state);
}

export function updateWorkspaceSelection(state) {
  if (!state.workspaceNavigationReady) return;
  const source = state.mode === 'single' ? state.allSources.find((s) => s.id === state.activeSourceId) : null;
  const job = state.miningJob;
  const artifact = source && job?.artifacts.find((a) => source.path === modelFileUrl(job, a));
  const levels = document.getElementById('workspaceLevel');
  levels.parentElement.hidden = !artifact || job.artifacts.length < 2;
  if (artifact) levels.value = artifact.level;
  if (job) {
    const level = artifact?.level || new URLSearchParams(location.search).get('label_level');
    document.getElementById('prepareTab').href = `/?${new URLSearchParams({ dataset: job.dataset_id, model: job.id, label_level: level })}`;
  }
  document.getElementById('exploreTab').href = `${location.pathname}${location.search}`;
  const download = document.getElementById('downloadModel');
  if (state.workspaceDownloadSource !== source || state.workspaceDownloadText !== source?.uploadText) {
    if (state.workspaceDownloadBlob) URL.revokeObjectURL(state.workspaceDownloadBlob);
    state.workspaceDownloadBlob = source?.kind === 'upload'
      ? URL.createObjectURL(new Blob([source.uploadText], { type: 'text/csv' })) : null;
    state.workspaceDownloadSource = source;
    state.workspaceDownloadText = source?.uploadText;
  }
  download.hidden = !source;
  if (source) {
    download.href = state.workspaceDownloadBlob || source.path;
    download.download = source.filename;
    download.textContent = 'Download CSV';
    download.setAttribute('aria-label', `Download original CSV: ${source.filename}`);
    download.title = source.filename;
  }
}
