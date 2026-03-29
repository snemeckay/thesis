"""DECLARE constraint discovery pipeline using pm4py (DisCoveR algorithm).

Uses ``pm4py.discover_declare()`` — the DisCoveR algorithm — for efficient
discovery of all DECLARE-style declarative constraints from an event log.

Reference:
    C. O. Back et al., "DisCoveR: accurate and efficient discovery of
    declarative process models", STTT 2022, 24:563-587.

The pipeline:
    1. Loads the CSV using the shared ``BasePipeline`` (column renaming included).
    2. Optionally filters to the N most-frequent activities to control runtime
       (binary templates scale as O(n²) in the number of activities).
    3. Runs ``pm4py.discover_declare()`` to obtain all matching constraints.
    4. Converts pm4py raw metrics to the unified rule format.
    5. Saves results as JSON + CSV.

Supported DECLARE templates (discovered by pm4py):
    Unary:  existence, absence, exactly_one, init
    Binary: responded_existence, response, altresponse, chainresponse,
            precedence, altprecedence, chainprecedence,
            succession, altsuccession, chainsuccession,
            coexistence, nonsuccession, noncoexistence, nonchainsuccession

Usage:
    python discover_pipeline.py \\
        --csv data/preprocessed.csv \\
        --out-dir output \\
        --min-support 0.4 \\
        --min-confidence 0.8 \\
        --top-activities 50

Output files (all in ``--out-dir``, stem taken from the input CSV):
    {stem}_dcr_constraints.json  -- unified rules (JSON)
    {stem}_dcr_constraints.csv   -- unified rules (CSV)
"""

import argparse
import logging
import time
from pathlib import Path

import pm4py

from shared.pipeline_base import BasePipeline
from shared.pipeline_schema import create_rule

logging.getLogger("matplotlib").setLevel(logging.WARNING)


class DiscoverPipeline(BasePipeline):
    """Discover DECLARE constraints using pm4py's DisCoveR algorithm.

    Inherits common CSV loading, column renaming, path construction, and
    result-saving logic from ``BasePipeline``.  Adds activity filtering and
    the pm4py-specific discovery and rule-conversion logic.
    """

    def __init__(
        self,
        csv_path: Path,
        out_dir: Path,
        min_support: float,
        min_confidence: float,
        top_activities: int | None,
    ) -> None:
        """Configure the pipeline with discovery thresholds.

        Args:
            csv_path:       Path to the preprocessed activity-log CSV.
            out_dir:        Directory where all output files are written.
            min_support:    Minimum support ratio (0.0 = no filter).
            min_confidence: Minimum confidence ratio (0.0 = no filter).
            top_activities: When set, only the N most-frequent activities
                            (by trace coverage) are considered.  Strongly
                            recommended for logs with > 200 activities.
        """
        super().__init__(csv_path, out_dir)
        self.min_support = min_support
        self.min_confidence = min_confidence
        self.top_activities = top_activities

    # ------------------------------------------------------------------
    # Step 1 – optional activity filtering
    # ------------------------------------------------------------------

    def select_top_activities(self, df) -> set | None:
        """Return the N most-frequent activities by trace coverage, or None.

        When ``self.top_activities`` is set, ranks activities by the number
        of distinct traces they appear in and returns the top N as a set.
        Prints a warning when the full activity set is large but no limit
        was requested.

        Args:
            df: DataFrame with pm4py standard column names.

        Returns:
            A set of activity name strings, or ``None`` to use all activities.
        """
        n_activities = df["concept:name"].nunique()
        n_traces = df["case:concept:name"].nunique()

        if self.top_activities is not None:
            act_trace_counts = (
                df.groupby("concept:name")["case:concept:name"]
                .nunique()
                .sort_values(ascending=False)
            )
            top = act_trace_counts.head(self.top_activities)
            print(f">> Limiting to top {self.top_activities} activities (by trace coverage)")
            print(f"   Coverage range: {top.iloc[-1]/n_traces:.1%} – {top.iloc[0]/n_traces:.1%} of traces")
            print(f"   Pair count: {len(top) * (len(top) - 1):,}")
            return set(top.index.tolist())

        if n_activities > 200:
            print(
                f">> WARNING: {n_activities} unique activities → "
                f"~{n_activities * (n_activities - 1):,} pairs to check."
            )
            print("   This may take a very long time. Consider using --top-activities N to limit scope.")

        return None

    # ------------------------------------------------------------------
    # Step 2 – pm4py DECLARE discovery
    # ------------------------------------------------------------------

    def discover_rules(self, df, considered_activities: set | None) -> list:
        """Run pm4py.discover_declare() and convert results to unified rule dicts.

        When ``considered_activities`` is provided the DataFrame is filtered
        to those activities before discovery so pm4py does not encounter
        empty traces.

        pm4py metric semantics:
            ``support``    → activation trace count (traces where activator occurs)
            ``confidence`` → fulfillment trace count (traces where constraint holds)

        These are converted to ratios relative to total trace count.

        Args:
            df:                    DataFrame with pm4py standard column names.
            considered_activities: Set of activity names to restrict discovery,
                                   or ``None`` to use all activities.

        Returns:
            List of unified rule dicts (see ``pipeline_schema.create_rule``).
        """
        total_traces = df["case:concept:name"].nunique()
        n_act = len(considered_activities) if considered_activities else df["concept:name"].nunique()

        print(">> Running pm4py.discover_declare (DisCoveR algorithm) ...")
        print(f"   min_support={self.min_support}, min_confidence={self.min_confidence}")
        print(f"   activities={n_act}, estimated binary pairs={n_act * (n_act - 1):,}")

        work_df = self._filter_dataframe(df, considered_activities)
        t0 = time.time()
        model = pm4py.discover_declare(
            work_df,
            min_support_ratio=self.min_support,
            min_confidence_ratio=self.min_confidence,
        )
        print(f">> discover_declare completed in {time.time() - t0:.1f}s")

        return self._model_to_rules(model, total_traces)

    # ------------------------------------------------------------------
    # Step 3 – result summarisation
    # ------------------------------------------------------------------

    def summarize_by_template(self, rules: list) -> None:
        """Print the number of discovered constraints grouped by template name.

        Args:
            rules: List of unified rule dicts.
        """
        template_counts: dict = {}
        for rule in rules:
            t = rule["template"]
            template_counts[t] = template_counts.get(t, 0) + 1
        for template, count in sorted(template_counts.items()):
            print(f"     {template}: {count}")

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------

    def run(self) -> list:
        """Execute the full pipeline end-to-end and return discovered rules.

        Steps:
            1. Load and display log statistics
            2. Select activity subset (optional)
            3. Discover DECLARE constraints
            4. Summarise results by template
            5. Save unified JSON + CSV

        Returns:
            List of unified rule dicts with all computed metrics.
        """
        print(f">> Loading CSV from {self.csv_path}")
        df = self.load_dataframe()
        self.print_dataframe_stats(df)

        considered_activities = self.select_top_activities(df)

        rules = self.discover_rules(df, considered_activities)
        print(f">> Discovered {len(rules)} DECLARE constraints")
        self.summarize_by_template(rules)

        json_path, csv_path = self.save_results(rules, "dcr_constraints")
        print(f">> Saved to {json_path} and {csv_path}")
        print(">> Use visualize_relations.py to filter and visualize these relationships")

        return rules

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _filter_dataframe(df, considered_activities: set | None):
        """Return a copy of ``df`` restricted to the given activities.

        Drops traces that become empty after filtering so pm4py does not
        encounter zero-event cases.  Returns the original DataFrame unchanged
        when ``considered_activities`` is ``None``.

        Args:
            df:                    DataFrame with pm4py standard column names.
            considered_activities: Set of activity names to keep, or ``None``.

        Returns:
            Filtered (or original) DataFrame.
        """
        if not considered_activities:
            return df

        work_df = df[df["concept:name"].isin(considered_activities)].copy()
        case_sizes = work_df.groupby("case:concept:name").size()
        valid_cases = case_sizes[case_sizes > 0].index
        work_df = work_df[work_df["case:concept:name"].isin(valid_cases)]
        print(
            f"   Filtered DF: {len(work_df)} events, "
            f"{work_df['case:concept:name'].nunique()} traces"
        )
        return work_df

    @staticmethod
    def _model_to_rules(model: dict, total_traces: int) -> list:
        """Convert the nested pm4py discover_declare result dict to unified rules.

        pm4py returns ``{template_name: {activities_key: {"support": int, "confidence": int}}}``.
        This method flattens that structure into a list of unified rule dicts,
        converting raw counts to ratios.

        Args:
            model:        The dict returned by ``pm4py.discover_declare()``.
            total_traces: Total number of traces in the (unfiltered) log, used
                          to compute support ratios.

        Returns:
            List of unified rule dicts.
        """
        rules = []
        for template_name, constraints in model.items():
            for activities_key, metrics in constraints.items():
                activation_count = metrics["support"]
                fulfillment_count = metrics["confidence"]

                support_ratio = activation_count / total_traces if total_traces else 0.0
                confidence_ratio = (
                    fulfillment_count / activation_count if activation_count > 0 else 0.0
                )

                acts = list(activities_key) if isinstance(activities_key, tuple) else [activities_key]

                rules.append(create_rule(
                    rule_id=f"declare_{len(rules)}",
                    rule_type=template_name,
                    template=template_name,
                    activities=[str(a) for a in acts],
                    support=round(support_ratio, 6),
                    confidence=round(confidence_ratio, 6),
                    trace_count=total_traces,
                    support_count=fulfillment_count,
                    activation_count=activation_count,
                    fulfillment_count=fulfillment_count,
                    activation_trace_count=activation_count,
                    metrics_source="pm4py_discover_declare",
                    source="discover",
                ))

        return rules


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Parse CLI arguments and run DiscoverPipeline."""
    parser = argparse.ArgumentParser(
        description="Discover DECLARE constraints from an activity-log CSV using pm4py DisCoveR"
    )
    BasePipeline.add_common_args(parser)
    parser.add_argument(
        "--min-support", type=float, default=0.0,
        help="Minimum support ratio for DECLARE discovery (0.0 = no filter)",
    )
    parser.add_argument(
        "--min-confidence", type=float, default=0.0,
        help="Minimum confidence ratio for DECLARE discovery (0.0 = no filter)",
    )
    parser.add_argument(
        "--top-activities", type=int, default=None,
        help=(
            "Only consider the N most frequent activities (by trace coverage). "
            "Crucial for large datasets — with 1974 activities pm4py checks ~3.9M pairs. "
            "E.g. --top-activities 50 keeps runtime under a minute."
        ),
    )
    args = parser.parse_args()

    pipeline = DiscoverPipeline(
        csv_path=Path(args.csv),
        out_dir=Path(args.out_dir),
        min_support=args.min_support,
        min_confidence=args.min_confidence,
        top_activities=args.top_activities,
    )
    pipeline.run()


if __name__ == "__main__":
    main()
