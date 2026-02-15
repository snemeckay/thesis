"""
Behavioral day boundary detection using multi-phase gap analysis.

Core logic for splitting events into behavioral days via intelligent gap detection.
Implements three-phase strategy: waking window gaps (primary) → night window gaps (fallback) →
late-sleep window gaps (last resort).

Functions:
    assign_day_counter() - Detect day boundaries and assign day counter to each event
    build_case_id() - Generate case IDs in format {user_id}_{date}
"""

import pandas as pd

from .constants import (
    RAW_COL_USER,
    RAW_COL_START,
    RAW_COL_END,
    WAKING_WINDOW_START,
    WAKING_WINDOW_END,
    NIGHT_WINDOW_START,
    NIGHT_WINDOW_END,
    LATE_SLEEP_START,
    LATE_SLEEP_END,
    MIN_INACTIVITY_GAP_HOURS,
)


def _is_gap_ending_in_waking_window(gap_end_time: pd.Timestamp) -> bool:
    """Return True if the gap END time (next event start) falls in waking window (4am-noon)."""
    hour = gap_end_time.hour
    return WAKING_WINDOW_START <= hour < WAKING_WINDOW_END


def _is_gap_ending_in_night_window(gap_end_time: pd.Timestamp) -> bool:
    """Return True if the gap END time (next event start) falls in night window (8pm-4am)."""
    hour = gap_end_time.hour
    return (hour >= NIGHT_WINDOW_START) or (hour < NIGHT_WINDOW_END)


def _is_gap_starting_in_late_sleep_window(gap_start_time: pd.Timestamp) -> bool:
    """Return True if the gap START time (prev event end) falls in late-sleep window."""
    hour = gap_start_time.hour
    return LATE_SLEEP_START <= hour < LATE_SLEEP_END


def _night_window_end_times_within_gap(
    prev_end: pd.Timestamp, curr_start: pd.Timestamp
) -> list[pd.Timestamp]:
    """Return all night-window end timestamps (04:00) that fall within the gap."""
    if curr_start <= prev_end:
        return []

    if prev_end.hour < NIGHT_WINDOW_END:
        first = prev_end.normalize() + pd.Timedelta(hours=NIGHT_WINDOW_END)
    else:
        first = prev_end.normalize() + pd.Timedelta(days=1, hours=NIGHT_WINDOW_END)

    boundaries: list[pd.Timestamp] = []
    boundary = first
    while boundary <= curr_start:
        boundaries.append(boundary)
        boundary += pd.Timedelta(days=1)

    return boundaries


def assign_day_counter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Assign behavioral days based on longest inactivity gaps.

     Algorithm (three-phase, per date):
     1. PRIMARY: gaps >= min threshold ending in waking window (4am-noon)
     2. FALLBACK: if none for a date, use gaps overlapping the night window (8pm-4am)
         and place boundaries at night-window end (04:00) within the gap
     3. LAST RESORT: if still none for a date, use gaps starting in late-sleep window
         and place boundary at gap start
     4. For each calendar date, select the longest candidate gap
     5. Use chosen boundary timestamps as day boundaries
     6. Assign each event to the day containing its start time
    """
    df = df.sort_values([RAW_COL_USER, RAW_COL_START]).reset_index(drop=True).copy()
    df["day_counter"] = 0

    for _, idx in df.groupby(RAW_COL_USER).groups.items():
        indices = list(idx)
        if len(indices) < 2:
            # Single event: it's day 0
            for i in indices:
                df.at[i, "day_counter"] = 0
            continue

        # Collect candidate gaps per date
        waking_candidates: dict[pd.Timestamp, list[tuple[pd.Timestamp, float]]] = {}
        night_candidates: dict[pd.Timestamp, list[tuple[pd.Timestamp, float]]] = {}
        late_sleep_candidates: dict[pd.Timestamp, list[tuple[pd.Timestamp, float]]] = {}

        for pos in range(1, len(indices)):
            prev_i = indices[pos - 1]
            curr_i = indices[pos]
            prev_end = df.at[prev_i, RAW_COL_END]
            curr_start = df.at[curr_i, RAW_COL_START]
            gap_length = curr_start - prev_end
            gap_hours = gap_length.total_seconds() / 3600

            if gap_hours >= MIN_INACTIVITY_GAP_HOURS:
                if _is_gap_ending_in_waking_window(curr_start):
                    waking_candidates.setdefault(curr_start.date(), []).append(
                        (curr_start, gap_hours)
                    )

                if _is_gap_ending_in_night_window(curr_start):
                    night_candidates.setdefault(curr_start.date(), []).append(
                        (curr_start, gap_hours)
                    )

                for boundary_ts in _night_window_end_times_within_gap(prev_end, curr_start):
                    night_candidates.setdefault(boundary_ts.date(), []).append(
                        (boundary_ts, gap_hours)
                    )

                if _is_gap_starting_in_late_sleep_window(prev_end):
                    late_sleep_candidates.setdefault(prev_end.date(), []).append(
                        (prev_end, gap_hours)
                    )

        # choose candidates per date: waking if available else night
        all_dates = (
            set(waking_candidates.keys())
            | set(night_candidates.keys())
            | set(late_sleep_candidates.keys())
        )
        if not all_dates:
            for i in indices:
                df.at[i, "day_counter"] = 0
            continue

        boundaries: dict[pd.Timestamp, tuple[pd.Timestamp, float]] = {}
        for date in all_dates:
            candidates = (
                waking_candidates.get(date)
                or night_candidates.get(date)
                or late_sleep_candidates.get(date)
                or []
            )
            if not candidates:
                continue

            # pick longest gap for this date
            best = max(candidates, key=lambda x: x[1])
            boundaries[date] = best

        # sort boundaries by timestamp
        sorted_boundaries = sorted([ts for ts, _ in boundaries.values()])

        # assign events to days based on which interval their start_time falls into
        for event_idx in indices:
            event_start = df.at[event_idx, RAW_COL_START]
            day_num = 0
            for boundary in sorted_boundaries:
                if event_start >= boundary:
                    day_num += 1
            df.at[event_idx, "day_counter"] = day_num

    return df


def build_case_id(df: pd.DataFrame) -> pd.DataFrame:
    first_times = (
        df.groupby([RAW_COL_USER, "day_counter"])[RAW_COL_START]
        .min()
        .rename("case_start")
        .reset_index()
    )
    first_times["case_date"] = first_times["case_start"].dt.date.astype(str)
    df = df.merge(
        first_times[[RAW_COL_USER, "day_counter", "case_date"]],
        on=[RAW_COL_USER, "day_counter"],
        how="left",
    )
    df["case_id"] = df[RAW_COL_USER].astype(str) + "_" + df["case_date"].astype(str)
    df = df.drop(columns=["case_date"])
    return df
