"""Mark-sensitive revaluation from intraday proxy bars."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from src.market.api_client import summarize_market_risk
from src.market.intraday_provider import latest_bar_by_ticker
from src.market.yfinance_client import interpret_market_move
from src.news.news_analyzer import analyze_news_risk
from src.news.live_news import build_live_news_snapshot
from src.risk.recommendation_engine import build_recommendations


def _strategy_proxy_tickers(strategy: dict[str, Any]) -> list[str]:
    positions = strategy.get("position_packet", {}).get("latest_positions") or []
    tickers = []
    for position in positions:
        ticker = position.get("source_ticker") or position.get("ticker")
        if ticker:
            tickers.append(str(ticker).replace("^", ""))
    return tickers


def _strategy_intraday_return(strategy: dict[str, Any], latest_bars: dict[str, dict[str, Any]]) -> float | None:
    positions = strategy.get("position_packet", {}).get("latest_positions") or []
    if not positions:
        return None
    weighted = 0.0
    weight_sum = 0.0
    for position in positions:
        ticker = str(position.get("source_ticker") or position.get("ticker") or "").replace("^", "")
        weight = float(position.get("weight") or 0.0)
        bar = latest_bars.get(ticker) or latest_bars.get(f"^{ticker}")
        if not bar:
            continue
        move = bar.get("intraday_return_from_open")
        if move is None:
            continue
        weighted += weight * float(move)
        weight_sum += weight
    if weight_sum <= 0:
        return None
    return weighted / weight_sum


def build_market_monitor_from_intraday(
    universe: list[dict[str, Any]],
    latest_bars: dict[str, dict[str, Any]],
    *,
    incomplete_bar_label: str,
) -> list[dict[str, Any]]:
    rows = []
    for meta in universe:
        ticker = meta["ticker"]
        alias = meta.get("alias", ticker)
        lookup = latest_bars.get(ticker) or latest_bars.get(alias)
        if not lookup:
            continue
        daily_return = float(lookup.get("intraday_return_from_open") or 0.0)
        rows.append(
            {
                "ticker": alias,
                "name": meta.get("name", alias),
                "bucket": meta.get("bucket", "other"),
                "last": lookup.get("close"),
                "daily_return": daily_return,
                "status": "normal",
                "risk_interpretation": interpret_market_move(alias, str(meta.get("bucket", "")), daily_return),
                "observation_ts_et": lookup.get("observation_ts_et"),
                "bar_interval": lookup.get("bar_interval"),
                "bar_completeness": incomplete_bar_label,
                "data_source": "yfinance_intraday_proxy",
            }
        )
    return summarize_market_risk({"markets": rows, "source": "yfinance_intraday_proxy"})


def revalue_mark_sensitive_outputs(
    artifact: dict[str, Any],
    fetch_result: dict[str, Any],
    universe: list[dict[str, Any]],
) -> dict[str, Any]:
    """Recompute mark-sensitive overlay fields without changing governance state."""
    latest_bars = latest_bar_by_ticker(fetch_result.get("rows") or [])
    capital = float(artifact.get("initial_capital") or 1_000_000)
    operating_cum = _operating_cumulative_return(artifact)
    baseline_nav = capital * (1.0 + operating_cum)

    strategy_rows = []
    weighted_return = 0.0
    invested_weight = 0.0
    for strategy in artifact.get("strategies") or []:
        current_weight = float(strategy.get("current_weight") or 0.0)
        move = _strategy_intraday_return(strategy, latest_bars)
        prior_daily_pnl = float(strategy.get("daily_pnl") or 0.0)
        estimated_pnl = prior_daily_pnl
        if move is not None and current_weight > 0:
            estimated_pnl = current_weight * capital * move
            weighted_return += current_weight * move
            invested_weight += current_weight
        strategy_rows.append(
            {
                "strategy_id": strategy.get("strategy_id"),
                "name": strategy.get("name"),
                "current_weight": current_weight,
                "estimated_intraday_return": move,
                "estimated_intraday_pnl": estimated_pnl,
                "artifact_daily_pnl_unchanged": prior_daily_pnl,
                "allocation_market_value": current_weight * capital,
            }
        )

    portfolio_intraday_return = weighted_return if invested_weight > 0 else 0.0
    estimated_nav = baseline_nav * (1.0 + portfolio_intraday_return)
    estimated_intraday_pnl = estimated_nav - baseline_nav

    market_monitor = build_market_monitor_from_intraday(
        universe,
        latest_bars,
        incomplete_bar_label=str(fetch_result.get("incomplete_bar_label") or "incomplete_current_bar"),
    )
    news_risk = analyze_news_risk(build_live_news_snapshot({"markets": market_monitor}))

    factor_checks = [
        check
        for check in (artifact.get("risk_limits", {}).get("factors", {}).get("checks") or [])
        if check.get("status") in {"watch", "warning", "breach"}
    ]
    portfolio_checks = [
        check
        for check in (artifact.get("risk_limits", {}).get("checks") or [])
        if check.get("status") in {"watch", "warning", "breach"}
    ]
    recommendations = build_recommendations(
        market_monitor,
        news_risk,
        {
            "estimated_transaction_cost": artifact.get("allocation", {}).get("estimated_transaction_cost"),
            "approval_required": artifact.get("allocation", {}).get("approval_required", True),
            "rationale": artifact.get("allocation", {}).get("rationale", ""),
        },
        factor_checks=factor_checks,
        portfolio_limit_checks=portfolio_checks,
        factor_exposure=artifact.get("factors", {}).get("portfolio_factor_exposure_current", {}),
    )

    freshness = _freshness_label(fetch_result)
    return {
        "estimated_model_nav": estimated_nav,
        "estimated_intraday_pnl": estimated_intraday_pnl,
        "estimated_intraday_return": portfolio_intraday_return,
        "baseline_model_nav": baseline_nav,
        "market_monitor": market_monitor,
        "news_risk": news_risk,
        "recommendations": recommendations,
        "strategy_marks": strategy_rows,
        "factor_exposure_current": artifact.get("factors", {}).get("portfolio_factor_exposure_current", {}),
        "data_quality": {
            "freshness": freshness,
            "missing_tickers": fetch_result.get("missing_tickers") or [],
            "stale_tickers": fetch_result.get("stale_tickers") or [],
            "provider": fetch_result.get("provider"),
            "bar_interval": fetch_result.get("bar_interval"),
            "latest_observation_ts_et": fetch_result.get("latest_observation_ts_et"),
            "disclosure": "Estimated model marks from yfinance intraday research proxies; not live portfolio fills.",
        },
        "evaluation_metadata": {
            "allocation_last_evaluated_at": artifact.get("build_metadata", {}).get("artifact_generated_at"),
            "signals_last_evaluated_at": artifact.get("as_of_date"),
            "backtest_last_evaluated_at": artifact.get("build_metadata", {}).get("artifact_generated_at"),
            "execution_authorized": False,
            "allocation_unchanged": True,
            "signals_unchanged": True,
        },
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "data_mode": "yfinance_intraday_proxy",
    }


def _operating_cumulative_return(artifact: dict[str, Any]) -> float:
    metric = artifact.get("operating_period_risk", {}).get("pnl", {}).get("cumulative_return")
    if isinstance(metric, dict):
        if metric.get("available") and metric.get("value") is not None:
            return float(metric["value"])
        return 0.0
    series = artifact.get("portfolio_series_live") or artifact.get("portfolio_series") or {}
    values = series.get("cumulative_return") or []
    if values:
        return float(values[-1])
    return 0.0


def _freshness_label(fetch_result: dict[str, Any]) -> str:
    missing = fetch_result.get("missing_tickers") or []
    stale = fetch_result.get("stale_tickers") or []
    requested = int(fetch_result.get("ticker_count_requested") or 0)
    success = int(fetch_result.get("ticker_count_successful") or 0)
    if requested and success == 0:
        return "Failed"
    if stale:
        return "Stale"
    if missing:
        return "Delayed"
    return "Current"
