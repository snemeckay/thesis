"""
Streak detection logic for anonymized data.
Detects consecutive anonymized rows and splits them based on time gaps.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Streak:
    """Represents a continuous streak of anonymized events."""

    start_row: int
    end_row: int
    count: int
    start_time: datetime
    end_time: datetime

    @property
    def seconds(self) -> float:
        """Calculate streak duration in seconds."""
        return (self.end_time - self.start_time).total_seconds()


class StreakDetector:
    """Detects streaks of anonymized rows with gap-based splitting."""

    # 1 hour = 3600 seconds
    GAP_THRESHOLD_SECONDS = 3600

    def __init__(self):
        self.streaks = []
        self.in_streak = False
        self.streak_start_row = None
        self.streak_count = 0
        self.streak_start_time = None
        self.streak_end_time = None
        self.prev_anon_end_time = None

    def process_row(
        self, is_anon: bool, row_idx: int, start_time: datetime, end_time: datetime
    ) -> None:
        """
        Process a single row for streak detection.

        Args:
            is_anon: Whether this row is anonymized
            row_idx: Row index (1-based)
            start_time: Start time of the row
            end_time: End time of the row
        """
        if is_anon:
            # check if this row should start a new streak due to a large gap
            should_start_new_streak = False
            if self.prev_anon_end_time is not None:
                gap_seconds = (start_time - self.prev_anon_end_time).total_seconds()
                if gap_seconds > self.GAP_THRESHOLD_SECONDS:
                    should_start_new_streak = True

            if not self.in_streak or should_start_new_streak:
                # save previous streak if it exists
                if self.in_streak:
                    self._save_current_streak(row_idx - 1)
                # start new streak
                self._start_new_streak(row_idx, start_time, end_time)
            else:
                # continue current streak
                self._continue_streak(start_time, end_time)

            # update the previous anon row's end time
            self.prev_anon_end_time = end_time
        else:
            # non-anon row: close current streak if active
            if self.in_streak:
                self._save_current_streak(row_idx - 1)
            # reset prev_anon_end_time when we hit a non-anon row
            self.prev_anon_end_time = None

    def finalize(self, total_rows: int) -> list:
        """
        Finalize streak detection after processing all rows.

        Args:
            total_rows: Total number of rows processed

        Returns:
            List of detected streaks
        """
        if self.in_streak:
            self._save_current_streak(total_rows)
        return self.streaks

    def _start_new_streak(
        self, row_idx: int, start_time: datetime, end_time: datetime
    ) -> None:
        """Start a new streak."""
        self.in_streak = True
        self.streak_start_row = row_idx
        self.streak_count = 1
        self.streak_start_time = start_time
        self.streak_end_time = end_time

    def _continue_streak(self, start_time: datetime, end_time: datetime) -> None:
        """Continue the current streak with a new row."""
        self.streak_count += 1
        if start_time < self.streak_start_time:
            self.streak_start_time = start_time
        if end_time > self.streak_end_time:
            self.streak_end_time = end_time

    def _save_current_streak(self, end_row: int) -> None:
        """Save the current streak to the list."""
        self.streaks.append(
            Streak(
                start_row=self.streak_start_row,
                end_row=end_row,
                count=self.streak_count,
                start_time=self.streak_start_time,
                end_time=self.streak_end_time,
            )
        )
        self.in_streak = False
