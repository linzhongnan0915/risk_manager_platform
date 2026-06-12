from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from src.strategies.platform_registry import FUNDAMENTAL_RESEARCH_CANDIDATE_IDS, STRATEGY_SELECTION_STATUS

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "dashboard/data/us_equity_research_bundle.json"
PACK = ROOT / "output/research/fundamental_strategy_expansion_v1"


def test_bundle_statuses_and_active_only_composite():
    payload = json.loads(BUNDLE.read_text(encoding="utf-8"))["factory_strategy_research"]
    rows = {row["strategy_id"]: row for row in payload["results"]}
    for strategy_id, decision in STRATEGY_SELECTION_STATUS.items():
        factory = rows[strategy_id]["backtest"]["factory_research"]
        assert factory["membership"] == decision["status"]
        assert factory["research_composite_eligible"] is (decision["status"] == "ACTIVE")

    composite = rows["COMBINED_PORTFOLIO_V1"]["backtest"]["factory_research"]["combined_portfolio"]
    active = [strategy_id for strategy_id, value in STRATEGY_SELECTION_STATUS.items() if value["status"] == "ACTIVE"]
    assert composite["constituent_ids"] == active
    assert composite["N"] == 7
    assert sum(composite["weights"].values()) == pytest.approx(1.0)
    assert all(weight == pytest.approx(1 / 7) for weight in composite["weights"].values())


def test_fundamental_candidates_are_research_only_and_trade_log_reconciles():
    payload = json.loads(BUNDLE.read_text(encoding="utf-8"))["factory_strategy_research"]
    rows = {row["strategy_id"]: row for row in payload["results"]}
    summary = pd.read_csv(PACK / "candidate_summary.csv").set_index("strategy_id")
    trades = pd.read_csv(PACK / "trade_log.csv")
    daily = pd.read_csv(PACK / "daily_net_returns.csv")
    for strategy_id in FUNDAMENTAL_RESEARCH_CANDIDATE_IDS:
        backtest = rows[strategy_id]["backtest"]
        assert backtest["factory_research"]["membership"] == "RESEARCH_CANDIDATE"
        assert backtest["research_composite_eligible"] is False
        assert backtest["live_allocation_approved"] is False
        trade_cost = trades.loc[trades["strategy_id"] == strategy_id, "estimated_transaction_cost"].sum()
        daily_cost = daily.loc[daily["strategy_id"] == strategy_id, "transaction_cost"].sum()
        assert trade_cost == pytest.approx(daily_cost)
        assert summary.loc[strategy_id, "trade_cost_reconciliation_error"] < 1e-12
