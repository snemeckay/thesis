import pandas as pd
from pathlib import Path

from config import MIN_DURATION_SECONDS, ACTIVITY_CLEAN_REGEX

from categorization import categorize_activity_row, mark_idle
from extractors import extract_web_events, extract_window_events
from helpers import load_json

def preprocess_activitywatch(json_path, export_csv_path):
    """
    Preprocessing pipeline:
    - load JSON
    - extract & merge events from window + web watchers
    - filter micro-events
    - idle detection
    - per-day case notion
    - activity categorization
    - clean activity labels
    - export CSV
    """
    raw = load_json(json_path)
    all_events: list[dict] = []

    for bucket_name, bucket in raw.get("buckets", {}).items():
        if bucket_name.startswith("aw-watcher-window"):
            all_events.extend(extract_window_events(bucket))
        elif bucket_name.startswith("aw-watcher-web"):
            all_events.extend(extract_web_events(bucket))

    df = pd.DataFrame(all_events)

    if df.empty:
        print("No events found in the provided JSON.")
        return df

    # timestamps & ordering
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="ISO8601", utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)

    # end_timestamp from duration
    df["end_timestamp"] = df["timestamp"] + pd.to_timedelta(
        df["duration"], unit="s"
    )

    # micro-events filtering
    df = df[df["duration"] >= MIN_DURATION_SECONDS].reset_index(drop=True)

    df = mark_idle(df)

    # case notion: per-day traces
    df["case_id"] = df["timestamp"].dt.date.astype(str)

    # categorization
    df["activity_category"] = df.apply(categorize_activity_row, axis=1)

    # clean activity labels
    activity_clean = (
        df["activity"]
        .fillna("UNKNOWN")
        .astype(str)
        .str.replace(ACTIVITY_CLEAN_REGEX, "_", regex=True)
        .str.strip("_")
    )
    activity_clean = activity_clean.replace("", "UNKNOWN")
    df["activity_clean"] = activity_clean

    # export
    if export_csv_path is not None:
        export_csv_path = Path(export_csv_path)
        event_log = df[[
            "case_id",
            "timestamp",
            "end_timestamp",
            "activity_clean",
            "activity_category",
            "source",
            "object",
            "is_idle",
        ]]
        event_log.to_csv(export_csv_path, index=False, sep=";")
        print(f"Exported event log to {export_csv_path}")

    return df


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage:   <input.json> [output.csv]")
        raise SystemExit(1)

    json_path = sys.argv[1]
    export_path = sys.argv[2] if len(sys.argv) >= 3 else None

    preprocess_activitywatch(json_path, export_path)
