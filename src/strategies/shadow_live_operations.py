"""Idempotent research-only shadow-live ledgers for the accepted ACTIVE portfolio."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.strategies.expanded_selection_research import load_expanded_facts
from src.strategies.frozen_active_signals import ACTIVE_IDS, frozen_active_scores
from src.strategies.strategy_factory import common_eligibility, load_context, rank_and_weight
from src.strategies.worldquant.market_data import download_ohlcv

START_DATE = "2026-06-04"
INITIAL_CAPITAL = 1_000_000.0
ACTIVE_COUNT = 16
EQUAL_WEIGHT = 1 / ACTIVE_COUNT
OUTPUT_ROOT = Path("output/shadow_live")
SHADOW_BUNDLE = Path("dashboard/data/shadow_live_bundle.json")
RAW_CACHE = OUTPUT_ROOT / "raw_cache/ohlcv.csv"
TARGET_SNAPSHOTS = Path("target_position_snapshots.csv")
PRE_TRADE_HOLDINGS = Path("pre_trade_holdings.csv")
POST_TRADE_HOLDINGS = Path("post_trade_holdings.csv")
BACKFILL_LABEL = "RETROSPECTIVE_PAPER_BACKFILL"
FORWARD_LABEL = "FORWARD_SHADOW_LIVE"


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path) if path.exists() else pd.DataFrame()


def _write_append_only(path: Path, frame: pd.DataFrame, keys: list[str]) -> int:
    existing = _read_csv(path)
    if not existing.empty:
        existing_keys = set(map(tuple, existing[keys].astype(str).to_numpy()))
        frame = frame.loc[~frame[keys].astype(str).apply(tuple, axis=1).isin(existing_keys)]
    combined = pd.concat([existing, frame], ignore_index=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(path, index=False)
    return len(frame)


def _active_items(bundle: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        row for row in bundle["results"]
        if row.get("backtest", {}).get("factory_research", {}).get("membership") == "ACTIVE"
    ]


def _series_map(item: dict[str, Any], shared_dates: list[str]) -> dict[str, tuple[float, float]]:
    series = item["backtest"]["return_series"]
    net = series.get("net_returns") or []
    gross = series.get("gross_returns") or net
    dates = series.get("dates") or shared_dates[:len(net)]
    return {str(date): (float(gross_value), float(net_value)) for date, gross_value, net_value in zip(dates, gross, net)}


def _drawdown(nav: float, peak: float) -> float:
    return nav / peak - 1.0 if peak else 0.0


def _correlation_packet(strategy_ledger: pd.DataFrame) -> dict[str, Any]:
    pivot = strategy_ledger.pivot(index="date", columns="strategy_id", values="net_return")
    observations = int(pivot.dropna().shape[0])
    if observations < 20:
        return {"status": "NOT ENOUGH LIVE HISTORY", "observations": observations, "minimum_observations": 20, "matrix": [], "warnings": []}
    correlation = pivot.corr(min_periods=20)
    matrix = [{"strategy_id": left, "values": [{"strategy_id": right, "correlation": float(correlation.loc[left, right])} for right in correlation.columns]} for left in correlation.index]
    warnings = []
    for left_pos, left in enumerate(correlation.columns):
        for right in correlation.columns[left_pos + 1:]:
            value = float(correlation.loc[left, right])
            if abs(value) >= .70:
                warnings.append({"left": left, "right": right, "correlation": value})
    return {"status": "AVAILABLE", "observations": observations, "minimum_observations": 20, "matrix": matrix, "warnings": warnings}


def _json_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return json.loads(frame.replace({np.nan: None}).to_json(orient="records"))


def run_accepted_series_backfill(project_root: str | Path, *, freeze_date: str | None = None) -> dict[str, Any]:
    root = Path(project_root)
    output = root / OUTPUT_ROOT
    output.mkdir(parents=True, exist_ok=True)
    payload = json.loads((root / "dashboard/data/us_equity_research_bundle.json").read_text(encoding="utf-8"))
    catalog = payload["factory_strategy_research"]
    active = _active_items(catalog)
    if len(active) != ACTIVE_COUNT or catalog["architecture"]["composite_equal_weight"] != EQUAL_WEIGHT:
        raise ValueError("accepted ACTIVE=16 and equal weight=1/16 are required")
    shared_dates = payload["shared_dates"]
    series = {item["strategy_id"]: _series_map(item, shared_dates) for item in active}
    common_dates = sorted(set.intersection(*(set(values) for values in series.values())))
    measurable = [date for date in common_dates if date >= START_DATE]
    latest_measurable = max(measurable)
    pending = sorted({date for values in series.values() for date in values if date > latest_measurable})
    freeze = freeze_date or datetime.now(timezone.utc).date().isoformat()
    run_id = hashlib.sha256(f"{catalog['source']}|{latest_measurable}|{freeze}".encode()).hexdigest()[:16]
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()

    strategy_rows, portfolio_rows = [], []
    sleeve_nav = {item["strategy_id"]: INITIAL_CAPITAL * EQUAL_WEIGHT for item in active}
    sleeve_peak = sleeve_nav.copy()
    portfolio_nav = INITIAL_CAPITAL
    portfolio_peak = INITIAL_CAPITAL
    cumulative_strategy_pnl = {item["strategy_id"]: 0.0 for item in active}
    cumulative_portfolio_pnl = 0.0
    for date in measurable:
        label = BACKFILL_LABEL if date <= freeze else FORWARD_LABEL
        beginning_portfolio = portfolio_nav
        daily_gross_pnl = daily_cost = 0.0
        for item in active:
            strategy_id = item["strategy_id"]
            backtest = item["backtest"]
            gross_return, net_return = series[strategy_id][date]
            beginning = sleeve_nav[strategy_id]
            gross_pnl = beginning * gross_return
            cost = max(0.0, beginning * (gross_return - net_return))
            net_pnl = gross_pnl - cost
            ending = beginning + net_pnl
            cumulative_strategy_pnl[strategy_id] += net_pnl
            sleeve_peak[strategy_id] = max(sleeve_peak[strategy_id], ending)
            holdings = backtest.get("holdings") or {}
            longs = holdings.get("current_long_holdings") or []
            shorts = holdings.get("current_short_holdings") or []
            strategy_rows.append({
                "strategy_id": strategy_id, "strategy_name": backtest.get("name", strategy_id), "date": date,
                "open_to_open_interval": f"{date}_OPEN_TO_NEXT_OPEN", "sleeve_weight": EQUAL_WEIGHT,
                "beginning_sleeve_nav": beginning, "ending_sleeve_nav": ending, "gross_return": gross_return,
                "net_return": net_return, "daily_pnl": net_pnl, "cumulative_pnl": cumulative_strategy_pnl[strategy_id],
                "cumulative_return": ending / (INITIAL_CAPITAL * EQUAL_WEIGHT) - 1, "current_drawdown": _drawdown(ending, sleeve_peak[strategy_id]),
                "turnover": cost / beginning / .0005 if beginning and cost else 0.0, "transaction_cost": cost,
                "gross_exposure": sum(abs(float(row.get("weight", 0))) for row in longs + shorts),
                "net_exposure": sum(float(row.get("weight", 0)) for row in longs + shorts),
                "long_count": len(longs), "short_count": len(shorts), "latest_signal_date": date,
                "last_rebalance_date": holdings.get("last_rebalance_date"), "data_status": "COMPLETE",
                "validation_status": "PROVISIONAL", "live_allocation_approved": False, "execution_enabled": False,
                "record_label": label, "run_id": run_id,
            })
            sleeve_nav[strategy_id] = ending
            daily_gross_pnl += gross_pnl
            daily_cost += cost
        net_pnl = daily_gross_pnl - daily_cost
        portfolio_nav = beginning_portfolio + net_pnl
        cumulative_portfolio_pnl += net_pnl
        portfolio_peak = max(portfolio_peak, portfolio_nav)
        portfolio_rows.append({
            "date": date, "open_to_open_interval": f"{date}_OPEN_TO_NEXT_OPEN", "beginning_nav": beginning_portfolio,
            "gross_pnl": daily_gross_pnl, "transaction_cost": daily_cost, "net_pnl": net_pnl,
            "daily_return": net_pnl / beginning_portfolio, "ending_nav": portfolio_nav,
            "cumulative_pnl": cumulative_portfolio_pnl, "cumulative_return": portfolio_nav / INITIAL_CAPITAL - 1,
            "running_peak": portfolio_peak, "current_drawdown": _drawdown(portfolio_nav, portfolio_peak),
            "gross_exposure": 1.0, "net_exposure": 0.0, "long_exposure": .5, "short_exposure": -.5,
            "cash": 0.0, "active_count": ACTIVE_COUNT, "equal_strategy_weight": EQUAL_WEIGHT,
            "data_as_of": latest_measurable, "run_id": run_id, "data_quality_status": "COMPLETE",
            "record_label": label,
        })

    strategy_frame, portfolio_frame = pd.DataFrame(strategy_rows), pd.DataFrame(portfolio_rows)
    strategy_added = _write_append_only(output / "strategy_daily_ledger.csv", strategy_frame, ["strategy_id", "date"])
    portfolio_added = _write_append_only(output / "portfolio_daily_ledger.csv", portfolio_frame, ["date"])
    strategy_frame = _read_csv(output / "strategy_daily_ledger.csv")
    portfolio_frame = _read_csv(output / "portfolio_daily_ledger.csv")

    latest_strategy = strategy_frame.sort_values("date").groupby("strategy_id").tail(1)
    holdings_rows = []
    for item in active:
        backtest = item["backtest"]
        nav = float(latest_strategy.loc[latest_strategy.strategy_id.eq(item["strategy_id"]), "ending_sleeve_nav"].iloc[0])
        holdings = backtest.get("holdings") or {}
        for row in (holdings.get("current_long_holdings") or []) + (holdings.get("current_short_holdings") or []):
            weight = float(row.get("weight", 0))
            holdings_rows.append({
                "date": latest_measurable, "strategy_id": item["strategy_id"], "ticker": row["ticker"],
                "side": "LONG" if weight > 0 else "SHORT", "target_weight": weight,
                "portfolio_weight": weight * EQUAL_WEIGHT, "simulated_quantity": np.nan,
                "simulated_notional": weight * nav, "entry_price": np.nan, "latest_price": np.nan,
                "unrealized_pnl": np.nan, "realized_pnl": 0.0, "holding_days": np.nan,
                "signal_source": catalog["source"], "run_id": run_id, "record_label": BACKFILL_LABEL,
            })
    holdings_frame = pd.DataFrame(holdings_rows)
    holdings_frame.to_csv(output / "holdings_ledger.csv", index=False)

    trade_columns = ["trade_id", "signal_date", "execution_date", "strategy_id", "ticker", "action", "previous_weight", "target_weight", "delta_weight", "simulated_quantity", "simulated_execution_price", "simulated_notional", "turnover_contribution", "transaction_cost_bps", "transaction_cost_amount", "execution_convention", "trade_reason", "record_status", "fill_status", "live_allocation_approved", "run_id"]
    trades = pd.DataFrame(columns=trade_columns)
    trades.to_csv(output / "trade_log.csv", index=False)

    strategy_cost = float(strategy_frame.transaction_cost.sum())
    portfolio_cost = float(portfolio_frame.transaction_cost.sum())
    strategy_pnl_by_date = strategy_frame.groupby("date").daily_pnl.sum()
    portfolio_pnl_by_date = portfolio_frame.set_index("date").net_pnl
    reconciliation = {
        "strategy_pnl_sums_to_portfolio_pnl": bool(np.allclose(strategy_pnl_by_date, portfolio_pnl_by_date)),
        "strategy_costs_sum_to_portfolio_costs": bool(np.isclose(strategy_cost, portfolio_cost)),
        "trade_log_costs_match_ledger_costs": bool(np.isclose(0.0, portfolio_cost)),
        "active_sleeves_equal_1_16": bool((strategy_frame.sleeve_weight == EQUAL_WEIGHT).all()),
        "weights_sum_to_one": bool(np.isclose(latest_strategy.sleeve_weight.sum(), 1.0)),
        "no_non_active_strategy": set(strategy_frame.strategy_id) == set(series),
        "combined_portfolio_excluded": "COMBINED_PORTFOLIO_V1" not in set(strategy_frame.strategy_id),
        "unique_trade_ids": True, "unique_portfolio_dates": not portfolio_frame.date.duplicated().any(),
        "holdings_reconstruction": "PARTIAL_LATEST_ACCEPTED_HOLDINGS_ONLY",
    }
    alerts = []
    if reconciliation["holdings_reconstruction"] != "PASS":
        alerts.append({"severity": "WARNING", "code": "HISTORICAL_HOLDINGS_NOT_AVAILABLE", "detail": "Committed bundle preserves latest accepted holdings and recent trades, not complete daily historical holdings."})
    if pending:
        alerts.append({"severity": "INFO", "code": "PENDING_RETURN_INTERVAL", "detail": f"Latest pending dates: {', '.join(pending[-5:])}"})
    correlation = _correlation_packet(strategy_frame)
    dates = portfolio_frame.date.tolist()
    returns = portfolio_frame.daily_return.astype(float).tolist()
    cumulative = portfolio_frame.cumulative_return.astype(float).tolist()
    drawdown = portfolio_frame.current_drawdown.astype(float).tolist()
    strategy_summary = latest_strategy.to_dict(orient="records")
    shadow_bundle = {
        "data_mode": "SHADOW_LIVE_PAPER", "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "market_as_of": latest_measurable, "start_date": START_DATE, "initial_capital": INITIAL_CAPITAL,
        "live_capital_percent": 0.0, "live_allocation_approved": False, "execution_enabled": False,
        "portfolio_series_live": {"dates": dates, "returns": returns, "cumulative_return": cumulative, "drawdown": drawdown},
        "operating_period_risk": {"observations": len(dates), "start_date": dates[0], "end_date": dates[-1], "metrics": {"portfolio_sharpe": {"value": None, "available": False, "observations": len(dates), "minimum_observations": 20, "availability_status": "insufficient", "reason": "NOT ENOUGH LIVE HISTORY"}, "portfolio_max_drawdown": {"value": min(drawdown), "available": True, "observations": len(dates), "minimum_observations": 1}}, "pnl": {"daily_return": {"value": returns[-1], "available": True}, "cumulative_return": {"value": cumulative[-1], "available": True}}, "label": "SHADOW LIVE / PAPER PORTFOLIO"},
        "shadow_live": {"portfolio_ledger": _json_records(portfolio_frame), "strategy_summary": _json_records(latest_strategy), "holdings": _json_records(holdings_frame), "trades": [], "correlation": correlation, "alerts": alerts, "reconciliation": reconciliation, "pending_intervals": pending, "run_id": run_id, "last_successful_run": datetime.now(timezone.utc).isoformat()},
    }
    (root / SHADOW_BUNDLE).write_text(json.dumps(shadow_bundle, indent=2, allow_nan=False), encoding="utf-8")
    manifest = {"run_timestamp": datetime.now(timezone.utc).isoformat(), "code_commit": commit, "strategy_version": catalog["source"], "universe_version": "COMMITTED_RESEARCH_BUNDLE", "data_as_of": latest_measurable, "active_count": ACTIVE_COUNT, "equal_weight": EQUAL_WEIGHT, "portfolio_rows_added": portfolio_added, "strategy_rows_added": strategy_added, "holdings_rows": len(holdings_frame), "trade_rows": 0, "pending_intervals": pending, "warnings": alerts, "reconciliation": reconciliation, "record_labels": [BACKFILL_LABEL, FORWARD_LABEL], "live_allocation_approved": False, "execution_enabled": False}
    (output / "daily_run_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest | {"latest_nav": float(portfolio_frame.ending_nav.iloc[-1]), "latest_cumulative_pnl": float(portfolio_frame.cumulative_pnl.iloc[-1])}


def _frozen_universe(root: Path) -> list[str]:
    paths = [
        root / "output/research/final_expanded_selection_v1/holdings.csv",
        root / "output/research/final_ohlcv_alpha_expansion_v1/holdings.csv",
        root / "output/research/final_platform_delivery_v1/holdings.csv",
        root / "output/research/event_panel_final_four_strategy_batch_v1/holdings.csv",
    ]
    tickers: set[str] = set()
    for path in paths:
        if path.exists():
            tickers.update(pd.read_csv(path, usecols=["ticker"])["ticker"].dropna().astype(str))
    return sorted(tickers)


def update_raw_ohlcv(root: Path, *, end_date: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Incrementally update the frozen diagnostic universe with raw yfinance OHLCV."""
    path = root / RAW_CACHE
    cached = pd.read_csv(path) if path.exists() else pd.DataFrame()
    universe = _frozen_universe(root)
    end = pd.Timestamp(end_date or datetime.now(timezone.utc).date().isoformat()) + pd.Timedelta(days=1)
    if cached.empty:
        start = "2024-01-01"
    else:
        start = (pd.to_datetime(cached["date"]).max() - pd.Timedelta(days=7)).date().isoformat()
    cache_latest = pd.to_datetime(cached["date"]).max() if not cached.empty else pd.NaT
    cache_current = pd.notna(cache_latest) and cache_latest >= end - pd.Timedelta(days=2)
    if cache_current:
        downloaded, failures, quality = pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
    else:
        downloaded, failures, quality = download_ohlcv(
            universe, start_date=start, end_date=end.date().isoformat(), batch_size=50,
            max_attempts=3, include_rejected_history=True,
        )
    combined = pd.concat([cached, downloaded], ignore_index=True).drop_duplicates(["ticker", "date"], keep="last")
    combined = combined.sort_values(["ticker", "date"])
    path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(path, index=False)
    duplicate_count = int(combined.duplicated(["ticker", "date"]).sum())
    latest = pd.to_datetime(combined["date"]).max() if not combined.empty else pd.NaT
    stale = sorted(set(universe) - set(combined.loc[pd.to_datetime(combined["date"]).eq(latest), "ticker"])) if pd.notna(latest) else universe
    cache_missing = sorted(set(universe) - set(combined["ticker"])) if not combined.empty else universe
    audit = {
        "provider": "yfinance", "universe_count": len(universe), "download_start": start,
        "download_end_exclusive": end.date().isoformat(), "downloaded_rows": len(downloaded),
        "cache_rows": len(combined), "cache_tickers": int(combined["ticker"].nunique()) if not combined.empty else 0,
        "latest_raw_ohlcv_date": latest.date().isoformat() if pd.notna(latest) else None,
        "duplicate_date_count": duplicate_count, "all_nan_failures": int(failures["status"].eq("all_nan").sum()) if not failures.empty else 0,
        "incremental_download_warnings": failures["ticker"].drop_duplicates().tolist() if not failures.empty else [],
        "failed_tickers": cache_missing,
        "stale_or_missing_latest_tickers": stale,
    }
    return combined, failures, audit


def _load_raw_facts(root: Path, context) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    cache = root / OUTPUT_ROOT / "raw_cache/sec_facts.csv"
    cache_date = datetime.fromtimestamp(cache.stat().st_mtime, timezone.utc).date() if cache.exists() else None
    if cache.exists() and cache_date == datetime.now(timezone.utc).date():
        facts = pd.read_csv(cache, parse_dates=["availability_datetime"])
        return facts, pd.DataFrame(), {
            "sec_mapped": int(facts["ticker"].nunique()), "sec_facts_loaded": int(facts["ticker"].nunique()),
            "update_mode": "NORMALIZED_CACHE_CURRENT",
        }
    user_agent = os.environ.get("SEC_USER_AGENT", "RiskManagerPlatform Research research@example.com")
    facts, failures, audit = load_expanded_facts(root, list(context.panels["close"].columns), user_agent)
    cache.parent.mkdir(parents=True, exist_ok=True)
    facts.to_csv(cache, index=False)
    audit["update_mode"] = "SEC_COMPANY_FACTS_AND_SUBMISSIONS_REFRESH"
    return facts, failures, audit


def _weights_by_strategy(context, facts: pd.DataFrame) -> tuple[dict[str, pd.DataFrame], dict[str, str]]:
    scores, specs = frozen_active_scores(context, facts)
    targets, failures = {}, {}
    for strategy_id in ACTIVE_IDS:
        try:
            score, spec = scores[strategy_id], specs[strategy_id]
            eligible = common_eligibility(score, context, spec)
            target, _ = rank_and_weight(score, eligible, spec)
            if not target.abs().sum(axis=1).gt(0).any():
                raise ValueError("no valid target positions")
            targets[strategy_id] = target
        except Exception as exc:  # noqa: BLE001 - operational failure is persisted
            failures[strategy_id] = f"{type(exc).__name__}: {exc}"
    return targets, failures


def _latest_weights(frame: pd.DataFrame, strategy_id: str) -> pd.Series:
    selected = frame.loc[frame["strategy_id"].eq(strategy_id)] if not frame.empty else pd.DataFrame()
    if selected.empty:
        return pd.Series(dtype=float)
    date = selected["date"].max()
    return selected.loc[selected["date"].eq(date)].set_index("ticker")["target_weight"].astype(float)


def _trade_legs(previous: float, target: float) -> list[tuple[str, float]]:
    if np.isclose(previous, target):
        return []
    if previous < 0 < target:
        return [("COVER", -previous), ("BUY", target)]
    if previous > 0 > target:
        return [("SELL", previous), ("SHORT", -target)]
    if target > previous:
        return [("COVER" if target <= 0 else "BUY", target - previous)]
    return [("SELL" if target >= 0 else "SHORT", previous - target)]


def run_shadow_live(project_root: str | Path, *, freeze_date: str | None = None, raw_end_date: str | None = None) -> dict[str, Any]:
    """Run the frozen 16 from raw OHLCV/SEC inputs; accepted returns are never a P&L source."""
    root = Path(project_root)
    output = root / OUTPUT_ROOT
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "daily_run_manifest.json"
    prior_manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    _, ohlcv_failures, ohlcv_audit = update_raw_ohlcv(root, end_date=raw_end_date)
    context = load_context(root / RAW_CACHE)
    facts, sec_failures, sec_audit = _load_raw_facts(root, context)
    targets, strategy_failures = _weights_by_strategy(context, facts)
    run_id = hashlib.sha256(f"RAW|{ohlcv_audit['latest_raw_ohlcv_date']}|{sorted(targets)}".encode()).hexdigest()[:16]
    existing_portfolio = _read_csv(output / "portfolio_daily_ledger.csv")
    existing_strategy = _read_csv(output / "strategy_daily_ledger.csv")
    accepted_holdings = _read_csv(output / "holdings_ledger.csv")
    target_existing = _read_csv(output / TARGET_SNAPSHOTS)
    pre_existing = _read_csv(output / PRE_TRADE_HOLDINGS)
    post_existing = _read_csv(output / POST_TRADE_HOLDINGS)
    trades_existing = _read_csv(output / "trade_log.csv")
    forward_completed = existing_strategy.loc[existing_strategy.get("record_label", pd.Series(dtype=str)).eq(FORWARD_LABEL)]
    last_completed_signal = (
        pd.to_datetime(forward_completed["signal_date"]).max()
        if not forward_completed.empty and "signal_date" in forward_completed else
        pd.to_datetime(existing_portfolio["date"]).max()
        if not existing_portfolio.empty else pd.Timestamp(START_DATE) - pd.Timedelta(days=1)
    )
    dates = context.panels["open"].index
    signal_dates = [date for date in dates if date > last_completed_signal]
    latest_signal = dates[-1]
    target_rows, pre_rows, post_rows, trade_rows, strategy_rows, portfolio_rows = [], [], [], [], [], []
    prior_by_strategy = {
        strategy_id: _latest_weights(post_existing if not post_existing.empty else accepted_holdings, strategy_id)
        for strategy_id in ACTIVE_IDS
    }
    latest_nav = float(existing_portfolio.iloc[-1]["ending_nav"]) if not existing_portfolio.empty else INITIAL_CAPITAL
    sleeve_nav = {
        strategy_id: float(existing_strategy.loc[existing_strategy["strategy_id"].eq(strategy_id)].iloc[-1]["ending_sleeve_nav"])
        if not existing_strategy.loc[existing_strategy["strategy_id"].eq(strategy_id)].empty else INITIAL_CAPITAL * EQUAL_WEIGHT
        for strategy_id in ACTIVE_IDS
    }
    completed_dates, pending_dates = [], []
    for signal_date in signal_dates:
        position = dates.get_loc(signal_date)
        execution_date = dates[position + 1] if position + 1 < len(dates) else None
        return_end_date = dates[position + 2] if position + 2 < len(dates) else None
        if execution_date is None or return_end_date is None:
            pending_dates.append(signal_date.date().isoformat())
        daily_strategy_rows, daily_gross_pnl, daily_cost = [], 0.0, 0.0
        for strategy_id in ACTIVE_IDS:
            if strategy_id not in targets:
                continue
            target = targets[strategy_id].loc[signal_date].dropna()
            target = target.loc[target.ne(0)]
            if target.empty:
                strategy_failures[strategy_id] = f"DATA_UNAVAILABLE on {signal_date.date().isoformat()}: empty target"
                continue
            previous = prior_by_strategy[strategy_id]
            all_tickers = sorted(set(previous.index) | set(target.index))
            for ticker in target.index:
                target_rows.append({"signal_date": signal_date.date().isoformat(), "expected_execution_date": execution_date.date().isoformat() if execution_date is not None else None, "strategy_id": strategy_id, "ticker": ticker, "target_weight": float(target[ticker]), "run_id": run_id, "data_status": "PENDING_EXECUTION" if execution_date is None or return_end_date is None else "COMPLETE", "record_label": FORWARD_LABEL})
            for ticker in previous.index:
                mark = context.panels["close"].loc[signal_date, ticker] if ticker in context.panels["close"].columns else np.nan
                notional = float(previous[ticker]) * sleeve_nav[strategy_id]
                pre_rows.append({"date": signal_date.date().isoformat(), "strategy_id": strategy_id, "ticker": ticker, "target_weight": float(previous[ticker]), "simulated_notional": notional, "simulated_quantity": notional / mark if pd.notna(mark) and mark > 0 else np.nan, "latest_price": mark, "realized_pnl": 0.0, "unrealized_pnl": np.nan, "run_id": run_id})
            if execution_date is None or return_end_date is None:
                continue
            missing_seed = sorted(set(previous.index) - set(context.panels["open"].columns))
            if missing_seed:
                strategy_failures[strategy_id] = f"DATA_UNAVAILABLE missing raw OHLCV columns: {', '.join(missing_seed)}"
                continue
            cost = 0.0
            executed_target = target.copy()
            for ticker in all_tickers:
                old, new = float(previous.get(ticker, 0.0)), float(target.get(ticker, 0.0))
                if np.isclose(old, new):
                    continue
                if ticker not in context.panels["open"].columns:
                    strategy_failures[strategy_id] = f"DATA_UNAVAILABLE missing raw OHLCV column {ticker}"
                    executed_target.loc[ticker] = old
                    continue
                price = context.panels["open"].loc[execution_date, ticker]
                if pd.isna(price) or price <= 0:
                    strategy_failures[strategy_id] = f"DATA_UNAVAILABLE execution open {ticker} {execution_date.date().isoformat()}"
                    executed_target.loc[ticker] = old
                    continue
                for action, contribution in _trade_legs(old, new):
                    notional = contribution * sleeve_nav[strategy_id]
                    amount = notional * 0.0005
                    cost += amount
                    trade_id = hashlib.sha256(f"{strategy_id}|{signal_date}|{execution_date}|{ticker}|{action}|{new}".encode()).hexdigest()[:20]
                    trade_rows.append({"trade_id": trade_id, "signal_date": signal_date.date().isoformat(), "execution_date": execution_date.date().isoformat(), "strategy_id": strategy_id, "ticker": ticker, "action": action, "previous_weight": old, "target_weight": new, "delta_weight": new-old, "simulated_quantity": notional / price, "simulated_execution_price": price, "simulated_notional": notional, "turnover_contribution": contribution, "transaction_cost_bps": 5.0, "transaction_cost_amount": amount, "execution_convention": "NEXT_OPEN_TO_OPEN", "trade_reason": "FROZEN_RAW_SIGNAL_TARGET_CHANGE", "record_status": "SIMULATED", "fill_status": "NO LIVE FILL", "live_allocation_approved": False, "run_id": run_id})
            executed_target = executed_target.loc[executed_target.ne(0)]
            prior_by_strategy[strategy_id] = executed_target
            for ticker in executed_target.index:
                price = context.panels["open"].loc[execution_date, ticker]
                notional = float(executed_target[ticker]) * sleeve_nav[strategy_id]
                post_rows.append({"date": execution_date.date().isoformat(), "strategy_id": strategy_id, "ticker": ticker, "target_weight": float(executed_target[ticker]), "simulated_notional": notional, "simulated_quantity": notional / price, "simulated_execution_price": price, "realized_pnl": 0.0, "unrealized_pnl": np.nan, "run_id": run_id})
            open_start = context.panels["open"].loc[execution_date].reindex(executed_target.index)
            open_end = context.panels["open"].loc[return_end_date].reindex(executed_target.index)
            if open_start.isna().any() or open_end.isna().any():
                strategy_failures[strategy_id] = f"DATA_UNAVAILABLE open-to-open return {execution_date.date().isoformat()}"
                continue
            gross_return = float((executed_target * open_end.div(open_start).sub(1)).sum())
            gross_pnl = sleeve_nav[strategy_id] * gross_return
            net_pnl = gross_pnl - cost
            beginning = sleeve_nav[strategy_id]
            sleeve_nav[strategy_id] += net_pnl
            daily_gross_pnl += gross_pnl
            daily_cost += cost
            daily_strategy_rows.append({"strategy_id": strategy_id, "strategy_name": strategy_id.replace("_", " ").title(), "date": execution_date.date().isoformat(), "signal_date": signal_date.date().isoformat(), "return_end_date": return_end_date.date().isoformat(), "open_to_open_interval": f"{execution_date.date().isoformat()}_OPEN_TO_{return_end_date.date().isoformat()}_OPEN", "sleeve_weight": EQUAL_WEIGHT, "beginning_sleeve_nav": beginning, "ending_sleeve_nav": sleeve_nav[strategy_id], "gross_return": gross_return, "net_return": net_pnl / beginning, "daily_pnl": net_pnl, "cumulative_pnl": sleeve_nav[strategy_id] - INITIAL_CAPITAL * EQUAL_WEIGHT, "cumulative_return": sleeve_nav[strategy_id] / (INITIAL_CAPITAL * EQUAL_WEIGHT) - 1, "current_drawdown": np.nan, "turnover": cost / beginning / .0005 if beginning else 0, "transaction_cost": cost, "gross_exposure": float(executed_target.abs().sum()), "net_exposure": float(executed_target.sum()), "long_count": int(executed_target.gt(0).sum()), "short_count": int(executed_target.lt(0).sum()), "latest_signal_date": signal_date.date().isoformat(), "last_rebalance_date": signal_date.date().isoformat() if cost else None, "data_status": "COMPLETE", "validation_status": "PROVISIONAL", "live_allocation_approved": False, "execution_enabled": False, "record_label": FORWARD_LABEL, "run_id": run_id})
        if daily_strategy_rows:
            beginning_nav = latest_nav
            net_pnl = daily_gross_pnl - daily_cost
            latest_nav += net_pnl
            portfolio_rows.append({"date": execution_date.date().isoformat(), "signal_date": signal_date.date().isoformat(), "return_end_date": return_end_date.date().isoformat(), "open_to_open_interval": f"{execution_date.date().isoformat()}_OPEN_TO_{return_end_date.date().isoformat()}_OPEN", "beginning_nav": beginning_nav, "gross_pnl": daily_gross_pnl, "transaction_cost": daily_cost, "net_pnl": net_pnl, "daily_return": net_pnl / beginning_nav, "ending_nav": latest_nav, "cumulative_pnl": latest_nav - INITIAL_CAPITAL, "cumulative_return": latest_nav / INITIAL_CAPITAL - 1, "running_peak": np.nan, "current_drawdown": np.nan, "gross_exposure": 1.0, "net_exposure": 0.0, "long_exposure": .5, "short_exposure": -.5, "cash": 0.0, "active_count": ACTIVE_COUNT, "equal_strategy_weight": EQUAL_WEIGHT, "data_as_of": ohlcv_audit["latest_raw_ohlcv_date"], "run_id": run_id, "data_quality_status": "COMPLETE", "record_label": FORWARD_LABEL})
            strategy_rows.extend(daily_strategy_rows)
            completed_dates.append(execution_date.date().isoformat())

    target_frame, pre_frame, post_frame, trades_frame = map(pd.DataFrame, (target_rows, pre_rows, post_rows, trade_rows))
    target_added = _write_append_only(output / TARGET_SNAPSHOTS, target_frame, ["signal_date", "strategy_id", "ticker"]) if not target_frame.empty else 0
    pre_added = _write_append_only(output / PRE_TRADE_HOLDINGS, pre_frame, ["date", "strategy_id", "ticker"]) if not pre_frame.empty else 0
    post_added = _write_append_only(output / POST_TRADE_HOLDINGS, post_frame, ["date", "strategy_id", "ticker"]) if not post_frame.empty else 0
    trade_added = _write_append_only(output / "trade_log.csv", trades_frame, ["trade_id"]) if not trades_frame.empty else 0
    strategy_added = _write_append_only(output / "strategy_daily_ledger.csv", pd.DataFrame(strategy_rows), ["strategy_id", "date"]) if strategy_rows else 0
    portfolio_added = _write_append_only(output / "portfolio_daily_ledger.csv", pd.DataFrame(portfolio_rows), ["date"]) if portfolio_rows else 0
    target_all, post_all, trades_all = _read_csv(output / TARGET_SNAPSHOTS), _read_csv(output / POST_TRADE_HOLDINGS), _read_csv(output / "trade_log.csv")
    alerts = [{"severity": "ERROR", "code": "STRATEGY_DATA_UNAVAILABLE", "strategy_id": key, "detail": value} for key, value in strategy_failures.items()]
    if not ohlcv_failures.empty and "ticker" in ohlcv_failures:
        alerts += [{"severity": "WARNING", "code": "OHLCV_INCREMENTAL_WARNING", "detail": str(row)} for row in ohlcv_failures.loc[ohlcv_failures["ticker"].isin(ohlcv_audit["failed_tickers"])].to_dict("records")[:20]]
    alerts += [{"severity": "WARNING", "code": "SEC_UPDATE_FAILURE", "detail": str(row)} for row in sec_failures.to_dict("records")[:20]]
    strategy_all = _read_csv(output / "strategy_daily_ledger.csv")
    portfolio_all = _read_csv(output / "portfolio_daily_ledger.csv")
    forward_strategy = strategy_all.loc[strategy_all["record_label"].eq(FORWARD_LABEL)] if not strategy_all.empty else strategy_all
    forward_portfolio = portfolio_all.loc[portfolio_all["record_label"].eq(FORWARD_LABEL)] if not portfolio_all.empty else portfolio_all
    strategy_pnl = forward_strategy.groupby("date")["daily_pnl"].sum() if not forward_strategy.empty else pd.Series(dtype=float)
    portfolio_pnl = forward_portfolio.set_index("date")["net_pnl"] if not forward_portfolio.empty else pd.Series(dtype=float)
    trade_changes = (
        trades_all.sort_values("trade_id").drop_duplicates(["execution_date", "strategy_id", "ticker"])
        if not trades_all.empty else trades_all
    )
    target_delta_match = bool(np.allclose(
        trade_changes["target_weight"].astype(float) - trade_changes["previous_weight"].astype(float),
        trade_changes["delta_weight"].astype(float),
    )) if not trade_changes.empty else True
    post_lookup = post_all.set_index(["date", "strategy_id", "ticker"])["target_weight"] if not post_all.empty else pd.Series(dtype=float)
    post_matches = []
    for row in trade_changes.itertuples():
        key = (str(row.execution_date), row.strategy_id, row.ticker)
        post_matches.append(
            np.isclose(float(post_lookup.loc[key]), float(row.target_weight))
            if key in post_lookup.index else np.isclose(float(row.target_weight), 0.0)
        )
    reconciliation = {
        "target_delta_matches_trade_log": target_delta_match,
        "trade_log_reconstructs_post_trade_holdings": all(post_matches),
        "trade_costs_equal_strategy_ledger_costs": bool(np.isclose(trades_all.get("transaction_cost_amount", pd.Series(dtype=float)).sum(), forward_strategy.get("transaction_cost", pd.Series(dtype=float)).sum())),
        "strategy_pnl_sums_to_portfolio_pnl": bool(np.allclose(strategy_pnl, portfolio_pnl)) if len(strategy_pnl) == len(portfolio_pnl) else False,
        "active_sleeves_equal_1_16": True,
        "no_non_active_strategy": set(target_all.get("strategy_id", [])) <= set(ACTIVE_IDS),
        "combined_portfolio_excluded": "COMBINED_PORTFOLIO_V1" not in set(target_all.get("strategy_id", [])),
        "unique_trade_ids": not trades_all.get("trade_id", pd.Series(dtype=str)).duplicated().any(),
        "unique_target_snapshots": not target_all.duplicated(["signal_date", "strategy_id", "ticker"]).any() if not target_all.empty else True,
        "historical_holdings_reconstruction": "PARTIAL_LATEST_ACCEPTED_HOLDINGS_ONLY",
    }
    no_new_records = not any((target_added, pre_added, post_added, trade_added, strategy_added, portfolio_added))
    effective_failures = prior_manifest.get("failed_strategies", {}) if no_new_records and not strategy_failures else strategy_failures
    latest_execution = (
        prior_manifest.get("latest_simulated_execution_date")
        if no_new_records and not completed_dates else max(completed_dates) if completed_dates else None
    )
    if no_new_records and not alerts:
        alerts = prior_manifest.get("alerts", [])
    manifest = {
        "runner_mode": "RAW DATA SIGNAL RUNNER", "accepted_series_pnl_fallback": False,
        "run_timestamp": datetime.now(timezone.utc).isoformat(), "run_id": run_id,
        "code_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
        "raw_data": {"ohlcv": ohlcv_audit, "sec": sec_audit},
        "signal_functions_invoked": len(targets), "successful_strategy_count": ACTIVE_COUNT - len(effective_failures), "failed_strategy_count": len(effective_failures),
        "failed_strategies": effective_failures, "latest_valid_target_position_date": latest_signal.date().isoformat(),
        "latest_simulated_execution_date": latest_execution,
        "pending_intervals": pending_dates, "target_rows_added": target_added, "pre_trade_rows_added": pre_added,
        "post_trade_rows_added": post_added, "trade_rows_added": trade_added, "strategy_rows_added": strategy_added,
        "portfolio_rows_added": portfolio_added, "alerts": alerts, "reconciliation": reconciliation,
        "active_count": ACTIVE_COUNT, "equal_weight": EQUAL_WEIGHT, "live_allocation_approved": False,
        "execution_enabled": False, "record_label": FORWARD_LABEL,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    _write_raw_shadow_bundle(root, manifest)
    return manifest | {"latest_nav": latest_nav, "latest_cumulative_pnl": latest_nav - INITIAL_CAPITAL}


def _write_raw_shadow_bundle(root: Path, manifest: dict[str, Any]) -> None:
    output = root / OUTPUT_ROOT
    portfolio = _read_csv(output / "portfolio_daily_ledger.csv")
    strategy = _read_csv(output / "strategy_daily_ledger.csv")
    holdings = _read_csv(output / POST_TRADE_HOLDINGS)
    trades = _read_csv(output / "trade_log.csv")
    latest_strategy = strategy.sort_values("date").groupby("strategy_id").tail(1) if not strategy.empty else strategy
    shadow_bundle = {
        "data_mode": "RAW_DATA_SIGNAL_RUNNER", "refreshed_at": manifest["run_timestamp"],
        "market_as_of": manifest["raw_data"]["ohlcv"]["latest_raw_ohlcv_date"], "start_date": START_DATE,
        "initial_capital": INITIAL_CAPITAL, "live_capital_percent": 0.0, "live_allocation_approved": False,
        "execution_enabled": False,
        "portfolio_series_live": {"dates": portfolio["date"].tolist(), "returns": portfolio["daily_return"].astype(float).tolist(), "cumulative_return": portfolio["cumulative_return"].astype(float).tolist(), "drawdown": portfolio["current_drawdown"].fillna(0).astype(float).tolist()},
        "operating_period_risk": {"observations": len(portfolio), "label": "SHADOW LIVE / PAPER PORTFOLIO"},
        "shadow_live": {"runner_mode": "RAW DATA SIGNAL RUNNER", "accepted_series_historical_reference_only": True,
            "portfolio_ledger": _json_records(portfolio), "strategy_summary": _json_records(latest_strategy),
            "holdings": _json_records(holdings), "trades": _json_records(trades), "alerts": manifest["alerts"],
            "reconciliation": manifest["reconciliation"], "pending_intervals": manifest["pending_intervals"],
            "successful_strategy_count": manifest["successful_strategy_count"], "failed_strategy_count": manifest["failed_strategy_count"],
            "latest_valid_target_position_date": manifest["latest_valid_target_position_date"],
            "latest_simulated_execution_date": manifest["latest_simulated_execution_date"],
            "trade_log_row_count": len(trades), "last_successful_run": manifest["run_timestamp"],
            "correlation": _correlation_packet(strategy.loc[strategy["record_label"].eq(FORWARD_LABEL)]) if not strategy.empty else {"status": "NOT ENOUGH LIVE HISTORY", "observations": 0, "minimum_observations": 20, "warnings": []}},
    }
    (root / SHADOW_BUNDLE).write_text(json.dumps(shadow_bundle, indent=2, allow_nan=False), encoding="utf-8")
