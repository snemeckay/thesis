"""Explicit, loss-aware CSV normalization, independent of mining libraries."""

import csv
import hashlib
import io
import json
import math
from datetime import datetime, timedelta, timezone


class ValidationError(ValueError):
    """A data or configuration problem a researcher can correct."""


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     allow_nan=False).encode("utf-8")).hexdigest()


def read_csv(text, delimiter=None):
    if delimiter is None:
        try:
            delimiter = csv.Sniffer().sniff(text[:65536], delimiters=",;\t|").delimiter
        except csv.Error as exc:
            raise ValidationError("Could not suggest a delimiter. Select one explicitly.") from exc
    if delimiter not in (",", ";", "\t", "|"):
        raise ValidationError("Choose comma, semicolon, tab, or pipe as delimiter.")
    reader = csv.reader(io.StringIO(text.lstrip("\ufeff")), delimiter=delimiter, strict=True)
    try:
        headers = next(reader)
        if not headers or any(not h.strip() for h in headers) or len(set(headers)) != len(headers):
            raise ValidationError("Column names must be nonempty and unique.")
        rows = []
        for number, values in enumerate(reader, 2):
            if not values or all(not v.strip() for v in values):
                continue
            if len(values) != len(headers):
                raise ValidationError(f"CSV record {number} has {len(values)} fields; expected {len(headers)}.")
            rows.append(dict(zip(headers, (v.strip() for v in values))))
    except (csv.Error, StopIteration) as exc:
        raise ValidationError(f"Invalid or empty CSV: {exc}") from exc
    if not rows:
        raise ValidationError("The CSV has no event rows.")
    return headers, rows, delimiter


def timestamp(value):
    if not value:
        raise ValidationError("Missing timestamp.")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"Timestamp {value!r} is not ISO date/time (for example 2021-05-28 05:48:27).") from exc
    return result.astimezone(timezone.utc) if result.tzinfo else result


def typed(value, kind):
    if value == "":
        return None
    if kind == "string":
        return value
    if kind == "number":
        try:
            number = float(value)
        except ValueError as exc:
            raise ValidationError(f"{value!r} is not a number.") from exc
        if not math.isfinite(number):
            raise ValidationError("Numbers must be finite.")
        return number
    if kind == "boolean":
        if value.lower() not in {"true", "false", "1", "0"}:
            raise ValidationError(f"{value!r} is not true/false or 1/0.")
        return value.lower() in {"true", "1"}
    raise ValidationError("Attribute type must be string, number, or boolean.")


def preview(text, delimiter=None):
    headers, rows, delimiter = read_csv(text, delimiter)
    columns = []
    for header in headers:
        values = [r[header] for r in rows if r[header]]
        suggestion = "string"
        for kind in ("number", "boolean"):
            try:
                if values and all(typed(v, kind) is not None for v in values):
                    suggestion = kind
                    break
            except ValidationError:
                pass
        columns.append({"name": header, "suggested_type": suggestion,
                        "missing": len(rows) - len(values), "distinct": len(set(values))})
    return {"delimiter": delimiter, "columns": columns, "rows": rows[:12], "event_count": len(rows)}


def behavioural_segments(events):
    """Reuse the original day splitter without its fixed input schema or case-ID builder."""
    try:
        import pandas as pd
    except ImportError as exc:
        raise ValidationError("Behavioural days require pandas. Install the local app requirements.") from exc
    from preprocessing.constants import RAW_COL_USER, RAW_COL_START, RAW_COL_END
    from preprocessing.day_split import assign_day_counter

    frame = pd.DataFrame([{
        RAW_COL_USER: "group", RAW_COL_START: timestamp(e["timestamp"]),
        RAW_COL_END: timestamp(e["end_timestamp"]), "source_record": e["source_record"],
    } for e in events])
    result = assign_day_counter(frame)
    return {int(row["source_record"]): str(row["day_counter"]) for row in result.to_dict("records")}


def normalize(text, profile):
    headers, rows, delimiter = read_csv(text, profile.get("delimiter"))
    case_columns = profile.get("case_columns", [])
    if not isinstance(case_columns, list) or not case_columns or any(not isinstance(c, str) for c in case_columns) or len(set(case_columns)) != len(case_columns):
        raise ValidationError("Explicitly choose one or more distinct participant/group columns, normally a participant ID.")
    activity = profile.get("activity")
    start = profile.get("timestamp")
    end = profile.get("end_timestamp") or None
    category = profile.get("activity_category") or None
    attrs = profile.get("attributes", [])
    if not isinstance(attrs, list) or any(not isinstance(a, dict) for a in attrs):
        raise ValidationError("Attributes must be a list of column/type/scope definitions.")
    attr_columns = [a.get("column") for a in attrs]
    selected = case_columns + [activity, start] + ([end] if end else []) + ([category] if category else []) + attr_columns
    if any(not isinstance(c, str) or c not in headers for c in selected):
        raise ValidationError("Every selected column must exist in this CSV.")
    if len(set(attr_columns)) != len(attr_columns):
        raise ValidationError("An attribute column may be retained only once.")
    for attr in attrs:
        if attr.get("scope") not in ("case", "event") or attr.get("type") not in ("string", "number", "boolean"):
            raise ValidationError("Choose a type and case/event scope for each retained attribute.")
    missing = profile.get("missing", "error")
    conflicts = profile.get("case_conflicts", "error")
    if missing not in ("error", "exclude_case", "keep_attributes") or conflicts not in ("error", "exclude_case"):
        raise ValidationError("Choose explicit missing-value and case-conflict handling.")
    mode = profile.get("case_mode", "group")
    if mode not in ("group", "calendar_day", "gap", "behavioural_day"):
        raise ValidationError("Choose all events together, calendar days, inactivity sessions, or behavioural days.")
    if mode == "behavioural_day" and not end:
        raise ValidationError("Behavioural days require an event end-time column to detect inactivity gaps.")
    gap = profile.get("gap_minutes", 60)
    day_hour = profile.get("day_start_hour", 0)
    merge = profile.get("merge_gap_seconds", 0)
    if mode == "gap" and (not isinstance(gap, (int, float)) or isinstance(gap, bool) or not math.isfinite(gap) or gap <= 0):
        raise ValidationError("Session gap must be a positive number of minutes.")
    if mode == "calendar_day" and (not isinstance(day_hour, int) or isinstance(day_hour, bool) or not 0 <= day_hour <= 23):
        raise ValidationError("Day start must be an integer hour from 0 to 23.")
    if not isinstance(merge, (int, float)) or isinstance(merge, bool) or not math.isfinite(merge) or merge < 0:
        raise ValidationError("Merge gap must be zero (disabled) or a positive number of seconds.")
    exclusions = profile.get("exclude_activities", [])
    if not isinstance(exclusions, list) or any(not isinstance(v, str) for v in exclusions):
        raise ValidationError("Excluded activities must be a list of exact labels.")
    grouped = {}
    excluded_groups = set()
    removed_events = 0
    awareness = set()
    for i, row in enumerate(rows, 2):
        group = tuple(row[c] for c in case_columns)
        if any(not v for v in group):
            raise ValidationError(f"Record {i}: case/group identifiers cannot be missing.")
        try:
            if not row[activity] or (category and not row[category]):
                raise ValidationError("Activity or mapped activity category is missing.")
            if any(token in row[activity] for token in ("|", "->", ";")) or (
                    category and any(token in row[category] for token in ("|", "->", ";"))):
                raise ValidationError("Activity/category labels cannot contain |, ->, or ; (legacy model separators).")
            at = timestamp(row[start])
            until = timestamp(row[end]) if end else at
            if bool(at.tzinfo) != bool(until.tzinfo) or until < at:
                raise ValidationError("End time must follow start time with the same timezone convention.")
            awareness.add(bool(at.tzinfo))
            attributes = {a["column"]: typed(row[a["column"]], a["type"]) for a in attrs}
            if any(v is None for v in attributes.values()) and missing != "keep_attributes":
                raise ValidationError("A retained attribute is missing.")
        except ValidationError as exc:
            if missing == "exclude_case":
                excluded_groups.add(group)
                continue
            raise ValidationError(f"Record {i}: {exc}") from exc
        if row[activity] in exclusions:
            removed_events += 1
            continue
        grouped.setdefault(group, []).append({
            "activity": row[activity], "activity_category": row[category] if category else None,
            "timestamp": at.isoformat(), "end_timestamp": until.isoformat(),
            "attributes": attributes, "source_record": i,
        })
    if len(awareness) > 1:
        raise ValidationError("Mixed timezone-aware and naive timestamps. Standardize the source timezone first.")
    events, cases = [], {}
    conflict_cases = 0
    merged_events = 0
    for group, group_events in sorted(grouped.items()):
        if group in excluded_groups:
            continue
        group_events.sort(key=lambda e: (e["timestamp"], e["source_record"]))
        behavioural = behavioural_segments(group_events) if mode == "behavioural_day" else None
        sessions = {}
        session = 0
        previous_end = None
        for event in group_events:
            at = timestamp(event["timestamp"])
            if mode == "behavioural_day":
                segment = behavioural[event["source_record"]]
            elif mode == "calendar_day":
                segment = (at - timedelta(hours=day_hour)).date().isoformat()
            elif mode == "gap":
                if previous_end is not None and (at - previous_end).total_seconds() > gap * 60:
                    session += 1
                segment = str(session)
            else:
                segment = "group"
            sessions.setdefault(segment, []).append(event)
            until = timestamp(event["end_timestamp"])
            previous_end = max(previous_end, until) if previous_end is not None else until
        for segment, session_events in sessions.items():
            case_id = json.dumps([*group, segment], ensure_ascii=False, separators=(",", ":"))
            case_attrs = {}
            conflict = False
            for attr in attrs:
                if attr["scope"] != "case":
                    continue
                values = {json.dumps(e["attributes"][attr["column"]]) for e in session_events}
                if len(values) != 1:
                    if conflicts == "error":
                        raise ValidationError(f"Case {case_id}: {attr['column']} changes within the case. Choose event scope or exclude conflicting cases.")
                    conflict = True
                else:
                    case_attrs[attr["column"]] = session_events[0]["attributes"][attr["column"]]
            if conflict:
                conflict_cases += 1
                continue
            cases[case_id] = {"attributes": case_attrs, "group": list(group), "segment": segment}
            merged = []
            for event in session_events:
                event["case_id"] = case_id
                if merge and merged:
                    prev = merged[-1]
                    seconds = (timestamp(event["timestamp"]) - timestamp(prev["end_timestamp"])).total_seconds()
                    if (0 <= seconds <= merge and prev["activity"] == event["activity"]
                            and prev["activity_category"] == event["activity_category"]
                            and prev["attributes"] == event["attributes"]):
                        prev["end_timestamp"] = max(prev["end_timestamp"], event["end_timestamp"])
                        merged_events += 1
                        continue
                merged.append(event)
            events.extend(merged)
    if not events:
        raise ValidationError("No complete cases remain after preparation. Review exclusions and missing-value handling.")
    metadata = {
        "schema_version": 1, "profile": {**profile, "delimiter": delimiter},
        "attributes": attrs, "category_available": bool(category),
        "time_convention": "UTC" if True in awareness else "naive source time",
        "quality": {"input_events": len(rows), "normalized_events": len(events), "cases": len(cases),
                    "excluded_groups": len(excluded_groups), "conflicting_cases": conflict_cases,
                    "removed_activity_events": removed_events, "merged_events": merged_events},
        "activity_categories": {},
    }
    if mode == "behavioural_day":
        from preprocessing import constants
        metadata["case_construction"] = {
            "algorithm": "preprocessing.day_split.assign_day_counter", "version": 1,
            "minimum_gap_hours": constants.MIN_INACTIVITY_GAP_HOURS,
            "waking_window": [constants.WAKING_WINDOW_START, constants.WAKING_WINDOW_END],
            "night_window": [constants.NIGHT_WINDOW_START, constants.NIGHT_WINDOW_END],
            "late_sleep_window": [constants.LATE_SLEEP_START, constants.LATE_SLEEP_END],
            "stage": "after exclusions, before optional merging",
        }
    for event in events:
        categories = metadata["activity_categories"].setdefault(event["activity"], [])
        if event["activity_category"] is not None and event["activity_category"] not in categories:
            categories.append(event["activity_category"])
    for categories in metadata["activity_categories"].values():
        categories.sort()
    return {"events": events, "cases": cases, "metadata": metadata}


def select_cohort(dataset, filters):
    """Select entire cases; event attributes use explicit any/all event quantifiers."""
    schema = {a["column"]: a for a in dataset["metadata"]["attributes"]}
    if not isinstance(filters, list):
        raise ValidationError("Cohort filters must be a list.")
    by_case = {}
    for event in dataset["events"]:
        by_case.setdefault(event["case_id"], []).append(event)
    selected = set(dataset["cases"])
    for condition in filters:
        if not isinstance(condition, dict) or not isinstance(condition.get("column"), str):
            raise ValidationError("Each cohort filter needs a retained column name.")
        column = condition.get("column")
        attr = schema.get(column)
        if attr is None:
            raise ValidationError("Cohort column must be a retained attribute.")
        op = condition.get("op")
        if op not in ("eq", "in", "range", "missing"):
            raise ValidationError("Choose equals, one of, range, or missing.")
        if op == "range":
            if attr["type"] != "number":
                raise ValidationError("Ranges require a numeric attribute.")
            bounds = condition.get("value")
            if not isinstance(bounds, list) or len(bounds) != 2 or any(
                    not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) for v in bounds) or bounds[0] > bounds[1]:
                raise ValidationError("Provide finite, ordered lower and upper numeric bounds.")
        if op == "in" and not isinstance(condition.get("value"), list):
            raise ValidationError("One-of requires a list of typed values.")
        if op in {"eq", "in"}:
            values = condition.get("value", []) if op == "in" else [condition.get("value")]
            for value in values:
                if (attr["type"] == "number" and (not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value))
                        or attr["type"] == "boolean" and not isinstance(value, bool)
                        or attr["type"] == "string" and not isinstance(value, str)):
                    raise ValidationError(f"Cohort values for {column} must match its retained {attr['type']} type; use 'missing' for null values.")
        def matches(value):
            if op == "missing":
                return value is None
            if op == "eq":
                return value == condition.get("value")
            if op == "in":
                return value in condition["value"]
            return value is not None and bounds[0] <= value <= bounds[1]
        if attr["scope"] == "case":
            selected &= {c for c, info in dataset["cases"].items() if matches(info["attributes"][column])}
        else:
            quantifier = condition.get("quantifier")
            if quantifier not in {"any", "all"}:
                raise ValidationError("Event attributes require any-event or all-events matching.")
            combine = any if quantifier == "any" else all
            selected &= {c for c, events in by_case.items() if combine(matches(e["attributes"][column]) for e in events)}
    if not selected:
        raise ValidationError("No complete cases match this cohort. Broaden the filters.")
    return [e for e in dataset["events"] if e["case_id"] in selected], len(selected)
