"""
Analyze anonymized data from a CSV file.
Detects streaks of anonymized events and generates statistics.
"""

import csv
from datetime import datetime

from .data_stats import DataStats
from .streak_detector import StreakDetector


def parse_dt(s: str) -> datetime:
    """Parse ISO format datetime string."""
    return datetime.fromisoformat((s or "").strip())


def read_and_process_csv(path: str) -> tuple:
    """
    Read CSV file and process all rows.

    Args:
        path: Path to input CSV file

    Returns:
        Tuple of (stats, streak_detector)
    """
    stats = DataStats()
    detector = StreakDetector()

    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            row_idx = stats.total_rows + 1

            try:
                start = parse_dt(row.get("start_time"))
                end = parse_dt(row.get("end_time"))
            except Exception:
                stats.bad_rows += 1
                continue

            is_browser = (row.get("app_in_focus") or "").strip().lower() == "browser"
            is_anon = (row.get("url3") or "").strip().lower() == "anonymized"

            stats.process_row(start, end, is_browser, is_anon)
            detector.process_row(is_anon, row_idx, start, end)

    return stats, detector


def write_streaks_csv(streaks_path: str, streaks: list) -> None:
    """
    Write detected streaks to CSV file.

    Args:
        streaks_path: Path to output streaks CSV
        streaks: List of Streak objects
    """
    with open(streaks_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "start_row",
                "end_row",
                "count",
                "start_time",
                "end_time",
                "duration_seconds",
            ]
        )
        for s in streaks:
            writer.writerow(
                [
                    s.start_row,
                    s.end_row,
                    s.count,
                    s.start_time.isoformat(),
                    s.end_time.isoformat(),
                    s.seconds,
                ]
            )


def main(path: str, streaks_path: str) -> str:
    """
    Analyze anonymized data from CSV file.

    Args:
        path: Path to input CSV file
        start_col: Name of start_time column
        end_col: Name of end_time column
        streaks_path: Path to output streaks CSV

    Returns:
        Formatted statistics as string
    """
    stats, detector = read_and_process_csv(path)

    streaks = detector.finalize(stats.total_rows)

    write_streaks_csv(streaks_path, streaks)

    output_lines = stats.format_stats(len(streaks))
    return "\n".join(output_lines)


if __name__ == "__main__":
    import argparse
    import os

    parser = argparse.ArgumentParser(description="Analyze anonymized data in CSV.")
    parser.add_argument("input_file", help="Path to input CSV file")
    parser.add_argument(
        "--out-stats",
        default="anon_stats.txt",
        help="Path to output statistics file (default: anon_stats.txt)",
    )
    parser.add_argument(
        "--out-streaks",
        default="anon_streaks.csv",
        help="Path to output streaks CSV (default: anon_streaks.csv)",
    )

    args = parser.parse_args()

    input_dir = os.path.dirname(os.path.abspath(args.input_file))

    def resolve_path(p: str) -> str:
        if os.path.isabs(p):
            return p
        return os.path.join(input_dir, p)

    main(
        args.input_file,
        "start_time",
        "end_time",
        resolve_path(args.out_stats),
        resolve_path(args.out_streaks),
    )
