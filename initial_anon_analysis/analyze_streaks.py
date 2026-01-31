#!/usr/bin/env python3
"""
Analyze anonymized streaks data from CSV file.
Returns formatted statistics as a string.
"""

import pandas as pd

from .streak_statistics import StreakStatistics


def load_streaks_data(csv_path: str) -> pd.DataFrame:
    """
    Load streaks from CSV and prepare data.

    Args:
        csv_path: Path to streaks CSV file

    Returns:
        DataFrame with streaks data
    """
    df = pd.read_csv(csv_path)
    df["start_time"] = pd.to_datetime(df["start_time"], format="mixed")
    df["end_time"] = pd.to_datetime(df["end_time"], format="mixed")
    return df


def get_basic_stats(df: pd.DataFrame) -> list:
    """Get basic streak statistics."""
    output = []
    output.append("=" * 80)
    output.append("ANONYMIZED STREAKS ANALYSIS")
    output.append("=" * 80)
    output.append("")
    output.append("BASIC STATISTICS")
    output.append("-" * 80)
    output.append(f"Total number of streaks: {len(df)}")
    output.append(f"Total events in streaks: {df['count'].sum()}")
    output.append(f"Average events per streak: {df['count'].mean():.2f}")
    output.append("")
    return output


def analyze_streaks(csv_path: str) -> str:
    """
    Load and analyze streaks from CSV file.

    Args:
        csv_path: Path to streaks CSV file

    Returns:
        Formatted statistics as string
    """
    df = load_streaks_data(csv_path)

    output = []

    output.extend(get_basic_stats(df))

    stats = StreakStatistics(df)
    output.extend(stats.get_duration_stats())
    output.extend(stats.get_duration_categories())
    output.extend(stats.get_streak_length_distribution())
    output.extend(stats.get_streak_characteristics())

    output.append("=" * 80)

    return "\n".join(output)
