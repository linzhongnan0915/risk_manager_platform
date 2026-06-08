"""Strategy expansion v1: ten daily-ETF research candidates outside live allocation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.strategies.literature_backtests import (
    BUY_BPS,
    SELL_BPS,
    TRADING_DAYS,
    StrategyPrototype,
    load_price_returns,
    run_all_literature_backtests,
    run_strategy_backtest,
    run_walk_forward,
    strategy_prototypes,
)
from src.strategies.literature_backtests import (
    _assign_alloc,
    _rebalance_only,
    _top_n_weights,
    _vix_level_proxy,
    _vix_stress_score,
    _zscore,
)

EXPANSION_STRATEGY_IDS = [
    "EXP_SECTOR_MOMENTUM_ROTATION",
    "EXP_SECTOR_NEUTRAL_RESIDUAL_MOM",
    "EXP_QUALITY_VALUE_COMPOSITE",
    "EXP_SIZE_REGIME",
    "EXP_US_INTL_RELATIVE_STRENGTH",
    "EXP_VOL_TARGET_EQUITY_TREND",
    "EXP_CREDIT_QUALITY_ROTATION",
    "EXP_REAL_ASSET_INFLATION",
    "EXP_EQUITY_BOND_CORR_REGIME",
    "EXP_CROSS_ASSET_REVERSAL",
]

NON_RETIRED_EXPANSION_IDS = [
    "EXP_EQUITY_BOND_CORR_REGIME",
    "EXP_VOL_TARGET_EQUITY_TREND",
    "EXP_REAL_ASSET_INFLATION",
]

RETIRED_EXPANSION_IDS = [strategy_id for strategy_id in EXPANSION_STRATEGY_IDS if strategy_id not in NON_RETIRED_EXPANSION_IDS]

SECTOR_ETF_TICKERS = ["XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC"]


def expansion_strategy_prototypes() -> list[StrategyPrototype]:
    return [
        StrategyPrototype(
            strategy_id="EXP_SECTOR_MOMENTUM_ROTATION",
            name="Sector Momentum Rotation",
            literature_source="Sector rotation / business-cycle style allocation",
            hypothesis="Sector leadership persists at daily frequency when measured with lagged momentum and cost-aware turnover.",
            universe=SECTOR_ETF_TICKERS + ["BIL"],
            rebalance="daily",
            signal_summary="Rank sector SPDR proxies by 126-day momentum; hold top three equal-weight with BIL buffer.",
            failure_modes=["sector crowding", "macro shock rotation", "high turnover", "ETF sector mapping drift"],
            builder=weights_sector_momentum_rotation,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_SECTOR_NEUTRAL_RESIDUAL_MOM",
            name="Sector-Neutral Residual Momentum",
            literature_source="Residual momentum / sector-neutral equity factor research",
            hypothesis="Sector-relative momentum versus broad equity beta can isolate rotational alpha.",
            universe=SECTOR_ETF_TICKERS + ["SPY", "BIL"],
            rebalance="daily",
            signal_summary="Long strongest sector ETF versus SPY hedge using 63-day residual momentum; neutralize with BIL.",
            failure_modes=["beta leakage", "sector concentration", "short-horizon reversal", "execution on daily rebalance"],
            builder=weights_sector_neutral_residual_momentum,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_QUALITY_VALUE_COMPOSITE",
            name="Quality-Value Composite Rotation",
            literature_source="Style factor rotation",
            hypothesis="Blended quality, value, and momentum style ETFs rotate leadership across regimes.",
            universe=["QUAL", "VLUE", "IVE", "MTUM", "USMV", "BIL"],
            rebalance="daily",
            signal_summary="Composite style score from 126-day trend and 21-day reversal; hold top two style ETFs.",
            failure_modes=["style crowding", "factor reversal", "value trap", "momentum crash"],
            builder=weights_quality_value_composite,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_SIZE_REGIME",
            name="Small-Cap vs Large-Cap Regime",
            literature_source="Size premium / business-cycle risk appetite",
            hypothesis="Small-cap outperformance is regime-dependent and should switch to defensive large-cap when IWM lags SPY.",
            universe=["IWM", "SPY", "MDY", "USMV", "BIL"],
            rebalance="daily",
            signal_summary="Hold IWM when 63-day relative strength versus SPY is positive; otherwise SPY/USMV defensive mix.",
            failure_modes=["liquidity stress in small caps", "late cycle reversal", "size factor crowding"],
            builder=weights_size_regime,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_US_INTL_RELATIVE_STRENGTH",
            name="US-International Relative Strength",
            literature_source="Global macro / regional rotation",
            hypothesis="Regional equity leadership rotates between US and developed international proxies.",
            universe=["SPY", "EFA", "EEM", "UUP", "BIL"],
            rebalance="daily",
            signal_summary="Hold SPY or EFA based on 126-day relative strength; penalize EEM when USD pressure rises.",
            failure_modes=["FX drag", "policy divergence", "EM spillover", "home bias concentration"],
            builder=weights_us_intl_relative_strength,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_VOL_TARGET_EQUITY_TREND",
            name="Volatility-Targeted Equity Trend",
            literature_source="Volatility targeting / trend following",
            hypothesis="Equity trend exposure scaled inversely to realized volatility improves risk-adjusted returns.",
            universe=["SPY", "USMV", "BIL"],
            rebalance="daily",
            signal_summary="Scale SPY weight by inverse 21-day vol when 63-day trend is positive; otherwise USMV/BIL.",
            failure_modes=["volatility clustering", "whipsaw", "leverage assumptions missing", "gap risk"],
            builder=weights_vol_target_equity_trend,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_CREDIT_QUALITY_ROTATION",
            name="Credit Quality Rotation",
            literature_source="Credit factor rotation / carry quality",
            hypothesis="Credit quality tiers rotate with stress; rotate among HY, IG, and cash proxies.",
            universe=["HYG", "JNK", "LQD", "IEF", "BIL", "VIX"],
            rebalance="daily",
            signal_summary="Rank HYG, LQD, JNK by 63-day trend; hold best two when stress low, else BIL/IEF.",
            failure_modes=["spread widening", "liquidity freeze", "rating migration lag", "duplicate HY exposure"],
            builder=weights_credit_quality_rotation,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_REAL_ASSET_INFLATION",
            name="Real-Asset Inflation Rotation",
            literature_source="Inflation regime / real asset allocation",
            hypothesis="Commodity, gold, and TIPS proxies rotate with inflation-pressure regimes.",
            universe=["DBC", "GLD", "TIP", "USO", "UUP", "BIL"],
            rebalance="daily",
            signal_summary="Hold top two real-asset ETFs by 63-day trend when inflation pressure proxy is positive.",
            failure_modes=["commodity roll drag", "USD squeeze", "inflation surprise reversal", "oil idiosyncratic shock"],
            builder=weights_real_asset_inflation_rotation,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_EQUITY_BOND_CORR_REGIME",
            name="Equity-Bond Correlation Regime",
            literature_source="Regime allocation / stock-bond correlation research",
            hypothesis="Diversification benefits depend on equity-bond correlation regime.",
            universe=["SPY", "TLT", "IEF", "USMV", "BIL"],
            rebalance="daily",
            signal_summary="Risk-parity SPY/TLT when 63-day correlation is negative; defensive USMV/BIL when correlation is positive.",
            failure_modes=["correlation breakdown", "inflation shock", "duration-equity selloff", "lagged regime detection"],
            builder=weights_equity_bond_correlation_regime,
            expansion_only=True,
            auto_eligible=False,
        ),
        StrategyPrototype(
            strategy_id="EXP_CROSS_ASSET_REVERSAL",
            name="Cross-Asset Short-Term Reversal",
            literature_source="Short-term reversal / multi-asset mean reversion",
            hypothesis="Short-horizon losers across liquid ETF sleeves mean-revert after one-day lag.",
            universe=["SPY", "TLT", "GLD", "HYG", "DBC", "BIL"],
            rebalance="daily",
            signal_summary="Long bottom two and underweight top two by 5-day return with BIL completion.",
            failure_modes=["momentum continuation", "crisis trending", "high turnover", "cross-asset beta drift"],
            builder=weights_cross_asset_short_term_reversal,
            expansion_only=True,
            auto_eligible=False,
        ),
    ]


def weights_sector_momentum_rotation(returns: pd.DataFrame) -> pd.DataFrame:
    tickers = [ticker for ticker in SECTOR_ETF_TICKERS if ticker in returns.columns]
    if len(tickers) < 3:
        return pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    score = returns[tickers].rolling(126).sum()
    weights = _top_n_weights(score, n=3, rebalance_every=1)
    if "BIL" in weights.columns:
        weights["BIL"] = (1.0 - weights[tickers].sum(axis=1)).clip(lower=0.0)
    return weights


def weights_sector_neutral_residual_momentum(returns: pd.DataFrame) -> pd.DataFrame:
    tickers = [ticker for ticker in SECTOR_ETF_TICKERS if ticker in returns.columns]
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if not tickers or "SPY" not in returns.columns:
        return weights
    residual = returns[tickers].subtract(returns["SPY"], axis=0).rolling(63).sum()
    for date in returns.index:
        row = residual.loc[date].dropna()
        if row.empty:
            continue
        leader = row.idxmax()
        weights.loc[date, leader] = 0.55
        weights.loc[date, "SPY"] = -0.25
        if "BIL" in weights.columns:
            weights.loc[date, "BIL"] = max(0.0, 1.0 - weights.loc[date].abs().sum())
    return _rebalance_only(weights, every=1)


def weights_quality_value_composite(returns: pd.DataFrame) -> pd.DataFrame:
    tickers = [ticker for ticker in ["QUAL", "VLUE", "IVE", "MTUM", "USMV"] if ticker in returns.columns]
    if len(tickers) < 2:
        return pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    trend = returns[tickers].rolling(126).sum().rank(axis=1, pct=True)
    reversal = (-returns[tickers].rolling(21).sum()).rank(axis=1, pct=True)
    score = 0.65 * trend + 0.35 * reversal
    return _top_n_weights(score, n=2, rebalance_every=1)


def weights_size_regime(returns: pd.DataFrame) -> pd.DataFrame:
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if "IWM" not in returns.columns or "SPY" not in returns.columns:
        return weights
    rel = (returns["IWM"] - returns["SPY"]).rolling(63).sum()
    for date in returns.index:
        if rel.loc[date] > 0:
            alloc = {"IWM": 0.60, "MDY": 0.20, "SPY": 0.10, "BIL": 0.10}
        else:
            alloc = {"SPY": 0.45, "USMV": 0.35, "BIL": 0.20}
        _assign_alloc(weights, date, alloc)
    return _rebalance_only(weights, every=1)


def weights_us_intl_relative_strength(returns: pd.DataFrame) -> pd.DataFrame:
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if "SPY" not in returns.columns or "EFA" not in returns.columns:
        return weights
    rel = returns["SPY"].rolling(126).sum() - returns["EFA"].rolling(126).sum()
    usd = returns["UUP"].rolling(63).sum() if "UUP" in returns.columns else pd.Series(0, index=returns.index)
    for date in returns.index:
        if rel.loc[date] >= 0:
            alloc = {"SPY": 0.75, "BIL": 0.25}
        else:
            alloc = {"EFA": 0.55, "EEM": 0.15, "BIL": 0.30} if usd.loc[date] <= 0 else {"EFA": 0.45, "BIL": 0.55}
        _assign_alloc(weights, date, alloc)
    return _rebalance_only(weights, every=1)


def weights_vol_target_equity_trend(returns: pd.DataFrame) -> pd.DataFrame:
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if "SPY" not in returns.columns:
        return weights
    trend = returns["SPY"].rolling(63).sum()
    vol = returns["SPY"].rolling(21).std() * np.sqrt(TRADING_DAYS)
    target_vol = 0.12
    for date in returns.index:
        if trend.loc[date] <= 0:
            alloc = {"USMV": 0.45, "BIL": 0.55} if "USMV" in weights.columns else {"BIL": 1.0}
        else:
            scale = float(np.clip(target_vol / max(vol.loc[date], 1e-6), 0.25, 1.0))
            alloc = {"SPY": scale, "BIL": 1.0 - scale}
        _assign_alloc(weights, date, alloc)
    return _rebalance_only(weights, every=1)


def weights_credit_quality_rotation(returns: pd.DataFrame) -> pd.DataFrame:
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    tickers = [ticker for ticker in ["HYG", "JNK", "LQD"] if ticker in returns.columns]
    if not tickers:
        return weights
    score = returns[tickers].rolling(63).sum()
    stress = _vix_stress_score(returns)
    for date in returns.index:
        if stress.loc[date] > 0.55:
            alloc = {"BIL": 0.55, "IEF": 0.45}
        else:
            row = score.loc[date].dropna().sort_values(ascending=False)
            chosen = list(row.head(2).index)
            alloc = {ticker: 0.45 for ticker in chosen}
            alloc["BIL"] = max(0.0, 1.0 - sum(alloc.values()))
        _assign_alloc(weights, date, alloc)
    return _rebalance_only(weights, every=1)


def weights_real_asset_inflation_rotation(returns: pd.DataFrame) -> pd.DataFrame:
    tickers = [ticker for ticker in ["DBC", "GLD", "TIP", "USO"] if ticker in returns.columns]
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if not tickers:
        return weights
    inflation_pressure = returns["DBC"].rolling(63).sum() if "DBC" in returns else pd.Series(0, index=returns.index)
    trend = returns[tickers].rolling(63).sum()
    for date in returns.index:
        if inflation_pressure.loc[date] <= 0:
            alloc = {"BIL": 0.70, "GLD": 0.30} if "GLD" in weights.columns else {"BIL": 1.0}
        else:
            row = trend.loc[date].dropna().sort_values(ascending=False)
            chosen = list(row.head(2).index)
            alloc = {ticker: 0.40 for ticker in chosen}
            alloc["BIL"] = max(0.0, 1.0 - sum(alloc.values()))
        _assign_alloc(weights, date, alloc)
    return _rebalance_only(weights, every=1)


def weights_equity_bond_correlation_regime(returns: pd.DataFrame) -> pd.DataFrame:
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if "SPY" not in returns.columns or "TLT" not in returns.columns:
        return weights
    corr = returns["SPY"].rolling(63).corr(returns["TLT"])
    for date in returns.index:
        if pd.isna(corr.loc[date]) or corr.loc[date] > 0:
            alloc = {"USMV": 0.40, "BIL": 0.60} if "USMV" in weights.columns else {"BIL": 1.0}
        else:
            alloc = {"SPY": 0.35, "TLT": 0.35, "IEF": 0.15, "BIL": 0.15}
        _assign_alloc(weights, date, alloc)
    return _rebalance_only(weights, every=1)


def weights_cross_asset_short_term_reversal(returns: pd.DataFrame) -> pd.DataFrame:
    tickers = [ticker for ticker in ["SPY", "TLT", "GLD", "HYG", "DBC"] if ticker in returns.columns]
    weights = pd.DataFrame(0.0, index=returns.index, columns=returns.columns)
    if len(tickers) < 3:
        return weights
    rev = -returns[tickers].rolling(5).sum()
    for date in returns.index:
        row = rev.loc[date].dropna()
        if len(row) < 3:
            continue
        losers = row.nsmallest(2).index
        winners = row.nlargest(2).index
        for ticker in losers:
            weights.loc[date, ticker] += 0.25
        for ticker in winners:
            weights.loc[date, ticker] -= 0.10
        gross = weights.loc[date, tickers].abs().sum()
        if "BIL" in weights.columns:
            weights.loc[date, "BIL"] = max(0.0, 1.0 - gross)
    return _rebalance_only(weights, every=1)


def ensure_literature_baseline(
    literature_path: str | Path,
    price_path: str | Path,
    *,
    allow_generate: bool = True,
) -> dict[str, Any]:
    path = Path(literature_path)
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("results"):
            return payload
        raise ValueError(f"Literature baseline at {path} exists but contains no strategy results.")
    if not allow_generate:
        raise FileNotFoundError(
            f"Literature baseline missing at {path}. Run scripts/run_literature_strategy_backtests.py first."
        )
    payload = run_all_literature_backtests(price_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    payload["generated_during_run"] = True
    return payload


def baseline_net_series_from_payload(payload: dict[str, Any]) -> dict[str, pd.Series]:
    series: dict[str, pd.Series] = {}
    for item in payload.get("results", []):
        backtest = item.get("backtest", {})
        strategy_id = backtest.get("strategy_id")
        dates = backtest.get("return_series", {}).get("dates", [])
        values = backtest.get("return_series", {}).get("net_returns", [])
        if strategy_id and dates:
            series[strategy_id] = pd.Series(values, index=pd.to_datetime(dates), dtype=float)
    if not series:
        raise ValueError("Literature baseline payload contains no usable net return series.")
    return series


def correlation_against_baseline(
    backtest: dict[str, Any],
    baseline_series: dict[str, pd.Series],
) -> dict[str, Any]:
    dates = backtest.get("return_series", {}).get("dates", [])
    values = backtest.get("return_series", {}).get("net_returns", [])
    if not dates:
        raise ValueError(f"Missing return series for correlation review: {backtest.get('strategy_id')}")
    expansion = pd.Series(values, index=pd.to_datetime(dates), dtype=float)
    baseline_frame = pd.DataFrame(baseline_series).dropna(how="all")
    aligned = pd.concat([expansion.rename("candidate"), baseline_frame], axis=1).dropna()
    if aligned.empty:
        raise ValueError(
            f"No overlapping dates for correlation review: {backtest.get('strategy_id')} vs literature baseline."
        )
    corr = aligned.corr()["candidate"].drop("candidate").sort_values(key=lambda s: s.abs(), ascending=False)
    top = [
        {
            "strategy_id": other_id,
            "correlation": float(value),
            "interpretation": (
                "high duplicate-exposure risk"
                if abs(value) >= 0.75
                else "watch overlap"
                if abs(value) >= 0.45
                else "low overlap"
            ),
        }
        for other_id, value in corr.head(5).items()
    ]
    return {
        "status": "complete",
        "baseline_strategy_count": len(baseline_series),
        "top_correlations": top,
        "average_abs_correlation": float(corr.abs().mean()) if len(corr) else 0.0,
        "max_abs_correlation": float(corr.abs().max()) if len(corr) else 0.0,
    }



def _correlation_against_baseline(expansion_results: list[dict], baseline_series: dict[str, pd.Series]) -> None:
    if not baseline_series:
        raise ValueError("Literature baseline net return series are required for correlation review.")
    for item in expansion_results:
        backtest = item["backtest"]
        dates = backtest.get("return_series", {}).get("dates", [])
        if not dates:
            backtest["correlation_vs_existing_strategies"] = {
                "status": "missing_strategy_data",
                "baseline_strategy_count": len(baseline_series),
                "top_correlations": [],
                "average_abs_correlation": 0.0,
                "max_abs_correlation": 0.0,
            }
            continue
        backtest["correlation_vs_existing_strategies"] = correlation_against_baseline(
            backtest,
            baseline_series,
        )


def classify_expansion_review(item: dict) -> dict[str, str]:
    backtest = item["backtest"]
    walk = item["walk_forward"]
    net = backtest.get("net_metrics", {})
    turnover = backtest.get("turnover", {})
    sharpe = float(net.get("sharpe", 0.0))
    max_dd = float(net.get("max_drawdown", 0.0))
    ann_turn = float(turnover.get("annualized_turnover", 0.0))
    cost_drag = float(turnover.get("annualized_cost_drag", 0.0))
    avg_oos = float(walk.get("average_test_sharpe", 0.0))
    pos_oos = float(walk.get("positive_window_rate", 0.0))
    corr_meta = backtest.get("correlation_vs_existing_strategies", {})
    max_corr = float(corr_meta.get("max_abs_correlation", 0.0))

    if backtest.get("archived"):
        return {
            "decision": "Retire",
            "reason": "Archived strategy retained for historical evidence only.",
        }
    if sharpe < 0 or max_dd < -0.45 or ann_turn > 24 or avg_oos < -0.25:
        return {
            "decision": "Retire",
            "reason": "Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe.",
        }
    if max_corr >= 0.75:
        return {
            "decision": "Research Hold",
            "reason": f"High overlap with existing sleeve (max |corr| {max_corr:.2f}).",
        }
    if sharpe >= 0.5 and max_dd > -0.35 and pos_oos >= 0.45 and avg_oos >= 0 and ann_turn <= 12 and cost_drag <= 0.015:
        return {
            "decision": "Keep",
            "reason": "Net Sharpe, OOS stability, drawdown, and turnover pass expansion review gates.",
        }
    return {
        "decision": "Research Hold",
        "reason": "Mixed evidence; continue research before any allocation review.",
    }


def build_ranked_strategy_review(expansion_results: list[dict], archived_item: dict | None = None) -> list[dict]:
    rows = []
    for item in expansion_results:
        backtest = item["backtest"]
        walk = item["walk_forward"]
        review = classify_expansion_review(item)
        net = backtest.get("net_metrics", {})
        turnover = backtest.get("turnover", {})
        rows.append(
            {
                "strategy_id": backtest["strategy_id"],
                "name": backtest["name"],
                "decision": review["decision"],
                "reason": review["reason"],
                "net_sharpe": float(net.get("sharpe", 0.0)),
                "annualized_return": float(net.get("annual_return", net.get("annualized_return", 0.0))),
                "annualized_volatility": float(net.get("annual_volatility", net.get("annualized_volatility", 0.0))),
                "max_drawdown": float(net.get("max_drawdown", 0.0)),
                "annualized_turnover": float(turnover.get("annualized_turnover", 0.0)),
                "annualized_cost_drag": float(turnover.get("annualized_cost_drag", 0.0)),
                "average_oos_sharpe": float(walk.get("average_test_sharpe", 0.0)),
                "positive_oos_windows": float(walk.get("positive_window_rate", 0.0)),
                "auto_eligible": bool(backtest.get("auto_eligible", False)),
                "expansion_only": bool(backtest.get("expansion_only", True)),
            }
        )
    if archived_item:
        backtest = archived_item["backtest"]
        walk = archived_item["walk_forward"]
        net = backtest.get("net_metrics", {})
        turnover = backtest.get("turnover", {})
        rows.append(
            {
                "strategy_id": backtest["strategy_id"],
                "name": backtest["name"],
                "decision": "Retire",
                "reason": "Archived Index Arbitrage Proxy; historical evidence preserved, not eligible for allocation.",
                "net_sharpe": float(net.get("sharpe", 0.0)),
                "annualized_return": float(net.get("annual_return", net.get("annualized_return", 0.0))),
                "annualized_volatility": float(net.get("annual_volatility", net.get("annualized_volatility", 0.0))),
                "max_drawdown": float(net.get("max_drawdown", 0.0)),
                "annualized_turnover": float(turnover.get("annualized_turnover", 0.0)),
                "annualized_cost_drag": float(turnover.get("annualized_cost_drag", 0.0)),
                "average_oos_sharpe": float(walk.get("average_test_sharpe", 0.0)),
                "positive_oos_windows": float(walk.get("positive_window_rate", 0.0)),
                "auto_eligible": False,
                "expansion_only": False,
                "archived": True,
            }
        )
    order = {"Keep": 0, "Research Hold": 1, "Retire": 2}
    rows.sort(key=lambda row: (order.get(row["decision"], 9), -row["net_sharpe"]))
    return rows


def run_strategy_expansion_v1(
    price_path: str | Path = "data/processed/market_price_history.csv",
    literature_path: str | Path = "output/literature_strategy_backtests.json",
) -> dict[str, Any]:
    price_path = Path(price_path)
    literature_path = Path(literature_path)
    baseline_payload = ensure_literature_baseline(literature_path, price_path)
    baseline_series = baseline_net_series_from_payload(baseline_payload)
    _, returns = load_price_returns(price_path)
    prototypes = expansion_strategy_prototypes()
    required_tickers: set[str] = set()
    for strategy in prototypes:
        required_tickers.update(strategy.universe)
    data_provenance = {
        "price_path": str(price_path),
        "data_snapshot_date": returns.index.max().date().isoformat(),
        "return_panel_first_date": returns.index.min().date().isoformat(),
        "return_panel_last_date": returns.index.max().date().isoformat(),
        "literature_baseline_path": str(literature_path),
        "literature_baseline_strategy_count": len(baseline_series),
        "literature_baseline_generated_during_run": bool(baseline_payload.get("generated_during_run", False)),
    }
    panel = pd.read_csv(price_path)
    available = set(panel["ticker"].unique())
    data_provenance["ticker_coverage"] = {
        "required_count": len(required_tickers),
        "available_count": len(required_tickers & available),
        "missing_tickers": sorted(required_tickers - available),
    }
    results = []
    for strategy in prototypes:
        results.append(
            {
                "backtest": run_strategy_backtest(strategy, returns),
                "walk_forward": run_walk_forward(strategy, returns, train_days=504, test_days=126),
            }
        )
    _correlation_against_baseline(results, baseline_series)

    archived = None
    for prototype in strategy_prototypes():
        if prototype.strategy_id == "CAND_INDEX_ARBITRAGE_PROXY":
            archived = {
                "backtest": run_strategy_backtest(prototype, returns),
                "walk_forward": run_walk_forward(prototype, returns, train_days=504, test_days=126),
            }
            archived["backtest"]["archived"] = True
            archived["backtest"]["auto_eligible"] = False
            break

    review = build_ranked_strategy_review(results, archived_item=archived)
    return {
        "phase": "strategy_expansion_v1",
        "source": "yfinance_etf_proxy_research",
        "price_path": str(price_path),
        "as_of": returns.index.max().date().isoformat(),
        "data_provenance": data_provenance,
        "cost_assumption": f"{int(BUY_BPS)} bps buy and {int(SELL_BPS)} bps sell; turnover-based daily rebalance cost",
        "no_lookahead": "Weights are shifted by one trading day before applying returns.",
        "walk_forward_design": {"train_days": 504, "test_days": 126, "step_days": 126},
        "allocation_policy": "Expansion candidates are research-only; auto_eligible=False and excluded from dashboard weights in this phase.",
        "results": results,
        "archived_strategies": [archived] if archived else [],
        "ranked_strategy_review": review,
    }
