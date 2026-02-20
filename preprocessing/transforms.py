"""Data transformation functions for preprocessing pipeline.

Individual transformation steps applied in sequence:
    - parse_datetime_columns() - Convert timestamp strings to pd.Timestamp
    - filter_anonymized_rows() - Remove rows with unknown/redacted URLs
    - merge_consecutive_events() - Combine events <1 min apart with same activity
    - build_activity_column() - Combine app + URL into unified activity label
    - build_timestamp_column() - Format timestamps
    - select_output_columns() - Filter to output schema
"""

import pandas as pd

from .constants import (
    RAW_COL_START,
    RAW_COL_END,
    RAW_COL_APP,
    RAW_COL_URL,
    RAW_COL_USER,
    OUTPUT_COLS,
)


def parse_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
    df[RAW_COL_START] = pd.to_datetime(df[RAW_COL_START], format="mixed")
    df[RAW_COL_END] = pd.to_datetime(df[RAW_COL_END], format="mixed")
    return df


def filter_anonymized_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Remove rows with anonymized/unknown URLs.

    Filters out rows where url3 is 'anonymized' or empty/null,
    keeping only rows with known, identifiable URLs.

    Returns:
        DataFrame with anonymized rows removed
    """
    before_count = len(df)

    df = df[df[RAW_COL_URL].notna()]  # remove null values
    df = df[df[RAW_COL_URL].astype(str).str.strip() != ""]  # remove empty strings
    df = df[df[RAW_COL_URL].astype(str).str.lower() != "anonymized"]  # remove 'anonymized'

    after_count = len(df)
    removed_count = before_count - after_count
    if removed_count > 0:
        print(f"[INFO] Filtered out {removed_count} anonymized rows ({100*removed_count/before_count:.1f}% of data)")

    return df


def merge_consecutive_events(df: pd.DataFrame) -> pd.DataFrame:
    """Merge consecutive events with same activity and <1 minute gap.

    Combines fragmented events (e.g., from multiple watchers) that:
    - Have the same user_id, app_in_focus, and url3
    - Have less than 1 minute gap between them

    Merges by extending end_time to last event's end_time and summing durations.

    Returns:
        DataFrame with consecutive events merged
    """
    if df.empty:
        return df

    df = df.sort_values([RAW_COL_USER, RAW_COL_APP, RAW_COL_URL, RAW_COL_START]).reset_index(drop=True)

    prev_end = df.groupby([RAW_COL_USER, RAW_COL_APP, RAW_COL_URL])[RAW_COL_END].shift()
    df["gap_seconds"] = (df[RAW_COL_START] - prev_end).dt.total_seconds()

    is_boundary = prev_end.isna() | (df["gap_seconds"] > 60)

    df["merge_group"] = is_boundary.cumsum()

    merged_data = []
    for group_id, group in df.groupby("merge_group"):
        merged_row = group.iloc[0].copy()
        merged_row[RAW_COL_END] = group.iloc[-1][RAW_COL_END]  # Extend to last event
        if "duration_secs" in merged_row.index:
            merged_row["duration_secs"] = (
                merged_row[RAW_COL_END] - merged_row[RAW_COL_START]
            ).total_seconds()
        merged_data.append(merged_row)

    merged_df = pd.DataFrame(merged_data).reset_index(drop=True)

    merged_df = merged_df.drop(columns=["gap_seconds", "merge_group"], errors="ignore")

    before_count = len(df)
    after_count = len(merged_df)
    merged_count = before_count - after_count

    if merged_count > 0:
        print(f"[INFO] Merged {merged_count} consecutive events ({100*merged_count/before_count:.1f}% reduction)")

    return merged_df


def build_activity_column(df: pd.DataFrame) -> pd.DataFrame:
    df["activity_clean"] = df[RAW_COL_APP].astype(str) + "/" + df[RAW_COL_URL].astype(str)
    return df


def build_timestamp_column(df: pd.DataFrame) -> pd.DataFrame:
    df["timestamp"] = df[RAW_COL_START]
    return df


def select_output_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in OUTPUT_COLS if c in df.columns]
    return df[cols]
