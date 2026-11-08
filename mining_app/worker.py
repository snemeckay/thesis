"""Run real mining pipelines in an isolated job process."""

import argparse
import csv
import importlib.metadata
import json
from pathlib import Path

from mining_app.preparation import select_cohort
from mining_app.storage import read_json, write_json


def run_job(path):
    job = read_json(path / "job.json")
    dataset = read_json(path / "input.json")
    events, case_count = select_cohort(dataset, job["cohort"])
    if not events:
        raise ValueError("No events in selected cohort.")
    from shared.pipeline_io import save_csv, save_json
    from shared.pipeline_schema import UNIFIED_FIELDS

    cfg = job["configuration"]
    levels = ["activity", "category"] if cfg["label_level"] == "both" else [cfg["label_level"]]
    artifacts = []
    for level in levels:
        source = path / f"{level}.csv"
        with source.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["case_id", "activity_clean", "timestamp"])
            writer.writeheader()
            writer.writerows({"case_id": e["case_id"],
                              "activity_clean": e["activity"] if level == "activity" else e["activity_category"],
                              "timestamp": e["timestamp"]} for e in events)
        print(f"Mining {level} labels: {case_count} complete cases, {len(events)} events", flush=True)
        if cfg["engine"] == "discover":
            from discover_pipeline import DiscoverPipeline
            pipeline = DiscoverPipeline(source, path, cfg["min_support"], cfg["min_confidence"])
            infix = "dcr_constraints"
        else:
            from declare4py_pipeline import Declare4PyPipeline
            pipeline = Declare4PyPipeline(source, path, cfg["min_support"],
                                          cfg["itemsets_support"], cfg["max_cardinality"])
            infix = "declare4py_constraints"
        rules = pipeline.run()
        # Categories are sets per endpoint, derived from this cohort, never first-row labels.
        categories = {}
        for event in events:
            values = categories.setdefault(event["activity"], set())
            if event["activity_category"] is not None:
                values.add(event["activity_category"])
        for rule in rules:
            rule["label_level"] = level
            rule["dataset_id"] = dataset["id"]
            rule["model_id"] = job["id"]
            rule["activity_categories"] = (
                [sorted(categories.get(a, set())) for a in rule["activities"]]
                if level == "activity" else [[a] for a in rule["activities"]])
        name = f"{level}_{infix}"
        save_json(rules, path / f"{name}.json")
        csv_rules = [{**r, "activity_categories": json.dumps(r["activity_categories"], ensure_ascii=False)} for r in rules]
        save_csv(csv_rules, path / f"{name}.csv",
                 UNIFIED_FIELDS + ["label_level", "dataset_id", "model_id", "activity_categories"])
        artifacts.append({"level": level, "csv": f"{name}.csv", "json": f"{name}.json", "rule_count": len(rules)})
    metadata = {
        "schema_version": 1, "dataset_id": dataset["id"], "model_id": job["id"],
        "preparation": dataset["metadata"], "configuration": cfg,
        "cohort": job["cohort"], "population": {"cases": case_count, "events": len(events)},
        "versions": job["versions"], "workflow_version": job.get("workflow_version", 1), "artifacts": artifacts,
        "metrics": "Trace-based activation confidence" if cfg["engine"] == "discover" else "Event-activation confidence",
    }
    write_json(path / "metadata.json", metadata)
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("job_directory", type=Path)
    args = parser.parse_args()
    run_job(args.job_directory.resolve())
