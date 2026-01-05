import argparse
import json
from pathlib import Path

import pm4py

from shared.common_utils import csv_to_pm4py_log

import logging

logging.getLogger("matplotlib").setLevel(logging.WARNING)


def discover_dcr_model_from_log(
    log,
    activity_key: str = "concept:name",
    timestamp_key: str = "time:timestamp",
    case_id_key: str = "case:concept:name",
    min_support_ratio: float = 0.4,
    min_confidence_ratio: float = 0.8,
):
    """
    Discover a DCR Graph using the DisCoveR algorithm in the pm4py-dcr fork. [web:6][web:23]
    """
    result = pm4py.discover_dcr(
        log=log,
        activity_key=activity_key,
        timestamp_key=timestamp_key,
        case_id_key=case_id_key,
        min_support_ratio=min_support_ratio,
        min_confidence_ratio=min_confidence_ratio,
    )

    if isinstance(result, tuple) and len(result) >= 1:
        dcr_graph = result[0]
    else:
        dcr_graph = result

    return dcr_graph


def save_dcr_relations(dcr_graph, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "events": list(getattr(dcr_graph, "events", [])),
        "conditions": list(getattr(dcr_graph, "conditions", [])),
        "responses": list(getattr(dcr_graph, "responses", [])),
        "includes": list(getattr(dcr_graph, "includes", [])),
        "excludes": list(getattr(dcr_graph, "excludes", [])),
        "marking": getattr(dcr_graph, "marking", None),
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def visualize_dcr_graph(dcr_graph, graph_path: Path) -> None:
    """
    Save a visualization of the DCR Graph as PNG. [web:6][web:23]
    """
    graph_path.parent.mkdir(parents=True, exist_ok=True)
    pm4py.save_vis_dcr(dcr_graph, str(graph_path))


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
        help="Minimum support ratio for discovered relations (DisCoveR).",
    )

    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.8,
        help="Minimum confidence ratio for discovered relations (DisCoveR).",
    )

    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dcr_model_path = out_dir / f"{csv_path.stem}_dcr_model.json"
    graph_path = out_dir / f"{csv_path.stem}_dcr_graph.png"

    print(f">> Loading CSV from {csv_path}")
    log = csv_to_pm4py_log(csv_path)
    print(f">> Log has {len(log)} traces and {sum(len(t) for t in log)} events")

    print(">> Discovering DCR Graph with DisCoveR (pm4py-dcr)...")
    dcr_graph = discover_dcr_model_from_log(
        log,
        activity_key="concept:name",
        timestamp_key="time:timestamp",
        case_id_key="case:concept:name",
        min_support_ratio=args.min_support,
        min_confidence_ratio=args.min_confidence,
    )

    print(">> Saving DCR relations JSON...")
    save_dcr_relations(dcr_graph, dcr_model_path)
    print(f">> Saved DCR relations to {dcr_model_path}")

    print(">> Saving DCR visualization...")
    visualize_dcr_graph(dcr_graph, graph_path)
    print(f">> Saved DCR graph to {graph_path}")


if __name__ == "__main__":
    main()
