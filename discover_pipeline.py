"""DECLARE constraint discovery pipeline using pm4py (DisCoveR algorithm).

Uses ``pm4py.discover_declare()`` — the DisCoveR algorithm — for efficient
discovery of all DECLARE-style declarative constraints from an event log.

Reference:
    C. O. Back et al., "DisCoveR: accurate and efficient discovery of
    declarative process models", STTT 2022, 24:563-587.

The pipeline:
    1. Loads the CSV using the shared ``BasePipeline`` (column renaming included).
    2. Runs ``pm4py.discover_declare()`` to obtain all matching constraints.
    3. Converts pm4py raw metrics to the unified rule format.
    4. Saves results as JSON + CSV.

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
        --min-confidence 0.8

Output files (all in ``--out-dir``, stem taken from the input CSV):
    {stem}_dcr_constraints.json  -- unified rules (JSON)
    {stem}_dcr_constraints.csv   -- unified rules (CSV)
"""

import argparse
import logging
from pathlib import Path

import pm4py

from shared.pipeline_base import BasePipeline
from shared.pipeline_schema import create_rule

logging.getLogger("matplotlib").setLevel(logging.WARNING)


class DiscoverPipeline(BasePipeline):
    """Discover DECLARE constraints using pm4py's DisCoveR algorithm.

    Inherits common CSV loading, column renaming, path construction, and
    result-saving logic from ``BasePipeline``. Adds the pm4py-specific
    discovery and rule-conversion logic.
    """

    def __init__(
        self,
        csv_path: Path,
        out_dir: Path,
        min_support: float,
        min_confidence: float,
        top_activities: int | None = None,
    ) -> None:
        """Configure the pipeline with discovery thresholds.

        Args:
            csv_path:       Path to the preprocessed activity-log CSV.
            out_dir:        Directory where all output files are written.
            min_support:    Minimum support ratio (0.0 = no filter).
            min_confidence: Minimum confidence ratio (0.0 = no filter).
            top_activities: Deprecated – no longer applied automatically by
                            ``run()``.  Kept for backward compatibility.
        """
        super().__init__(csv_path, out_dir)
        self.min_support = min_support
        self.min_confidence = min_confidence
        self.top_activities = top_activities

    # ------------------------------------------------------------------
    # Step 2 – pm4py DECLARE discovery
    # ------------------------------------------------------------------

    def discover_rules(self, df) -> list:
        """Run pm4py.discover_declare() and convert results to unified rule dicts.

        pm4py metric semantics:
            ``support``    → activation trace count (traces where activator occurs)
            ``confidence`` → fulfillment trace count (traces where constraint holds)

        These are converted to ratios relative to total trace count.

        Args:
            df: DataFrame with pm4py standard column names.

        Returns:
            List of unified rule dicts (see ``pipeline_schema.create_rule``).
        """
        model = self.discover_model(df)
        total_traces = df["case:concept:name"].nunique()
        return self._model_to_rules(model, total_traces)

    def discover_model(self, df) -> dict:
        """Run pm4py.discover_declare() and return the raw model dict."""
        return pm4py.discover_declare(
            df,
            min_support_ratio=self.min_support,
            min_confidence_ratio=self.min_confidence,
        )

    # ------------------------------------------------------------------
    # Step 3 – result summarisation
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------

    def run(self) -> list:
        """Execute the full pipeline end-to-end and return discovered rules.

        Steps:
            1. Load CSV and display log statistics
            2. Discover DECLARE constraints
            3. Save unified JSON + CSV

        Returns:
            List of unified rule dicts with all computed metrics.
        """
        print(f">> Loading CSV from {self.csv_path}")
        df = self.load_dataframe()
        self.print_dataframe_stats(df)

        print(">> Running DisCoveR (pm4py.discover_declare)...")
        model = self.discover_model(df)
        rules = self._model_to_rules(model, df["case:concept:name"].nunique())
        print(f">> Discovered {len(rules)} constraints")

        json_path, csv_path = self.save_results(rules, "dcr_constraints")
        print(f">> Saved to {json_path} and {csv_path}")

        return rules

    @staticmethod
    def _filter_to_top_activities(df, top_k: int):
        """Keep only rows whose activity is among the top-K most frequent."""
        if top_k <= 0:
            return df

        top_vals = df["concept:name"].value_counts().head(top_k).index
        return df[df["concept:name"].isin(top_vals)].copy()

    @staticmethod
    def _model_to_rules(model: dict, total_traces: int) -> list:
        """Convert the nested pm4py discover_declare result dict to unified rules.

        pm4py returns ``{template_name: {activities_key: {"support": int, "confidence": int}}}``.
        In pm4py DisCoveR semantics:
            ``support``    → activation trace count (traces where activating condition holds)
            ``confidence`` → fulfillment trace count (activated traces where constraint holds)

        These are mapped to the unified schema as follows:
            ``activation_trace_count`` = pm4py ``support``
            ``fulfillment_count``      = pm4py ``confidence``
            ``violation_count``        = activation_trace_count − fulfillment_count
            ``support_count``          = total_traces − violation_count

        Note: pm4py only provides trace-level counts.  ``activation_count`` is
        therefore populated with the trace-level ``activation_trace_count`` as
        the best available approximation; event-level activation counts are not
        available from ``discover_declare``.

        Args:
            model:        The dict returned by ``pm4py.discover_declare()``.
            total_traces: Total number of traces in the log, used to compute
                          support ratios.

        Returns:
            List of unified rule dicts.
        """
        rules = []
        seen_constraints: set[tuple[str, tuple[str, ...]]] = set()
        for template_name, constraints in model.items():
            template_key = DiscoverPipeline._normalize_template_key(template_name)
            for activities_key, metrics in constraints.items():
                activation_trace_count = metrics["support"]
                fulfillment_count = metrics["confidence"]

                violation_count = max(activation_trace_count - fulfillment_count, 0)
                support_count = total_traces - violation_count

                support_ratio = support_count / total_traces if total_traces else 0.0
                confidence_ratio = (
                    fulfillment_count / activation_trace_count
                    if activation_trace_count > 0 else 0.0
                )

                acts = list(activities_key) if isinstance(activities_key, tuple) else [activities_key]
                acts = [str(a) for a in acts]

                constraint_key = DiscoverPipeline._canonical_constraint_key(template_key, acts)
                if constraint_key in seen_constraints:
                    continue
                seen_constraints.add(constraint_key)

                rules.append(create_rule(
                    rule_id=f"declare_{len(rules)}",
                    rule_type=template_name,
                    template=template_name,
                    activities=acts,
                    support=round(support_ratio, 6),
                    confidence=round(confidence_ratio, 6),
                    trace_count=total_traces,
                    support_count=support_count,
                    violation_count=violation_count,
                    activation_count=activation_trace_count,
                    fulfillment_count=fulfillment_count,
                    activation_trace_count=activation_trace_count,
                    metrics_source="pm4py_discover_declare",
                    source="discover",
                ))

        return rules

    @staticmethod
    def _normalize_template_key(template_name: str) -> str:
        return str(template_name or "").strip().lower().replace("_", "")

    @staticmethod
    def _canonical_constraint_key(template_key: str, activities: list[str]) -> tuple[str, tuple[str, ...]]:
        symmetric_templates = {"choice", "exclusivechoice", "coexistence", "notcoexistence", "noncoexistence"}

        if len(activities) == 2 and template_key in symmetric_templates:
            a, b = sorted(activities)
            return template_key, (a, b)

        return template_key, tuple(activities)


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
        help="Optional top-K most frequent activities to keep before discovery",
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
