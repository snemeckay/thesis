// Cytoscape graph rendering and layout logic
import {
  edgeColorForRelation,
  brightenHexColor,
  shortTemplateLabel,
  escapeHtml,
  fmt
} from './utils.js';
import { explainConstraintText } from './constraint_explanations.js';
import { normalizeRuleTypeKey } from './ruleTypeHierarchy.js';

export function buildGraphElements(records, activityNames = [], activityStatuses = new Map()) {
  const mergedComparisonMode = activityStatuses.size > 0 ||
    records.some((r) => isComparisonStatus(r?.comparisonStatus));
  const nodeMap = new Map();
  const edges = [];
  const unaryByNode = new Map();
  const nodeStatuses = new Map();
  const unaryLabelNodes = [];

  const addActivity = (name) => {
    if (!nodeMap.has(name)) {
      nodeMap.set(name, {
        data: {
          id: nodeId(name),
          label: name,
          originalName: name,
          isUnaryLabel: 'false',
          hasUnary: 'false',
          showUnaryPie: 'false',
          nodeColor: '#4c5a6d',
          comparisonStatus: 'normal',
          u1Color: '#000000', u1Size: 0,
          u2Color: '#000000', u2Size: 0,
          u3Color: '#000000', u3Size: 0,
          u4Color: '#000000', u4Size: 0
        }
      });
    }
  };
  activityNames.forEach((name) => {
    addActivity(name);
    const status = activityStatuses.get(name);
    if (isComparisonStatus(status)) addNodeStatus(nodeStatuses, name, status);
  });

  for (const r of records) {
    const names = r.activityList.length ? r.activityList : [r.activities];
    names.forEach(addActivity);

    const sourceName = r.activityA || names[0];
    const targetName = r.activityB || names[0];
    if (!sourceName || !targetName) continue;

    if (mergedComparisonMode && isComparisonStatus(r.comparisonStatus)) {
      addNodeStatus(nodeStatuses, sourceName, r.comparisonStatus);
      addNodeStatus(nodeStatuses, targetName, r.comparisonStatus);
    }

    if (r.isUnary) {
      const relationKey = normalizeRelationKey(r.rule_type || 'unary');
      if (!unaryByNode.has(sourceName)) unaryByNode.set(sourceName, new Map());
      const relMap = unaryByNode.get(sourceName);
      if (!relMap.has(relationKey)) {
        relMap.set(relationKey, { count: 0, statuses: new Set() });
      }
      const relInfo = relMap.get(relationKey);
      relInfo.count += 1;
      if (mergedComparisonMode && isComparisonStatus(r.comparisonStatus)) {
        relInfo.statuses.add(r.comparisonStatus);
      }
      continue;
    }

    const edgeId = `edge_${r.rule_id}_${edges.length}`;
    const relationKey = normalizeRelationKey(r.rule_type || 'unknown');
    const baseEdgeColor = edgeColorForRelation(relationKey);
    edges.push({
      data: {
        id: edgeId,
        source: nodeId(sourceName),
        target: nodeId(targetName),
        label: shortTemplateLabel(r.rule_type),
        template: r.rule_type,
        ruleType: r.rule_type,
        support: r.support,
        confidence: r.confidence,
        category: r.category,
        ruleId: r.rule_id,
        edgeColor: baseEdgeColor,
        edgeSelectedColor: brightenHexColor(baseEdgeColor, 0.22),
        directionUncertain: r.directionUncertain ? 'true' : 'false',
        comparisonStatus: r.comparisonStatus || 'normal',
        recordIndex: String(edges.length)
      },
      classes: `binary ${edgeClassByStrength(r.support, r.confidence)}`
    });
  }

  const nodes = [...nodeMap.values()].map((node) => {
    const name = node.data.originalName;
    const nodeStatus = resolveStatus(nodeStatuses.get(name));
    node.data.comparisonStatus = nodeStatus;
    node.data.nodeColor = statusColor(nodeStatus, '#4c5a6d');

    const unaryMap = unaryByNode.get(name);
    if (!unaryMap || unaryMap.size === 0) return node;

    const sorted = [...unaryMap.entries()].sort((a, b) => b[1].count - a[1].count);
    const total = sorted.reduce((acc, [, info]) => acc + info.count, 0);
    const top = sorted.slice(0, 4);

    node.data.hasUnary = 'true';
    node.data.showUnaryPie = mergedComparisonMode ? 'false' : 'true';

    sorted.forEach(([rel, info], idx) => {
      const relStatus = resolveStatus(info.statuses);
      unaryLabelNodes.push({
        data: {
          id: `ulbl_${node.data.id}_${idx}`,
          label: prettifyRel(rel),
          labelColor: mergedComparisonMode
            ? statusColor(relStatus, edgeColorForRelation(rel))
            : edgeColorForRelation(rel),
          parentActivityId: node.data.id,
          labelOrder: idx,
          isUnaryLabel: 'true'
        },
        selectable: false,
        grabbable: false,
        locked: true
      });
    });

    const pie = [
      { color: '#000000', size: 0 },
      { color: '#000000', size: 0 },
      { color: '#000000', size: 0 },
      { color: '#000000', size: 0 }
    ];

    let used = 0;
    for (let i = 0; i < top.length && i < 4; i++) {
      const [rel, info] = top[i];
      const count = info.count;
      const pct = Math.round((count / total) * 100);
      pie[i] = { color: edgeColorForRelation(rel), size: pct };
      used += pct;
    }
    if (used > 100) pie[0].size -= (used - 100);

    node.data.u1Color = pie[0].color; node.data.u1Size = pie[0].size;
    node.data.u2Color = pie[1].color; node.data.u2Size = pie[1].size;
    node.data.u3Color = pie[2].color; node.data.u3Size = pie[2].size;
    node.data.u4Color = pie[3].color; node.data.u4Size = pie[3].size;

    return node;
  });

  return { nodes: [...nodes, ...unaryLabelNodes], edges };
}

export function edgeClassByStrength(support, confidence) {
  const s = typeof support === 'number' ? support : 0;
  const c = typeof confidence === 'number' ? confidence : 0;
  const mix = (s + c) / 2;
  if (mix >= 0.66) return 'strong';
  if (mix >= 0.33) return 'medium';
  return 'weak';
}

export function renderGraph(state, nodes = [], edges = []) {
  ensurePositionCache(state);
  const elements = [...nodes, ...edges];
  const graphLabelBg = '#1f2937';
  const graphLabelText = '#edf3fb';

  if (!state.cy) {
    state.cy = cytoscape({
      container: state.dom.cyContainer,
      elements,
      style: [
        {
          selector: "node[isUnaryLabel != 'true']",
          style: {
            color: graphLabelText,
            'text-outline-width': 0,
            'text-outline-color': 'transparent',
            'text-background-color': graphLabelBg,
            'text-background-opacity': 1,
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle'
          }
        },
        {
          selector: "node[isUnaryLabel != 'true']",
          style: {
            'background-color': 'data(nodeColor)',
            label: 'data(label)',
            'font-size': 10,
            'text-wrap': 'ellipsis',
            'text-max-width': 120,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 8,
            width: 24,
            height: 24,
            'border-width': 1,
            'border-color': '#ffffff',
            'pie-size': '0%'
          }
        },
        {
          selector: "node[showUnaryPie = 'true']",
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
            'text-background-opacity': 0,
            'text-background-padding': 0,
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
            'text-background-color': graphLabelBg,
            'text-background-opacity': 0.82,
            'text-background-padding': 2,
            'text-wrap': 'none',
            color: graphLabelText,
            width: 1.6,
            'line-opacity': 0.75
          }
        },
        {
          selector: "edge[directionUncertain = 'true']",
          style: {
            'target-arrow-shape': 'none',
            'line-style': 'dashed'
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
        },
        {
          selector: "node:selected[isUnaryLabel != 'true']",
          style: {
            'background-color': '#0f766e',
            'border-color': '#0f766e',
            'border-width': 3
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': 'data(edgeSelectedColor)',
            'target-arrow-color': 'data(edgeSelectedColor)',
            width: 4,
            'line-opacity': 1
          }
        }
      ],
      layout: layoutOptions(state.dom.layoutSelect.value)
    });

    setTimeout(() => {
      cacheVisibleNodePositions(state);
      placeAllUnaryLabels(state);
    }, 0);

    state.cy.on('select', 'node, edge', (event) => {
      state.selectedElement = event.target;
      state.selectedRecords = null;
      state.selectedContext = "";
      state.renderDetails();
    });

    state.cy.on('unselect', 'node, edge', () => {
      const selected = state.cy.$(':selected').first();
      state.selectedElement = selected.nonempty() ? selected : null;
      state.renderDetails();
    });

    state.cy.on("position", "node[isUnaryLabel != 'true']", (event) => {
      cacheNodePosition(state, event.target);
      placeUnaryLabelsForActivity(state, event.target);
    });
  } else {
    cacheVisibleNodePositions(state);

    state.selectedElement = null;
    state.selectedRecords = null;
    state.selectedContext = "";
    state.cy.elements().remove();
    state.cy.add(elements);

    const activityNodes = state.cy.nodes("[isUnaryLabel != 'true']");
    const seenNodes = activityNodes.filter((n) => state.nodePositions.has(n.id()));
    const unseenNodes = activityNodes.filter((n) => !state.nodePositions.has(n.id()));

    seenNodes.forEach((n) => {
      const pos = state.nodePositions.get(n.id());
      if (pos) n.position(pos);
    });

    if (unseenNodes.length > 0) {
      const anchor = averagePosition(seenNodes) || viewportCenter(state.cy);
      unseenNodes.forEach((n, idx) => {
        const ring = Math.floor(idx / 12);
        const angle = (idx % 12) * (Math.PI / 6);
        const radius = 30 + ring * 22;
        n.position({
          x: anchor.x + Math.cos(angle) * radius,
          y: anchor.y + Math.sin(angle) * radius
        });
      });
    }

    cacheVisibleNodePositions(state);
    placeAllUnaryLabels(state);
  }
}

export function runLayout(state, layoutName = 'cose') {
  if (!state.cy) return;
  const layout = state.cy.layout(layoutOptions(layoutName));
  layout.on('layoutstop', () => {
    placeAllUnaryLabels(state);
  });
  layout.run();
}

export function layoutOptions(name) {
  const base = { animate: false, fit: true, padding: 30 };
  switch (name) {
    case 'concentric':
      return { ...base, name: 'concentric', spacingFactor: 1.2 };
    case 'breadthfirst':
      return { ...base, name: 'breadthfirst', directed: true, spacingFactor: 1.1 };
    case 'grid':
      return { ...base, name: 'grid', condense: true };
    case 'cose':
    default:
      return { ...base, name: 'cose', idealEdgeLength: 110, nodeRepulsion: 8500 };
  }
}

export function renderDetails(state) {
  const selected = state.selectedElement;
  const records = state.selectedRecords ?? state.filteredRecords;
  const contextHtml = state.selectedContext
    ? `<div class="helper">Selected in ${escapeHtml(state.selectedContext)}</div>`
    : '';
  if (!selected || selected.empty?.() || selected.removed?.()) {
    state.dom.detailsPanel.innerHTML = `
      <div class="note">Select a node or edge to view plain-language explanation and technical metadata.</div>
      ${detailsLegendHtml(state)}
    `;
    return;
  }

  if (selected.isNode()) {
    const name = selected.data('originalName') || selected.data('label');
    const related = records.filter((r) => r.activityList.includes(name));
    const visibleRelated = related;
    const unary = visibleRelated.filter((r) => r.isUnary);
    const binary = visibleRelated.length - unary.length;
    const activityCategories = [...new Set(related.flatMap((r) =>
      r.activityCategoryLists?.[r.activityList.indexOf(name)] || []))].sort();

    const unaryRows = unary
      .slice()
      .sort((a, b) => (b.support ?? 0) - (a.support ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0))
      .map((record) => {
        const ruleLabel = escapeHtml(prettifyRel(normalizeRelationKey(record.rule_type || 'unary')));
        const explanation = escapeHtml(explainConstraint(record));
        const source = record.source && record.source !== 'unknown'
          ? record.source : record.source_file;
        return `
          <li style="margin-bottom:10px;">
            <div style="font-weight:600; color:${edgeColorForRelation(normalizeRelationKey(record.rule_type || 'unary'))};">${ruleLabel}</div>
            <div style="margin-top:4px;">${explanation}</div>
            <div class="helper" style="margin-top:4px;">Support: ${formatMetric(record.support)} • Confidence: ${formatMetric(record.confidence)} • Source: ${escapeHtml(source || 'Not specified')} • Rule: ${escapeHtml(record.rule_id)}</div>
          </li>
        `;
      })
      .join('');

    state.dom.detailsPanel.innerHTML = `
      <h4>${escapeHtml(name)}</h4>
      ${contextHtml}
      ${activityCategories.length ? `<p class="helper">Activity categories in this model: ${activityCategories.map(escapeHtml).join(', ')}</p>` : ''}
      ${state.filters?.ruleTypeOperator === 'and' ? '<div class="helper">This activity participates in every selected rule type within a selected source file. Relationships to non-matching activities are hidden.</div>' : ''}
      <p>${visibleRelated.length.toLocaleString()} related constraints in current filtered view.</p>
      <p class="helper">Unary: ${unary.length.toLocaleString()} • Binary: ${binary.toLocaleString()}</p>
      ${unaryRows ? `<h5 style="margin:10px 0 6px">Unary rules on this node</h5><ul style="margin:0;padding-left:18px">${unaryRows}</ul>` : '<div class="helper">No unary rules matched the current filters for this node.</div>'}
      ${detailsLegendHtml(state)}
    `;
    return;
  }

  if (selected.isEdge()) {
    const ruleId = selected.data('ruleId');
    const record = records.find((r) => r.rule_id === ruleId);
    if (!record) {
      state.dom.detailsPanel.innerHTML = '<div class="empty">Selected edge metadata is not available.</div>';
      return;
    }

    const explanation = explainConstraint(record);
    const involved = record.activityList.join(' → ') || record.activities;
    const comparisonStatus = record.comparisonStatus;
    
    let comparisonHtml = '';
    if (comparisonStatus) {
      const statusLabel = {
        'both': 'Present in both models',
        'only_a': 'Only in Model A',
        'only_b': 'Only in Model B'
      }[comparisonStatus] || 'Unknown';
      
      const statusColor = {
        'both': '#0f766e',
        'only_a': '#2563eb',
        'only_b': '#dc2626'
      }[comparisonStatus] || '#666';
      
      comparisonHtml = `
        <div style="background:${statusColor}20;border-left:3px solid ${statusColor};padding:8px;margin-bottom:12px;border-radius:4px;">
          <strong style="color:${statusColor}">${statusLabel}</strong>
        </div>
      `;
    }

    state.dom.detailsPanel.innerHTML = `
      <h4>Constraint ${escapeHtml(record.rule_id)}</h4>
      ${contextHtml}
      ${comparisonHtml}
      <p><strong>Plain-language explanation:</strong><br>${escapeHtml(explanation)}</p>
      <dl class="kv">
        <dt>Activities</dt><dd>${escapeHtml(involved)}</dd>
        ${record.label_level ? `<dt>Label level</dt><dd>${escapeHtml(record.label_level)}</dd>` : ''}
        ${record.activityCategoryLists ? `<dt>Endpoint activity categories</dt><dd>${record.activityList.map((a, i) => `${escapeHtml(a)}: ${record.activityCategoryLists[i].map(escapeHtml).join(', ') || 'not mapped'}`).join('<br>')}</dd>` : ''}
        <dt>Rule type</dt><dd>${escapeHtml(record.rule_type)}</dd>
        <dt>Constraint category (arity)</dt><dd>${escapeHtml(record.category)}</dd>
        <dt>Cardinality</dt><dd>${fmt(record.cardinality)}</dd>
        <dt>Support</dt><dd>${formatMetric(record.support)} of cases satisfy this rule</dd>
        <dt>Confidence</dt><dd>${formatMetric(record.confidence)} of activations fulfilled</dd>
        <dt>Trace count</dt><dd>${fmt(record.trace_count, true)}</dd>
        <dt>Support count</dt><dd>${fmt(record.support_count, true)}</dd>
        <dt>Violation count</dt><dd>${fmt(record.violation_count, true)}</dd>
        <dt>Activation count</dt><dd>${fmt(record.activation_count, true)}</dd>
        <dt>Fulfillment count</dt><dd>${fmt(record.fulfillment_count, true)}</dd>
        <dt>Activation trace count</dt><dd>${fmt(record.activation_trace_count, true)}</dd>
        <dt>Raw activities</dt><dd>${escapeHtml(record.activities)}</dd>
        <dt>Source file</dt><dd>${escapeHtml(record.source_file)}</dd>
        ${record.model_id ? `<dt>Local model</dt><dd>${escapeHtml(record.model_id)}</dd>` : ''}
      </dl>
      ${detailsLegendHtml(state)}
    `;
  }
}

export function explainConstraint(record) {
  return explainConstraintText(record);
}

function formatMetric(value) {
  if (typeof value !== 'number' || value < 0 || value > 1) return fmt(value);
  return `${fmt(value)} (${Math.round(value * 1000) / 10}%)`;
}

export function renderNoSourceState(state) {
  state.showStatus('No built-in sources discovered.');
  renderGraph(state, [], []);
  state.renderGraphMessage('No built-in constraint CSV files were found. Add *_constraints.csv files under output/, update visualization/csv-sources.json, or upload a file.');
  state.dom.detailsPanel.innerHTML = `<div class="empty">No source selected yet.</div>${detailsLegendHtml(state)}`;
}

export function renderErrorState(state, message) {
  state.showStatus('Error state');
  renderGraph(state, [], []);
  state.renderGraphMessage(message, true);
  state.dom.detailsPanel.innerHTML = `<div class="error">${escapeHtml(message)}</div>${detailsLegendHtml(state)}`;
}

function nodeId(activityName) {
  return `node_${activityName}`;
}

function isComparisonStatus(status) {
  return status === 'both' || status === 'only_a' || status === 'only_b';
}

function addNodeStatus(nodeStatuses, nodeName, status) {
  if (!nodeStatuses.has(nodeName)) nodeStatuses.set(nodeName, new Set());
  nodeStatuses.get(nodeName).add(status);
}

function resolveStatus(statusSet) {
  if (!statusSet || statusSet.size === 0) return 'normal';
  if (statusSet.has('both')) return 'both';
  if (statusSet.has('only_a') && statusSet.has('only_b')) return 'both';
  if (statusSet.has('only_a')) return 'only_a';
  if (statusSet.has('only_b')) return 'only_b';
  return 'normal';
}

function statusColor(status, fallback = '#4c5a6d') {
  if (status === 'both') return '#0f766e';
  if (status === 'only_a') return '#2563eb';
  if (status === 'only_b') return '#dc2626';
  return fallback;
}

function normalizeRelationKey(text) {
  return normalizeRuleTypeKey(text) || String(text || '').trim().toLowerCase();
}

function prettifyRel(rel) {
  return String(rel || '').replace(/_/g, ' ');
}

function placeAllUnaryLabels(state) {
  if (!state.cy) return;
  const activityNodes = state.cy.nodes("[isUnaryLabel != 'true']");
  activityNodes.forEach((n) => placeUnaryLabelsForActivity(state, n));
}

function placeUnaryLabelsForActivity(state, activityNode) {
  if (!state.cy || !activityNode || activityNode.empty?.()) return;
  const activityId = activityNode.id();
  const labels = state.cy.nodes(`[parentActivityId = '${activityId}']`);
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

function ensurePositionCache(state) {
  if (!state.nodePositions) {
    state.nodePositions = new Map();
  }
}

function cacheNodePosition(state, node) {
  if (!node || node.empty?.()) return;
  ensurePositionCache(state);
  state.nodePositions.set(node.id(), { ...node.position() });
}

function cacheVisibleNodePositions(state) {
  if (!state.cy) return;
  ensurePositionCache(state);
  state.cy.nodes("[isUnaryLabel != 'true']").forEach((n) => {
    state.nodePositions.set(n.id(), { ...n.position() });
  });
}

function averagePosition(nodes) {
  if (!nodes || nodes.length === 0) return null;
  let x = 0;
  let y = 0;
  nodes.forEach((n) => {
    x += n.position('x');
    y += n.position('y');
  });
  return { x: x / nodes.length, y: y / nodes.length };
}

function viewportCenter(cy) {
  const extent = cy.extent();
  return {
    x: (extent.x1 + extent.x2) / 2,
    y: (extent.y1 + extent.y2) / 2
  };
}

function detailsLegendHtml(state) {
  return `
    <section class="filter-section" aria-label="Edge legend">
      <h4>Edge legend</h4>
      ${buildEdgeStrengthLegendHtml()}
      ${buildRelationColorLegendSectionHtml(state)}
    </section>
  `;
}

function buildEdgeStrengthLegendHtml() {
  return `
    <div style="display:grid;gap:6px;font-size:.84rem;">
      <div><span style="display:inline-block;width:18px;border-top:3px solid currentColor;vertical-align:middle;margin-right:8px;"></span>Strong relation</div>
      <div><span style="display:inline-block;width:18px;border-top:2.2px solid currentColor;vertical-align:middle;margin-right:8px;"></span>Medium relation</div>
      <div><span style="display:inline-block;width:18px;border-top:1.4px solid currentColor;vertical-align:middle;margin-right:8px;"></span>Weak relation</div>
      <div><span style="display:inline-block;width:18px;border-top:2px dashed currentColor;vertical-align:middle;margin-right:8px;"></span>Dashed: uncertain or symmetric direction</div>
    </div>
  `;
}

function buildRelationColorLegendSectionHtml(state) {
  return `
    <h4 style="margin-top:10px;">Relation color legend</h4>
    <div style="display:grid;gap:5px;font-size:.84rem;">${buildRelationColorLegendRowsHtml(state)}</div>
  `;
}

function getLegendRecords(state) {
  if (Array.isArray(state?.filteredRecords) && state.filteredRecords.length) {
    return state.filteredRecords;
  }
  if (Array.isArray(state?.records)) {
    return state.records;
  }
  return [];
}

function buildRelationColorLegendRowsHtml(state) {
  const records = getLegendRecords(state);

  if (!records.length) {
    return '<div class="helper">Load a source to see relation colors.</div>';
  }

  const counts = new Map();
  records.forEach((r) => {
    const key = normalizeRelationKey(r.rule_type || 'unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const totalRows = records.length || 1;

  const rows = sorted.map(([rel, count]) => {
    const color = edgeColorForRelation(rel);
    const label = escapeHtml(prettifyRel(rel));
    const pct = ((count / totalRows) * 100).toFixed(1);
    return `<div>
      <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${color};margin-right:8px;vertical-align:middle;border:1px solid rgba(127,127,127,.4)"></span>
      ${label}
      <span class="helper">(count: ${count.toLocaleString()}, ${pct}%)</span>
    </div>`;
  });

  return rows.join('');
}
