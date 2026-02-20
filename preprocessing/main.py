"""
Pipeline orchestrator for data preprocessing.

Applies sequence of transformations to raw activity logs:
    1. Parse datetime strings to pd.Timestamp
    2. Filter out anonymized/unknown rows
    3. Merge consecutive events (<1min apart, same activity)
    4. Detect behavioral day boundaries via gap analysis
    5. Generate case IDs for process mining
    6. Normalize and combine activity labels (app + URL)
    7. Format timestamps
    8. Select output columns

Usage:
    python -m preprocessing.main --raw_csv <input.csv> --out_csv <output.csv>
"""

import pandas as pd
from pathlib import Path

from .day_split import assign_day_counter, build_case_id
from .transforms import (
    parse_datetime_columns,
    filter_anonymized_rows,
    merge_consecutive_events,
    build_activity_column,
    build_timestamp_column,
    select_output_columns,
)


def main(raw_csv: str, out_csv: str):
    raw_path = Path(raw_csv)
    out_path = Path(out_csv)

    df = pd.read_csv(raw_path)
    df = parse_datetime_columns(df)
    df = filter_anonymized_rows(df)
    df = merge_consecutive_events(df)
    df = assign_day_counter(df)
    df = build_case_id(df)
    df = build_activity_column(df)
    df = build_timestamp_column(df)

    df = select_output_columns(df)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--raw_csv", required=True)
    p.add_argument("--out_csv", required=True)
    args = p.parse_args()
    main(args.raw_csv, args.out_csv)
