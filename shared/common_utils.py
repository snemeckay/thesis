"""Utility functions shared across all pipeline modules.

Currently provides a single helper that loads a CSV activity log and
converts it to a pm4py EventLog, handling project-specific column
renames automatically.
"""

import pandas as pd
from pm4py.objects.log.util import dataframe_utils
from pm4py.objects.conversion.log import converter as log_converter

from .constants import CASE_COL, ACTIVITY_COL, TIMESTAMP_COL, RESOURCE_COL


def csv_to_pm4py_log(csv_path):
    """Load a CSV and convert it to a pm4py EventLog.

    Renames project-specific columns (``case_id``, ``activity_clean``,
    ``timestamp``, ``resource``) to the pm4py standard names before
    conversion so that all pm4py operations work out of the box.

    Args:
        csv_path: Path (str or ``pathlib.Path``) to the preprocessed CSV.

    Returns:
        A pm4py ``EventLog`` instance ready for process mining.
    """
    df = pd.read_csv(csv_path, sep=",")

    # map column names to pm4py standard
    rename_map = {}
    if CASE_COL in df.columns:
        rename_map[CASE_COL] = "case:concept:name"
    if ACTIVITY_COL in df.columns:
        rename_map[ACTIVITY_COL] = "concept:name"
    if TIMESTAMP_COL in df.columns:
        rename_map[TIMESTAMP_COL] = "time:timestamp"
    if RESOURCE_COL in df.columns:
        rename_map[RESOURCE_COL] = "org:resource"

    df = df.rename(columns=rename_map)

    df = dataframe_utils.convert_timestamp_columns_in_df(df)

    event_log = log_converter.apply(
        df,
        variant=log_converter.Variants.TO_EVENT_LOG
    )
    return event_log
