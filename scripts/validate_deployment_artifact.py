"""Validate the committed deployment seed dashboard artifact."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT = PROJECT_ROOT / "output" / "dashboard_artifact.json"
EXPECTED_STRATEGY_COUNT = 20
ARCHIVED_STRATEGY_ID = "CAND_INDEX_ARBITRAGE_PROXY"
REPLACEMENT_STRATEGY_ID = "EXP_EQUITY_BOND_CORR_REGIME"


class DeploymentArtifactError(RuntimeError):
    """Raised when the deployment artifact fails validation."""


def validate_deployment_artifact(path: Path | str = DEFAULT_ARTIFACT) -> dict:
    artifact_path = Path(path)
    if not artifact_path.is_file():
        raise DeploymentArtifactError(f"Deployment artifact missing: {artifact_path}")

    try:
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DeploymentArtifactError(f"Deployment artifact is not valid JSON: {artifact_path}") from exc

    strategies = artifact.get("strategies") or []
    if len(strategies) != EXPECTED_STRATEGY_COUNT:
        raise DeploymentArtifactError(
            f"Expected {EXPECTED_STRATEGY_COUNT} strategies, found {len(strategies)}."
        )

    strategy_ids = [strategy.get("strategy_id") for strategy in strategies]
    if ARCHIVED_STRATEGY_ID in strategy_ids:
        raise DeploymentArtifactError(f"Archived strategy must not appear in active artifact: {ARCHIVED_STRATEGY_ID}.")
    if REPLACEMENT_STRATEGY_ID not in strategy_ids:
        raise DeploymentArtifactError(f"Active universe missing governed replacement strategy: {REPLACEMENT_STRATEGY_ID}.")

    replacement = next((row for row in strategies if row.get("strategy_id") == REPLACEMENT_STRATEGY_ID), None)
    if replacement is None:
        raise DeploymentArtifactError("Replacement strategy row missing from artifact.")
    if float(replacement.get("current_weight", -1.0)) != 0.0:
        raise DeploymentArtifactError("Replacement strategy must start with 0% current governed weight.")
    if replacement.get("lifecycle_status") != "eligible_unallocated":
        raise DeploymentArtifactError("Replacement strategy lifecycle must be eligible_unallocated.")

    governance = artifact.get("governance_audit") or {}
    if not governance.get("promotions"):
        raise DeploymentArtifactError("governance_audit.promotions is required for phase 3 artifact.")

    literature = artifact.get("literature_strategy_backtests") or {}
    literature_results = literature.get("results") if isinstance(literature, dict) else literature
    if not literature_results:
        raise DeploymentArtifactError("literature_strategy_backtests.results is empty.")

    empty_chart_strategies = []
    for strategy in strategies:
        chart = (strategy.get("risk_packet") or {}).get("chart_series") or {}
        if not chart.get("dates") or not chart.get("returns"):
            empty_chart_strategies.append(strategy.get("strategy_id") or strategy.get("name") or "unknown")

    if empty_chart_strategies:
        raise DeploymentArtifactError(
            "Strategy chart series are empty for: "
            + ", ".join(empty_chart_strategies[:5])
            + ("..." if len(empty_chart_strategies) > 5 else "")
        )

    portfolio_series = artifact.get("portfolio_series") or {}
    if not portfolio_series.get("returns"):
        raise DeploymentArtifactError("portfolio_series.returns is empty.")

    return artifact


def main() -> int:
    try:
        validate_deployment_artifact()
    except DeploymentArtifactError as exc:
        print(f"Deployment artifact validation failed: {exc}", file=sys.stderr)
        return 1
    print("Deployment artifact validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
