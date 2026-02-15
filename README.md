# Diploma Thesis

## Anonymized Data Analysis Pipeline

Decision support tool for dataset assesment aimed at whether we can omit rows with anonymized URLs (url3).

### Purpose

This pipeline quantifies the impact of removing rows with anonymized/unknown URLs (where `url3` is redacted using anonymized). It helps answer:

1. **What is the cost of omission?** - How much data would we lose (% of rows, duration coverage)?
2. **Is the remaining data workable?** - After omitting anonymized rows, do we have enough data for process mining?
3. **What are the patterns in anonymized data?** - How are these rows distributed? Do they cluster?

### Overview

The pipeline identifies consecutive sequences of rows with anonymized URLs ("streaks") and analyzes their impact on dataset completeness. A streak is defined as consecutive rows where `url3` is unknown, split when gaps exceed 1 hour (indicating distinct activity sessions).

### Architecture

The pipeline is organized into modular components in `initial_analysis/`:

- **`streak_detector.py`** - Core streak detection logic
  - `Streak` dataclass: Represents a single streak with start/end row indices, count, timestamps, and duration
  - `StreakDetector` class: Processes CSV rows sequentially and detects streaks with gap-based splitting (> 1 hour = new streak)

- **`data_stats.py`** - Dataset-level statistics tracking
  - `DataStats` class: Tracks total rows, duration, browser activity, anonymized (url3) data counts
  - Formats statistics for readable output

- **`analyze_anon_data.py`** - Main anonymized data analyzer
  - Reads CSV file and detects anonymized URL streaks using `StreakDetector`
  - Calculates dataset statistics using `DataStats`
  - Outputs formatted report with dataset analysis and streak CSV

- **`streak_statistics.py`** - Streak-specific analysis
  - `StreakStatistics` class: Analyzes detected streaks from CSV
  - Methods: `get_duration_stats()`, `get_duration_categories()`, `get_streak_length_distribution()`, `get_streak_characteristics()`

- **`analyze_streaks.py`** - Streak analysis entry point
  - Loads streaks CSV and delegates to `StreakStatistics` for detailed analysis
  - Combines basic stats with comprehensive streak breakdowns

- **`run_analysis_pipeline.py`** - Full pipeline orchestrator
  - Runs `analyze_anon_data` and `analyze_streaks` in sequence
  - Combines both analyses into single output file
  - Outputs unified stats report + streaks CSV

### Usage

Run the full analysis pipeline:

```bash
python -m initial_analysis.run_analysis_pipeline "data/path/to/input.csv" \
  --out-stats "output/analysis/stats.txt" \
  --out-streaks "output/analysis/streaks.csv"
```

**Default output paths:**
- Stats: `output/analysis/anon_stats.txt`
- Streaks: `output/analysis/anon_streaks.csv`

### Output Format

**Stats File** (unified text report):

1. **DATASET ANALYSIS** section
  - General statistics (row count, total duration)
  - Browser activity (rows/duration with known URLs)
  - Anonymized data summary (rows/duration with unknown URLs)
  - Streak overview

2. **ANONYMIZED STREAKS ANALYSIS** section
  - Duration statistics (mean, median, percentiles)
  - Streak categories (instant, short, medium, long)
  - Duration distribution by time buckets
  - Streak characteristics (single-row vs multi-row)

**Streaks CSV**: Detailed row for each streak (start_row, end_row, count, start_time, end_time, duration_seconds)

### Key Concepts

- **Anonymized Data**: Rows where the URL is unknown/redacted
- **Streak**: Consecutive rows with anonymized URLs, split when gap > 1 hour (indicating separate sessions)
- **Gap Threshold**: 3600 seconds (1 hour) - gaps larger than this create new streaks
- **Duration**: Total time span from first to last row in streak (in seconds)

### Example Output & Interpretation

```
================================================================================
DATASET ANALYSIS
================================================================================

GENERAL STATISTICS
Rows (excluding header): 1,513,057
Total duration (all): 11,526.99 h

BROWSER ACTIVITY
Total browser rows: 1,032,302 (68.2%)
Total browser duration: 8,603.51 h (74.6%)

ANONYMIZED DATA
Total anon rows: 305,244 (20.17%)  ← Cost of omission
Total anon duration: 898.74 h (7.8%)
Anon share of duration (vs browser): 10.45%

ANONYMIZED STREAKS
Total anon streaks found: 145,871

================================================================================
ANONYMIZED STREAKS ANALYSIS
================================================================================

STREAK LENGTH DISTRIBUTION
0-30 min:   145,778 (99.9%)  ← Most anonymized data is short bursts
30 min - 1 h:     73 (0.1%)
>24 h:            3 (0.0%)
```
