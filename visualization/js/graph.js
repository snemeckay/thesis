// Cytoscape graph rendering and layout logic
import {
  edgeColorForRelation,
  brightenHexColor,
  shortTemplateLabel,
  escapeHtml,
  fmt
} from './utils.js';
import { explainConstraintText } from './constraint_explanations.js';

export function buildGraphElements(records) {
  const nodeMap = new Map();
  const edges = [];
  const unaryByNode = new Map();
  const unaryLabelNodes = [];

  for (const r of records) {
    const names = r.activityList.length ? r.activityList : [r.activities];
    names.forEach((name) => {
      if (!nodeMap.has(name)) {
        nodeMap.set(name, {
          data: {
            id: nodeId(name),
            label: name,
            originalName: name,
            isUnaryLabel: 'false',
            hasUnary: 'false',
            u1Color: '#000000', u1Size: 0,
            u2Color: '#000000', u2Size: 0,
            u3Color: '#000000', u3Size: 0,
            u4Color: '#000000', u4Size: 0
          }
        });
      }
    });

    const sourceName = r.activityA || names[0];
    const targetName = r.activityB || names[0];
    if (!sourceName || !targetName) continue;

    if (r.isUnary) {
      const relationKey = normalizeRelationKey(r.rule_type || r.template || 'unary');
      if (!unaryByNode.has(sourceName)) unaryByNode.set(sourceName, new Map());
      const relMap = unaryByNode.get(sourceName);
      relMap.set(relationKey, (relMap.get(relationKey) || 0) + 1);
      continue;
    }

    const edgeId = `edge_${r.rule_id}_${edges.length}`;
    const relationKey = String(r.rule_type || r.template || 'unknown').toLowerCase();
    const baseEdgeColor = edgeColorForRelation(relationKey);
    edges.push({
      data: {
        id: edgeId,
        source: nodeId(sourceName),
        target: nodeId(targetName),
        label: shortTemplateLabel(r.rule_type || r.template),
        template: r.template,
        ruleType: r.rule_type,
        support: r.support,
        confidence: r.confidence,
        category: r.category,
        ruleId: r.rule_id,
        edgeColor: baseEdgeColor,
        edgeSelectedColor: brightenHexColor(baseEdgeColor, 0.22),
        directionUncertain: r.directionUncertain ? 'true' : 'false',
        recordIndex: String(edges.length)
      },
      classes: `binary ${edgeClassByStrength(r.support, r.confidence)}`
    });
  }

  const nodes = [...nodeMap.values()].map((node) => {
    const name = node.data.originalName;

    const unaryMap = unaryByNode.get(name);
    if (!unaryMap || unaryMap.size === 0) return node;

    const sorted = [...unaryMap.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((acc, [, c]) => acc + c, 0);
    const top = sorted.slice(0, 4);

    node.data.hasUnary = 'true';

    sorted.forEach(([rel], idx) => {
      unaryLabelNodes.push({
        data: {
          id: `ulbl_${node.data.id}_${idx}`,
          label: prettifyRel(rel),
          labelColor: edgeColorForRelation(rel),
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
      const [rel, count] = top[i];
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
            'background-color': '#4c5a6d',
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
  if (!selected || selected.empty?.()) {
    state.dom.detailsPanel.innerHTML = `
      <div class="note">Select a node or edge to view plain-language explanation and technical metadata.</div>
      ${detailsLegendHtml(state)}
    `;
    return;
  }

  if (selected.isNode()) {
    const name = selected.data('originalName') || selected.data('label');
    const related = state.filteredRecords.filter((r) => r.activityList.includes(name));
    const unary = related.filter((r) => r.isUnary);
    const binary = related.length - unary.length;

    const unaryCounts = new Map();
    for (const r of unary) {
      const key = normalizeRelationKey(r.rule_type || r.template || 'unary');
      unaryCounts.set(key, (unaryCounts.get(key) || 0) + 1);
    }

    const unaryRows = [...unaryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([rel, count]) => {
        const color = edgeColorForRelation(rel);
        return `<li><span style="color:${color};font-weight:600">${escapeHtml(prettifyRel(rel))}</span>: ${count.toLocaleString()}</li>`;
      })
      .join('');

    state.dom.detailsPanel.innerHTML = `
      <h4>${escapeHtml(name)}</h4>
      <p>${related.length.toLocaleString()} related constraints in current filtered view.</p>
      <p class="helper">Unary: ${unary.length.toLocaleString()} • Binary: ${binary.toLocaleString()}</p>
      ${unaryRows ? `<h5 style="margin:10px 0 6px">Unary relations</h5><ul style="margin:0;padding-left:18px">${unaryRows}</ul>` : ''}
      ${detailsLegendHtml(state)}
    `;
    return;
  }

  if (selected.isEdge()) {
    const ruleId = selected.data('ruleId');
    const record = state.filteredRecords.find((r) => r.rule_id === ruleId);
    if (!record) {
      state.dom.detailsPanel.innerHTML = '<div class="empty">Selected edge metadata is not available.</div>';
      return;
    }

    const explanation = explainConstraint(record);
    const involved = record.activityList.join(' → ') || record.activities;

    state.dom.detailsPanel.innerHTML = `
      <h4>Constraint ${escapeHtml(record.rule_id)}</h4>
      <p><strong>Plain-language explanation:</strong><br>${escapeHtml(explanation)}</p>
      <dl class="kv">
        <dt>Activities</dt><dd>${escapeHtml(involved)}</dd>
        <dt>Rule type</dt><dd>${escapeHtml(record.rule_type)}</dd>
        <dt>Category</dt><dd>${escapeHtml(record.category)}</dd>
        <dt>Support</dt><dd>${fmt(record.support)}</dd>
        <dt>Confidence</dt><dd>${fmt(record.confidence)}</dd>
        <dt>Trace count</dt><dd>${fmt(record.trace_count, true)}</dd>
        <dt>Support count</dt><dd>${fmt(record.support_count, true)}</dd>
        <dt>Violation count</dt><dd>${fmt(record.violation_count, true)}</dd>
        <dt>Activation count</dt><dd>${fmt(record.activation_count, true)}</dd>
        <dt>Fulfillment count</dt><dd>${fmt(record.fulfillment_count, true)}</dd>
        <dt>Activation trace count</dt><dd>${fmt(record.activation_trace_count, true)}</dd>
        <dt>Raw activities</dt><dd>${escapeHtml(record.activities)}</dd>
        <dt>Source file</dt><dd>${escapeHtml(record.source_file)}</dd>
      </dl>
      ${detailsLegendHtml(state)}
    `;
  }
}

export function explainConstraint(record) {
  return explainConstraintText(record);
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

function normalizeRelationKey(text) {
  return String(text || '').trim().toLowerCase();
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
    const key = normalizeRelationKey(r.rule_type || r.template || 'unknown');
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
