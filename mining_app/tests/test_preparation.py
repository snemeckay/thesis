import unittest

from mining_app.preparation import ValidationError, normalize, preview, select_cohort


CSV = """user;session;time;end;app;category;gender;age
u1;1;2021-05-28 00:00:00;2021-05-28 00:01:00;A;Work;F;20
u1;1;2021-05-28 00:02:00;2021-05-28 00:03:00;B;Rest;F;20
u2;1;2021-05-28 00:00:00;2021-05-28 00:01:00;A;Rest;M;40
u2;1;2021-05-28 00:02:00;2021-05-28 00:03:00;C;Work;M;40
"""


def profile(**changes):
    return {"delimiter": ";", "case_columns": ["user", "session"], "activity": "app",
            "timestamp": "time", "end_timestamp": "end", "activity_category": "category",
            "attributes": [{"column": "gender", "type": "string", "scope": "case"},
                           {"column": "age", "type": "number", "scope": "case"}], **changes}


class PreparationTests(unittest.TestCase):
    def test_preview_suggests_only_syntax(self):
        result = preview(CSV)
        self.assertEqual(result["delimiter"], ";")
        self.assertNotIn("case_columns", result)
        self.assertEqual(result["event_count"], 4)

    def test_complete_cases_and_ambiguous_categories_preserved(self):
        data = normalize(CSV, profile())
        self.assertEqual(len(data["cases"]), 2)
        self.assertEqual(data["metadata"]["activity_categories"]["A"], ["Rest", "Work"])
        events, count = select_cohort(data, [{"column": "age", "op": "range", "value": [19, 21]}])
        self.assertEqual((len(events), count), (2, 1))
        self.assertEqual([e["activity"] for e in events], ["A", "B"])

    def test_explicit_case_required(self):
        with self.assertRaisesRegex(ValidationError, "Explicitly"):
            normalize(CSV, profile(case_columns=[]))

    def test_conflicts_not_first_row_wins(self):
        text = CSV.replace(";B;Rest;F;20", ";B;Rest;M;20")
        with self.assertRaisesRegex(ValidationError, "changes"):
            normalize(text, profile())
        data = normalize(text, profile(case_conflicts="exclude_case"))
        self.assertEqual(len(data["cases"]), 1)

    def test_missing_excludes_whole_group(self):
        text = CSV.replace(";B;Rest;F;20", ";B;Rest;;20")
        with self.assertRaisesRegex(ValidationError, "missing"):
            normalize(text, profile())
        data = normalize(text, profile(missing="exclude_case"))
        self.assertEqual(len(data["events"]), 2)
        self.assertEqual(data["metadata"]["quality"]["excluded_groups"], 1)

    def test_event_cohort_quantifier_retains_other_events(self):
        attrs = [{"column": "gender", "type": "string", "scope": "event"}]
        data = normalize(CSV.replace(";B;Rest;F;20", ";B;Rest;M;20"), profile(attributes=attrs))
        condition = {"column": "gender", "op": "eq", "value": "F"}
        with self.assertRaisesRegex(ValidationError, "any-event"):
            select_cohort(data, [condition])
        events, count = select_cohort(data, [{**condition, "quantifier": "any"}])
        self.assertEqual((len(events), count), (2, 1))

    def test_merge_preserves_category_and_attributes(self):
        data = normalize(CSV.replace(";B;Rest", ";A;Rest"), profile(merge_gap_seconds=120))
        self.assertEqual(len(data["events"]), 4)
        data = normalize(CSV.replace(";B;Rest", ";A;Work"), profile(merge_gap_seconds=120))
        self.assertEqual(len(data["events"]), 3)

    def test_gap_and_calendar_cases(self):
        text = CSV.replace("2021-05-28 00:02:00", "2021-05-29 00:02:00").replace(
            "2021-05-28 00:03:00", "2021-05-29 00:03:00")
        self.assertEqual(len(normalize(text, profile(case_mode="gap"))["cases"]), 4)
        self.assertEqual(len(normalize(text, profile(case_mode="calendar_day"))["cases"]), 4)

    def test_bad_csv_timestamps_ranges(self):
        for text in (CSV.replace("u1;1;", "u1;", 1), CSV.replace("2021-05-28", "bad", 1)):
            with self.assertRaises(ValidationError):
                normalize(text, profile())
        with self.assertRaises(ValidationError):
            select_cohort(normalize(CSV, profile()), [{"column": "age", "op": "range", "value": [40, 20]}])

    def test_timezone_consistency_and_reserved_labels(self):
        for text in (CSV.replace(";A;", ";A|B;", 1), CSV.replace("00:00:00;", "00:00:00Z;", 1)):
            with self.assertRaises(ValidationError):
                normalize(text, profile())


if __name__ == "__main__":
    unittest.main()
