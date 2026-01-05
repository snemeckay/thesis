import pandas as pd
from pathlib import Path

RAW_COL_USER = "user_id"
RAW_COL_START = "start_time"
RAW_COL_END = "end_time"
RAW_COL_APP = "app_in_focus"
RAW_COL_URL = "url3"


def build_case_id(df: pd.DataFrame) -> pd.DataFrame:
    df[RAW_COL_START] = pd.to_datetime(df[RAW_COL_START], format="mixed")
    day_str = df[RAW_COL_START].dt.date.astype(str)
    df["case_id"] = df[RAW_COL_USER].astype(str) + "_" + day_str
    return df


def build_activity_column(df: pd.DataFrame) -> pd.DataFrame:
    df["activity_clean"] = df[RAW_COL_APP].astype(str) + "/" + df[RAW_COL_URL].astype(str)
    return df


def build_timestamp_column(df: pd.DataFrame) -> pd.DataFrame:
    df["timestamp"] = pd.to_datetime(df[RAW_COL_START], format="mixed")
    return df


def main(raw_csv: str, out_csv: str):
    raw_path = Path(raw_csv)
    out_path = Path(out_csv)

    df = pd.read_csv(raw_path)

    df = build_case_id(df)
    df = build_activity_column(df)
    df = build_timestamp_column(df)

    cols = ["case_id", "activity_clean", "timestamp",
            RAW_COL_USER, RAW_COL_START, RAW_COL_END,
            "duration_secs", "source", "client", "audible",
            "incognito", "tab_count", RAW_COL_URL, RAW_COL_APP]
    cols = [c for c in cols if c in df.columns]
    df = df[cols]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--raw_csv", required=True)
    p.add_argument("--out_csv", required=True)
    args = p.parse_args()
    main(args.raw_csv, args.out_csv)
