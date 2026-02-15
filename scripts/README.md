# Visualization & Analysis Scripts

## Overview

Utility scripts for validating and analyzing preprocessed activity data. These tools help visualize behavioral days and aggregate activity patterns to confirm preprocessing correctness and enable exploratory analysis.

**Input:** Preprocessed CSV from the preprocessing pipeline  
**Outputs:** PNG visualizations and text summaries

---

## User Data Extraction (`extract_user.py`)

Extract data for a single user from the full preprocessed dataset.

### Purpose

Isolate individual user data for focused analysis and visualization.

### Usage

```bash
python scripts/extract_user.py \
  --in data/preprocessed.csv \
  --user ema3.0053 \
  --out output/users/ema3.0053.csv
```

### Output

Filtered CSV containing only rows for the specified user_id, with all original columns preserved.

---

---

## Activity Timeline Plotter (`plot_user_activity.py`)

Generates timeline visualizations of user activity grouped by behavioral day (case_id).

### Purpose

Visualize activity patterns and validate behavioral day boundaries. Each horizontal bar represents one activity event, grouped by case_id with midnight boundaries marking calendar day transitions.

### Usage

```bash
python scripts/plot_user_activity.py \
  --in data/preprocessed.csv \
  --out output/plots/user_timeline.png \
  --user ema3.0053
```

### Options

- `--in` (required): Input preprocessed CSV file
- `--out` (required): Output PNG file path
- `--user` (optional): user_id to filter; if omitted, plots all users (if CSV contains single user)
- `--max-days` (default: 60): Maximum number of behavioral days to plot

### Visualization

**Layout:**
- Y-axis: case_id (behavioral day identifier in format `user_id_date`)
- X-axis: Absolute datetime with day boundaries marked
- Each horizontal bar: One activity event (duration visible from bar width)
- Midnight ticks: Mark transitions between calendar days

**Interpretation:**
- Clear gaps between case_ids indicate successful day splitting
- Gaps should align with actual inactivity periods (4+ hours with no activity)

---

## Activity Per Day Summarizer (`activity_per_day.py`)

Generates text summary of activity aggregated by behavioral day with temporal boundaries and duration calculations.

### Usage

```bash
python activity_per_day.py \
  --in data/preprocessed.csv \
  --out output/activity_per_day.txt
```

### Output Format

Text file with per-user, per-behavioral-day aggregates:

```
user1
  day 0 - activity: 05:30:15    start: 2025-05-02 09:39:39.129    end: 2025-05-02 15:35:50.216
  day 1 - activity: 08:12:45    start: 2025-05-03 13:42:32.817    end: 2025-05-03 22:42:18.456
  day 2 - activity: 03:45:22    start: 2025-05-04 08:00:00.000    end: 2025-05-04 11:45:22.000

user2
  day 0 - activity: 03:15:22    start: 2025-05-02 10:00:00.000    end: 2025-05-02 13:15:22.000
  day 1 - activity: 07:20:18    start: 2025-05-03 14:30:15.000    end: 2025-05-03 21:50:33.000
```

### Columns Explained

- **day**: Behavioral day counter (0-indexed per user)
- **activity**: Total active time (sum of event durations) in HH:MM:SS format
- **start**: First event's start timestamp
- **end**: Last event's end timestamp

### Use Cases

- Quick overview of activity volume per behavioral day
- Spot-checking day boundaries and temporal coverage
- Identifying anomalies (days with minimal or excessive activity)
- Temporal analysis (which dates have data coverage)
