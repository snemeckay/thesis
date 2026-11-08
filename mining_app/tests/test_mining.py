import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from mining_app.preparation import normalize
from mining_app.server import configuration, engine_versions
from mining_app.storage import Store, event_csv, read_json, write_json
from mining_app.tests.test_preparation import CSV, profile
from mining_app.worker import run_job


class MiningTests(unittest.TestCase):
    def test_real_declare4py_and_multicategory_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            dataset = store.save_dataset(normalize(CSV, profile()), "synthetic.csv")
            cfg = configuration({"engine": "declare4py", "label_level": "both"}, dataset)
            path = store.path("models", "b" * 64)
            write_json(path / "job.json", {"id": "b" * 64, "configuration": cfg,
                                          "cohort": [], "versions": engine_versions("declare4py")})
            write_json(path / "input.json", dataset)
            with contextlib.redirect_stdout(io.StringIO()):
                metadata = run_job(path)
            self.assertEqual(metadata["population"], {"cases": 2, "events": 4})
            rules = read_json(path / "activity_declare4py_constraints.json")
            self.assertTrue(rules)
            a_rule = next(r for r in rules if r["activities"] == ["A"])
            self.assertEqual(a_rule["activity_categories"], [["Rest", "Work"]])
            self.assertTrue(read_json(path / "category_declare4py_constraints.json"))

    def test_real_both_models_and_cohort(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory)
            dataset = store.save_dataset(normalize(CSV, profile()), "synthetic.csv")
            cfg = configuration({"engine": "discover", "label_level": "both"}, dataset)
            cohort = [{"column": "gender", "op": "eq", "value": "F"}]
            identifier = "a" * 64
            path = store.path("models", identifier)
            job = {"id": identifier, "dataset_id": dataset["id"], "status": "queued",
                   "configuration": cfg, "cohort": cohort, "versions": engine_versions("discover")}
            write_json(path / "job.json", job)
            write_json(path / "input.json", dataset)
            with contextlib.redirect_stdout(io.StringIO()):
                metadata = run_job(path)
            self.assertEqual(metadata["population"], {"cases": 1, "events": 2})
            self.assertEqual([a["level"] for a in metadata["artifacts"]], ["activity", "category"])
            activity = read_json(path / "activity_dcr_constraints.json")
            category = read_json(path / "category_dcr_constraints.json")
            self.assertTrue(activity)
            self.assertTrue(category)
            self.assertEqual({a for r in activity for a in r["activities"]}, {"A", "B"})
            self.assertEqual({a for r in category for a in r["activities"]}, {"Work", "Rest"})
            self.assertTrue(all(r["trace_count"] == 1 for r in activity + category))
            a_rule = next(r for r in activity if r["activities"] == ["A"])
            self.assertEqual(a_rule["activity_categories"], [["Work"]])
            self.assertNotIn("gender", a_rule)
            self.assertIn("activity_category", event_csv(dataset))
            self.assertIn("attribute:gender", event_csv(dataset))

    def test_empty_csv_is_persisted(self):
        from shared.pipeline_io import save_csv
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.csv"
            save_csv([], path, ["rule_id", "rule_type", "activities"])
            self.assertEqual(path.read_text().strip(), "rule_id,rule_type,activities")

    def test_numeric_labels_and_leading_zero_ids_stay_strings(self):
        from shared.pipeline_base import BasePipeline
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.csv"
            path.write_text("case_id,activity_clean,timestamp\n001,1,2021-01-01\n002,2,2021-01-01\n", encoding="utf-8")
            df = BasePipeline(path, Path(directory)).load_dataframe()
            self.assertEqual(df["case:concept:name"].tolist(), ["001", "002"])
            self.assertEqual(df["concept:name"].tolist(), ["1", "2"])

    def test_category_unavailable_is_not_relabelled(self):
        dataset = normalize(CSV, profile(activity_category=""))
        with self.assertRaisesRegex(ValueError, "requires"):
            configuration({"label_level": "category"}, dataset)


if __name__ == "__main__":
    unittest.main()
