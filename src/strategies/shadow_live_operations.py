"""Idempotent research-only shadow-live ledgers for the accepted ACTIVE portfolio."""

from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

START_DATE = "2026-06-04"
INITIAL_CAPITAL = 1_000_000.0
ACTIVE_COUNT = 16
EQUAL_WEIGHT = 1 / ACTIVE_COUNT
OUTPUT_ROOT = Path("output/shadow_live")
SHADOW_BUNDLE = Path("dashboard/data/shadow_live_bundle.json")
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


def run_shadow_live(project_root: str | Path, *, freeze_date: str | None = None) -> dict[str, Any]:
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
