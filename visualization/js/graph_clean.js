// Clean Cytoscape graph rendering and layout logic
import {
  edgeColorForRelation,
  brightenHexColor,
  shortTemplateLabel,
  escapeHtml,
  fmt
} from './utils.js';

export function buildGraphElements(records) {
  const nodeMap = new Map();
  const edges = [];
  const connectedByNode = new Map();

  for (const r of records) {
    const names = r.activityList.length ? r.activityList : [r.activities];
    names.forEach((name) => {
      if (!nodeMap.has(name)) {
        nodeMap.set(name, {
          data: {
            id: nodeId(name),
            label: name,
            originalName: name,
            degreeHint: 0
          }
        });
      }
    });

    const sourceName = r.activityA || names[0];
    const targetName = r.activityB || names[0];
    if (!sourceName || !targetName) continue;

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
      classes: `${r.isUnary ? 'unary' : 'binary'} ${edgeClassByStrength(r.support, r.confidence)}`
    });

    if (!connectedByNode.has(sourceName)) connectedByNode.set(sourceName, 0);
    if (!connectedByNode.has(targetName)) connectedByNode.set(targetName, 0);
    connectedByNode.set(sourceName, connectedByNode.get(sourceName) + 1);
    connectedByNode.set(targetName, connectedByNode.get(targetName) + (sourceName === targetName ? 0 : 1));
  }

  const nodes = [...nodeMap.values()].map((node) => {
    const originalName = node.data.originalName;
    node.data.degreeHint = connectedByNode.get(originalName) || 0;
    return node;
  });

  return { nodes, edges };
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
  const elements = [...nodes, ...edges];

  if (!state.cy) {
    state.cy = cytoscape({
      container: state.dom.cyContainer,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#4c5a6d',
            label: 'data(label)',
            'font-size': 10,
            'text-wrap': 'ellipsis',
            'text-max-width': 120,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 8,
            color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
            width: 'mapData(degreeHint, 0, 24, 18, 36)',
            height: 'mapData(degreeHint, 0, 24, 18, 36)',
            'border-width': 1,
            'border-color': '#ffffff'
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
            'text-background-color': getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
            'text-background-opacity': 0.82,
            'text-background-padding': 2,
            'text-wrap': 'none',
            color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
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
          selector: 'edge.unary',
          style: {
            'loop-direction': '-30deg',
            'loop-sweep': '35deg'
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
          selector: 'node:selected',
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

    state.cy.on('select', 'node, edge', (event) => {
      state.selectedElement = event.target;
      state.renderDetails();
    });

    state.cy.on('unselect', 'node, edge', () => {
      const selected = state.cy.$(':selected').first();
      state.selectedElement = selected.nonempty() ? selected : null;
      state.renderDetails();
    });
  } else {
    state.cy.elements().remove();
    state.cy.add(elements);
    runLayout(state, state.dom.layoutSelect.value);
  }
}

export function runLayout(state, layoutName = 'cose') {
  if (!state.cy) return;
  const layout = state.cy.layout(layoutOptions(layoutName));
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
      <p class="helper">Dashed edges indicate a relation where direction is uncertain or symmetric based on available metadata.</p>
    `;
    return;
  }

  if (selected.isNode()) {
    const name = selected.data('originalName') || selected.data('label');
    const related = state.filteredRecords.filter((r) => r.activityList.includes(name));
    state.dom.detailsPanel.innerHTML = `
      <h4>${escapeHtml(name)}</h4>
      <p>${related.length.toLocaleString()} connected constraints in current filtered view.</p>
      <p class="helper">Tip: add activity search text to focus on this activity across all templates.</p>
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
    `;
  }
}

export function explainConstraint(record) {
  const [a, b] = [record.activityA, record.activityB];
  const t = String(record.template || '').toLowerCase();

  const map = {
    existence: () => `${a || 'This activity'} is expected to appear in a case.`,
    absence: () => `${a || 'This activity'} tends not to appear in a case.`,
    init: () => `${a || 'This activity'} is often observed at the start of a case.`,
    end: () => `${a || 'This activity'} is often observed at the end of a case.`,
    exactly: () => `${a || 'This activity'} is expected to occur an exact number of times (see cardinality if available).`,
    responded_existence: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} usually appears somewhere as well.`,
    response: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} usually follows later.`,
    precedence: () => `${b || 'Activity B'} usually appears only if ${a || 'activity A'} happened before it.`,
    chain_response: () => `After ${a || 'activity A'}, ${b || 'activity B'} is expected next.`,
    chain_precedence: () => `${b || 'Activity B'} is expected to be directly preceded by ${a || 'activity A'}.`,
    choice: () => `${a || 'Activity A'} and ${b || 'activity B'} are connected as an either/or choice pattern.`,
    exclusive_choice: () => `${a || 'Activity A'} and ${b || 'activity B'} tend to occur as alternatives, not together.`,
    coexistence: () => `${a || 'Activity A'} and ${b || 'activity B'} tend to occur together.`,
    not_coexistence: () => `${a || 'Activity A'} and ${b || 'activity B'} usually do not occur together.`,
    not_response: () => `After ${a || 'activity A'}, ${b || 'activity B'} is usually not expected to follow.`,
    not_precedence: () => `${b || 'Activity B'} usually occurs without prior ${a || 'activity A'}.`,
    not_responded_existence: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} is often absent in the same case.`
  };

  if (map[t]) return map[t]();
  return `TODO: This rule connects the listed activities under template ${record.template}. Add explanation here.`;
}

export function renderNoSourceState(state) {
  state.showStatus('No built-in sources discovered.');
  renderGraph(state, [], []);
  state.renderGraphMessage('No built-in constraint CSV files were found. Add *_constraints.csv files under output/, update visualization/csv-sources.json, or upload a file.');
  state.dom.detailsPanel.innerHTML = '<div class="empty">No source selected yet.</div>';
}

export function renderErrorState(state, message) {
  state.showStatus('Error state');
  renderGraph(state, [], []);
  state.renderGraphMessage(message, true);
  state.dom.detailsPanel.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function nodeId(activityName) {
  return `node_${activityName}`;
}
