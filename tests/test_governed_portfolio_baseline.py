"""Regression tests for governed portfolio baseline preservation (Phase 3 correction)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAIN_BASELINE_PATH = PROJECT_ROOT / "data" / "config" / "governed_portfolio_baseline.json"


def _load_main_baseline_weights() -> dict[str, float]:
    payload = json.loads(MAIN_BASELINE_PATH.read_text(encoding="utf-8"))
    return {key: float(value) for key, value in payload["baseline_current_weights"].items()}


def _load_main_artifact_weights() -> dict[str, float]:
    result = subprocess.run(
        ["git", "show", "main:output/dashboard_artifact.json"],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=True,
    )
    artifact = json.loads(result.stdout)
    return {row["strategy_id"]: float(row.get("current_weight", 0.0)) for row in artifact["strategies"]}


def _write_synthetic_price_panel(path: Path, periods: int = 700) -> None:
    dates = pd.date_range("2022-01-03", periods=periods, freq="B")
    tickers = [
        "SPY", "TLT", "IEF", "USMV", "BIL", "DBC", "GLD", "TIP", "UUP", "VIX",
        "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC",
        "IWM", "MDY", "EFA", "EEM", "QUAL", "VLUE", "IVE", "MTUM", "HYG", "JNK", "LQD",
        "QQQ", "IVV", "VOO", "MNA", "CWB", "DBMF", "SHY", "USO",
    ]
    rows = []
    for ti, ticker in enumerate(sorted(set(tickers))):
        price = 100.0 + ti
        for i, date in enumerate(dates):
            price *= 1.0 + 0.00012 + ((i + ti) % 9 - 4) * 0.00035
            rows.append({"date": date.date().isoformat(), "ticker": ticker, "adj_close": price})
    pd.DataFrame(rows).to_csv(path, index=False)


def _generate_test_artifact(tmp_path: Path):
    from src.reporting.artifact_generator import generate_dashboard_artifact
    from src.strategies.literature_backtests import run_all_literature_backtests

    price_path = tmp_path / "prices.csv"
    artifact_path = tmp_path / "artifact.json"
    _write_synthetic_price_panel(price_path)
    payload = run_all_literature_backtests(price_path)

    import src.reporting.artifact_generator as artifact_generator

    original_load = artifact_generator._load_literature_strategy_backtests
    artifact_generator._load_literature_strategy_backtests = lambda path="output/literature_strategy_backtests.json": payload
    try:
        artifact = generate_dashboard_artifact(tmp_path / "registry.json", artifact_path)
    finally:
        artifact_generator._load_literature_strategy_backtests = original_load
    return artifact


def test_baseline_file_matches_pre_phase3_main_artifact():
    baseline = _load_main_baseline_weights()
    main = _load_main_artifact_weights()
    for strategy_id, weight in main.items():
        if strategy_id == "CAND_INDEX_ARBITRAGE_PROXY":
            continue
        assert strategy_id in baseline
        assert baseline[strategy_id] == weight
    assert baseline["EXP_EQUITY_BOND_CORR_REGIME"] == 0.0
    assert "CAND_INDEX_ARBITRAGE_PROXY" not in baseline


def test_governed_weights_match_baseline_not_equal_weighted():
    from src.strategies.active_universe import ARCHIVED_STRATEGY_ID, REPLACEMENT_STRATEGY_ID, governed_current_weights

    baseline = _load_main_baseline_weights()
    weights = governed_current_weights()
    assert weights == baseline
    positive = [sid for sid, w in weights.items() if w > 0]
    assert len(positive) == 10
    assert all(abs(w - 0.1) < 1e-12 for w in weights.values() if w > 0)
    assert weights[REPLACEMENT_STRATEGY_ID] == 0.0
    assert ARCHIVED_STRATEGY_ID not in weights


def test_artifact_preserves_governed_weights_and_no_rebalance(tmp_path):
    from src.strategies.active_universe import ARCHIVED_STRATEGY_ID, REPLACEMENT_STRATEGY_ID

    artifact = _generate_test_artifact(tmp_path)
    baseline = _load_main_baseline_weights()
    main_positive_count = sum(1 for sid, weight in _load_main_artifact_weights().items() if weight > 0)

    by_id = {row["strategy_id"]: row for row in artifact["strategies"]}
    assert len(by_id) == 20
    assert ARCHIVED_STRATEGY_ID not in by_id
    assert sum(1 for row in artifact["strategies"] if row["current_weight"] > 0) == main_positive_count

    for strategy_id, expected in baseline.items():
        assert strategy_id in by_id
        assert by_id[strategy_id]["current_weight"] == expected
        assert by_id[strategy_id]["proposed_weight"] == expected

    replacement = by_id[REPLACEMENT_STRATEGY_ID]
    assert replacement["lifecycle_status"] == "eligible_unallocated"
    assert replacement["current_weight"] == 0.0

    total = sum(row["current_weight"] for row in artifact["strategies"])
    assert abs(total - 1.0) < 1e-9
    assert artifact["allocation"]["estimated_transaction_cost"] == 0.0


def test_lifecycle_counts_and_research_only_blocked_at_zero(tmp_path):
    artifact = _generate_test_artifact(tmp_path)
    summary = artifact["strategy_universe"]["lifecycle_summary"]
    assert summary["allocated_existing"] >= 1
    assert summary["eligible_unallocated"] == 1
    assert summary["research_only_blocked"] >= 1
    assert summary["active_universe_total"] == 20

    blocked = [row for row in artifact["strategies"] if row["lifecycle_status"] == "research_only_blocked"]
    assert blocked
    assert all(row["current_weight"] == 0.0 for row in blocked)
    assert all(row["proposed_weight"] == 0.0 for row in blocked)


def test_no_rebalance_proposed_initial_state(tmp_path):
    artifact = _generate_test_artifact(tmp_path)
    for row in artifact["strategies"]:
        assert abs(row["allocation_change"]) < 1e-12
    assert all(abs(row["proposed_weight"] - row["current_weight"]) < 1e-12 for row in artifact["strategies"])
