import unittest

from mining_app.naming import artifact_download_name, output_name
from mining_app.preparation import ValidationError


class NamingTests(unittest.TestCase):
    def test_portable_names(self):
        self.assertEqual(output_name(" My study.CSV "), "My study")
        self.assertEqual(output_name("my-study_2026"), "my-study_2026")
        for value in (None, "", "A" * 81, ".", "folder/file", "file.csv.exe", "NUL", "COM1.csv"):
            with self.assertRaises(ValidationError):
                output_name(value)

    def test_exact_single_name_and_separate_both_names(self):
        activity = {"level": "activity", "csv": "activity_dcr_constraints.csv"}
        category = {"level": "category", "csv": "category_dcr_constraints.csv"}
        job = {"output_name": "Study", "artifacts": [activity]}
        self.assertEqual(artifact_download_name(job, activity, "csv"), "Study.csv")
        job["artifacts"].append(category)
        self.assertEqual(artifact_download_name(job, activity, "csv"), "Study_activity.csv")
        self.assertEqual(artifact_download_name(job, category, "csv"), "Study_category.csv")
        self.assertEqual(artifact_download_name({"artifacts": [activity]}, activity, "csv"),
                         "activity_dcr_constraints.csv")
