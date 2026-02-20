"""Extract data for a single user from preprocessed CSV.

Filters preprocessed dataset to a specific user_id and saves to separate CSV.
Useful for individual user analysis and visualization.

Usage:
    python scripts/extract_user.py --in <preprocessed.csv> --user <user_id> --out <user.csv>
"""
import argparse
from pathlib import Path
import pandas as pd

parser = argparse.ArgumentParser(description="Extract single user data from preprocessed CSV")
parser.add_argument("--in", dest="infile", required=True, help="Input preprocessed CSV file")
parser.add_argument("--user", dest="user", required=True, help="user_id to extract")
parser.add_argument("--out", dest="outfile", required=True, help="Output CSV file path")
args = parser.parse_args()

infile = Path(args.infile)
outfile = Path(args.outfile)

df = pd.read_csv(infile, dtype={"user_id": str})

if "user_id" not in df.columns:
    raise SystemExit("Missing user_id column in input file")

user_data = df[df["user_id"] == args.user]

if user_data.empty:
    raise SystemExit(f"No data found for user_id: {args.user}")

outfile.parent.mkdir(parents=True, exist_ok=True)
user_data.to_csv(outfile, index=False)

print(f"Extracted {len(user_data)} rows for user {args.user}")
print(f"Saved to {outfile}")
