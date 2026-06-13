from pathlib import Path
import json

import pandas as pd

from src.strategies.frozen_active_signals import ACTIVE_IDS
from src.strategies.shadow_live_operations import (
    ACTIVE_COUNT,
    EQUAL_WEIGHT,
    FORWARD_LABEL,
    _trade_legs,
    update_raw_ohlcv,
)


def test_frozen_active_contract_and_no_accepted_return_fallback():
    source = Path("src/strategies/shadow_live_operations.py").read_text(encoding="utf-8")
    assert len(ACTIVE_IDS) == ACTIVE_COUNT == 16
    assert EQUAL_WEIGHT == 1 / 16
    assert '"accepted_series_pnl_fallback": False' in source
    assert FORWARD_LABEL == "FORWARD_SHADOW_LIVE"


def test_trade_generation_actions():
    assert _trade_legs(0.0, 0.2) == [("BUY", 0.2)]
    assert _trade_legs(0.2, 0.0) == [("SELL", 0.2)]
    assert _trade_legs(0.0, -0.2) == [("SHORT", 0.2)]
    assert _trade_legs(-0.2, 0.0) == [("COVER", 0.2)]
    assert _trade_legs(-0.2, 0.2) == [("COVER", 0.2), ("BUY", 0.2)]
    assert _trade_legs(0.2, 0.2) == []


def test_incremental_raw_ohlcv_update(monkeypatch, tmp_path):
    monkeypatch.setattr("src.strategies.shadow_live_operations._frozen_universe", lambda root: ["AAA"])
    calls = []

    def fake_download(tickers, **kwargs):
        calls.append(kwargs)
        frame = pd.DataFrame([
            {"date": "2026-06-11", "ticker": "AAA", "provider_symbol": "AAA", "open": 10, "high": 11,
             "low": 9, "close": 10, "adj_close": 10, "volume": 1_000_000, "source": "yfinance"}
        ])
        return frame, pd.DataFrame(), pd.DataFrame()

    monkeypatch.setattr("src.strategies.shadow_live_operations.download_ohlcv", fake_download)
    first, _, audit = update_raw_ohlcv(tmp_path, end_date="2026-06-12")
    second, _, _ = update_raw_ohlcv(tmp_path, end_date="2026-06-12")
    assert len(first) == len(second) == 1
    assert audit["duplicate_date_count"] == 0
    assert calls[0]["start_date"] == "2024-01-01"
    assert len(calls) == 1


def test_generated_raw_outputs_reconcile():
    output = Path("output/shadow_live")
    manifest = json.loads((output / "daily_run_manifest.json").read_text(encoding="utf-8"))
    targets = pd.read_csv(output / "target_position_snapshots.csv")
    post = pd.read_csv(output / "post_trade_holdings.csv")
    trades = pd.read_csv(output / "trade_log.csv")
    assert manifest["runner_mode"] == "RAW DATA SIGNAL RUNNER"
    assert manifest["accepted_series_pnl_fallback"] is False
    assert manifest["signal_functions_invoked"] == 16
    assert not targets.empty and not post.empty and not trades.empty
    assert {"simulated_notional", "simulated_quantity", "simulated_execution_price", "realized_pnl", "unrealized_pnl"} <= set(post)
    assert set(targets["record_label"]) == {FORWARD_LABEL}
    assert not targets.duplicated(["signal_date", "strategy_id", "ticker"]).any()
    assert not trades["trade_id"].duplicated().any()
    assert all(value is True for key, value in manifest["reconciliation"].items() if isinstance(value, bool))
