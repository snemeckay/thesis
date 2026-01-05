import argparse
from pathlib import Path

import pm4py

from Declare4Py.D4PyEventLog import D4PyEventLog
from Declare4Py.ProcessMiningTasks.Discovery.DeclareMiner import DeclareMiner
from Declare4Py.ProcessModels.DeclareModel import DeclareModel

from shared.common_utils import csv_to_pm4py_log
from shared.visualize_graph import visualize_declare_graph

import logging
logging.getLogger("matplotlib").setLevel(logging.WARNING)


def export_log_to_xes(log, xes_path: Path) -> None:
    """Export pm4py EventLog to XES for Declare4Py."""
    xes_path.parent.mkdir(parents=True, exist_ok=True)
    pm4py.write_xes(log, str(xes_path))


def discover_declare_model_from_xes(
        xes_path,
        case_name_key="case:concept:name",
        min_support=0.4,
        itemsets_support=0.8,
        max_cardinality=2):
    """
    Load XES into Declare4Py and run DeclareMiner to discover a DECLARE model.
    """
    # Wrap pm4py log into Declare4Py's event log wrapper
    d4py_log = D4PyEventLog(case_name=case_name_key)
    d4py_log.parse_xes_log(str(xes_path))

    miner = DeclareMiner(
        log=d4py_log,
        consider_vacuity=False,
        min_support=min_support,
        itemsets_support=itemsets_support,
        max_declare_cardinality=max_cardinality,
    )

    print(">> Running DeclareMiner discovery...")
    discovered_model: DeclareModel = miner.run()
    return discovered_model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to preprocessed CSV")
    parser.add_argument(
        "--out-dir",
        default="output",
        help="Output directory",
    )
    parser.add_argument(
        "--min-support",
        type=float,
        default=0.4,
        help="Minimum support for discovered constraints",
    )
    parser.add_argument(
        "--itemsets-support",
        type=float,
        default=0.8,
        help="Support for frequent itemsets mining (length 2)",
    )
    parser.add_argument(
        "--max-cardinality",
        type=int,
        default=2,
        help="Max cardinality for Existence/Absence/Exactly templates",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    xes_path = out_dir / (csv_path.stem + ".xes")
    decl_model_path = out_dir / (csv_path.stem + "_declare_model.decl")

    print(f">> Loading CSV from {csv_path}")
    log = csv_to_pm4py_log(csv_path)
    print(f">> Log has {len(log)} traces and {sum(len(t) for t in log)} events")

    print(f">> Exporting log to XES: {xes_path}")
    export_log_to_xes(log, xes_path)

    print(">> Discovering DECLARE model with Declare4Py...")
    model = discover_declare_model_from_xes(
        xes_path,
        case_name_key="case:concept:name",
        min_support=args.min_support,
        itemsets_support=args.itemsets_support,
        max_cardinality=args.max_cardinality,
    )

    print(f">> Discovered {len(model.serialized_constraints)} constraints.")

    model.to_file(str(decl_model_path))
    print(f">> Saved model to {decl_model_path}")

    graph_path = out_dir / f"{csv_path.stem}_declare_graph.png"
    print(">> Constraints example:", model.serialized_constraints[:3])
    print(">> Number of constraints:", len(model.serialized_constraints))
    visualize_declare_graph(model, graph_path)
    print(f">> Saved constraint graph to {graph_path}")


if __name__ == "__main__":
    main()
