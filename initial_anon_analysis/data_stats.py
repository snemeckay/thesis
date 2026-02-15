"""
Statistics tracking and formatting for anonymized data analysis.
"""

from datetime import datetime


class DataStats:
    """Tracks statistics about the dataset."""

    def __init__(self):
        self.total_rows = 0
        self.bad_rows = 0
        self.total_seconds_all = 0.0
        self.total_seconds_anon = 0.0
        self.total_anon_rows = 0
        self.total_browser_rows = 0
        self.total_browser_seconds = 0.0

    def process_row(
        self, start: datetime, end: datetime, is_browser: bool, is_anon: bool
    ) -> None:
        """
        Process a single row and update statistics.

        Args:
            start: Start time of row
            end: End time of row
            is_browser: Whether row is browser activity
            is_anon: Whether row is anonymized
        """
        dur = (end - start).total_seconds()
        if dur < 0:
            self.bad_rows += 1
            return

        self.total_rows += 1
        self.total_seconds_all += dur

        if is_browser:
            self.total_browser_rows += 1
            self.total_browser_seconds += dur

        if is_anon:
            self.total_seconds_anon += dur
            self.total_anon_rows += 1

    def format_stats(self, num_streaks: int) -> list:
        """
        Format statistics as a list of strings.

        Args:
            num_streaks: Number of anonymized streaks

        Returns:
            List of formatted stat strings
        """
        output = []
        output.append("=" * 80)
        output.append("DATASET ANALYSIS")
        output.append("=" * 80)
        output.append("")
        output.append("GENERAL STATISTICS")
        output.append("-" * 80)
        output.append(f"Rows (excluding header): {self.total_rows}")
        output.append(f"Bad/ignored rows: {self.bad_rows}")
        output.append(
            f"Total duration (all): {self._fmt_hours(self.total_seconds_all)}"
        )
        output.append("")
        output.append("BROWSER ACTIVITY")
        output.append("-" * 80)
        output.append(f"Total browser rows: {self.total_browser_rows}")
        output.append(
            f"Total browser duration: {self._fmt_hours(self.total_browser_seconds)}"
        )
        if self.total_seconds_all > 0:
            pct = 100 * self.total_browser_seconds / self.total_seconds_all
            output.append(f"Browser share of duration: {pct:.2f}%")
        output.append("")
        output.append("ANONYMIZED DATA")
        output.append("-" * 80)
        output.append(f"Total anon rows: {self.total_anon_rows}")
        output.append(
            f"Total anon duration: {self._fmt_hours(self.total_seconds_anon)}"
        )
        if self.total_seconds_all > 0:
            pct = 100 * self.total_seconds_anon / self.total_seconds_all
            output.append(f"Anon share of duration (vs all): {pct:.2f}%")
        if self.total_browser_seconds > 0:
            pct = 100 * self.total_seconds_anon / self.total_browser_seconds
            output.append(f"Anon share of duration (vs browser): {pct:.2f}%")
        output.append("")
        output.append("ANONYMIZED STREAKS")
        output.append("-" * 80)
        output.append(f"Total anon streaks found: {num_streaks}")
        output.append("")
        return output

    @staticmethod
    def _fmt_hours(seconds: float) -> str:
        """Format seconds as hours with 2 decimal places."""
        return f"{seconds/3600:.2f} h"
