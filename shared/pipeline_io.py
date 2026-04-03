"""I/O helpers for process mining pipelines.

Provides three groups of operations:
  - Event log loading: CSV → pm4py EventLog (delegates to common_utils)
  - Log export: pm4py EventLog → XES file (required by Declare4Py)
  - Rule persistence: unified rule dicts → JSON and CSV files
"""

import csv
import json
from pathlib import Path
import pm4py


def load_log_from_csv(csv_path: Path):
    """Load an activity-log CSV and return a pm4py EventLog.

    Delegates to ``csv_to_pm4py_log`` in ``common_utils``, which handles
    project-specific column renaming before conversion.

    Args:
        csv_path: Path to the preprocessed activity-log CSV.

    Returns:
        A pm4py ``EventLog`` instance.
    """
    from shared.common_utils import csv_to_pm4py_log
    return csv_to_pm4py_log(csv_path)


def export_xes(log, xes_path: Path) -> None:
    """Write a pm4py EventLog to an XES file.

    Creates parent directories if they do not exist.

    Args:
        log:      A pm4py ``EventLog`` instance.
        xes_path: Destination path for the XES file.
    """
    xes_path.parent.mkdir(parents=True, exist_ok=True)
    pm4py.write_xes(log, str(xes_path))


def save_json(data, path: Path) -> None:
    """Serialise ``data`` to a JSON file.

    Creates parent directories if they do not exist.

    Args:
        data: Any JSON-serialisable object (lists, dicts, etc.).
        path: Destination file path.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def save_csv(rows: list, path: Path, fieldnames: list) -> None:
    """Write a list of dicts to a CSV file.

    The ``activities`` field, if present as a list, is serialised as a
    pipe-delimited string so the CSV remains single-valued per cell.
    Creates parent directories if they do not exist.

    Args:
        rows:       List of dicts to write.  Each dict must contain all keys
                    listed in ``fieldnames``.
        path:       Destination file path.
        fieldnames: Ordered list of column names for the CSV header.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return

    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            row_copy = row.copy()
            if "activities" in row_copy and isinstance(row_copy["activities"], list):
                row_copy["activities"] = "|".join(row_copy["activities"])
            writer.writerow(row_copy)


def save_unified_rules(rules: list, json_path: Path, csv_path: Path) -> None:
    """Persist a list of unified rule dicts to both JSON and CSV formats.

    Args:
        rules:     List of rule dicts produced by ``create_rule()``.
        json_path: Destination path for the JSON file.
        csv_path:  Destination path for the CSV file.
    """
    from shared.pipeline_schema import UNIFIED_FIELDS
    save_json(rules, json_path)
    save_csv(rules, csv_path, UNIFIED_FIELDS)
