"""Data transformation functions for preprocessing pipeline.

Individual transformation steps applied in sequence:
    - parse_datetime_columns() - Convert timestamp strings to pd.Timestamp
    - filter_anonymized_rows() - Remove rows with unknown/redacted URLs
    - build_activity_column() - Combine app + URL into unified activity label
    - build_timestamp_column() - Format timestamps
    - select_output_columns() - Filter to output schema
"""

import pandas as pd

from .constants import RAW_COL_START, RAW_COL_END, RAW_COL_APP, RAW_COL_URL, OUTPUT_COLS


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


def build_activity_column(df: pd.DataFrame) -> pd.DataFrame:
    df["activity_clean"] = df[RAW_COL_APP].astype(str) + "/" + df[RAW_COL_URL].astype(str)
    return df


def build_timestamp_column(df: pd.DataFrame) -> pd.DataFrame:
    df["timestamp"] = df[RAW_COL_START]
    return df


def select_output_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in OUTPUT_COLS if c in df.columns]
    return df[cols]
