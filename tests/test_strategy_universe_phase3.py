import json
from pathlib import Path

import pandas as pd

from src.reporting.artifact_generator import generate_dashboard_artifact
from src.strategies.active_universe import (
    ACTIVE_STRATEGY_IDS,
    ARCHIVED_STRATEGY_ID,
    REPLACEMENT_STRATEGY_ID,
    build_active_literature_results,
    governed_current_weights,
    is_governance_eligible_unallocated,
    load_governance_records,
)
from src.strategies.literature_backtests import run_all_literature_backtests


def _write_synthetic_price_panel(path, periods: int = 700) -> None:
    dates = pd.date_range("2022-01-03", periods=periods, freq="B")
    tickers = [
        "SPY", "TLT", "IEF", "USMV", "BIL", "DBC", "GLD", "TIP", "UUP", "VIX",
        "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC",
        "IWM", "MDY", "EFA", "EEM", "QUAL", "VLUE", "IVE", "MTUM", "HYG", "JNK", "LQD",
        "QQQ", "IVV", "VOO", "MNA", "CWB", "DBMF", "SHY", "USO", "XLF",
    ]
    rows = []
    for ti, ticker in enumerate(sorted(set(tickers))):
        price = 100.0 + ti
        for i, date in enumerate(dates):
            price *= 1.0 + 0.00012 + ((i + ti) % 9 - 4) * 0.00035
            rows.append({"date": date.date().isoformat(), "ticker": ticker, "adj_close": price})
    pd.DataFrame(rows).to_csv(path, index=False)


def test_governance_record_approves_exp_equity_bond_unallocated():
    records = load_governance_records()
    promotion = next(item for item in records["promotions"] if item["strategy_id"] == REPLACEMENT_STRATEGY_ID)
    assert promotion["decision"] == "eligible_unallocated"
    assert promotion["canonical_specification"]["rebalance_days"] == 21
    assert promotion["canonical_specification"]["buy_bps"] == 5
    assert promotion["initial_allocation_policy"]["current_weight"] == 0.0
    assert is_governance_eligible_unallocated(REPLACEMENT_STRATEGY_ID, records)


def test_active_universe_has_twenty_members_without_index_arbitrage():
    assert len(ACTIVE_STRATEGY_IDS) == 20
    assert ARCHIVED_STRATEGY_ID not in ACTIVE_STRATEGY_IDS
    assert REPLACEMENT_STRATEGY_ID in ACTIVE_STRATEGY_IDS


def test_governed_weights_match_baseline(tmp_path):
    from src.strategies.active_universe import ARCHIVED_STRATEGY_ID, REPLACEMENT_STRATEGY_ID, governed_current_weights

    baseline_path = Path(__file__).resolve().parents[1] / "data" / "config" / "governed_portfolio_baseline.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))["baseline_current_weights"]
    weights = governed_current_weights()
    assert weights == {key: float(value) for key, value in baseline.items()}
    assert weights[REPLACEMENT_STRATEGY_ID] == 0.0
    assert ARCHIVED_STRATEGY_ID not in weights
    assert sum(1 for value in weights.values() if value > 0) == 10


def test_dashboard_artifact_integrates_active_universe(tmp_path):
    price_path = tmp_path / "prices.csv"
    literature_path = tmp_path / "literature.json"
    artifact_path = tmp_path / "artifact.json"
    _write_synthetic_price_panel(price_path)
    payload = run_all_literature_backtests(price_path)
    literature_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    import src.reporting.artifact_generator as artifact_generator

    original_load = artifact_generator._load_literature_strategy_backtests
    artifact_generator._load_literature_strategy_backtests = lambda path="output/literature_strategy_backtests.json": payload
    try:
        artifact = generate_dashboard_artifact(
            tmp_path / "registry.json",
            artifact_path,
        )
    finally:
        artifact_generator._load_literature_strategy_backtests = original_load

    strategy_ids = [row["strategy_id"] for row in artifact["strategies"]]
    assert len(strategy_ids) == 20
    assert ARCHIVED_STRATEGY_ID not in strategy_ids
    assert REPLACEMENT_STRATEGY_ID in strategy_ids
    replacement = next(row for row in artifact["strategies"] if row["strategy_id"] == REPLACEMENT_STRATEGY_ID)
    assert replacement["current_weight"] == 0.0
    assert replacement["proposed_weight"] == 0.0
    assert replacement["lifecycle_status"] == "eligible_unallocated"
    assert replacement["allocation_eligibility"]["eligible"] is True
    allocated = [row for row in artifact["strategies"] if row["current_weight"] > 0]
    assert len(allocated) == 10
    assert all(row["proposed_weight"] == row["current_weight"] for row in artifact["strategies"])
    assert replacement.get("rebalance_days") == 21 or replacement.get("canonical_specification", {}).get("rebalance_days") == 21
    assert artifact["governance_audit"]["promotions"]
    assert any(item["backtest"]["strategy_id"] == ARCHIVED_STRATEGY_ID for item in artifact["archived_strategy_evidence"])
