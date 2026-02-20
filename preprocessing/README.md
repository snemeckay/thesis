# Data Preprocessing Pipeline

## Overview

The preprocessing pipeline performs comprehensive data transformation and normalization on raw activity logs:

1. **Datetime Parsing** - Convert string timestamps to proper `pd.Timestamp` objects
2. **Anonymized Data Filtering** - Remove rows with unknown/redacted URLs
3. **Event Merging** - Merge consecutive events <1 minute apart with the same activity
4. **Activity Normalization** - Combine application name and URL into unified, cleaned activity labels
5. **Timestamp Formatting** - Create readable timestamp column for analysis
6. **Behavioral Day Segmentation** - Split events into cohesive activity sequences using intelligent gap detection
7. **Case ID Generation** - Create unique identifiers for each behavioral day (for process mining)
8. **Column Selection** - Filter and output only relevant columns for downstream analysis

The result is a clean, normalized dataset grouped into behavioral days - activity sequences representing cohesive periods of user engagement, enabling meaningful process mining and temporal analysis.

## Purpose

Transform raw activity logs into analysis-ready data with meaningful temporal grouping (behavioral days) for process mining research.

## Architecture

The pipeline applies a sequence of transformations in `main.py`:

### Data Flow

```
Raw CSV Input
    ↓
parse_datetime_columns() → Convert timestamp strings to pd.Timestamp
    ↓
filter_anonymized_rows() → Remove rows with unknown/redacted URLs
    ↓
merge_consecutive_events() → Merge consecutive events <1 min apart with same activity
  ↓
assign_day_counter() → Detect behavioral day boundaries via gap analysis
    ↓
build_case_id() → Create case IDs: {user_id}_{date}
    ↓
build_activity_column() → Normalize activity: combine app + URL
    ↓
build_timestamp_column() → Format readable timestamps
    ↓
select_output_columns() → Filter to output schema
    ↓
Preprocessed CSV Output
```

### Module Details

- **`constants.py`** - Configuration parameters
  - Window definitions (waking: 4am–noon, night: 8pm–4am, late-sleep: 3am–10am)
  - Gap thresholds (`MIN_INACTIVITY_GAP_HOURS = 4`)
  - Output column specification

- **`transforms.py`** - Individual transformation functions
  - `parse_datetime_columns()`: Convert timestamp strings to `pd.Timestamp`
  - `filter_anonymized_rows()`: Remove rows with unknown/redacted URLs
  - `merge_consecutive_events()`: Merge consecutive events <1 min apart with same activity
  - `build_activity_column()`: Combine `app_in_focus` and `url3` into unified, cleaned `activity_clean` label
  - `build_timestamp_column()`: Format start_time into readable ISO timestamp
  - `select_output_columns()`: Filter DataFrame to final output schema

- **`day_split.py`** - Behavioral day boundary detection
  - `assign_day_counter()`: Multi-phase gap detection algorithm (core logic)
  - `build_case_id()`: Generate case IDs as `{user_id}_{first_event_date_in_day}`

- **`main.py`** - Pipeline orchestrator
  - Loads raw CSV
  - Applies all transforms in sequence
  - Outputs clean, segmented preprocessed CSV

## Data Transformations

### 1. Datetime Parsing

Converts raw timestamp strings to pandas `pd.Timestamp` objects for proper temporal analysis.

**Input columns:** `start_time`, `end_time` (string)  
**Output:** Same columns as `pd.Timestamp`

### 2. Anonymized Data Filtering

Removes all rows with unknown, redacted, or "anonymized" URLs. Only rows with identifiable, known URLs are kept.

**Filtering logic:**
- Remove rows where `url3` is null/missing
- Remove rows where `url3` is empty string (after stripping whitespace)
- Remove rows where `url3` is "anonymized" (case-insensitive)

**Result:** Clean dataset with only known-URL activities

**Example output:**
```
Before filtering: 1,000,000 rows
After filtering:   680,000 rows (32% removed as anonymized)
```

### 3. Activity Normalization

Combines application name and URL into a single unified activity label, with filtering for browser-based activities.

**Input columns:** `app_in_focus`, `url3`  
**Output column:** `activity_clean`

Logic:
- If `app_in_focus` is "Browser", use `url3` (the actual website)
- Otherwise, use `app_in_focus` as-is

**Example transformations:**
```
app_in_focus="Browser", url3="facebook.com" → activity_clean="Browser/facebook.com"
app_in_focus="Slack", url3=<anything> → activity_clean="Slack/<url>"
```

### 4. Day Segmentation (Core)

Groups consecutive events into behavioral days - activity sequences not interrupted by qualifying inactivity gaps.

## Behavioral Day Algorithm

Events are grouped into behavioral days using a **three-phase gap detection strategy**:

1. **PRIMARY**: Identify gaps ≥ 4 hours **ending in waking window** (4am–noon)
   - These indicate natural day boundaries (user sleeps through night, resumes in morning)

2. **FALLBACK**: If no primary gaps found for a date, check gaps overlapping **night window** (8pm–4am)
   - Place boundary at night-window end (04:00) within the gap
   - Handles users with varied sleep schedules or overnight activity

3. **LAST RESORT**: If still no boundary found, check gaps **starting in late-sleep window** (3am–10am)
   - Place boundary at gap start time
   - Captures morning sleep periods even if activity resumes in afternoon

For each calendar date, the **longest qualifying gap** is selected to minimize fragmentation.

**Result:** `day_counter` column incremented at each boundary crossing

### 5. Case ID Generation

Creates unique identifiers for each behavioral day in the format `{user_id}_{date}`.

**Input:** `user_id`, `day_counter`, first event's `start_time` per day  
**Output column:** `case_id`

**Example:**
```
user_id="ema3.0053", first_event_date=2025-05-02 → case_id="ema3.0053_2025-05-02"
user_id="ema3.0053", first_event_date=2025-05-03 → case_id="ema3.0053_2025-05-03"
```

### 6. Timestamp Formatting

Formats `start_time` into readable ISO 8601 timestamp (already done via datetime parsing).

### 7. Column Selection

Filters output to relevant columns for analysis:
- `user_id`, `case_id`, `day_counter`
- `start_time`, `end_time`
- `activity_clean`, `timestamp`
- (Other domain-specific columns as configured)

- **Case ID**: `{user_id}_{date}` where date is the first event's date in that behavioral day
- **Behavioral Day**: Set of consecutive events not split by any qualifying inactivity gap
- **Gap**: Inactive period between `end_time` of one event and `start_time` of next
- **Day Counter**: Integer incremented each time a boundary is crossed; used to derive case IDs

## Usage

```bash
python -m preprocessing.main \
  --raw_csv "data/raw_input.csv" \
  --out_csv "data/preprocessed.csv"
```

Output: Preprocessed CSV with `case_id` column grouping events into behavioral days.

## Configuration

All behavioral day parameters are configurable in `constants.py`:

```python
# Time windows for gap detection
WAKING_WINDOW_START = 4        # 4am
WAKING_WINDOW_END = 12         # noon
NIGHT_WINDOW_START = 20        # 8pm
NIGHT_WINDOW_END = 4           # 4am next day
LATE_SLEEP_START = 3           # 3am
LATE_SLEEP_END = 10            # 10am

# Minimum gap to split days
MIN_INACTIVITY_GAP_HOURS = 4
```

Adjust these values to match your dataset's characteristics and behavioral patterns.
