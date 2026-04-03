"""DECLARE constraint discovery pipeline using Declare4Py.

Discovers DECLARE constraints from a preprocessed activity-log CSV using
the Declare4Py library (DeclareMiner algorithm).  The pipeline:

  1. Loads the CSV and converts it to a pm4py EventLog.
  2. Exports the log to XES format (required by Declare4Py).
  3. Runs DeclareMiner to discover all DECLARE constraint templates.
  4. Re-computes support/confidence metrics against the original log so
     results are expressed in the same unified format as DiscoverPipeline.
  5. Saves the discovered constraints as JSON + CSV and the raw model as
     a .decl file.

Usage:
    python declare4py_pipeline.py \\
        --csv data/preprocessed.csv \\
        --out-dir output \\
        --min-support 0.4 \\
        --itemsets-support 0.8 \\
        --max-cardinality 2

Output files (all in ``--out-dir``, stem taken from the input CSV):
    {stem}.xes                          -- intermediate XES log
    {stem}_declare_model.decl           -- raw Declare4Py model
    {stem}_declare4py_constraints.json  -- unified rules (JSON)
    {stem}_declare4py_constraints.csv   -- unified rules (CSV)
"""

import argparse
import re
import logging
from pathlib import Path

from Declare4Py.D4PyEventLog import D4PyEventLog
from Declare4Py.ProcessMiningTasks.Discovery.DeclareMiner import DeclareMiner

from shared.pipeline_base import BasePipeline
from shared.pipeline_io import export_xes
from shared.pipeline_metrics import build_trace_cache, compute_metrics_for_template
from shared.pipeline_schema import create_rule, normalize_activities

logging.getLogger("matplotlib").setLevel(logging.WARNING)


class Declare4PyPipeline(BasePipeline):
    """Discover DECLARE constraints using the Declare4Py DeclareMiner algorithm.

    Inherits common CSV loading, path construction, and result-saving logic
    from ``BasePipeline``.  Adds Declare4Py-specific model discovery, template
    name parsing, cardinality extraction, and metrics recomputation.
    """

    def __init__(
        self,
        csv_path: Path,
        out_dir: Path,
        min_support: float,
        itemsets_support: float,
        max_cardinality: int,
    ) -> None:
        """Configure the pipeline with discovery thresholds.

        Args:
            csv_path:          Path to the preprocessed activity-log CSV.
            out_dir:           Directory where all output files are written.
            min_support:       Minimum support for DeclareMiner (0.0 = no filter).
            itemsets_support:  Minimum itemsets support for DeclareMiner.
            max_cardinality:   Maximum cardinality for unary DECLARE templates.
        """
        super().__init__(csv_path, out_dir)
        self.min_support = min_support
        self.itemsets_support = itemsets_support
        self.max_cardinality = max_cardinality

    # ------------------------------------------------------------------
    # Step 1 – prepare XES input
    # ------------------------------------------------------------------

    def prepare_xes(self) -> tuple:
        """Load the CSV as a pm4py EventLog and export it to XES.

        Declare4Py requires XES input.  This step converts the CSV to a
        pm4py EventLog (for later metric computation) and persists it as an
        intermediate XES file that Declare4Py can read.

        Returns:
            Tuple of ``(event_log, xes_path)`` where ``event_log`` is a pm4py
            ``EventLog`` and ``xes_path`` is the ``Path`` to the written file.
        """
        log = self.load_event_log()
        xes_path = self.output_path(".xes")
        export_xes(log, xes_path)
        return log, xes_path

    # ------------------------------------------------------------------
    # Step 2 – Declare4Py model discovery
    # ------------------------------------------------------------------

    def discover_model(self, xes_path: Path):
        """Run DeclareMiner on the XES log to discover DECLARE constraints.

        Args:
            xes_path: Path to the XES file produced by ``prepare_xes()``.

        Returns:
            The ``DeclareModel`` returned by ``DeclareMiner.run()``.
        """
        d4py_log = D4PyEventLog(case_name="case:concept:name")
        d4py_log.parse_xes_log(str(xes_path))

        miner = DeclareMiner(
            log=d4py_log,
            consider_vacuity=False,
            min_support=self.min_support,
            itemsets_support=self.itemsets_support,
            max_declare_cardinality=self.max_cardinality,
        )

        print(">> Running DeclareMiner discovery...")
        return miner.run()

    # ------------------------------------------------------------------
    # Step 3 – constraint extraction and metrics recomputation
    # ------------------------------------------------------------------

    def extract_rules(self, model, trace_cache: list) -> list:
        """Extract DECLARE constraints with recomputed support/confidence metrics.

        Iterates over all constraints in the discovered model, normalises
        template names and activities, and delegates metric computation to
        ``compute_metrics_for_template``.  When metrics cannot be computed
        (e.g. unsupported template), the miner's own thresholds are used as
        fallback values.

        Args:
            model:       ``DeclareModel`` returned by ``discover_model()``.
            trace_cache: Pre-built trace cache from ``build_trace_cache()``.

        Returns:
            List of unified rule dicts (see ``pipeline_schema.create_rule``).
        """
        if not hasattr(model, "constraints") or not isinstance(model.constraints, list):
            return []

        rules = []
        seen: set = set()

        for constraint_dict in model.constraints:
            if not isinstance(constraint_dict, dict):
                continue

            template_obj = constraint_dict.get("template")
            activities_raw = constraint_dict.get("activities", [])
            n_value = constraint_dict.get("n", None)

            template = self._extract_template_name(template_obj)
            cardinality = self._extract_cardinality(template, n_value)
            activities = normalize_activities(activities_raw)

            constraint_key = (template, tuple(activities))
            if constraint_key in seen:
                continue
            seen.add(constraint_key)

            template_norm = self._normalize_template_name(template)
            metrics = compute_metrics_for_template(template_norm, activities, trace_cache, cardinality)

            if metrics:
                rule = create_rule(
                    rule_id=f"declare_{len(rules)}",
                    rule_type=template,
                    template=template,
                    activities=activities,
                    support=float(metrics["support"]),
                    confidence=float(metrics["confidence"]),
                    cardinality=cardinality,
                    trace_count=metrics["trace_count"],
                    support_count=metrics["support_count"],
                    violation_count=metrics["violation_count"],
                    activation_count=metrics["activation_count"],
                    fulfillment_count=metrics["fulfillment_count"],
                    activation_trace_count=metrics["activation_trace_count"],
                    metrics_source="computed",
                    source="declare4py",
                )
            else:
                rule = create_rule(
                    rule_id=f"declare_{len(rules)}",
                    rule_type=template,
                    template=template,
                    activities=activities,
                    support=float(self.min_support),
                    confidence=float(self.itemsets_support),
                    cardinality=cardinality,
                    metrics_source="fallback",
                    source="declare4py",
                )

            rules.append(rule)

        return rules

    # ------------------------------------------------------------------
    # Step 4 – model persistence
    # ------------------------------------------------------------------

    def save_declare_model(self, model) -> Path:
        """Write the raw DECLARE model to a .decl text file.

        Args:
            model: ``DeclareModel`` returned by ``discover_model()``.

        Returns:
            Path to the written .decl file.
        """
        model_path = self.output_path("_declare_model.decl")
        model_path.parent.mkdir(parents=True, exist_ok=True)
        with open(model_path, "w", encoding="utf-8") as f:
            if hasattr(model, "serialized_constraints"):
                f.write("\n".join(model.serialized_constraints))
            else:
                f.write("# DECLARE Model\n")
                f.write(f"# Constraints: {len(getattr(model, 'constraints', []))}\n")
        return model_path

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------

    def run(self) -> list:
        """Execute the full pipeline end-to-end and return discovered rules.

        Steps:
            1. Load CSV → export XES
            2. Run DeclareMiner
            3. Save .decl model
            4. Recompute metrics via trace cache
            5. Save unified JSON + CSV

        Returns:
            List of unified rule dicts with all computed metrics.
        """
        print(f">> Loading CSV from {self.csv_path}")
        log, xes_path = self.prepare_xes()
        print(f">> Log: {len(log)} traces, {sum(len(t) for t in log)} events")
        print(f">> Exported XES to {xes_path}")

        model = self.discover_model(xes_path)
        n_constraints = len(model.constraints) if hasattr(model, "constraints") else 0
        print(f">> Discovered {n_constraints} raw constraints")

        model_path = self.save_declare_model(model)
        print(f">> Saved DECLARE model to {model_path}")

        print(">> Recomputing metrics via trace cache...")
        trace_cache = build_trace_cache(log)
        rules = self.extract_rules(model, trace_cache)
        print(f">> Extracted {len(rules)} constraints with metrics")

        json_path, csv_path = self.save_results(rules, "declare4py_constraints")
        print(f">> Saved constraints to {json_path} and {csv_path}")

        return rules

    # ------------------------------------------------------------------
    # Private helpers – template name and cardinality parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_template_name(template_obj) -> str:
        """Return a plain string template name from a Declare4Py Template object.

        Declare4Py represents templates as enum values (e.g.
        ``Template.RESPONSE``).  This method handles both enum objects and
        plain strings.

        Args:
            template_obj: A Declare4Py ``Template`` enum instance or a string.

        Returns:
            Template name as a plain string (e.g. ``"Response"``).
        """
        if hasattr(template_obj, "name"):
            return template_obj.name

        template_str = str(template_obj)
        if ":" in template_str:
            return template_str.split(":")[-1].strip(" >")
        return template_str

    @staticmethod
    def _extract_cardinality(template: str, n_value) -> int | None:
        """Extract the numeric cardinality bound for unary templates.

        For templates like ``Existence``, ``Absence``, and ``Exactly``,
        Declare4Py may supply the cardinality as an explicit ``n`` parameter
        or embed it in the template name (e.g. ``Existence2``).

        Args:
            template: Template name string.
            n_value:  Explicit cardinality value from the constraint dict,
                      or ``None`` if absent.

        Returns:
            Integer cardinality, or ``None`` for binary templates.
        """
        if n_value is not None and any(t in template for t in ("Existence", "Absence", "Exactly")):
            return n_value

        match = re.search(r"\d+", template)
        if match:
            return int(match.group())

        return None

    @staticmethod
    def _normalize_template_name(template: str) -> str:
        """Convert a Declare4Py template name to the lowercase key used by the metrics module.

        Strips digits and non-alphabetic characters so that e.g.
        ``"AlternateResponse"`` → ``"alternateresponse"`` and
        ``"Existence2"`` → ``"existence"``.

        Args:
            template: Raw template name string.

        Returns:
            Normalised lowercase key for ``compute_metrics_for_template``.
        """
        base = re.sub(r"\d+", "", template)
        base = re.sub(r"[^A-Za-z]", "", base)
        return base.lower()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Parse CLI arguments and run Declare4PyPipeline."""
    parser = argparse.ArgumentParser(
        description="Discover DECLARE constraints from an activity-log CSV using Declare4Py"
    )
    BasePipeline.add_common_args(parser)
    parser.add_argument(
        "--min-support", type=float, default=0.0,
        help="Minimum support for DeclareMiner (0.0 = discover all)",
    )
    parser.add_argument(
        "--itemsets-support", type=float, default=0.0,
        help="Minimum itemsets support for DeclareMiner (0.0 = discover all)",
    )
    parser.add_argument(
        "--max-cardinality", type=int, default=2,
        help="Maximum cardinality for unary DECLARE templates",
    )
    args = parser.parse_args()

    pipeline = Declare4PyPipeline(
        csv_path=Path(args.csv),
        out_dir=Path(args.out_dir),
        min_support=args.min_support,
        itemsets_support=args.itemsets_support,
        max_cardinality=args.max_cardinality,
    )
    pipeline.run()


if __name__ == "__main__":
    main()
