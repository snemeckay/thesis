import csv
import sys
from dataclasses import dataclass
from datetime import datetime

def parse_dt(s: str) -> datetime:
    return datetime.fromisoformat((s or "").strip())

@dataclass
class Streak:
    start_row: int
    end_row: int
    count: int
    start_time: datetime
    end_time: datetime

    @property
    def seconds(self) -> float:
        return (self.end_time - self.start_time).total_seconds()

def main(path: str, start_col: str, end_col: str, out_path: str, streaks_path: str) -> None:
    total_rows = 0
    bad_rows = 0

    total_seconds_all = 0.0
    total_seconds_anon = 0.0
    total_anon_rows = 0

    total_browser_rows = 0
    total_browser_seconds = 0.0

    streaks: list[Streak] = []
    in_streak = False
    streak_start_row = None
    streak_count = 0
    streak_start_time = None
    streak_end_time = None

    with open(path, "r", newline="", encoding="utf-8") as f, open(out_path, "w", encoding="utf-8") as out:
        reader = csv.DictReader(f)

        for row in reader:
            total_rows += 1
            row_idx = total_rows

            try:
                start = parse_dt(row.get(start_col))
                end = parse_dt(row.get(end_col))
                dur = (end - start).total_seconds()
                if dur < 0:
                    bad_rows += 1
                    continue
            except Exception:
                bad_rows += 1
                continue

            total_seconds_all += dur
            
            is_browser = (row.get("app_in_focus") or "").strip().lower() == "browser"
            if is_browser:
                total_browser_rows += 1
                total_browser_seconds += dur

            is_anon = (row.get("url3") or "").strip().lower() == "anonymized"
            if is_anon:
                total_seconds_anon += dur
                total_anon_rows += 1

            # Streak detection (consecutive anon rows)
            if is_anon:
                if not in_streak:
                    in_streak = True
                    streak_start_row = row_idx
                    streak_count = 1
                    streak_start_time = start
                    streak_end_time = end
                else:
                    streak_count += 1
                    if start < streak_start_time:
                        streak_start_time = start
                    if end > streak_end_time:
                        streak_end_time = end
            else:
                if in_streak:
                    streaks.append(Streak(
                        start_row=streak_start_row,
                        end_row=row_idx - 1,
                        count=streak_count,
                        start_time=streak_start_time,
                        end_time=streak_end_time,
                    ))
                    in_streak = False

        if in_streak:
            streaks.append(Streak(
                start_row=streak_start_row,
                end_row=total_rows,
                count=streak_count,
                start_time=streak_start_time,
                end_time=streak_end_time,
            ))

        def fmt_h(seconds: float) -> str:
            return f"{seconds/3600:.2f} h"

        # Summary
        print(f"Rows (excluding header): {total_rows}", file=out)
        print(f"Bad/ignored rows: {bad_rows}", file=out)
        print(f"Total duration (all): {fmt_h(total_seconds_all)}", file=out)
        print("", file=out)
        print(f"Total browser rows: {total_browser_rows}", file=out)
        print(f"Total browser duration: {fmt_h(total_browser_seconds)}", file=out)
        if total_seconds_all > 0:
            print(f"Browser share of duration: {100*total_browser_seconds/total_seconds_all:.2f}%", file=out)
        print("", file=out)
        print(f"Total anon rows: {total_anon_rows}", file=out)
        print(f'Total anon duration: {fmt_h(total_seconds_anon)}', file=out)
        if total_seconds_all > 0:
            print(f"Anon share of duration (vs all): {100*total_seconds_anon/total_seconds_all:.2f}%", file=out)
        if total_browser_seconds > 0:
            print(f"Anon share of duration (vs browser): {100*total_seconds_anon/total_browser_seconds:.2f}%", file=out)

        # Streaks > 1
        long_streaks = [s for s in streaks if s.count > 1]
        print("", file=out)
        print(f"Anon streaks found: {len(streaks)}", file=out)
        print(f"Anon streaks printed (len>1): {len(long_streaks)}", file=out)
        print("", file=out)

        for s in long_streaks:
            print(
                f"rows {s.start_row}-{s.end_row} | count={s.count} | "
                f"duration={fmt_h(s.seconds)} | {s.start_time.isoformat()} -> {s.end_time.isoformat()}",
                file=out
            )
            
    # Write streaks CSV
    with open(streaks_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["start_row", "end_row", "count", "start_time", "end_time", "duration_seconds"])
        for s in streaks:
            writer.writerow([s.start_row, s.end_row, s.count, s.start_time.isoformat(), s.end_time.isoformat(), s.seconds])

if __name__ == "__main__":
    import argparse
    import os

    parser = argparse.ArgumentParser(description="Analyze anonymized data in CSV.")
    parser.add_argument("input_file", help="Path to input CSV file")
    parser.add_argument("--out-stats", default="anon_stats.txt", help="Path to output statistics file (default: anon_stats.txt)")
    parser.add_argument("--out-streaks", default="anon_streaks.csv", help="Path to output streaks CSV (default: anon_streaks.csv)")

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
        resolve_path(args.out_streaks)
    )
