# Diploma Thesis

Activity log analysis and preprocessing pipeline for behavioral process mining.

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
Ready for Process Mining Analysis
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
