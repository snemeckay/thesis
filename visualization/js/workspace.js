// Shared full-page navigation for preparation and the existing graph viewer.
export function isBoundModelView(params) {
  return params.has('mine_model') && (params.get('workspace') === '1' || params.get('embedded') === '1');
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
  if (!job) return;
  const params = new URLSearchParams(location.search);
  const artifact = job.artifacts.find((a) => a.level === params.get('label_level'));
  if (!artifact) throw new Error('Choose an available activity or category model.');
  const prepare = document.getElementById('prepareTab');
  prepare.href = `/?${new URLSearchParams({ dataset: job.dataset_id, model: job.id, label_level: artifact.level })}`;
  document.getElementById('exploreTab').href = modelViewerUrl(job, artifact.level);
  const download = document.getElementById('downloadModel');
  download.href = modelFileUrl(job, artifact);
  download.textContent = 'Download CSV';
  download.setAttribute('aria-label', 'Download original mined CSV');
  download.title = modelDownloadName(job, artifact);
  download.hidden = false;
  const levels = document.getElementById('workspaceLevel');
  levels.replaceChildren();
  for (const item of job.artifacts) {
    levels.add(new Option(item.level === 'activity' ? 'Activities' : 'Categories', item.level));
  }
  levels.value = artifact.level;
  levels.parentElement.hidden = job.artifacts.length < 2;
  levels.addEventListener('change', () => location.assign(modelViewerUrl(job, levels.value)));
  // Bound views cannot switch to unrelated sources beneath the model download link.
  if (isBoundModelView(params)) state.dom.uploadInput.closest('.filter-section').hidden = true;
}
