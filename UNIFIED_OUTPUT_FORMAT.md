# Process Mining Rules - Unified Output Format

Both process mining pipelines (`declare4py_pipeline.py` and `discover_pipeline.py`) discover DECLARE constraints and output them in a unified format suitable for filtering and visualization.

## Output Files

Each pipeline generates two unified output formats (same information, choose based on preference):

| Pipeline | JSON Output | CSV Output |
|---|---|---|
| Declare4Py | `{stem}_declare4py_constraints.json` | `{stem}_declare4py_constraints.csv` |
| DisCoveR (pm4py) | `{stem}_dcr_constraints.json` | `{stem}_dcr_constraints.csv` |

Both formats contain the same unified rule information and can be used interchangeably.

## Unified Schema

Each rule/constraint/relation has the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `rule_id` | string | Unique identifier (e.g., "declare_0", "dcr_15") |
| `rule_type` | string | Canonical uppercase rule type (e.g., "EXISTENCE", "RESPONSE", "NOT_COEXISTENCE") |
| `activities` | list[string] | Activities involved in the rule (1 or 2 activities) |
| `support` | float | Support value (0.0 to 1.0) - frequency in the log |
| `confidence` | float | Confidence value (0.0 to 1.0) - reliability/strength |
| `cardinality` | int or null | Cardinality for DECLARE templates when applicable (e.g., Existence1, Exactly2) |
| `category` | string | Rule category: `unary` or `binary` |
| `trace_count` | int or null | Number of traces (cases) used for computation |
| `support_count` | int or null | Pipeline-specific support count (satisfied traces in Declare4Py; activating traces in DisCoveR) |
| `violation_count` | int or null | Pipeline-specific violation count (violating traces in Declare4Py; total-trace remainder in DisCoveR) |
| `activation_count` | int or null | Pipeline-specific activation count (event-level activations in Declare4Py; trace-level activations in DisCoveR) |
| `fulfillment_count` | int or null | Pipeline-specific fulfillment count (fulfilled activations in Declare4Py; fulfilling traces in DisCoveR) |
| `activation_trace_count` | int or null | Number of traces containing activations or activation traces, depending on pipeline |
| `source` | string | Pipeline source: "declare4py" or "discover" |

### Normalization and deduplication rules

- `rule_type` is canonicalized to uppercase snake case (e.g., `AlternateResponse` → `ALTERNATE_RESPONSE`).
- `template` and `metrics_source` are not part of the unified schema.
- Symmetric binary templates are deduplicated per template (`CHOICE`, `EXCLUSIVE_CHOICE`, `COEXISTENCE`, `NOT_COEXISTENCE`) by sorting activity pairs.
- Cardinality is part of the deduplication key, so unary variants with different bounds remain distinct.

## Example JSON Output

```json
[
  {
    "rule_id": "declare_0",
    "rule_type": "EXISTENCE",
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
    "source": "declare4py"
  },
  {
    "rule_id": "declare_1",
    "rule_type": "RESPONSE",
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
    "source": "declare4py"
  }
]
```

## Example Output from DisCoveR Pipeline

```json
[
  {
    "rule_id": "declare_0",
    "rule_type": "EXISTENCE",
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
    "source": "discover"
  },
  {
    "rule_id": "declare_1",
    "rule_type": "RESPONSE",
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
    "source": "discover"
  }
]
```

## Example CSV Output

```csv
rule_id,rule_type,activities,support,confidence,cardinality,category,trace_count,support_count,violation_count,activation_count,fulfillment_count,activation_trace_count,source
declare_0,EXISTENCE,browser/youtube,0.85,0.8,,unary,120,102,18,120,102,98,declare4py
declare_1,RESPONSE,browser/facebook|browser/instagram,0.65,0.9,,binary,120,78,42,210,189,80,declare4py
declare_0,EXISTENCE,browser/twitch,0.72,0.85,,unary,150,108,42,150,127,127,discover
declare_1,RESPONSE,browser/youtube|browser/netflix,0.68,0.88,,binary,150,102,48,180,158,115,discover
```

**Note**: In CSV format, activities are joined with `|` separator.

## Usage for Visualization & Filtering

This format enables:

1. **Filter by support threshold**: Show only rules with `support >= 0.7`
2. **Filter by confidence threshold**: Show only rules with `confidence >= 0.85`
3. **Filter by rule type**: Show only specific DECLARE templates (e.g., `RESPONSE`, `PRECEDENCE`, `SUCCESSION`)
4. **Filter by category**: Show only unary or binary constraints
5. **Compare algorithms**: Compare rules from different discovery methods (Declare4Py vs DisCoveR)
6. **Activity-based filtering**: Find all rules involving specific activities
7. **Pipeline comparison**: Filter by `source` field to isolate results from one pipeline

## Supported DECLARE Templates

**Unary templates** (constraints on single activities):
- `EXISTENCE`: Activity must occur at least once
- `ABSENCE`: Activity must not occur
- `EXACTLY_ONE`: Activity occurs exactly once
- `INIT`: Activity must be the first event

**Binary templates** (constraints between two activities):
- `RESPONDED_EXISTENCE`: If A occurs, B must occur (anywhere in trace)
- `RESPONSE`: If A occurs, B must occur after A
- `ALT_RESPONSE`: Every A is followed by B before another A
- `CHAIN_RESPONSE`: If A occurs, B must occur immediately after
- `PRECEDENCE`: B can only occur if preceded by A
- `ALT_PRECEDENCE`: Every B is preceded by A before another B
- `CHAIN_PRECEDENCE`: B must be immediately preceded by A
- `SUCCESSION`: Response + Precedence combined
- `ALT_SUCCESSION`: AltResponse + AltPrecedence combined
- `CHAIN_SUCCESSION`: ChainResponse + ChainPrecedence combined
- `COEXISTENCE`: A and B must both occur or both not occur
- `NOT_SUCCESSION`: If A occurs, B must not occur after A (NotResponse), AND if B occurs, A must not have preceded B (NotPrecedence)
- `NOT_COEXISTENCE`: A and B cannot both occur
- `NOT_CHAIN_RESPONSE`: If A occurs, B must not occur immediately after
- `NOT_CHAIN_PRECEDENCE`: B must not be immediately preceded by A
- `NOT_CHAIN_SUCCESSION`: If A occurs, B must not immediately follow A (NotChainResponse), AND if B occurs, A must not immediately precede B (NotChainPrecedence)

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
- `output/preprocessed_shortened_declare4py_constraints.json`
- `output/preprocessed_shortened_declare4py_constraints.csv`

### DisCoveR Pipeline

```bash
python discover_pipeline.py \
  --csv data/preprocessed_shortened.csv \
  --out-dir output \
  --min-support 0.4 \
  --min-confidence 0.8
```

Outputs:
- `output/preprocessed_shortened_dcr_constraints.json`
- `output/preprocessed_shortened_dcr_constraints.csv`

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

- **Declare4Py**: Support/confidence are recomputed post-discovery from the event log for each discovered constraint.
  - `support_count` = number of traces that satisfy the constraint.
  - `violation_count` = number of traces that violate the constraint.
  - `activation_count` = total activations across the log.
  - `fulfillment_count` = total fulfilled activations.
  - `activation_trace_count` = number of traces containing at least one activation.
- **DisCoveR**: The pipeline preserves pm4py’s discovered trace-level counts and converts them into the unified schema.
  - `support_count` and `activation_trace_count` reflect the number of traces that activate the rule.
  - `fulfillment_count` reflects the number of traces that fulfill the rule.
  - `support` and `confidence` are normalised from those pm4py counts.
  - `violation_count` is derived from the total trace count.

In other words, the unified schema is shared, but the count provenance differs slightly between the two discovery engines.
# Local research model extensions

The [local mining app](mining_app/README.md) preserves the unified rule fields
and adds `label_level`, `dataset_id`, `model_id`, and `activity_categories`.
`activity_categories` is a JSON array of category arrays aligned to the
`activities` endpoints; multi-category activities retain all observed categories
in the selected cohort. The existing `category` field still means unary/binary
constraint arity. Demographics are not assigned to aggregate rule rows: retained
events and preparation/model metadata provide typed attributes, case scope,
population filters, engine/configuration, and reproducible cohort context.
Category models are mined separately, not derived by relabeling activity rules.
Valid empty output writes a header-only CSV and an empty JSON list.
