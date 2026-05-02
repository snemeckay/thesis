"""Trace cache construction and per-template metrics computation for DECLARE constraints.

Provides two public helpers consumed by Declare4PyPipeline:

  ``build_trace_cache(log)``
      Pre-processes a pm4py EventLog into a list of lightweight trace dicts
      for fast repeated lookup during metric computation.

  ``compute_metrics_for_template(template_norm, activities, trace_cache, cardinality)``
      Dispatches to the appropriate per-template handler and returns a
      standardised metrics dict.

All other functions in this module are private per-template handlers.  They
follow a uniform interface: ``(a, b, trace_cache) → metrics_dict`` and are
only called through ``compute_metrics_for_template``.
"""


def build_trace_cache(log) -> list:
    """Pre-compute per-trace activity lookups from a pm4py EventLog.

    Converts each trace into a dict of pre-indexed structures so that
    metric computation functions can perform O(1) lookups instead of
    scanning the activity list repeatedly.

    Args:
        log: A pm4py ``EventLog`` instance.

    Returns:
        List of trace dicts, one per case, each containing:

        - ``activities``: ordered list of activity name strings
        - ``positions``: ``{activity: [index, ...]}`` mapping
        - ``counts``: ``{activity: occurrence_count}`` mapping
        - ``first``: ``{activity: first_occurrence_index}`` mapping
        - ``last``: ``{activity: last_occurrence_index}`` mapping
    """
    traces = []
    for trace in log:
        activities = [str(evt.get("concept:name")) for evt in trace]
        positions = {}
        for idx, act in enumerate(activities):
            positions.setdefault(act, []).append(idx)

        counts = {act: len(pos) for act, pos in positions.items()}
        first = {act: pos[0] for act, pos in positions.items()}
        last = {act: pos[-1] for act, pos in positions.items()}

        traces.append({
            "activities": activities,
            "positions": positions,
            "counts": counts,
            "first": first,
            "last": last,
        })
    return traces


def compute_metrics_for_template(
    template_norm: str,
    activities: list,
    trace_cache: list,
    cardinality: int | None = None,
) -> dict | None:
    """Dispatch to the appropriate handler and return a standardised metrics dict.

    Selects a unary or binary handler based on ``template_norm`` and
    ``activities``, invokes it against ``trace_cache``, and returns the
    resulting metrics.  Returns ``None`` for unrecognised templates or
    when ``activities`` is empty.

    Args:
        template_norm: Lowercase, digit-free template name
                       (e.g. ``"response"``, ``"existence"``).
        activities:    List of activity name strings (1 for unary, 2 for binary).
        trace_cache:   Pre-built trace cache from ``build_trace_cache()``.
        cardinality:   Numeric bound for unary templates (``Existence``,
                       ``Absence``, ``Exactly``); ``None`` for binary templates.

    Returns:
        Dict with keys ``support``, ``confidence``, ``trace_count``,
        ``support_count``, ``violation_count``, ``activation_count``,
        ``fulfillment_count``, ``activation_trace_count``;
        or ``None`` if the template is not recognised.
    """
    if len(activities) == 0:
        return None

    # Unary templates
    if template_norm in {"existence", "absence", "exactly", "init", "end"}:
        return compute_unary_metrics(template_norm, activities[0], trace_cache, cardinality)

    # Binary templates
    if len(activities) < 2:
        return None

    a, b = activities[0], activities[1]

    template_handlers = {
        "response": compute_response,
        "precedence": compute_precedence,
        "succession": compute_succession,
        "chainresponse": compute_chain_response,
        "chainprecedence": compute_chain_precedence,
        "chainsuccession": compute_chain_succession,
        "alternateresponse": compute_alternate_response,
        "alternateprecedence": compute_alternate_precedence,
        "alternatesuccession": compute_alternate_succession,
        "notresponse": compute_not_response,
        "notrespondedexistence": compute_not_response,
        "notprecedence": compute_not_precedence,
        "notsuccession": compute_not_succession,
        "notchainresponse": compute_not_chain_response,
        "notchainprecedence": compute_not_chain_precedence,
        "notchainsuccession": compute_not_chain_succession,
        "choice": compute_choice,
        "exclusivechoice": compute_exclusive_choice,
        "coexistence": compute_coexistence,
        "notcoexistence": compute_not_coexistence,
        "respondedexistence": compute_responded_existence,
    }

    handler = template_handlers.get(template_norm)
    if not handler:
        return None

    return handler(a, b, trace_cache)


def compute_unary_metrics(template_norm, activity, trace_cache, cardinality):
    """Compute metrics for unary templates (Existence, Absence, etc.)."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = trace_count
    fulfillment_count = 0
    activation_trace_count = trace_count

    for trace in trace_cache:
        count = trace["counts"].get(activity, 0)

        if template_norm == "existence":
            n = cardinality if cardinality else 1
            satisfied = count >= n
            if satisfied:
                support_count += 1
                fulfillment_count += 1

        elif template_norm == "absence":
            n = cardinality if cardinality else 1
            satisfied = count < n
            if satisfied:
                support_count += 1
                fulfillment_count += 1

        elif template_norm == "exactly":
            n = cardinality if cardinality else 1
            satisfied = count == n
            if satisfied:
                support_count += 1
                fulfillment_count += 1

        elif template_norm == "init":
            first_activity = trace["activities"][0] if trace["activities"] else None
            satisfied = first_activity == activity
            if satisfied:
                support_count += 1
                fulfillment_count += 1

        elif template_norm == "end":
            last_activity = trace["activities"][-1] if trace["activities"] else None
            satisfied = last_activity == activity
            if satisfied:
                support_count += 1
                fulfillment_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_response(a, b, trace_cache):
    """Response(A,B): if A occurs, eventually B must occur after."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_a = trace["positions"].get(a, [])
        last_b = trace["last"].get(b, None)

        if positions_a:
            activation_trace_count += 1
        activation_count += len(positions_a)

        fulfilled_a = 0
        if positions_a and last_b is not None:
            for pos_a in positions_a:
                if last_b > pos_a:
                    fulfilled_a += 1

        trace_satisfied = (fulfilled_a == len(positions_a)) if positions_a else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_a

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_precedence(a, b, trace_cache):
    """Precedence(A,B): if B occurs, A must have occurred before."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_b = trace["positions"].get(b, [])
        first_a = trace["first"].get(a, None)

        if positions_b:
            activation_trace_count += 1
        activation_count += len(positions_b)

        fulfilled_b = 0
        if positions_b and first_a is not None:
            for pos_b in positions_b:
                if first_a < pos_b:
                    fulfilled_b += 1

        trace_satisfied = (fulfilled_b == len(positions_b)) if positions_b else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_b

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_succession(a, b, trace_cache):
    """Succession(A,B): combination of Response and Precedence."""
    response_metrics = compute_response(a, b, trace_cache)
    precedence_metrics = compute_precedence(a, b, trace_cache)

    trace_count = len(trace_cache)
    support_count = 0

    for i, trace in enumerate(trace_cache):
        response_ok = (i < response_metrics["support_count"])
        precedence_ok = (i < precedence_metrics["support_count"])
        if response_ok and precedence_ok:
            support_count += 1

    activation_count = response_metrics["activation_count"] + precedence_metrics["activation_count"]
    fulfillment_count = response_metrics["fulfillment_count"] + precedence_metrics["fulfillment_count"]

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": max(response_metrics["activation_trace_count"],
                                      precedence_metrics["activation_trace_count"]),
    }


def compute_chain_response(a, b, trace_cache):
    """ChainResponse(A,B): if A occurs, B must immediately follow."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        acts = trace["activities"]
        positions_a = trace["positions"].get(a, [])

        if positions_a:
            activation_trace_count += 1
        activation_count += len(positions_a)

        fulfilled_a = 0
        for pos_a in positions_a:
            if pos_a + 1 < len(acts) and acts[pos_a + 1] == b:
                fulfilled_a += 1

        trace_satisfied = (fulfilled_a == len(positions_a)) if positions_a else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_a

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_chain_precedence(a, b, trace_cache):
    """ChainPrecedence(A,B): if B occurs, A must immediately precede."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        acts = trace["activities"]
        positions_b = trace["positions"].get(b, [])

        if positions_b:
            activation_trace_count += 1
        activation_count += len(positions_b)

        fulfilled_b = 0
        for pos_b in positions_b:
            if pos_b - 1 >= 0 and acts[pos_b - 1] == a:
                fulfilled_b += 1

        trace_satisfied = (fulfilled_b == len(positions_b)) if positions_b else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_b

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_chain_succession(a, b, trace_cache):
    """ChainSuccession(A,B): combination of ChainResponse and ChainPrecedence."""
    chain_response_metrics = compute_chain_response(a, b, trace_cache)
    chain_precedence_metrics = compute_chain_precedence(a, b, trace_cache)

    trace_count = len(trace_cache)
    support_count = 0

    for i in range(trace_count):
        response_ok = (i < chain_response_metrics["support_count"])
        precedence_ok = (i < chain_precedence_metrics["support_count"])
        if response_ok and precedence_ok:
            support_count += 1

    activation_count = chain_response_metrics["activation_count"] + chain_precedence_metrics["activation_count"]
    fulfillment_count = chain_response_metrics["fulfillment_count"] + chain_precedence_metrics["fulfillment_count"]

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": max(chain_response_metrics["activation_trace_count"],
                                      chain_precedence_metrics["activation_trace_count"]),
    }


def compute_alternate_response(a, b, trace_cache):
    """AlternateResponse(A,B): between each A, there must be a B before next A."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_a = trace["positions"].get(a, [])
        positions_b = trace["positions"].get(b, [])

        if positions_a:
            activation_trace_count += 1
        activation_count += len(positions_a)

        fulfilled_a = 0
        for idx, pos_a in enumerate(positions_a):
            next_a = positions_a[idx + 1] if idx + 1 < len(positions_a) else len(trace["activities"])
            has_b = any(pos_a < pos_b < next_a for pos_b in positions_b)
            if has_b:
                fulfilled_a += 1

        trace_satisfied = (fulfilled_a == len(positions_a)) if positions_a else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_a

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_alternate_precedence(a, b, trace_cache):
    """AlternatePrecedence(A,B): between each B, there must be an A before next B."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_b = trace["positions"].get(b, [])
        positions_a = trace["positions"].get(a, [])

        if positions_b:
            activation_trace_count += 1
        activation_count += len(positions_b)

        fulfilled_b = 0
        for idx, pos_b in enumerate(positions_b):
            prev_b = positions_b[idx - 1] if idx > 0 else -1
            has_a = any(prev_b < pos_a < pos_b for pos_a in positions_a)
            if has_a:
                fulfilled_b += 1

        trace_satisfied = (fulfilled_b == len(positions_b)) if positions_b else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_b

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_alternate_succession(a, b, trace_cache):
    """AlternateSuccession(A,B): combination of AlternateResponse and AlternatePrecedence."""
    alt_response = compute_alternate_response(a, b, trace_cache)
    alt_precedence = compute_alternate_precedence(a, b, trace_cache)

    trace_count = len(trace_cache)
    support_count = 0

    for i in range(trace_count):
        response_ok = (i < alt_response["support_count"])
        precedence_ok = (i < alt_precedence["support_count"])
        if response_ok and precedence_ok:
            support_count += 1

    activation_count = alt_response["activation_count"] + alt_precedence["activation_count"]
    fulfillment_count = alt_response["fulfillment_count"] + alt_precedence["fulfillment_count"]

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": max(alt_response["activation_trace_count"],
                                      alt_precedence["activation_trace_count"]),
    }


def compute_not_response(a, b, trace_cache):
    """NotResponse(A,B): if A occurs, B must not occur after."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_a = trace["positions"].get(a, [])
        last_b = trace["last"].get(b, None)

        if positions_a:
            activation_trace_count += 1
        activation_count += len(positions_a)

        fulfilled_a = 0
        for pos_a in positions_a:
            if last_b is None or last_b <= pos_a:
                fulfilled_a += 1

        trace_satisfied = (fulfilled_a == len(positions_a)) if positions_a else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_a

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_not_precedence(a, b, trace_cache):
    """NotPrecedence(A,B): if B occurs, A must not have occurred before."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_b = trace["positions"].get(b, [])
        first_a = trace["first"].get(a, None)

        if positions_b:
            activation_trace_count += 1
        activation_count += len(positions_b)

        fulfilled_b = 0
        for pos_b in positions_b:
            if first_a is None or first_a >= pos_b:
                fulfilled_b += 1

        trace_satisfied = (fulfilled_b == len(positions_b)) if positions_b else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_b

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_not_succession(a, b, trace_cache):
    """NotSuccession(A,B): NotResponse and NotPrecedence together.

    A trace satisfies NotSuccession(A,B) only if it satisfies both
    NotResponse(A,B) (no B after any A) and NotPrecedence(A,B) (no A before
    any B).  Iterates over each trace once to compute per-trace satisfaction
    for both sub-constraints simultaneously.

    ``activation_trace_count`` counts traces where A or B occurs because
    NotResponse is activated by A and NotPrecedence is activated by B;
    either sub-constraint can be activated independently.
    """
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        positions_a = trace["positions"].get(a, [])
        positions_b = trace["positions"].get(b, [])
        last_b = trace["last"].get(b)
        first_a = trace["first"].get(a)

        # NotResponse: for each A, no B may occur after.
        nr_acts = len(positions_a)
        nr_fulfilled = sum(
            1 for pos_a in positions_a
            if last_b is None or last_b <= pos_a
        )
        nr_satisfied = (nr_fulfilled == nr_acts)

        # NotPrecedence: for each B, no A may have occurred before.
        np_acts = len(positions_b)
        np_fulfilled = sum(
            1 for pos_b in positions_b
            if first_a is None or first_a >= pos_b
        )
        np_satisfied = (np_fulfilled == np_acts)

        if nr_acts > 0 or np_acts > 0:
            activation_trace_count += 1

        activation_count += nr_acts + np_acts
        fulfillment_count += nr_fulfilled + np_fulfilled

        if nr_satisfied and np_satisfied:
            support_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_not_chain_response(a, b, trace_cache):
    """NotChainResponse(A,B): if A occurs, B must not immediately follow."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        acts = trace["activities"]
        positions_a = trace["positions"].get(a, [])

        if positions_a:
            activation_trace_count += 1
        activation_count += len(positions_a)

        fulfilled_a = 0
        for pos_a in positions_a:
            if not (pos_a + 1 < len(acts) and acts[pos_a + 1] == b):
                fulfilled_a += 1

        trace_satisfied = (fulfilled_a == len(positions_a)) if positions_a else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_a

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_not_chain_precedence(a, b, trace_cache):
    """NotChainPrecedence(A,B): if B occurs, A must not immediately precede."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        acts = trace["activities"]
        positions_b = trace["positions"].get(b, [])

        if positions_b:
            activation_trace_count += 1
        activation_count += len(positions_b)

        fulfilled_b = 0
        for pos_b in positions_b:
            if not (pos_b - 1 >= 0 and acts[pos_b - 1] == a):
                fulfilled_b += 1

        trace_satisfied = (fulfilled_b == len(positions_b)) if positions_b else True
        if trace_satisfied:
            support_count += 1
        fulfillment_count += fulfilled_b

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_not_chain_succession(a, b, trace_cache):
    """NotChainSuccession(A,B): NotChainResponse and NotChainPrecedence together.

    A trace satisfies NotChainSuccession(A,B) only if it satisfies both
    NotChainResponse(A,B) (B does not immediately follow any A) and
    NotChainPrecedence(A,B) (A does not immediately precede any B).
    Iterates over each trace once to compute per-trace satisfaction for both
    sub-constraints simultaneously.

    ``activation_trace_count`` counts traces where A or B occurs because
    NotChainResponse is activated by A and NotChainPrecedence is activated by B;
    either sub-constraint can be activated independently.
    """
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        acts = trace["activities"]
        positions_a = trace["positions"].get(a, [])
        positions_b = trace["positions"].get(b, [])

        # NotChainResponse: for each A, the immediately following event is not B.
        ncr_acts = len(positions_a)
        ncr_fulfilled = sum(
            1 for pos_a in positions_a
            if not (pos_a + 1 < len(acts) and acts[pos_a + 1] == b)
        )
        ncr_satisfied = (ncr_fulfilled == ncr_acts)

        # NotChainPrecedence: for each B, the immediately preceding event is not A.
        ncp_acts = len(positions_b)
        ncp_fulfilled = sum(
            1 for pos_b in positions_b
            if not (pos_b - 1 >= 0 and acts[pos_b - 1] == a)
        )
        ncp_satisfied = (ncp_fulfilled == ncp_acts)

        if ncr_acts > 0 or ncp_acts > 0:
            activation_trace_count += 1

        activation_count += ncr_acts + ncp_acts
        fulfillment_count += ncr_fulfilled + ncp_fulfilled

        if ncr_satisfied and ncp_satisfied:
            support_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_choice(a, b, trace_cache):
    """Choice(A,B): at least one of A or B must occur."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = trace_count
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        count_a = trace["counts"].get(a, 0)
        count_b = trace["counts"].get(b, 0)

        if count_a > 0 or count_b > 0:
            activation_trace_count += 1
            support_count += 1
            fulfillment_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_exclusive_choice(a, b, trace_cache):
    """ExclusiveChoice(A,B): exactly one of A or B must occur, not both."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = trace_count
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        count_a = trace["counts"].get(a, 0)
        count_b = trace["counts"].get(b, 0)

        if count_a > 0 or count_b > 0:
            activation_trace_count += 1

        satisfied = (count_a > 0) ^ (count_b > 0)
        if satisfied:
            support_count += 1
            fulfillment_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_coexistence(a, b, trace_cache):
    """CoExistence(A,B): both A and B must occur together or neither."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = trace_count
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        count_a = trace["counts"].get(a, 0)
        count_b = trace["counts"].get(b, 0)

        if count_a > 0 or count_b > 0:
            activation_trace_count += 1

        satisfied = (count_a > 0) == (count_b > 0)
        if satisfied:
            support_count += 1
            fulfillment_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_not_coexistence(a, b, trace_cache):
    """NotCoExistence(A,B): A and B cannot both occur."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = trace_count
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        count_a = trace["counts"].get(a, 0)
        count_b = trace["counts"].get(b, 0)

        if count_a > 0 or count_b > 0:
            activation_trace_count += 1

        satisfied = not (count_a > 0 and count_b > 0)
        if satisfied:
            support_count += 1
            fulfillment_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }


def compute_responded_existence(a, b, trace_cache):
    """RespondedExistence(A,B): if A occurs, B must occur (before or after)."""
    trace_count = len(trace_cache)
    support_count = 0
    activation_count = 0
    fulfillment_count = 0
    activation_trace_count = 0

    for trace in trace_cache:
        count_a = trace["counts"].get(a, 0)
        count_b = trace["counts"].get(b, 0)

        if count_a > 0:
            activation_trace_count += 1
        activation_count += count_a

        fulfilled_a = count_a if count_b > 0 else 0
        fulfillment_count += fulfilled_a

        trace_satisfied = (count_a == 0) or (count_b > 0)
        if trace_satisfied:
            support_count += 1

    support = support_count / trace_count if trace_count > 0 else 0.0
    confidence = fulfillment_count / activation_count if activation_count > 0 else 1.0

    return {
        "support": support,
        "confidence": confidence,
        "trace_count": trace_count,
        "support_count": support_count,
        "violation_count": trace_count - support_count,
        "activation_count": activation_count,
        "fulfillment_count": fulfillment_count,
        "activation_trace_count": activation_trace_count,
    }
