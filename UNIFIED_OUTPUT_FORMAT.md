# Process Mining Rules - Unified Output Format

Both process mining pipelines (`declare4py_pipeline.py` and `discover_pipeline.py`) discover DECLARE constraints and output them in a unified format suitable for filtering and visualization.

## Output Files

Each pipeline generates two formats (same information, choose based on preference):

| Pipeline | JSON Output | CSV Output |
|---|---|---|
| Declare4Py | `{stem}_declare4py_constraints.json` | `{stem}_declare4py_constraints.csv` |
| DisCoveR (pm4py) | `{stem}_dcr_constraints.json` | `{stem}_dcr_constraints.csv` |

Both formats contain the same information and can be used interchangeably.

## Unified Schema

Each rule/constraint/relation has the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `rule_id` | string | Unique identifier (e.g., "declare_0", "dcr_15") |
| `rule_type` | string | Type of rule (e.g., "Existence", "Response", "Condition", "Exclude") |
| `template` | string | Specific template name (e.g., "Existence1", "Response", "Condition") |
| `activities` | list[string] | Activities involved in the rule (1 or 2 activities) |
| `support` | float | Support value (0.0 to 1.0) - frequency in the log |
| `confidence` | float | Confidence value (0.0 to 1.0) - reliability/strength |
| `cardinality` | int or null | Cardinality for DECLARE templates when applicable (e.g., Existence1, Exactly2) |
| `category` | string | Rule category: `unary` or `binary` |
| `trace_count` | int or null | Number of traces (cases) used for computation |
| `support_count` | int or null | Number of traces that satisfy the rule |
| `violation_count` | int or null | Number of traces that violate the rule |
| `activation_count` | int or null | Number of activations used for confidence (event-level for binary rules) |
| `fulfillment_count` | int or null | Number of fulfilled activations |
| `activation_trace_count` | int or null | Number of traces containing activations |
| `metrics_source` | string | `computed`, `pm4py`, or `fallback` |
| `source` | string | Pipeline source: "declare4py" or "discover" |

## Example JSON Output

```json
[
  {
    "rule_id": "declare4py_0",
    "rule_type": "existence",
    "template": "existence",
    "activities": ["browser/youtube"],
    "support": 0.85,
    "confidence": 0.8,
    "cardinality": null,
    "category": "unary",
    "trace_count": 120,
    "support_count": 102,
    "violation_count": 18,
    "activation_count": 120,
    "fulfillment_count": 102,
    "activation_trace_count": 98,
    "metrics_source": "computed",
    "source": "declare4py"
  },
  {
    "rule_id": "declare4py_1",
    "rule_type": "response",
    "template": "response",
    "activities": ["browser/facebook", "browser/instagram"],
    "support": 0.65,
    "confidence": 0.9,
    "cardinality": null,
    "category": "binary",
    "trace_count": 120,
    "support_count": 78,
    "violation_count": 42,
    "activation_count": 210,
    "fulfillment_count": 189,
    "activation_trace_count": 80,
    "metrics_source": "computed",
    "source": "declare4py"
  }
]
```

## Example Output from DisCoveR Pipeline

```json
[
  {
    "rule_id": "dcr_0",
    "rule_type": "existence",
    "template": "existence",
    "activities": ["browser/twitch"],
    "support": 0.72,
    "confidence": 0.85,
    "cardinality": null,
    "category": "unary",
    "trace_count": 150,
    "support_count": 108,
    "violation_count": 42,
    "activation_count": 150,
    "fulfillment_count": 127,
    "activation_trace_count": 127,
    "metrics_source": "pm4py_discover_declare",
    "source": "discover"
  },
  {
    "rule_id": "dcr_1",
    "rule_type": "response",
    "template": "response",
    "activities": ["browser/youtube", "browser/netflix"],
    "support": 0.68,
    "confidence": 0.88,
    "cardinality": null,
    "category": "binary",
    "trace_count": 150,
    "support_count": 102,
    "violation_count": 48,
    "activation_count": 180,
    "fulfillment_count": 158,
    "activation_trace_count": 115,
    "metrics_source": "pm4py_discover_declare",
    "source": "discover"
  }
]
```

## Example CSV Output

```csv
rule_id,rule_type,template,activities,support,confidence,cardinality,category,trace_count,support_count,violation_count,activation_count,fulfillment_count,activation_trace_count,metrics_source,source
declare4py_0,existence,existence,browser/youtube,0.85,0.8,,unary,120,102,18,120,102,98,computed,declare4py
declare4py_1,response,response,browser/facebook|browser/instagram,0.65,0.9,,binary,120,78,42,210,189,80,computed,declare4py
dcr_0,existence,existence,browser/twitch,0.72,0.85,,unary,150,108,42,150,127,127,pm4py_discover_declare,discover
dcr_1,response,response,browser/youtube|browser/netflix,0.68,0.88,,binary,150,102,48,180,158,115,pm4py_discover_declare,discover
```

**Note**: In CSV format, activities are joined with `|` separator.

## Usage for Visualization & Filtering

This format enables:

1. **Filter by support threshold**: Show only rules with `support >= 0.7`
2. **Filter by confidence threshold**: Show only rules with `confidence >= 0.85`
3. **Filter by rule type**: Show only specific DECLARE templates (e.g., response, precedence, succession)
4. **Filter by category**: Show only unary or binary constraints
5. **Compare algorithms**: Compare rules from different discovery methods (Declare4Py vs DisCoveR)
6. **Activity-based filtering**: Find all rules involving specific activities
7. **Pipeline comparison**: Filter by `source` field to isolate results from one pipeline

## Supported DECLARE Templates

**Unary templates** (constraints on single activities):
- `existence`: Activity must occur at least once
- `absence`: Activity must not occur
- `exactly_one`: Activity occurs exactly once
- `init`: Activity must be the first event

**Binary templates** (constraints between two activities):
- `responded_existence`: If A occurs, B must occur (anywhere in trace)
- `response`: If A occurs, B must occur after A
- `altresponse`: Every A is followed by B before another A
- `chainresponse`: If A occurs, B must occur immediately after
- `precedence`: B can only occur if preceded by A
- `altprecedence`: Every B is preceded by A before another B
- `chainprecedence`: B must be immediately preceded by A
- `succession`: Response + Precedence combined
- `altsuccession`: AltResponse + AltPrecedence combined
- `chainsuccession`: ChainResponse + ChainPrecedence combined
- `coexistence`: A and B must both occur or both not occur
- `nonsuccession`: If A occurs, B must not occur after A
- `noncoexistence`: A and B cannot both occur
- `nonchainsuccession`: If A occurs, B must not occur immediately after

## Pipeline Usage

### Declare4Py Pipeline

```bash
python declare4py_pipeline.py \
  --csv data/preprocessed_shortened.csv \
  --out-dir output \
  --min-support 0.4 \
  --itemsets-support 0.8 \
  --max-cardinality 2
```

Outputs:
- `output/preprocessed_shortened_declare_constraints.json`
- `output/preprocessed_shortened_declare_constraints.csv`
- `output/preprocessed_shortened_declare_model.decl` (original format)
- `output/preprocessed_shortened_declare_graph.png` (visualization)

### DisCoveR Pipeline

```bash
python discover_pipeline.py \
  --csv data/preprocessed_shortened.csv \
  --out-dir output \
  --min-support 0.4 \
  --min-confidence 0.8
```

Outputs:
- `output/preprocessed_shortened_dcr_relations.json`
- `output/preprocessed_shortened_dcr_relations.csv`
- `output/preprocessed_shortened_dcr_model.json` (original format)
- `output/preprocessed_shortened_dcr_graph.png` (visualization)

## Notes on Metrics

### Support
- Represents how frequently the rule appears in the event log
- Value range: 0.0 (never) to 1.0 (always)
- Higher support = more common pattern

### Confidence
- Represents the reliability/strength of the rule
- Value range: 0.0 (unreliable) to 1.0 (always holds when applicable)
- Higher confidence = more reliable pattern

### Cardinality
- Only applicable to DECLARE Existence/Absence/Exactly templates
- Indicates the exact number of occurrences required
- `null` for other rule types

### Metric Extraction Notes

- **Declare4Py**: Support/confidence are computed post-discovery from the event log for each discovered constraint (trace-level support, activation-level confidence). If a template is not supported by the evaluator, thresholds are used as fallback.
- **DisCoveR**: The pipeline checks if pm4py returns support/confidence dictionaries with the DCR graph. If available, these are used; otherwise, configured thresholds are used as fallbacks.

Both pipelines emit a `metrics_source` field to indicate whether values are computed, provided by pm4py, or fallbacks.
