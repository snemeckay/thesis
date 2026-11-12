"""Base class for process mining discovery pipelines.

Provides shared functionality used by all pipeline scripts:
  - CSV loading with automatic column renaming to pm4py standard names
  - Conversion of a DataFrame to a pm4py EventLog
  - Standardised output-path construction (all files share the CSV stem)
  - Unified rule persistence (JSON + CSV) via pipeline_io
  - Log-statistics reporting to stdout
  - Common argparse arguments (--csv, --out-dir)

Both Declare4PyPipeline and DiscoverPipeline inherit from BasePipeline so
that these concerns are implemented once and never duplicated.
"""

from pathlib import Path

import pandas as pd
from pm4py.objects.log.util import dataframe_utils
from pm4py.objects.conversion.log import converter as log_converter

from shared.constants import CASE_COL, ACTIVITY_COL, TIMESTAMP_COL, RESOURCE_COL
from shared.pipeline_io import save_unified_rules


# Maps project-specific column names to pm4py standard column names.
_PM4PY_COLUMN_MAP = {
    CASE_COL: "case:concept:name",
    ACTIVITY_COL: "concept:name",
    TIMESTAMP_COL: "time:timestamp",
    RESOURCE_COL: "org:resource",
}


class BasePipeline:
    """Base class providing shared I/O and data loading for process mining pipelines.

    Subclasses only need to implement their specific discovery logic; all
    common operations (loading, path building, saving) are handled here.
    """

    def __init__(self, csv_path: Path, out_dir: Path) -> None:
        """Store input/output paths and ensure the output directory exists.

        Args:
            csv_path: Path to the preprocessed activity-log CSV file.
            out_dir:  Directory where all output files will be written.
        """
        self.csv_path = Path(csv_path)
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._df: pd.DataFrame | None = None

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def load_dataframe(self) -> pd.DataFrame:
        """Load the CSV and rename columns to pm4py standard names.

        Renames project-specific column names (e.g. ``case_id``,
        ``activity_clean``) to the pm4py conventions
        (``case:concept:name``, ``concept:name``, ``time:timestamp``).
        The result is cached so subsequent calls skip re-reading the file.

        Returns:
            DataFrame with pm4py-compatible column names and a parsed
            ``time:timestamp`` column.
        """
        if self._df is not None:
            return self._df

        df = pd.read_csv(self.csv_path, sep=",", dtype={
            CASE_COL: str, ACTIVITY_COL: str,
            "case:concept:name": str, "concept:name": str,
        }, keep_default_na=False)
        rename_map = {src: dst for src, dst in _PM4PY_COLUMN_MAP.items() if src in df.columns}
        df = df.rename(columns=rename_map)
        df["time:timestamp"] = pd.to_datetime(df["time:timestamp"])
        self._df = df
        return df

    def load_event_log(self):
        """Convert the loaded DataFrame to a pm4py EventLog.

        Calls ``load_dataframe()`` if not already cached, then applies
        pm4py timestamp conversion and log-converter to produce an
        ``EventLog`` object suitable for pm4py and Declare4Py operations.

        Returns:
            A pm4py ``EventLog`` instance.
        """
        df = self.load_dataframe().copy()
        df = dataframe_utils.convert_timestamp_columns_in_df(df)
        return log_converter.apply(df, variant=log_converter.Variants.TO_EVENT_LOG)

    @staticmethod
    def dataframe_to_event_log(df):
        """Convert a pm4py-formatted DataFrame to a pm4py EventLog."""
        work_df = dataframe_utils.convert_timestamp_columns_in_df(df.copy())
        return log_converter.apply(work_df, variant=log_converter.Variants.TO_EVENT_LOG)

    # ------------------------------------------------------------------
    # Output path helpers
    # ------------------------------------------------------------------

    def output_path(self, suffix: str) -> Path:
        """Return an output path whose stem matches the input CSV stem.

        Example:
            ``self.output_path("_rules.json")``  →  ``output/preprocessed_rules.json``

        Args:
            suffix: File name suffix including extension (e.g. ``"_rules.json"``).

        Returns:
            Absolute ``Path`` inside ``self.out_dir``.
        """
        return self.out_dir / f"{self.csv_path.stem}{suffix}"

    # ------------------------------------------------------------------
    # Result persistence
    # ------------------------------------------------------------------

    def save_results(self, rules: list, name: str) -> tuple[Path, Path]:
        """Save a list of unified rule dicts to JSON and CSV files.

        Args:
            rules: List of rule dicts produced by ``create_rule()``.
            name:  Infix used in the output file names
                   (e.g. ``"declare4py_constraints"``).

        Returns:
            Tuple of ``(json_path, csv_path)`` pointing to the saved files.
        """
        json_path = self.output_path(f"_{name}.json")
        csv_path = self.output_path(f"_{name}.csv")
        save_unified_rules(rules, json_path, csv_path)
        return json_path, csv_path

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    def print_dataframe_stats(self, df: pd.DataFrame) -> None:
        """Print trace, event, and unique-activity counts for the loaded log.

        Args:
            df: DataFrame with pm4py standard column names.
        """
        n_traces = df["case:concept:name"].nunique()
        n_events = len(df)
        n_activities = df["concept:name"].nunique()
        print(f">> Log: {n_traces} traces, {n_events} events, {n_activities} unique activities")

    def print_event_log_stats(self, log) -> None:
        """Print trace, event, and unique-activity counts for a pm4py EventLog.

        Args:
            log: A pm4py ``EventLog`` (list of traces).
        """
        n_traces = len(log)
        n_events = sum(len(t) for t in log)
        n_activities = len({e["concept:name"] for t in log for e in t})
        print(f">> Log: {n_traces} traces, {n_events} events, {n_activities} unique activities")

    # ------------------------------------------------------------------
    # Argparse helpers
    # ------------------------------------------------------------------

    @staticmethod
    def add_common_args(parser) -> None:
        """Add the shared ``--csv`` and ``--out-dir`` arguments to an ArgumentParser.

        Args:
            parser: An ``argparse.ArgumentParser`` instance to extend.
        """
        parser.add_argument("--csv", required=True, help="Path to preprocessed CSV")
        parser.add_argument("--out-dir", default="output", help="Output directory")
