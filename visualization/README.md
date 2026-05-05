# Constraint Visualization Dashboard

Interactive web dashboard for inspecting discovered declarative constraints from CSV exports.

## Purpose

The dashboard helps you:
- explore relations between activities as a graph,
- filter constraints by categorical and numeric metadata,
- inspect rule details in plain language,
- compare built-in outputs and uploaded CSV files quickly.

## Entry Point

Main page:
- [visualization/constraint-visualization.html](constraint-visualization.html)

This page is now the modular entry shell that loads:
- [visualization/styles/main.css](styles/main.css)
- [visualization/js/app.js](js/app.js)
- [visualization/js/data.js](js/data.js)
- [visualization/js/filters.js](js/filters.js)
- [visualization/js/graph_unary.js](js/graph_unary.js)
- [visualization/js/ui.js](js/ui.js)
- [visualization/js/utils.js](js/utils.js)

Alternative/legacy graph modules kept in repo:
- [visualization/js/graph_clean.js](js/graph_clean.js)
- [visualization/js/graph.js](js/graph.js)

## Run Locally

Important: start the server from the **project root** so built-in paths to `output/` resolve correctly.

```bash
cd <project-root>
python -m http.server 8000
```

Open:
- `http://localhost:8000/visualization/constraint-visualization.html`

## Data Sources

Built-in source discovery:
- [visualization/csv-sources.json](csv-sources.json)
- default fallback paths in `app`/`data` module point to:
  - `output/preprocessed_declare4py_constraints.csv`
  - `output/preprocessed_dcr_constraints.csv`

Custom sources:
- Upload any compatible CSV from the UI.

## Expected Schema (minimum)

Required columns:
- `rule_id`
- `rule_type`
- `activities`

Notes:
- `rule_type` is the only template identifier used by the dashboard.
- Legacy columns `template` and `metrics_source` are no longer required or consumed.
- `rule_type` values are expected in canonical uppercase snake case (e.g., `CHAIN_RESPONSE`).

Additional columns (optional but recommended) are parsed when present:
- `support`, `confidence`, `category`, `source`, counts, etc.

## Features

- Source selector + upload
- Source quick-toggle buttons
- Activity text search
- Categorical filters (`source`, `rule_type`, `category`)
- Numeric range filters (`support`, `confidence`, counts)
- Active filter chips with one-click clear
- Graph layout switching (`cose`, `concentric`, `breadthfirst`, `grid`)
- Node/edge detail panel
- Theme toggle (light/dark)
- Collapsible filters/details panels

## Module Overview

- [visualization/js/app.js](js/app.js): app state, startup orchestration, event wiring
- [visualization/js/data.js](js/data.js): manifest loading, CSV fetching/parsing, record normalization
- [visualization/js/filters.js](js/filters.js): filter state init, UI rendering, filtering logic
- [visualization/js/graph_unary.js](js/graph_unary.js): active graph renderer (unary-aware), Cytoscape rendering, details text, legends
- [visualization/js/graph_clean.js](js/graph_clean.js): simpler fallback graph renderer
- [visualization/js/graph.js](js/graph.js): legacy/original graph renderer
- [visualization/js/ui.js](js/ui.js): DOM cache, theme/panel controls, status/empty/error messages
- [visualization/js/utils.js](js/utils.js): constants and helper utilities

## What Includes What (Detailed)

### HTML includes

- [visualization/constraint-visualization.html](constraint-visualization.html) includes:
  - stylesheet: [visualization/styles/main.css](styles/main.css)
  - external scripts (CDN):
    - PapaParse
    - Cytoscape
    - Lucide
  - module entry script:
    - [visualization/js/app.js](js/app.js)

### JavaScript import graph

- [visualization/js/app.js](js/app.js) imports:
  - [visualization/js/ui.js](js/ui.js)
  - [visualization/js/utils.js](js/utils.js)
  - [visualization/js/data.js](js/data.js)
  - [visualization/js/filters.js](js/filters.js)
  - [visualization/js/graph_unary.js](js/graph_unary.js)

- [visualization/js/data.js](js/data.js) imports:
  - [visualization/js/utils.js](js/utils.js)

- [visualization/js/filters.js](js/filters.js) imports:
  - [visualization/js/utils.js](js/utils.js)
  - [visualization/js/ui.js](js/ui.js)

- [visualization/js/graph_unary.js](js/graph_unary.js) imports:
  - [visualization/js/utils.js](js/utils.js)

- [visualization/js/graph_clean.js](js/graph_clean.js) imports:
  - [visualization/js/utils.js](js/utils.js)

- [visualization/js/graph.js](js/graph.js) imports:
  - [visualization/js/utils.js](js/utils.js)

- [visualization/js/ui.js](js/ui.js) imports:
  - [visualization/js/utils.js](js/utils.js)

### Runtime flow (high level)

1. Browser loads [visualization/constraint-visualization.html](constraint-visualization.html)
2. HTML loads CSS + CDN libs + [visualization/js/app.js](js/app.js)
3. `app` initializes state and wires events
4. `data` discovers/loads CSV rows
5. `filters` computes and applies active filters
6. `graph` renders Cytoscape elements
7. `ui` updates theme/panels/messages

## Troubleshooting

### Blank or no data loaded
- Ensure the server is started from project root.
- Confirm CSV files exist in `output/`.
- Confirm [visualization/csv-sources.json](csv-sources.json) paths are valid.

### Upload works but built-in files fail
- Usually caused by running server in `visualization/` instead of project root.

### Icons not rendering
- Lucide is loaded via CDN. If blocked/offline, icons may be missing but core app still runs.

## Notes

- CDN dependencies used by page:
  - PapaParse
  - Cytoscape
  - Lucide
