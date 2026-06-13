import json
from pathlib import Path

import numpy as np
import pandas as pd

from src.strategies.shadow_live_operations import ACTIVE_COUNT, EQUAL_WEIGHT, INITIAL_CAPITAL, START_DATE, run_shadow_live

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/shadow_live"


def test_shadow_initialization_and_reconciliation():
    result = run_shadow_live(ROOT, freeze_date="2026-06-13")
    portfolio = pd.read_csv(OUTPUT / "portfolio_daily_ledger.csv")
    strategy = pd.read_csv(OUTPUT / "strategy_daily_ledger.csv")
    manifest = json.loads((OUTPUT / "daily_run_manifest.json").read_text(encoding="utf-8"))
    assert portfolio.date.iloc[0] == START_DATE
    assert portfolio.open_to_open_interval.iloc[0] == f"{START_DATE}_OPEN_TO_NEXT_OPEN"
    assert portfolio.beginning_nav.iloc[0] == INITIAL_CAPITAL
    assert portfolio.active_count.eq(ACTIVE_COUNT).all()
    assert strategy.sleeve_weight.eq(EQUAL_WEIGHT).all()
    assert np.allclose(strategy.groupby("date").daily_pnl.sum(), portfolio.set_index("date").net_pnl)
    assert np.isclose(strategy.transaction_cost.sum(), portfolio.transaction_cost.sum())
    assert manifest["reconciliation"]["weights_sum_to_one"] is True
    assert manifest["reconciliation"]["no_non_active_strategy"] is True
    assert manifest["reconciliation"]["combined_portfolio_excluded"] is True


def test_backfill_labels_pending_interval_and_idempotency():
    before = pd.read_csv(OUTPUT / "portfolio_daily_ledger.csv")
    result = run_shadow_live(ROOT, freeze_date="2026-06-13")
    after = pd.read_csv(OUTPUT / "portfolio_daily_ledger.csv")
    bundle = json.loads((ROOT / "dashboard/data/shadow_live_bundle.json").read_text(encoding="utf-8"))
    assert len(before) == len(after)
    assert result["portfolio_rows_added"] == 0
    assert set(after.record_label) == {"RETROSPECTIVE_PAPER_BACKFILL"}
    assert bundle["shadow_live"]["pending_intervals"] == ["2026-06-09"]
    assert bundle["shadow_live"]["correlation"]["status"] == "NOT ENOUGH LIVE HISTORY"
    assert bundle["shadow_live"]["correlation"]["observations"] == 3


def test_trade_and_holdings_contracts():
    trades = pd.read_csv(OUTPUT / "trade_log.csv")
    holdings = pd.read_csv(OUTPUT / "holdings_ledger.csv")
    assert not holdings.empty
    assert {"strategy_id", "ticker", "target_weight", "portfolio_weight", "simulated_notional", "run_id"} <= set(holdings)
    assert trades.empty
    assert not holdings.duplicated(["date", "strategy_id", "ticker"]).any()
