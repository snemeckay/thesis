import io
import logging
import tempfile
import time
import unittest
import zipfile
from unittest.mock import patch

from fastapi.testclient import TestClient

from mining_app.server import create_app
from mining_app.tests.test_preparation import CSV, profile

# Declare4Py enables global INFO logging; keep HTTP polling out of test output.
logging.getLogger("httpx").setLevel(logging.WARNING)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.app = create_app(self.directory.name)
        self.client = TestClient(self.app, base_url="http://127.0.0.1")
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.directory.cleanup()

    def prepare(self):
        response = self.client.post("/api/preview", files={"file": ("synthetic.csv", CSV.encode(), "text/csv")})
        self.assertEqual(response.status_code, 200, response.text)
        upload = response.json()
        result = self.client.post("/api/prepare", json={"upload_id": upload["upload_id"], "profile": profile()})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def test_real_job_cache_exports_and_persistence(self):
        dataset = self.prepare()
        request = {"dataset_id": dataset["id"], "configuration": {"label_level": "both"},
                   "cohort": [{"column": "age", "op": "range", "value": [19, 21]}]}
        job_response = self.client.post("/api/mine", json=request)
        self.assertEqual(job_response.status_code, 200, job_response.text)
        job = job_response.json()
        deadline = time.monotonic() + 90
        while job["status"] not in {"complete", "failed"} and time.monotonic() < deadline:
            time.sleep(.1)
            job = self.client.get(f"/api/jobs/{job['id']}").json()
        if job["status"] == "failed":
            self.fail(self.client.get(job["log_url"]).text)
        self.assertEqual(job["status"], "complete")
        self.assertEqual(job["population"]["cases"], 1)
        cached = self.client.post("/api/mine", json=request).json()
        self.assertTrue(cached["cached"])
        self.assertEqual(job["id"], cached["id"])
        different = self.client.post("/api/mine", json={**request, "cohort": []}).json()
        self.assertNotEqual(different["id"], job["id"])
        self.assertEqual(different["population"]["cases"], 2)
        models = self.client.get(f"/api/models?dataset_id={dataset['id']}").json()
        self.assertTrue(any(m["id"] == job["id"] for m in models))
        url = f"/api/models/{job['id']}/file/"
        metadata = self.client.get(url + "metadata.json").json()
        self.assertEqual(metadata["configuration"]["label_level"], "both")
        model_csv = self.client.get(url + "category_dcr_constraints.csv").text
        self.assertIn("label_level", model_csv)
        bundle = self.client.get(f"/api/datasets/{dataset['id']}/bundle")
        with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
            self.assertIn("dataset.json", archive.namelist())
            self.assertIn("events.csv", archive.namelist())
            self.assertIn(f"models/{job['id']}/metadata.json", archive.namelist())
        # Inspect a persisted finished dataset without restarting the active job owner.
        saved = self.app.state.store.dataset(dataset["id"])
        self.assertEqual(saved["metadata"]["attributes"][1]["type"], "number")

    def test_private_paths_cross_origin_and_invalid_requests(self):
        self.assertEqual(self.client.get("/.mining-local/").status_code, 404)
        self.assertEqual(self.client.get("/output/private.csv").status_code, 422)
        response = self.client.post("/api/prepare", json={}, headers={"Origin": "https://example.org"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get("/api/datasets", headers={"Host": "attacker.example"}).status_code, 400)
        self.assertEqual(self.client.post("/api/mine", content="{", headers={"Content-Type": "application/json"}).status_code, 422)
        self.assertEqual(self.client.post("/api/preview", files={"file": ("bad.csv", b"\xff", "text/csv")}).status_code, 422)

    def test_profile_and_absent_engine_error(self):
        result = self.client.post("/api/profiles", json={"name": "Study", "profile": profile()})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.client.get("/api/profiles").json()[0]["profile"], profile())
        dataset = self.prepare()
        import importlib.metadata
        with patch("mining_app.server.importlib.metadata.version", side_effect=importlib.metadata.PackageNotFoundError):
            result = self.client.post("/api/mine", json={"dataset_id": dataset["id"]})
        self.assertEqual(result.status_code, 422)
        self.assertIn("no engine has run", result.json()["error"])


if __name__ == "__main__":
    unittest.main()
