"""Summarize activity per event-day with start/end bounds.

Usage:
    python scripts/activity_per_day.py --in <csv> --out <txt> [--user USER]

Event-days are computed by splitting when the gap between events is >= --event-gap-hours.
"""
import argparse
from pathlib import Path
import pandas as pd

parser = argparse.ArgumentParser(description="Activity per event-day summary")
parser.add_argument("--in", dest="infile", required=True)
parser.add_argument("--out", dest="outfile", required=True)
parser.add_argument("--user", dest="user", default=None, help="user_id to filter (optional)")
parser.add_argument(
    "--event-gap-hours",
    dest="event_gap_hours",
    type=float,
    default=4.0,
    help="Gap (hours) that starts a new event day",
)
args = parser.parse_args()

infile = Path(args.infile)
outfile = Path(args.outfile)
user = args.user

parse_cols = ["start_time", "end_time"]
df = pd.read_csv(infile, parse_dates=parse_cols, dtype={"user_id": str})
if user:
    df = df[df["user_id"] == user]

if df.empty:
    raise SystemExit("No rows for requested user/file")

for col in parse_cols:
    df[col] = pd.to_datetime(df[col], errors="coerce")

df = df.dropna(subset=["start_time", "end_time"])

# compute duration if missing
if "duration_secs" not in df.columns:
    df["duration_secs"] = (df["end_time"] - df["start_time"]).dt.total_seconds()

# sort and compute event days
rdf = df.sort_values(["user_id", "start_time"]).reset_index(drop=True)

# per-user event day counter
rdf["event_day"] = 0
for uid, group_idx in rdf.groupby("user_id").groups.items():
    idx = list(group_idx)
    grp = rdf.loc[idx].sort_values("start_time")
    gaps = grp["start_time"] - grp["end_time"].shift()
    boundaries = gaps >= pd.Timedelta(hours=args.event_gap_hours)
    rdf.loc[grp.index, "event_day"] = boundaries.cumsum().fillna(0).astype(int).values

summary = rdf.groupby(["user_id", "event_day"]).agg(
    activity_secs=("duration_secs", "sum"),
    day_start=("start_time", "min"),
    day_end=("end_time", "max"),
)

outfile.parent.mkdir(parents=True, exist_ok=True)
with open(outfile, "w", encoding="utf-8") as fh:
    for uid in sorted(summary.index.get_level_values(0).unique()):
        fh.write(f"{uid}\n")
        user_days = summary.loc[uid]
        for day in sorted(user_days.index.tolist()):
            row = user_days.loc[day]
            act_td = pd.to_timedelta(row["activity_secs"], unit="s")
            fh.write(
                f"  day {day} - activity: {act_td}    start: {row['day_start']}    end: {row['day_end']}\n"
            )
        fh.write("\n")

print(f"Wrote activity-per-day summary to {outfile}")
