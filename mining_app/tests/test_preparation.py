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

    def test_only_active_splitting_settings_are_validated(self):
        self.assertEqual(len(normalize(CSV, profile(gap_minutes=0, day_start_hour=99))["cases"]), 2)
        with self.assertRaisesRegex(ValidationError, "positive"):
            normalize(CSV, profile(case_mode="gap", gap_minutes=0))
        with self.assertRaisesRegex(ValidationError, "integer hour"):
            normalize(CSV, profile(case_mode="calendar_day", day_start_hour=99))

    def test_behavioural_day_requires_end_time(self):
        with self.assertRaisesRegex(ValidationError, "end-time"):
            normalize(CSV, profile(case_mode="behavioural_day", end_timestamp=None))

    def test_behavioural_days_reuse_original_boundary_phases(self):
        import pandas as pd
        from preprocessing.day_split import assign_day_counter

        examples = [
            ("2021-05-28 22:00:00", "2021-05-29 06:00:00"),  # waking window
            ("2021-05-28 18:00:00", "2021-05-28 23:00:00"),  # nighttime fallback
            ("2021-05-28 22:00:00", "2021-05-29 14:00:00"),  # 04:00 within gap
            ("2021-05-28 05:00:00", "2021-05-28 13:00:00"),  # late-sleep fallback
        ]
        for first, second in examples:
            with self.subTest(first=first, second=second):
                first_start = (pd.Timestamp(first) - pd.Timedelta(minutes=30)).isoformat(sep=" ")
                text = "user;time;end;app;category;gender;age\n"
                for user in ("u1", "u2"):
                    for at, until in ((first_start, first), (second, second)):
                        text += f"{user};{at};{until};A;Work;F;20\n"
                data = normalize(text, profile(case_columns=["user"], case_mode="behavioural_day"))
                reference = assign_day_counter(pd.DataFrame({
                    "user_id": ["u1", "u1"], "start_time": pd.to_datetime([first_start, second]),
                    "end_time": pd.to_datetime([first, second])
                }))
                self.assertEqual([e["case_id"] for e in data["events"][:2]],
                                 [f'["u1","{day}"]' for day in reference["day_counter"]])
                self.assertEqual(len(data["cases"]), 4)
                self.assertEqual(data["metadata"]["case_construction"]["minimum_gap_hours"], 4)
                self.assertEqual(select_cohort(data, [{"column": "gender", "op": "eq", "value": "F"}])[1], 4)

    def test_behavioural_days_choose_longest_candidate_not_every_gap(self):
        text = """user;time;end;app
u1;2021-05-28 21:00:00;2021-05-28 22:00:00;A
u1;2021-05-29 04:00:00;2021-05-29 04:10:00;B
u1;2021-05-29 09:00:00;2021-05-29 09:10:00;C
"""
        p = profile(case_columns=["user"], attributes=[], activity_category=None, case_mode="behavioural_day")
        data = normalize(text, p)
        self.assertEqual(len(data["cases"]), 2)
        self.assertEqual(data["events"][1]["case_id"], data["events"][2]["case_id"])
        self.assertEqual(len(normalize(text, {**p, "case_mode": "gap", "gap_minutes": 240})["cases"]), 3)

    def test_behavioural_days_preserve_attributes_and_no_gap_sequences(self):
        data = normalize(CSV, profile(case_columns=["user"], case_mode="behavioural_day"))
        self.assertEqual(len(data["events"]), 4)
        self.assertEqual(len(data["cases"]), 2)
        self.assertEqual(data["metadata"]["activity_categories"]["A"], ["Rest", "Work"])
        self.assertEqual(select_cohort(data, [{"column": "age", "op": "eq", "value": 20}])[1], 1)

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
