# Diploma Thesis

Activity log analysis and preprocessing pipeline for behavioral process mining.

## Local researcher application

The [local preparation and mining app](mining_app/README.md) adds guided CSV
mapping, configurable cases, separate activity/category
mining of separately prepared populations, reusable profiles, and connected graph
exploration. Launch with `python -m mining_app.server` after installing
`requirements.txt` in a local Python 3.11 environment; open
<http://127.0.0.1:8765>. Data and jobs remain in ignored `.mining-local`.
The legacy tools below remain available.

**Prepare & mine / Visualize** is a compact top switcher between full-page
screens. Enter a mined CSV filename, mine, and either download the file on the
mining screen or switch to its automatically loaded graph. The visualization is
not nested inside the preparation page.

## Project Structure

This project consists of three sequential components, each with detailed documentation in their respective folders:

### 1. [Anonymized Data Analysis](initial_analysis/README.md) – `initial_analysis/`

**What it does:**
Analyzes patterns of missing/anonymized data in the raw logs. Detects streaks of consecutive anonymized rows, calculates dataset statistics, and provides impact assessment for downstream analysis.

**Key analyses:**
- Anonymized data percentage and temporal coverage
- Streak detection and duration distribution
- Dataset completeness assessment
- Cost/benefit of data omission strategies

**Entry point:** `python -m initial_analysis.run_analysis_pipeline`

---

### 2. [Data Preprocessing Pipeline](preprocessing/README.md) – `preprocessing/`

**What it does:**
Comprehensive data transformation and normalization. Removes anonymized rows, merges consecutive events, parses timestamps, combines activity labels, detects behavioral day boundaries via intelligent gap analysis, generates case IDs for process mining, and outputs clean, segmented data.

**Key transformations:**
- Datetime parsing and normalization
- **Anonymized data removal** (filters out unknown/redacted URLs)
- **Consecutive event merging** (merge events <1 min apart with same activity)
- Activity label unification (app + URL → single label)
- Behavioral day segmentation (three-phase gap detection)
- Case ID generation for each behavioral day
- Column filtering and schema normalization

**Entry point:** `python -m preprocessing.main`

---

### 3. [Visualization & Analysis Scripts](scripts/README.md) – `scripts/`

**What they do:**
Validate preprocessing results and explore preprocessed data through visualizations and aggregations.

**Available tools:**
- **`plot_user_activity.py`**: Timeline visualization with 3 layout modes (timeline, event-index, case-id)
  - Recommended: Use `case-id` layout to visually confirm day-splitting correctness
- **`activity_per_day.py`**: Per-behavioral-day aggregation with activity duration and temporal bounds
  - Recommended: Spot-check day boundaries and identify anomalies

---

### 4. Process Mining Pipelines – `declare4py_pipeline.py` & `discover_pipeline.py`

Both pipelines discover **DECLARE constraints** — declarative rules that describe temporal and co-occurrence relationships between activities — from the preprocessed activity logs.  They differ in the underlying algorithm and produce the same unified output format so results can be compared directly.

Both are implemented as classes that share common CSV loading, column-renaming, and result-saving logic via the `shared/pipeline_base.py` `BasePipeline` class.

---

#### 4a. Declare4Py Pipeline (`declare4py_pipeline.py`)

**Algorithm:** DeclareMiner (Declare4Py library)

**How it works:**
1. Loads the CSV and converts it to a pm4py EventLog.
2. Exports the log to XES format (required by Declare4Py).
3. Runs `DeclareMiner` — a constraint-enumeration miner that checks all activity pairs against all DECLARE templates using an Apriori-style itemset approach.
4. Recomputes support and confidence metrics from the original log (more accurate than the miner's internal estimates).
5. Saves the raw `.decl` model and the unified JSON + CSV output.

**When to use:**
- When you need the raw `.decl` model file for use in other Declare4Py tools.
- When fine-grained control over `itemsets_support` is needed (separate from per-constraint support).
- For smaller logs where the Apriori enumeration overhead is acceptable.

**Key parameters:**
- `--min-support` — minimum support for DeclareMiner (proportion of traces; 0.0 = no filter)
- `--itemsets-support` — minimum itemsets support for the Apriori step
- `--max-cardinality` — maximum cardinality for unary templates (Existence/Absence/Exactly)

**Output files** (stem taken from input CSV):
- `{stem}.xes` — intermediate XES log
- `{stem}_declare_model.decl` — raw DECLARE model
- `{stem}_declare4py_constraints.json` / `.csv` — unified rules

---

#### 4b. DisCoveR Pipeline (`discover_pipeline.py`)

**Algorithm:** DisCoveR (`pm4py.discover_declare`)

**Reference:** C. O. Back et al., *"DisCoveR: accurate and efficient discovery of declarative process models"*, STTT 2022, 24:563–587.

**How it works:**
1. Loads the CSV (column renaming handled by `BasePipeline`).
2. Runs `pm4py.discover_declare()`, which evaluates all DECLARE templates in a single efficient pass using automata-based conformance checking.
3. Converts pm4py's raw activation/fulfillment counts to support and confidence ratios.
4. Saves unified JSON + CSV output.

**When to use:**
- For large datasets: DisCoveR is significantly faster than DeclareMiner on high-activity logs.
- When a `.decl` model file is not needed and only the unified constraint output matters.
- As a faster cross-validation of Declare4Py results.

**Key parameters:**
- `--min-support` — minimum support ratio (0.0 = no filter)
- `--min-confidence` — minimum confidence ratio (0.0 = no filter)

**Output files** (stem taken from input CSV):
- `{stem}_dcr_constraints.json` / `.csv` — unified rules

---

**Key metrics (both pipelines):**
- **Support**: Fraction of traces in which the constraint holds (0–1; higher = more frequent).
- **Confidence**: Conditional probability that the constraint is fulfilled given it is activated (0–1; higher = more consistent).
- **Cardinality**: For Existence/Absence/Exactly templates — the numeric bound (e.g. `Existence2` requires the activity to occur at least twice).

**Output format:**
Both pipelines write JSON + CSV in a unified schema with support, confidence, cardinality, category, and auxiliary counts for filtering and visualisation.  See [UNIFIED_OUTPUT_FORMAT.md](UNIFIED_OUTPUT_FORMAT.md) for full field definitions.

**Recent pipeline updates (April 2026):**
- Unified schema now uses only `rule_type` (canonical `UPPERCASE_SNAKE_CASE`).
- Legacy `template` and `metrics_source` fields were removed from outputs and visualization parsing.
- Symmetric binary templates are deduplicated by normalized activity order (e.g., `CHOICE(A,B)` = `CHOICE(B,A)`).
- Deduplication now includes cardinality in the key, so unary constraints with different bounds are preserved (e.g., `EXISTENCE(A,1)` vs `EXISTENCE(A,2)`).
- Missing `NOT_CHAIN_*` metric handlers were implemented; uncomputed constraints are no longer expected in normal runs.
- `--top-activities` pre-filtering was removed from both pipelines to avoid semantic distortion of temporal constraints.

**Entry points:**
```bash
# Declare4Py pipeline
python declare4py_pipeline.py \
  --csv data/preprocessed.csv \
  --out-dir output \
  --min-support 0.4 \
  --itemsets-support 0.8 \
  --max-cardinality 2

# DisCoveR pipeline
python discover_pipeline.py \
  --csv data/preprocessed.csv \
  --out-dir output \
  --min-support 0.4 \
  --min-confidence 0.8
```

---

### 5. Constraint Visualization Dashboard – `visualization/`

Interactive web dashboard for exploring discovered constraints as a graph with filters (source, template family/category, activity search, and numeric thresholds such as support/confidence).

**What it includes (quick view):**
- Constraint graph rendering (Cytoscape)
- Dynamic filtering and active filter chips
- Details side panel for selected nodes/edges
- Built-in CSV discovery + custom CSV upload
- Light/dark theme and responsive layout

**Open locally:**
```bash
# run from project root
python -m http.server 8000
# then open:
# http://localhost:8000/visualization/constraint-visualization.html
```

Full documentation: [visualization/README.md](visualization/README.md)

---

## Data Processing Workflow

```
Raw Activity Logs
    ↓
[1. Anonymized Data Analysis]
    ├─ Assess data quality
    ├─ Quantify missing data impact
    └─ Decide on omission strategy
    ↓
[2. Data Preprocessing Pipeline]
    ├─ Parse & normalize timestamps
    ├─ Merge consecutive events
    ├─ Standardize activity labels
    ├─ Segment into behavioral days
    ├─ Generate case IDs
    └─ Output clean data
    ↓
[3. Visualization & Validation]
    ├─ Visually inspect day boundaries
    ├─ Aggregate by behavioral day
    └─ Spot-check segmentation quality
    ↓
[4. Process Mining Analysis]
    ├─ Declare4Py: Discover DECLARE constraints (DeclareMiner)
    ├─ DisCoveR: Discover DECLARE constraints (pm4py automata)
    └─ Extract metrics: support, confidence, cardinality
    ↓
[5. Analysis & Visualization]
    └─ Filter, compare, and visualize discovered rules
```

---

## Quick Start

### 1. Assess data quality

```bash
python -m initial_analysis.run_analysis_pipeline "data/raw_input.csv"
# Output: output/analysis/anon_stats.txt, anon_streaks.csv
```

### 2. Preprocess into behavioral days

```bash
python -m preprocessing.main \
  --raw_csv "data/raw_input.csv" \
  --out_csv "data/preprocessed.csv"
# Output: data/preprocessed.csv (clean, segmented)
```

### 3. Validate and explore

```bash
# Visual validation (recommended for day-splitting verification)
python scripts/plot_user_activity.py \
  --in data/preprocessed.csv \
  --layout case-id \
  --out output/plots/validation.png

# Activity summary by behavioral day
python scripts/activity_per_day.py \
  --in data/preprocessed.csv \
  --out output/activity_per_day.txt
```

---

## Documentation Structure

- **Main README (this file):** High-level overview and workflow
- **`initial_analysis/README.md`:** Detailed documentation on anonymized data analysis
- **`preprocessing/README.md`:** Complete preprocessing pipeline and transformation details
- **`scripts/README.md`:** Visualization and analysis script usage

---

## Key Configuration

All behavioral day parameters are customizable in `preprocessing/constants.py`:

```python
# Time windows for gap detection
WAKING_WINDOW_START = 4        # 4am
WAKING_WINDOW_END = 12         # noon
NIGHT_WINDOW_START = 20        # 8pm
NIGHT_WINDOW_END = 4           # 4am next day
LATE_SLEEP_START = 3           # 3am
LATE_SLEEP_END = 10            # 10am

MIN_INACTIVITY_GAP_HOURS = 4   # Minimum gap to trigger day split
```

Adjust for different user types or behavioral patterns.

---

## Output Directories

- `output/analysis/` — Anonymized data analysis results (stats, streaks CSV)
- `output/users/` — Per-user extracts from preprocessed data
- `output/plots/` — Generated visualizations (PNG images)
- `data/` — Preprocessed CSV files and intermediate outputs

---

## Glossary: Process Mining & DECLARE Templates

### Core Concepts

**Rule**
A discovered behavioral pattern or constraint describing relationships between activities. All rules include metrics (support, confidence) that quantify their reliability and frequency.

**Template**
The type or class of a rule. Templates specify what kind of constraint or relationship is represented (e.g., "Response", "Condition", "Existence1").

**Case**
A sequence of activities representing one behavioral instance (in this project: one behavioral day per user). Process mining discovers patterns across multiple cases.

**Support**
The proportion of cases where a rule appears. Ranges 0.0 (never) to 1.0 (always).
- *Example*: Support 0.85 means the rule appears in 85% of behavioral days
- Higher support = more frequent/common pattern

**Confidence**
The reliability or conditional probability of a rule. Ranges 0.0 (unreliable) to 1.0 (always holds).
- *Example*: Confidence 0.9 means when the rule's condition is met, it follows through 90% of the time
- Higher confidence = more consistent/predictable behavior

**Cardinality**
The exact number of times an activity must or must not occur in a case. Only used in DECLARE Existence/Absence/Exactly templates.
- *Example*: Cardinality 2 for Existence2 means "activity must occur at least 2 times"

---

### DECLARE Templates (from Declare4Py)

DECLARE uses **declarative constraints** to describe what happens in a process. These are constraints on unary (single activity) or binary (two activities) relations.

#### Unary (Single Activity) Templates

**Existence1[A]**
- Meaning: Activity A must occur at least once in the case
- Interpretation: "Activity A happens at least once"
- Example: `Existence1[browser/youtube]` = YouTube is visited in every behavioral day

**Existence2[A]**
- Meaning: Activity A must occur at least twice in the case
- Interpretation: "Activity A happens at least two times"
- Example: `Existence2[browser/netflix]` = Netflix is visited multiple times per day

**Absence1[A]**
- Meaning: Activity A occurs at most zero times (never occurs)
- Interpretation: "Activity A should never happen"
- Example: `Absence1[browser/anonymized]` = Anonymized sites are never visited

**Absence2[A]**
- Meaning: Activity A occurs at most once
- Interpretation: "Activity A happens at most once"
- Example: `Absence2[browser/specific-app]` = This app opens at most once

**Exactly1[A]**
- Meaning: Activity A occurs exactly one time
- Interpretation: "Activity A happens exactly once"
- Example: `Exactly1[app/email]` = Email is checked exactly once per day

**Exactly2[A]**
- Meaning: Activity A occurs exactly twice
- Interpretation: "Activity A happens exactly twice"

**Init[A]**
- Meaning: Activity A must be the first activity in the case
- Interpretation: "The day always starts with activity A"
- Example: `Init[browser/email]` = Email is always the first activity checked

**End[A]**
- Meaning: Activity A must be the last activity in the case
- Interpretation: "The day always ends with activity A"
- Example: `End[browser/youtube]` = YouTube is always the last activity

#### Binary (Two Activities) Templates

**Response[A,B]**
- Meaning: Whenever A occurs, B must eventually occur after it
- Interpretation: "A is followed by B"
- Example: `Response[browser/facebook,browser/instagram]` = After visiting Facebook, Instagram is visited
- **Note**: B can occur multiple times, including overlapping or interleaved with other activities

**Precedence[A,B]**
- Meaning: B can only occur after A has occurred at least once
- Interpretation: "B never happens before A"
- Example: `Precedence[browser/login,browser/app]` = App access only after login

**Succession[A,B]**
- Meaning: Both Response[A,B] and Precedence[A,B] hold together
- Interpretation: "A must come before B, and B must follow A"
- Example: `Succession[phone/lock,phone/unlock]` = Lock always precedes and is followed by unlock

**Alternate Response[A,B]**
- Meaning: Whenever A occurs, B must occur immediately after (next activity)
- Interpretation: "A is directly followed by B"
- Example: `AlternateResponse[lunch,walk]` = Lunch is always immediately followed by a walk

**Alternate Precedence[A,B]**
- Meaning: B can only occur immediately after A
- Interpretation: "B's only predecessor is A"

**Chain Response[A,B]**
- Meaning: Whenever A occurs without other activities in between, B must immediately follow
- Interpretation: "B directly follows A"

**Not Responded Existence[A,B]**
- Meaning: If A occurs, then B must not occur afterward
- Interpretation: "A rules out B"
- Example: `NotRespondedExistence[focus_mode,notifications]` = Enabling focus prevents notifications

**Not Precedence[A,B]**
- Meaning: If B occurs, then A must not occur at any point before
- Interpretation: "B cannot happen after A"

---

### Algorithm Comparison

| | Declare4Py (DeclareMiner) | DisCoveR (pm4py) |
|---|---|---|
| **Discovery method** | Apriori itemset enumeration | Automata-based conformance checking |
| **Runtime (large logs)** | Slower — itemset step is exhaustive | Faster — single-pass automata evaluation |
| **Extra output** | `.decl` model file | None |
| **Activity scaling** | O(n²) binary pairs | O(n²) binary pairs |
| **Metric source** | Recomputed from log | Direct activation/fulfillment counts |
| **Best for** | Compatibility with Declare4Py tools | Large datasets, fast exploration |

---

### Interpretation Guide: When to Use Which

| Question | Template | Example |
|----------|----------|---------|
| Does activity X always happen? | Existence1[X] | `Existence1[email_check]` = Email is checked daily |
| Does X happen multiple times? | Existence2[X] | `Existence2[break]` = Multiple breaks per day |
| Should X never happen? | Absence1[X] | `Absence1[blocked_site]` = Blocked sites never visited |
| After A, does B always follow? | Response[A,B] | `Response[work,lunch]` = Work is followed by lunch |
| Does B depend on A first? | Precedence[A,B] | `Precedence[login,access_data]` = Data access needs login first |
| Are A and B incompatible? | NotCoExistence[A,B] | `NotCoExistence[gaming,work]` = Can't game while working |
| Does A directly precede B? | AlternateResponse[A,B] | `AlternateResponse[coffee,meeting]` = Coffee right before meeting |

---
