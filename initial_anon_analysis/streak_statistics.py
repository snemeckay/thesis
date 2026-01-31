"""
Streak statistics calculation for anonymized data analysis.
"""

import pandas as pd


class StreakStatistics:
    """Calculates and formats statistics from streaks data."""

    def __init__(self, df: pd.DataFrame):
        self.df = df

    def get_duration_stats(self) -> list:
        """Calculate duration statistics."""
        output = []
        output.append("DURATION STATISTICS (seconds)")
        output.append("-" * 80)
        total_duration = self.df["duration_seconds"].sum()
        hours = total_duration / 3600
        output.append(
            f"Total duration of all streaks: {total_duration:.2f}s ({hours:.2f}h)"
        )
        output.append(f"Mean duration: {self.df['duration_seconds'].mean():.2f}s")
        output.append(f"Median duration: {self.df['duration_seconds'].median():.2f}s")
        output.append(f"Std deviation: {self.df['duration_seconds'].std():.2f}s")
        output.append(f"Min duration: {self.df['duration_seconds'].min():.2f}s")
        output.append(f"Max duration: {self.df['duration_seconds'].max():.2f}s")
        output.append(
            f"Q1 (25th percentile): {self.df['duration_seconds'].quantile(0.25):.2f}s"
        )
        output.append(
            f"Q3 (75th percentile): {self.df['duration_seconds'].quantile(0.75):.2f}s"
        )
        output.append("")
        return output

    def get_duration_categories(self) -> list:
        """Categorize streaks by duration."""
        output = []
        output.append("DURATION CATEGORIES")
        output.append("-" * 80)

        zero = len(self.df[self.df["duration_seconds"] == 0])
        short = len(
            self.df[
                (self.df["duration_seconds"] > 0) & (self.df["duration_seconds"] <= 60)
            ]
        )
        medium = len(
            self.df[
                (self.df["duration_seconds"] > 60)
                & (self.df["duration_seconds"] <= 300)
            ]
        )
        long = len(self.df[self.df["duration_seconds"] > 300])

        total = len(self.df)
        output.append(f"Zero duration (instant): {zero} ({zero/total*100:.1f}%)")
        output.append(f"Short (0-60s): {short} ({short/total*100:.1f}%)")
        output.append(f"Medium (60-300s / 1-5 min): {medium} ({medium/total*100:.1f}%)")
        output.append(f"Long (>300s / >5 min): {long} ({long/total*100:.1f}%)")
        output.append("")
        return output

    def get_streak_length_distribution(self) -> list:
        """Generate distribution of streaks by duration buckets."""
        output = []
        output.append("STREAK LENGTH DISTRIBUTION (by duration)")
        output.append("-" * 80)

        buckets = [
            (0, 1800, "0-30 min"),
            (1800, 3600, "30 min - 1 h"),
            (3600, 7200, "1 h - 2 h"),
            (7200, 18000, "2 h - 5 h"),
            (18000, 36000, "5 h - 10 h"),
            (36000, 86400, "10 h - 24 h"),
            (86400, float("inf"), ">24 h"),
        ]

        total = len(self.df)
        for min_sec, max_sec, label in buckets:
            count = len(
                self.df[
                    (self.df["duration_seconds"] >= min_sec)
                    & (self.df["duration_seconds"] < max_sec)
                ]
            )
            percentage = count / total * 100 if total > 0 else 0
            output.append(f"{label:15s} | {count:6d} ({percentage:5.1f}%)")

        output.append("")
        return output

    def get_streak_characteristics(self) -> list:
        """Calculate characteristics of streaks."""
        output = []
        output.append("STREAK CHARACTERISTICS")
        output.append("-" * 80)

        single_row = len(self.df[self.df["start_row"] == self.df["end_row"]])
        multi_row = len(self.df[self.df["start_row"] != self.df["end_row"]])
        total = len(self.df)

        output.append(f"Single-row streaks: {single_row} ({single_row/total*100:.1f}%)")
        output.append(f"Multi-row streaks: {multi_row} ({multi_row/total*100:.1f}%)")

        if multi_row > 0:
            avg_span = self.df[self.df["start_row"] != self.df["end_row"]][
                "count"
            ].mean()
            output.append(f"Avg rows per multi-row streak: {avg_span:.2f}")

        output.append("")
        return output
