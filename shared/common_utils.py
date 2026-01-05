import pandas as pd
from pm4py.objects.log.util import dataframe_utils
from pm4py.objects.conversion.log import converter as log_converter

from .constants import CASE_COL, ACTIVITY_COL, TIMESTAMP_COL, RESOURCE_COL


def csv_to_pm4py_log(csv_path):
    """
    Load a CSV and convert it into a pm4py EventLog.
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
