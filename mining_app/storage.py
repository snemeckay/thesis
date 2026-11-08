"""Content-addressed local datasets and reproducible model jobs."""

import csv
import io
import json
import os
import re
import threading
import uuid
import zipfile
from pathlib import Path

from mining_app.preparation import ValidationError, fingerprint


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    os.replace(temporary, path)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def event_csv(dataset):
    columns = ["case_id", "activity_clean", "activity_category", "timestamp", "end_timestamp", "source_record"]
    attrs = dataset["metadata"]["attributes"]
    columns += [f"attribute:{a['column']}" for a in attrs]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for event in dataset["events"]:
        row = {key: event.get(key) for key in columns[:6]}
        row["activity_clean"] = event["activity"]
        row.update({f"attribute:{a['column']}": event["attributes"][a["column"]] for a in attrs})
        writer.writerow(row)
    return stream.getvalue()


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        # A stopped server cannot still own a running job.
        for path in self.root.glob("models/*/job.json"):
            job = read_json(path)
            if job["status"] in {"queued", "running"}:
                write_json(path, {**job, "status": "failed", "error": "Server stopped before this job completed. Select the dataset and mine again."})

    def path(self, kind, identifier):
        if kind not in {"uploads", "datasets", "models", "profiles"} or not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9]{64}", identifier):
            raise ValidationError("Invalid local artifact identifier.")
        return self.root / kind / identifier

    def upload(self, text, filename):
        identifier = fingerprint(text)
        write_json(self.path("uploads", identifier) / "upload.json", {"text": text, "name": filename})
        return identifier

    def dataset(self, identifier):
        path = self.path("datasets", identifier) / "dataset.json"
        if not path.exists():
            raise ValidationError("Dataset not found. Prepare the CSV first.")
        return read_json(path)

    def save_dataset(self, dataset, name):
        identifier = fingerprint(dataset)
        dataset = {**dataset, "id": identifier, "name": name}
        path = self.path("datasets", identifier)
        with self.lock:
            write_json(path / "dataset.json", dataset)
            write_json(path / "metadata.json", dataset["metadata"])
            (path / "events.csv").write_text(event_csv(dataset), encoding="utf-8")
        return dataset

    def summaries(self):
        result = []
        for path in self.root.glob("datasets/*/dataset.json"):
            dataset = read_json(path)
            schema = []
            for attr in dataset["metadata"]["attributes"]:
                values = {json.dumps(e["attributes"][attr["column"]], ensure_ascii=False)
                          for e in dataset["events"]}
                schema.append({**attr, "values": [json.loads(v) for v in sorted(values)[:500]],
                               "distinct": len(values), "values_truncated": len(values) > 500})
            result.append({"id": dataset["id"], "name": dataset["name"],
                           "metadata": dataset["metadata"], "schema": schema})
        return result

    def job(self, identifier):
        path = self.path("models", identifier) / "job.json"
        if not path.exists():
            raise ValidationError("Mining job not found.")
        return read_json(path)

    def models(self, dataset_id=None):
        result = []
        for path in self.root.glob("models/*/job.json"):
            job = read_json(path)
            if job["status"] == "complete" and (dataset_id is None or job["dataset_id"] == dataset_id):
                result.append(job)
        return result

    def bundle(self, identifier):
        path = self.path("datasets", identifier)
        self.dataset(identifier)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            for name in ("dataset.json", "metadata.json", "events.csv"):
                archive.write(path / name, name)
            for model in self.models(identifier):
                model_path = self.path("models", model["id"])
                for artifact in model_path.glob("*"):
                    if artifact.name in {"job.json", "metadata.json"} or artifact.name.endswith(("_constraints.csv", "_constraints.json")):
                        archive.write(artifact, f"models/{model['id']}/{artifact.name}")
        return stream.getvalue()
