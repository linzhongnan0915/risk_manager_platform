"""Tests for scheduled intraday proxy refresh pipeline."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from src.market.intraday_config import bar_interval_for_refresh, load_intraday_config
from src.market.intraday_provider import _normalize_intraday_panel
from src.market.intraday_refresh_service import (
    build_refresh_status_payload,
    collect_refresh_tickers,
    refresh_lock,
    run_intraday_refresh,
)
from src.market.market_hours import market_session_status, should_run_scheduled_refresh
from src.market.snapshot_store import publish_snapshot, read_latest_pointer, read_latest_snapshot


@pytest.fixture
def intraday_cfg(tmp_path: Path) -> dict:
    cfg = load_intraday_config()
    cfg = dict(cfg)
    cfg["snapshot_dir"] = str(tmp_path / "snapshots")
    cfg["latest_pointer_path"] = str(tmp_path / "latest.json")
    cfg["status_path"] = str(tmp_path / "status.json")
    cfg["lock_path"] = str(tmp_path / "refresh.lock")
    return cfg


@pytest.fixture
def minimal_artifact() -> dict:
    return {
        "as_of_date": "2026-06-04",
        "initial_capital": 1_000_000,
        "allocation": {"current_weights": {"S1": 0.5, "S2": 0.5}},
        "strategies": [
            {
                "strategy_id": "S1",
                "name": "Alpha",
                "current_weight": 0.5,
                "daily_pnl": 1000.0,
                "position_packet": {"latest_positions": [{"source_ticker": "SPY", "weight": 1.0}]},
            },
            {
                "strategy_id": "S2",
                "name": "Macro",
                "current_weight": 0.5,
                "daily_pnl": -500.0,
                "position_packet": {"latest_positions": [{"source_ticker": "TLT", "weight": 1.0}]},
            },
        ],
        "factors": {"portfolio_factor_exposure_current": {"equity_beta": 0.3}},
        "risk_limits": {"checks": [], "factors": {"checks": []}},
        "operating_period_risk": {"pnl": {"cumulative_return": {"available": True, "value": 0.01}}},
        "build_metadata": {"artifact_generated_at": "2026-06-04T20:00:00Z"},
    }


def _mock_fetch_success(tickers, **kwargs):
    now_et = datetime.now(tz=ZoneInfo("America/New_York")).isoformat()
    rows = []
    for ticker in tickers:
        rows.append(
            {
                "source_ticker": ticker,
                "observation_ts_et": now_et,
                "session_date": now_et[:10],
                "open": 100.0,
                "high": 101.0,
                "low": 99.0,
                "close": 101.0,
                "volume": 1000.0,
                "bar_interval": kwargs.get("bar_interval", "15m"),
                "intraday_return_from_open": 0.01,
                "timezone": "America/New_York",
            }
        )
    return {
        "provider": "yfinance",
        "bar_interval": kwargs.get("bar_interval", "15m"),
        "requested_tickers": tickers,
        "rows": rows,
        "missing_tickers": [],
        "stale_tickers": [],
        "ticker_count_requested": len(tickers),
        "ticker_count_successful": len(tickers),
        "latest_observation_ts_et": now_et,
        "incomplete_bar_label": "incomplete_current_bar",
    }


def _mock_fetch_partial(tickers, **kwargs):
    payload = _mock_fetch_success(tickers[: max(1, len(tickers) // 2)], **kwargs)
    payload["missing_tickers"] = tickers[max(1, len(tickers) // 2) :]
    payload["ticker_count_requested"] = len(tickers)
    payload["ticker_count_successful"] = len(payload["rows"])
    return payload


def _mock_fetch_fail(tickers, **kwargs):
    raise RuntimeError("provider unavailable")


def test_bar_interval_mapping_30_and_10_minutes(intraday_cfg):
    assert bar_interval_for_refresh(intraday_cfg, 30) == "15m"
    assert bar_interval_for_refresh(intraday_cfg, 10) == "5m"


def test_market_closed_skips_scheduled_refresh(intraday_cfg):
    closed = datetime(2026, 6, 6, 12, 0, tzinfo=ZoneInfo("America/New_York"))  # Saturday
    assert should_run_scheduled_refresh(
        closed,
        timezone=intraday_cfg["timezone"],
        holidays=intraday_cfg["market_holidays"],
        regular_session_only=True,
    ) is False
    info = market_session_status(closed, timezone=intraday_cfg["timezone"], holidays=intraday_cfg["market_holidays"])
    assert info.status == "Closed"


def test_market_open_allows_scheduled_refresh(intraday_cfg):
    open_time = datetime(2026, 6, 5, 11, 0, tzinfo=ZoneInfo("America/New_York"))
    assert should_run_scheduled_refresh(
        open_time,
        timezone=intraday_cfg["timezone"],
        holidays=intraday_cfg["market_holidays"],
        regular_session_only=True,
    ) is True


def test_duplicate_refresh_job_prevented(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    lock_path = Path(intraday_cfg["lock_path"])
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.close(fd)
    try:
        result = run_intraday_refresh(
            force=True,
            artifact_path=artifact_path,
            config=intraday_cfg,
            fetch_fn=_mock_fetch_success,
        )
        assert result["ok"] is False
        assert result["error"] == "refresh_already_in_progress"
    finally:
        lock_path.unlink(missing_ok=True)


def test_successful_refresh_publishes_snapshot(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    open_time = datetime(2026, 6, 5, 11, 0, tzinfo=ZoneInfo("America/New_York"))
    result = run_intraday_refresh(
        force=True,
        artifact_path=artifact_path,
        config=intraday_cfg,
        fetch_fn=_mock_fetch_success,
    )
    assert result["ok"] is True
    assert result["snapshot_id"]
    pointer = read_latest_pointer(intraday_cfg)
    assert pointer["snapshot_id"] == result["snapshot_id"]
    snapshot = read_latest_snapshot(intraday_cfg)
    assert snapshot["refresh_status"] == "success"
    assert snapshot["latest_observation_ts_et"]
    assert snapshot["refresh_completed_at"] != snapshot["latest_observation_ts_et"]


def test_failed_refresh_preserves_previous_snapshot(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    ok = run_intraday_refresh(force=True, artifact_path=artifact_path, config=intraday_cfg, fetch_fn=_mock_fetch_success)
    prior_id = ok["snapshot_id"]
    fail = run_intraday_refresh(force=True, artifact_path=artifact_path, config=intraday_cfg, fetch_fn=_mock_fetch_fail)
    assert fail["ok"] is False
    assert read_latest_pointer(intraday_cfg)["snapshot_id"] == prior_id


def test_partial_ticker_failure_below_threshold_fails(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    intraday_cfg["min_success_ticker_ratio"] = 0.95
    result = run_intraday_refresh(
        force=True,
        artifact_path=artifact_path,
        config=intraday_cfg,
        fetch_fn=_mock_fetch_partial,
    )
    assert result["ok"] is False
    assert "insufficient ticker coverage" in result["error"]


def test_partial_ticker_failure_above_threshold_marks_delayed(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    intraday_cfg["min_success_ticker_ratio"] = 0.3
    result = run_intraday_refresh(
        force=True,
        artifact_path=artifact_path,
        config=intraday_cfg,
        fetch_fn=_mock_fetch_partial,
    )
    assert result["ok"] is True
    snapshot = read_latest_snapshot(intraday_cfg)
    assert snapshot["marks"]["data_quality"]["freshness"] == "Delayed"


def test_stale_ticker_classification():
    idx = pd.date_range("2026-06-05 09:30", periods=1, freq="15min", tz="UTC")
    data = pd.DataFrame(
        {
            "Open": [100.0],
            "High": [101.0],
            "Low": [99.0],
            "Close": [100.5],
            "Volume": [1000.0],
        },
        index=idx,
    )
    rows, missing, stale = _normalize_intraday_panel(
        data,
        ["SPY"],
        bar_interval="15m",
        target_timezone="America/New_York",
        stale_after_minutes=0,
    )
    assert rows
    assert stale == ["SPY"]


def test_duplicate_bar_removal_and_timezone_normalization():
    idx = pd.to_datetime(["2026-06-05 09:30:00", "2026-06-05 09:30:00"], utc=True)
    data = pd.DataFrame(
        {
            "Open": [100.0, 100.0],
            "High": [101.0, 101.0],
            "Low": [99.0, 99.0],
            "Close": [100.5, 100.5],
            "Volume": [1000.0, 1000.0],
        },
        index=idx,
    )
    rows, missing, stale = _normalize_intraday_panel(
        data,
        ["SPY"],
        bar_interval="15m",
        target_timezone="America/New_York",
        stale_after_minutes=45,
    )
    assert len(rows) == 1
    assert "America/New_York" in rows[0]["observation_ts_et"] or "-04:00" in rows[0]["observation_ts_et"] or "-05:00" in rows[0]["observation_ts_et"]


def test_snapshot_atomic_publish(intraday_cfg):
    snapshot = {"snapshot_id": "snap-test-001", "refresh_status": "success", "marks": {}}
    publish_snapshot(snapshot, intraday_cfg)
    pointer = read_latest_pointer(intraday_cfg)
    stored = read_latest_snapshot(intraday_cfg)
    assert pointer["snapshot_id"] == "snap-test-001"
    assert stored["snapshot_id"] == "snap-test-001"
    assert Path(intraday_cfg["snapshot_dir"], "snap-test-001.json").exists()


def test_revaluation_updates_nav_not_allocation(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    result = run_intraday_refresh(
        force=True,
        artifact_path=artifact_path,
        config=intraday_cfg,
        fetch_fn=_mock_fetch_success,
    )
    snapshot = read_latest_snapshot(intraday_cfg)
    marks = snapshot["marks"]
    assert marks["estimated_model_nav"] > minimal_artifact["initial_capital"]
    assert marks["estimated_intraday_pnl"] is not None
    assert marks["evaluation_metadata"]["allocation_unchanged"] is True
    assert marks["evaluation_metadata"]["signals_unchanged"] is True
    assert snapshot["governance_preserved"]["allocation_weights_unchanged"] == minimal_artifact["allocation"]["current_weights"]
    assert snapshot["governance_preserved"]["signals_as_of_unchanged"] == "2026-06-04"


def test_scheduled_refresh_skipped_when_market_closed(intraday_cfg, minimal_artifact, tmp_path: Path, monkeypatch):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    monkeypatch.setattr(
        "src.market.intraday_refresh_service.should_run_scheduled_refresh",
        lambda *args, **kwargs: False,
    )
    result = run_intraday_refresh(force=False, artifact_path=artifact_path, config=intraday_cfg, fetch_fn=_mock_fetch_fail)
    assert result.get("skipped") is True
    assert read_latest_pointer(intraday_cfg) is None


def test_manual_and_scheduled_share_pipeline(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    manual = run_intraday_refresh(force=True, artifact_path=artifact_path, config=intraday_cfg, fetch_fn=_mock_fetch_success)
    scheduled = run_intraday_refresh(force=True, interval_minutes=10, artifact_path=artifact_path, config=intraday_cfg, fetch_fn=_mock_fetch_success)
    assert manual["ok"] and scheduled["ok"]
    assert read_latest_snapshot(intraday_cfg)["requested_bar_interval"] == "5m"


def test_build_refresh_status_payload_shape(intraday_cfg):
    payload = build_refresh_status_payload(intraday_cfg)
    assert payload["ok"] is True
    assert payload["refresh_cadence_minutes"] == 30
    assert payload["bar_interval"] == "15m"
    assert "disclosure" in payload


def test_collect_refresh_tickers_includes_universe_and_positions(minimal_artifact):
    tickers = collect_refresh_tickers(minimal_artifact)
    assert "SPY" in tickers
    assert "TLT" in tickers
    assert len(tickers) > 2


def test_refresh_lock_context_manager(intraday_cfg):
    lock_path = Path(intraday_cfg["lock_path"])
    with refresh_lock(lock_path) as first:
        assert first is True
        with refresh_lock(lock_path) as second:
            assert second is False


def test_retry_behavior_on_transient_provider_errors(monkeypatch):
    attempts = {"count": 0}

    def flaky_download(**kwargs):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise ConnectionError("temporary outage")
        idx = pd.date_range("2026-06-05 10:00", periods=1, freq="15min", tz="UTC")
        return pd.DataFrame(
            {"Open": [100.0], "High": [101.0], "Low": [99.0], "Close": [100.5], "Volume": [1000.0]},
            index=idx,
        )

    monkeypatch.setattr("src.market.intraday_provider.yf.download", flaky_download)
    from src.market.intraday_provider import fetch_intraday_bars

    payload = fetch_intraday_bars(
        ["SPY"],
        bar_interval="15m",
        retry_attempts=3,
        backoff_seconds=[0, 0, 0],
    )
    assert attempts["count"] == 3
    assert payload["ticker_count_successful"] == 1


def test_concurrent_refresh_threads_one_wins(intraday_cfg, minimal_artifact, tmp_path: Path):
    artifact_path = tmp_path / "artifact.json"
    artifact_path.write_text(json.dumps(minimal_artifact), encoding="utf-8")
    results: list[dict] = []

    def worker():
        results.append(
            run_intraday_refresh(
                force=True,
                artifact_path=artifact_path,
                config=intraday_cfg,
                fetch_fn=_mock_fetch_success,
            )
        )

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sum(1 for item in results if item.get("ok")) >= 1
    assert any(item.get("error") == "refresh_already_in_progress" for item in results)
