# Anonymized Data Analysis

## Overview

This analysis pipeline quantifies the impact and patterns of anonymized (redacted) data in activity logs:

1. **Anonymized Data Detection** - Identify all rows with unknown/redacted URLs
2. **Streak Detection** - Group consecutive anonymized rows into "streaks" (separate sessions > 1 hour gaps)
3. **Dataset Statistics** - Calculate total rows, durations, and anonymization coverage percentages
4. **Temporal Pattern Analysis** - Analyze streak duration distribution, temporal clustering, and characteristics
5. **Impact Assessment** - Answer: What is the cost of removing anonymized data? Is remaining data workable?

The result is a comprehensive assessment supporting data quality decisions and dataset usability for downstream process mining.

## Purpose

Quantify the impact of removing rows with anonymized/unknown URLs. Support decisions about dataset omission strategies through statistics and pattern analysis.

## Overview

The pipeline identifies consecutive sequences of rows with anonymized URLs ("streaks") and analyzes their impact on dataset completeness. A streak is defined as consecutive rows where `url3` is unknown, split when gaps exceed 1 hour (indicating distinct activity sessions).

## Analysis Pipeline

### Execution Flow

```
Raw CSV Input
    ↓
analyze_anon_data.py → Detect anonymized streaks + dataset statistics
    ├─ StreakDetector: Gap-based streak segmentation (>1 hour splits)
    ├─ DataStats: Row counts, duration, browser vs anonymous breakdown
    └─ Output: stats.txt + streaks.csv
    ↓
analyze_streaks.py → Detailed streak pattern analysis
    ├─ StreakStatistics: Duration distribution, categories, characteristics
    └─ Output: Enhanced stats.txt
    ↓
Final Report: Combined analysis + streaks data
```

### Module Details

The analysis is organized into modular components:

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

## Analysis Details

### 1. Anonymized Data Detection

Identifies all rows where `url3` is "anonymized" or unknown/missing, treating them as missing data.

**Metrics:**
- Count of anonymized rows
- Total duration of anonymized rows
- Percentage of dataset (rows and hours)
- Browser activity vs anonymized ratio

### 2. Streak Detection

Groups consecutive anonymized rows into distinct "streaks" using gap-based splitting:
- **Gap threshold:** > 1 hour (3600 seconds) indicates a new streak
- **Streak boundary:** First and last event within each streak
- **Duration:** Total time span from first to last event in streak

**Example:**
```
Rows: [10:00-10:30 anon], [10:45-11:00 anon], [11:05-11:10 anon]
                         ↑ 15 min gap (< 1 hr)          ↑ 5 min gap (< 1 hr)
Result: Single streak from 10:00-11:10 (70 min total)

Rows: [10:00-10:30 anon], [12:00-12:30 anon]
                         ↑ 1.5 hr gap (> 1 hr)
Result: Two separate streaks
```

### 3. Dataset Statistics

Comprehensive breakdown of dataset composition:

**General Statistics:**
- Total rows (excluding header)
- Total duration across all data (hours)

**Browser Activity (Known URLs):**
- Row count and duration for known-URL browser activities
- Percentage of dataset

**Anonymized Data:**
- Row count and duration with unknown URLs
- Percentage of dataset
- Cost of omission (if these rows removed)
- Share of duration vs known activities

**Streak Overview:**
- Total number of detected streaks
- Average streak duration
- Streak length distribution

### 4. Temporal Pattern Analysis

Analyzes streak characteristics to understand anonymization patterns:

**Duration Statistics:**
- Mean, median, min, max, std dev
- Percentiles (25th, 50th, 75th, 90th, 95th, 99th)

**Streak Categories:**
- Instant: < 30 seconds (single events or very brief)
- Short: 30 sec - 5 min (quick browsing)
- Medium: 5 min - 1 hour (typical sessions)
- Long: > 1 hour (extended sessions)

**Duration Distribution:**
- Bucketed breakdown (0-30 min, 30 min-1 hr, 1-2 hr, etc.)
- Visual percentage distribution

**Streak Characteristics:**
- Single-row streaks (very brief events)
- Multi-row streaks (extended periods)
- Temporal clustering (which times/days have most anonymization)

### 5. Impact Assessment

**Cost Metrics:**
- Rows lost if omitting anonymized data
- Hours of user activity lost
- Temporal coverage reduction

**Workability Assessment:**
- Remaining dataset size post-omission
- Duration coverage post-omission
- Whether sufficient data remains for analysis

## Usage

Run the full analysis pipeline:

```bash
python -m initial_analysis.run_analysis_pipeline "data/path/to/input.csv" \
  --out-stats "output/analysis/stats.txt" \
  --out-streaks "output/analysis/streaks.csv"
```

**Default output paths:**
- Stats: `output/analysis/anon_stats.txt`
- Streaks: `output/analysis/anon_streaks.csv`

## Output Format

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

## Key Concepts

- **Anonymized Data**: Rows where the URL is unknown/redacted
- **Streak**: Consecutive rows with anonymized URLs, split when gap > 1 hour (indicating separate sessions)
- **Gap Threshold**: 3600 seconds (1 hour) - gaps larger than this create new streaks
- **Duration**: Total time span from first to last row in streak (in seconds)

## Example Output & Interpretation

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
Total anon rows: 305,244 (20.17%)  <- Cost of omission
Total anon duration: 898.74 h (7.8%)
Anon share of duration (vs browser): 10.45%

ANONYMIZED STREAKS
Total anon streaks found: 145,871

================================================================================
ANONYMIZED STREAKS ANALYSIS
================================================================================

STREAK LENGTH DISTRIBUTION
0-30 min:   145,778 (99.9%)  <- Most anonymized data is short bursts
30 min - 1 h:     73 (0.1%)
>24 h:            3 (0.0%)
```
