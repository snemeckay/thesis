/**
 * Tooltip Manager
 * 
 * Centralized tooltips and explanations for UI elements
 * Used throughout the visualization to help non-experts understand the interface
 */

/**
 * Tooltip definitions for various UI elements and fields
 */
export const TOOLTIPS = {
  // Visualization modes
  vizModeSingle: "View constraints from a single source at a time",
  vizModeCompare: "Compare two models beside each other, stacked on smaller screens",
  vizModeMerged: "See one combined view showing common constraints and differences",
  
  // Data source
  dataSource: "The tool or pipeline that generated the constraints",
  uploadCustomCSV: "Load your own constraint data from a CSV file",
  
  // Activity search
  activitySearch: "Complete activity names match exactly; partial names use substring matching. Both comparison models use the same matching rule.",
  
  // Filters
  filterMetrics: "Shows how many constraints are currently visible based on your filters",
  activeFilters: "Currently applied filters. Click the X to remove a filter.",
  
  // Constraint fields
  support: `How often the constraint is satisfied. 
For example, 0.95 means the constraint is satisfied in 95% of cases.`,
  
  confidence: `How reliable the constraint pattern is.
Based on the number of times the constraint was fulfilled versus how many times it could have been tested.`,
  
  cardinality: `Occurrence bound for a unary rule.
Existence requires at least this many occurrences; Absence requires fewer.`,
  
  category: `Semantic grouping of the constraint.
Helps understand whether it involves one activity, two activities, or more.`,
  
  ruleType: `The pattern type of the constraint.
Examples: Precedence (A before B), Response (A then B), Existence (A must occur), etc.`,
  
  activationCount: `Total number of times the constraint could potentially be activated.
Higher numbers mean more opportunity to observe the pattern.`,
  
  fulfillmentCount: `Number of times the constraint was actually satisfied when activated.`,
  
  violationCount: `Number of times the constraint was violated or not satisfied.`,
  
  supportCount: `Number of cases (execution traces) where the constraint is satisfied.`,
  
  // Graph controls
  layoutSelect: `Choose how to arrange the graph:
• cose: Spring-like layout (usually best for most data)
• concentric: Circular layout
• breadthfirst: Tree-like layout
• grid: Regular grid pattern`,
  
  relayout: "Re-arrange the graph with a new random layout. Useful if edges are overlapping.",
  fitGraph: "Zoom and pan to show the entire graph",
  zoomIn: "Zoom in to see details",
  zoomOut: "Zoom out to see the big picture",
  resetSelection: "Clear any selected nodes/edges",
  exportPNG: "Save the current graph as an image file",
  downloadCSV: "Download the currently visible constraints as a CSV file",
  
  // Details panel
  detailsPanel: `Shows detailed information about selected nodes (activities) and edges (constraints).
Click on any activity or constraint in the graph to see its details.`,
  
  graphNodes: `Each circle represents an activity (a step in the process).
Hover to see the activity name, or click to view associated constraints.`,
  
  graphEdges: `Each line represents a constraint between two activities.
Solid lines = stronger/more certain constraints
Dashed lines = weaker or symmetric relationships`,
  
  // Common concepts
  case: `A single instance or execution of a process.
For example, one customer's order journey from start to finish.`,
  
  trace: `A record of all activities that occurred in a single case.`,
  
  activity: `A single step or task in a process.
For example: 'Submit Order', 'Process Payment', 'Ship Item', etc.`,
  
  constraint: `A rule describing a relationship or pattern between activities.
Examples: 'Activity A must occur', 'Activity B must follow Activity A', etc.`
};

/**
 * Create a tooltip element for an HTML element
 * @param {HTMLElement} element - The element to attach the tooltip to
 * @param {string} text - The tooltip text
 * @param {Object} options - Configuration options
 */
export function attachTooltip(element, text, options = {}) {
  if (!element || !text) return;
  
  const placement = options.placement || 'top';
  const delay = options.delay || 200;
  
  element.title = text;
  element.setAttribute('data-tooltip', text);
  element.setAttribute('aria-label', text);
  element.setAttribute('role', 'tooltip');
  element.classList.add('has-tooltip');
  
  // Optional: Create a visual indicator that a tooltip exists
  if (options.showIcon !== false) {
    const indicator = document.createElement('abbr');
    indicator.style.cssText = 'cursor: help; border-bottom: 1px dotted currentColor; margin-left: 0.25rem;';
    indicator.textContent = '?';
    indicator.title = text;
    element.appendChild(indicator);
  }
}

/**
 * Create an info icon that shows a tooltip
 * @param {string} text - The tooltip text
 * @returns {HTMLElement} - The created element
 */
export function createTooltipIcon(text, tooltipText = null) {
  const icon = document.createElement('span');
  icon.innerHTML = 'ⓘ';
  icon.className = 'tooltip-icon';
  icon.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 50%;
    background: var(--accent-soft, rgba(15, 118, 110, 0.15));
    color: var(--accent, #0f766e);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: help;
    margin-left: 0.3rem;
    flex-shrink: 0;
  `;
  
  if (text || tooltipText) {
    icon.title = tooltipText || text;
    icon.setAttribute('aria-label', tooltipText || text);
  }
  
  return icon;
}

/**
 * Add tooltip to a field label
 * @param {HTMLElement} labelElement - The label element
 * @param {string} fieldName - The field name (to look up in TOOLTIPS)
 */
export function addFieldTooltip(labelElement, fieldName) {
  const tooltipText = TOOLTIPS[fieldName];
  if (!tooltipText) return;
  
  const icon = createTooltipIcon(fieldName, tooltipText);
  labelElement.appendChild(icon);
  labelElement.title = tooltipText;
}

/**
 * Get tooltip text for a field
 * @param {string} fieldName - The field name
 * @returns {string|null} - The tooltip text or null if not found
 */
export function getFieldTooltip(fieldName) {
  return TOOLTIPS[fieldName] || null;
}

/**
 * Initialize global tooltip behavior
 */
export function initializeTooltips() {
  // Add hover event listeners for better UX with tooltips
  document.addEventListener('mouseover', (e) => {
    const element = e.target;
    if (element.classList && element.classList.contains('has-tooltip')) {
      element.style.cursor = 'help';
    }
  }, true);
  
  // Optional: Add support for showing/hiding tooltip text on small screens
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    document.documentElement.style.setProperty('--tooltip-visible', 'visible');
  }
}

/**
 * Create an info modal button
 * @param {string} title - Modal title
 * @param {string} content - Modal content (can be HTML)
 * @returns {HTMLElement} - A button that opens the modal
 */
export function createInfoModalButton(title, content) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-info-modal';
  button.innerHTML = '?';
  button.title = `Learn more: ${title}`;
  button.setAttribute('aria-label', `Learn more: ${title}`);
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showInfoModal(title, content);
  });
  
  return button;
}

/**
 * Show an information modal
 * @param {string} title - Modal title
 * @param {string} content - Modal content (can be HTML)
 */
export function showInfoModal(title, content) {
  // Check if modal already exists
  let modal = document.getElementById('infoModal');
  if (!modal) {
    modal = createInfoModal();
    document.body.appendChild(modal);
  }
  
  const titleEl = modal.querySelector('.modal-title');
  const bodyEl = modal.querySelector('.modal-body');
  
  titleEl.textContent = title;
  if (typeof content === 'string' && content.includes('<')) {
    bodyEl.innerHTML = content;
  } else {
    bodyEl.textContent = content;
  }
  
  modal.style.display = 'flex';
  modal.classList.add('active');
  modal.querySelector('.modal-close').focus();
}

/**
 * Create the info modal DOM structure
 */
function createInfoModal() {
  const modal = document.createElement('div');
  modal.id = 'infoModal';
  modal.className = 'info-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'modalTitle');
  modal.setAttribute('aria-modal', 'true');
  
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="modalTitle" class="modal-title"></h2>
        <button type="button" class="modal-close" aria-label="Close modal">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer">
        <button type="button" class="btn-modal-close">Close</button>
      </div>
    </div>
  `;
  
  const closeBtn = modal.querySelector('.modal-close');
  const closeFooterBtn = modal.querySelector('.btn-modal-close');
  const overlay = modal.querySelector('.modal-overlay');
  
  const closeModal = () => {
    modal.style.display = 'none';
    modal.classList.remove('active');
  };
  
  closeBtn.addEventListener('click', closeModal);
  closeFooterBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  
  // Close on Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  
  return modal;
}

/**
 * Hide the info modal
 */
export function hideInfoModal() {
  const modal = document.getElementById('infoModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}
