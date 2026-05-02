# Behavioral Activity Analysis: Progress Report

## Completed Work

### April 2026 Pipeline Consolidation Update

Implemented a unification pass across both DECLARE discovery pipelines and the visualization layer:

- Standardized output schema to a single canonical rule identifier field (`rule_type`, uppercase snake case).
- Removed legacy/ambiguous fields (`template`, `metrics_source`) from exported datasets.
- Added symmetric-template deduplication for pair-order invariance (e.g., `CHOICE(A,B)` and `CHOICE(B,A)` are treated as the same discovered relation).
- Fixed deduplication for unary cardinality templates by including cardinality in the key, preserving distinct constraints such as `EXISTENCE(A,1)` vs `EXISTENCE(A,2)`.
- Completed metric handlers for missing negative chain templates (`NOT_CHAIN_RESPONSE`, `NOT_CHAIN_PRECEDENCE`, `NOT_CHAIN_SUCCESSION`).
- Removed pre-discovery activity filtering (`--top-activities`) from both pipelines to avoid altering temporal semantics before mining.

This update improved cross-pipeline comparability, reduced duplicate noise, and ensured semantically consistent export data for downstream analysis and visualization.

### 1. Assessing Impact of Removing Anonymized Data

Analyzed the raw logs to understand what data would be lost by filtering out redacted/anonymized entries. Found that:

- **7.8% of total activity duration** comes from anonymized data (898.74 hours out of 11,527 total)
- **10.45% of browser activity duration** is anonymized
- Anonymized entries are mostly brief (99.9% of anonymized streaks are <30 minutes long)
- Most are single-row events or very short sequences (71% are single events, 99% <60 seconds)

This showed that removing anonymized data would lose relatively little information while gaining consistency—most anonymized entries are noise/gaps rather than substantive activity sequences. Decision: filter them out in preprocessing to keep only identifiable activities.

---

### 2. Data Preparation Pipeline

Created a data cleaning and preprocessing system that:
- Parses and normalizes timestamps
- Removes low-quality entries (redacted/missing data)
- Consolidates redundant events
- Standardizes activity labels
- Segments data into behavioral days (identifies natural breakpoints in activity)
- Generates case identifiers for analysis

The behavioral day segmentation uses gap detection—when there's a sustained pause in activity, that marks a boundary. This creates natural segments reflecting actual behavior rather than calendar days.

---

### 3. Data Validation

Built visualization and verification tools to check that data preparation worked correctly. Can visually inspect activity timelines and validate day boundaries.

**Output example - per-day activity summary:**
```
User: ema3.0015
  day 0 - activity: 6h 21m 48s    start: 2025-05-02 16:30:04    end: 2025-05-03 01:05:54
  day 1 - activity: 12h 13m 36s   start: 2025-05-03 08:14:26    end: 2025-05-03 21:05:59
  day 2 - activity: 10h 16m 58s   start: 2025-05-04 08:57:59    end: 2025-05-04 20:25:14
  day 3 - activity: 7h 57m 50s    start: 2025-05-05 12:41:00    end: 2025-05-05 21:59:41
```

**Visualization outputs:**
- Timeline plots showing activity sequences grouped by behavioral day
- Activity duration per day with temporal bounds (start/end times)
- Anomaly detection flagging unusual behavioral patterns

[INSERT: example_timeline_visualization.png or activity_per_day_visualization.png here]

---

### 4. Pattern Discovery

Implemented automated constraint discovery that scans activity logs for behavioral patterns. Discovers unary patterns (single activities) and binary patterns (relationships between two activities).

**Output format - CSV:**
```
rule_id,rule_type,activities,support,confidence,cardinality,category,trace_count,support_count,violation_count
declare_0,EXISTENCE,browser/youtube,0.4107,0.4107,,unary,3643,1496,2147
declare_1,ABSENCE,browser/youtube,0.5893,0.5893,,unary,3643,2147,1496
declare_2,EXISTENCE,browser/facebook,0.3563,0.3563,,unary,3643,1298,2345
declare_39,CHOICE,browser/youtube|browser_file/nan,0.8765,0.8765,,binary,3643,3193,450
declare_45,RESPONSE,browser/youtube|browser_file/nan,0.7963,0.3710,,binary,3643,2901,742
```

**Output format - JSON:**
```json
{
  "rule_id": "declare_0",
  "rule_type": "EXISTENCE",
  "activities": ["browser/youtube"],
  "support": 0.41065056272303047,
  "confidence": 0.41065056272303047,
  "cardinality": null,
  "category": "unary",
  "trace_count": 3643,
  "support_count": 1496,
  "violation_count": 2147,
  "activation_count": 3643,
  "fulfillment_count": 1496,
  "source": "declare4py"
}
```

**Field reference:**
- `support`: Ratio of cases where rule holds (0-1)
- `confidence`: Strength/reliability of the rule (0-1)
- `support_count`: Number of behavioral days with this pattern
- `violation_count`: Number of behavioral days without this pattern
- `trace_count`: Total number of behavioral days analyzed

**Scale:** Generates hundreds to thousands of constraint records per dataset (tested on 3,600+ behavioral days). Exported to both JSON and CSV formats for flexibility in downstream analysis.

---

## Current Problem

Discovery produces 500–2,000 patterns per dataset. Manually reading through that many rules doesn't work. A single visualization showing all patterns is unreadable (just looks like a tangled mess).

We need to be able to filter and explore these patterns interactively—by strength, by activity type, by specific interests—so researchers can actually make sense of what was discovered.

---

## What We Have

- Clean activity data with behavioral day segmentation
- Automatically discovered patterns (hundreds to thousands, in JSON/CSV format)
- Filtering and visualization infrastructure built and ready

---

## What's Needed

Tools to filter, organize, and inspect patterns interactively. The hard part (discovery) is done. This is about building the interface to explore results.
