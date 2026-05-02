"""Unified schema definition for process mining pipeline outputs.

Defines the canonical field set shared by all pipeline outputs (JSON and CSV),
and provides helpers to create and categorise rule dicts.  Any file produced
by Declare4PyPipeline or DiscoverPipeline conforms to this schema so that
downstream visualisation and filtering tools can consume either output without
extra adaptation.
"""

import re

UNIFIED_FIELDS = [
    "rule_id",
    "rule_type",
    "template",
    "activities",
    "support",
    "confidence",
    "cardinality",
    "category",
    "trace_count",
    "support_count",
    "violation_count",
    "activation_count",
    "fulfillment_count",
    "activation_trace_count",
    "metrics_source",
    "source",
]

# Known compact DisCoveR template names that cannot be reliably split by the
# general camelCase / separator rules below.
_COMPACT_TEMPLATE_MAP = {
    "altresponse": "ALT_RESPONSE",
    "altprecedence": "ALT_PRECEDENCE",
    "altsuccession": "ALT_SUCCESSION",
    "chainresponse": "CHAIN_RESPONSE",
    "chainprecedence": "CHAIN_PRECEDENCE",
    "chainsuccession": "CHAIN_SUCCESSION",
    "nonsuccession": "NON_SUCCESSION",
    "noncoexistence": "NON_COEXISTENCE",
    "nonchainsuccession": "NON_CHAIN_SUCCESSION",
    "respondedexistence": "RESPONDED_EXISTENCE",
}


def canonical_rule_type(name: str) -> str:
    """Return canonical uppercase template label (e.g. ``ALTERNATE_RESPONSE``).

    Handles both CamelCase names from Declare4Py (e.g. ``AlternateResponse``)
    and the compact all-lowercase names emitted by pm4py DisCoveR
    (e.g. ``altresponse``, ``noncoexistence``, ``nonchainsuccession``).
    """
    text = str(name or "").strip()
    if not text:
        return "UNKNOWN"

    # Strip all separators and lower-case to look up compact DisCoveR names.
    compact = text.lower().replace(" ", "").replace("_", "").replace("-", "")
    if compact in _COMPACT_TEMPLATE_MAP:
        return _COMPACT_TEMPLATE_MAP[compact]

    # General path: insert _ at camelCase boundaries, then normalise separators.
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", text)
    text = re.sub(r"[\s\-]+", "_", text)
    text = re.sub(r"[^A-Za-z0-9_]", "", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text.upper() if text else "UNKNOWN"


def create_rule(
    rule_id,
    rule_type,
    activities,
    support,
    confidence,
    template=None,
    cardinality=None,
    category=None,
    trace_count=None,
    support_count=None,
    violation_count=None,
    activation_count=None,
    fulfillment_count=None,
    activation_trace_count=None,
    metrics_source="computed",
    source="unknown",
):
    """Build a unified rule dict with all schema fields populated.

    Any field not supplied defaults to ``None`` except ``metrics_source``
    (``"computed"``) and ``source`` (``"unknown"``).
    The ``category`` field is inferred from the number of activities when
    not explicitly provided.

    Args:
        rule_id:                Unique identifier string (e.g. ``"declare_0"``).
        rule_type:              Template type label (canonicalised to uppercase,
                    e.g. ``"ALTERNATE_RESPONSE"``).
        activities:             List of activity name strings (length 1 or 2).
        support:                Support ratio (0.0 – 1.0).
        confidence:             Confidence ratio (0.0 – 1.0).
        template:               Original/raw template name before canonicalisation.
        cardinality:            Numeric bound for unary templates, or ``None``.
        category:               ``"unary"`` or ``"binary"``; inferred if omitted.
        trace_count:            Total number of traces in the log.
        support_count:          Number of traces where the constraint holds.
        violation_count:        Number of traces where the constraint is violated.
        activation_count:       Total activations across all traces.
        fulfillment_count:      Total fulfillments across all traces.
        activation_trace_count: Number of traces containing at least one activation.
        metrics_source:         Label describing how metrics were computed.
        source:                 Pipeline that produced this rule.

    Returns:
        Dict with all ``UNIFIED_FIELDS`` keys present.
    """
    canonical = canonical_rule_type(rule_type)
    return {
        "rule_id": rule_id,
        "rule_type": canonical,
        "template": template if template is not None else canonical,
        "activities": activities,
        "support": support,
        "confidence": confidence,
        "cardinality": cardinality,
        "category": category or infer_category(activities),
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": violation_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
        "metrics_source": metrics_source,
        "source": source,
    }


def infer_category(activities: list) -> str:
    """Infer whether a rule is unary or binary from the number of activities.

    Args:
        activities: List of activity name strings.

    Returns:
        ``"binary"`` if two or more activities, ``"unary"`` otherwise.
    """
    return "binary" if len(activities) >= 2 else "unary"


def normalize_activities(activities) -> list:
    """Coerce an activities value to a list of stripped strings.

    Handles both the case where ``activities`` is already a list and the
    case where it is a bare string or other scalar.

    Args:
        activities: A list of activity names, or a single activity name.

    Returns:
        List of stripped string activity names.
    """
    if not isinstance(activities, list):
        activities = [activities]
    return [str(a).strip() for a in activities]
