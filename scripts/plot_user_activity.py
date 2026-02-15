"""Plot activity timeline grouped by behavioral day (case_id).

Visualizes activity as horizontal bars where each bar represents one event,
grouped by case_id and colored by temporal progression.

Usage:
    python scripts/plot_user_activity.py --in <csv> --out <png> [--user USER]

If the CSV already contains only one user, omit --user.
"""
import argparse
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

parser = argparse.ArgumentParser(description="Plot user activity timeline by case_id")
parser.add_argument("--in", dest="infile", required=True, help="Input preprocessed CSV")
parser.add_argument("--out", dest="outfile", required=True, help="Output PNG file path")
parser.add_argument("--user", dest="user", default=None, help="user_id to filter (optional)")
parser.add_argument("--max-days", dest="max_days", type=int, default=60, help="Max behavioral days to plot")
args = parser.parse_args()

infile = Path(args.infile)
outfile = Path(args.outfile)
user = args.user

df = pd.read_csv(infile, parse_dates=["start_time", "end_time"], dtype={"user_id": str})

if user:
    df = df[df["user_id"] == user]

if df.empty:
    raise SystemExit("No rows for requested user/file")

if "case_id" not in df.columns:
    raise SystemExit("Missing case_id column - ensure data is preprocessed")

df = df.sort_values("start_time")

case_order = df.groupby("case_id")["start_time"].min().sort_values().index.tolist()
if len(case_order) > args.max_days:
    case_order = case_order[:args.max_days]
    df = df[df["case_id"].isin(case_order)]

case_to_y = {cid: i for i, cid in enumerate(case_order)}

xs = mdates.date2num(df["start_time"])
xe = mdates.date2num(df["end_time"])
widths = xe - xs
ys = df["case_id"].map(case_to_y).values

num_cases = len(case_order)
fig, ax = plt.subplots(figsize=(14, max(4, num_cases * 0.3)))

for i in range(len(df)):
    y = ys[i]
    ax.broken_barh([(xs[i], widths[i])], (y - 0.4, 0.8), facecolors=(0.2, 0.4, 0.8, 0.8))

ax.set_yticks(range(len(case_order)))
ax.set_yticklabels(case_order, fontsize=8)
ax.set_ylabel("case_id (behavioral day)", fontsize=10)

ax.xaxis_date()
ax.xaxis.set_major_locator(mdates.DayLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
ax.set_xlabel("Time", fontsize=10)

fig.autofmt_xdate(rotation=45)

title = "Activity timeline by behavioral day"
if user:
    title += f" for {user}"
ax.set_title(title, fontsize=12)

plt.tight_layout()
outfile.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(outfile, dpi=200)
print(f"Saved activity plot to {outfile}")
