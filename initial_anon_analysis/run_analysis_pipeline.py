#!/usr/bin/env python3
"""
Pipeline for initial analysis of data focused on finding out whether anonymized data can be ommited in the dataset
without significant loss of information, and at what cost.

This script calls:
 - `analyze_anon_data.main(input_file, start_col, end_col, out_stats, out_streaks)`
 - `analyze_streaks.analyze_streaks(out_streaks)`

Usage:
        python initial_analysis/run_analysis_pipeline.py <input_csv>
                [--out-stats PATH] [--out-streaks PATH]
"""

import argparse
import os
import sys

import initial_analysis.analyze_anon_data as analyze_anon
import initial_analysis.analyze_streaks as analyze_streaks


def main():
    parser = argparse.ArgumentParser(
        description="Run full annonymized analysis pipeline using imports"
    )
    parser.add_argument("input_file", help="Path to input CSV file")
    parser.add_argument(
        "--out-stats",
        default="output/analysis/anon_stats.txt",
        help="Path to output stats file (default: output/analysis/anon_stats.txt)",
    )
    parser.add_argument(
        "--out-streaks",
        default="output/analysis/anon_streaks.csv",
        help="Path to output streaks CSV (default: output/analysis/anon_streaks.csv)",
    )
    args = parser.parse_args()

    # ensure output directory exists for provided paths
    out_stats = args.out_stats
    out_streaks = args.out_streaks
    for p in (out_stats, out_streaks):
        d = os.path.dirname(os.path.abspath(p))
        if d and not os.path.exists(d):
            os.makedirs(d, exist_ok=True)

    # run analysis steps
    print("Running analyze_anon_data.main(...)\n")
    try:
        anon_analysis = analyze_anon.main(
            args.input_file, out_streaks
        )
    except Exception as e:
        print(f"Error running analyze_anon_data.main: {e}", file=sys.stderr)
        raise

    if not os.path.exists(out_streaks):
        print(f"Streaks file not produced: {out_streaks}", file=sys.stderr)
        sys.exit(1)

    print("Running analyze_streaks.analyze_streaks(...)\n")
    try:
        streaks_analysis = analyze_streaks.analyze_streaks(out_streaks)
    except Exception as e:
        print(f"Error running analyze_streaks.analyze_streaks: {e}", file=sys.stderr)
        raise

    # save and print results
    combined_output = anon_analysis + "\n" + streaks_analysis

    with open(out_stats, "w", encoding="utf-8") as f:
        f.write(combined_output)

    print(combined_output)

    print("\nPipeline finished successfully\n")
    print(f"Combined analysis written to: {out_stats}")
    print(f"Streaks CSV:                  {out_streaks}")


if __name__ == "__main__":
    main()
