"""End-to-end WorldQuant Alpha #2 research backtest."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.risk.performance import cumulative_returns, max_drawdown, sharpe_ratio, volatility
from src.strategies.worldquant.alpha2 import compute_alpha2_components
from src.strategies.worldquant.data_loader import prepare_alpha2_market_data
from src.strategies.worldquant.market_data import (
    DEFAULT_CORRELATION_WINDOW,
    DEFAULT_DELTA_PERIODS,
    DEFAULT_MIN_ALPHA2_OBSERVATIONS,
    is_usable_ticker_status,
)
from src.strategies.worldquant.portfolio import signal_to_dollar_neutral_weights

STRATEGY_NAME = "WorldQuant Alpha #2"
TRADING_DAYS = 252
DEFAULT_BUY_BPS = 5.0
DEFAULT_SELL_BPS = 5.0
DEFAULT_EXECUTION_LAG = 1


@dataclass(frozen=True)
class Alpha2BacktestResult:
    run_status: str
    summary: pd.DataFrame
    daily_returns: pd.DataFrame
    quality_report: pd.DataFrame
    signal_sample: pd.DataFrame
    components: dict[str, pd.DataFrame]
    weights: pd.DataFrame
    signal: pd.DataFrame


def _compound_return(values: pd.Series) -> float:
    clean = values.dropna().astype(float)
    if clean.empty:
        return 0.0
    return float(np.prod(1.0 + clean.to_numpy()) - 1.0)


def _active_backtest_index(weights: pd.DataFrame) -> pd.Index:
    active = weights.abs().sum(axis=1) > 1e-10
    if not active.any():
        return weights.index[:0]
    return weights.loc[active[active].index[0] :].index


def run_alpha2_backtest(
    ohlcv: pd.DataFrame,
    requested_tickers: list[str],
    *,
    delta_periods: int = DEFAULT_DELTA_PERIODS,
    correlation_window: int = DEFAULT_CORRELATION_WINDOW,
    min_valid_observations: int = DEFAULT_MIN_ALPHA2_OBSERVATIONS,
    long_quantile: float = 0.20,
    short_quantile: float = 0.20,
    execution_lag: int = DEFAULT_EXECUTION_LAG,
    buy_bps: float = DEFAULT_BUY_BPS,
    sell_bps: float = DEFAULT_SELL_BPS,
    download_failures: pd.DataFrame | None = None,
) -> Alpha2BacktestResult:
    """Run Alpha #2 signal -> delayed weights -> gross/net daily returns."""
    panels, usable_ohlcv, quality_report = prepare_alpha2_market_data(
        ohlcv,
        requested_tickers,
        min_valid_observations=min_valid_observations,
    )
    quality_report = _merge_download_failures(quality_report, download_failures)
    usable_tickers = sorted(quality_report.loc[
        quality_report["status"].map(is_usable_ticker_status),
        "ticker",
    ].tolist())

    if not usable_tickers:
        empty_summary = pd.DataFrame(
            [{
                "strategy_name": STRATEGY_NAME,
                "run_status": "failed_no_usable_data",
                "requested_ticker_count": len(requested_tickers),
                "usable_ticker_count": 0,
                "rejected_ticker_count": int(len(quality_report)),
                "start_date": None,
                "end_date": None,
                "valid_trading_days": 0,
                "annualized_return": 0.0,
                "annualized_volatility": 0.0,
                "sharpe_ratio": 0.0,
                "maximum_drawdown": 0.0,
                "cumulative_gross_return": 0.0,
                "cumulative_net_return": 0.0,
                "average_daily_turnover": 0.0,
                "data_coverage": 0.0,
            }]
        )
        return Alpha2BacktestResult(
            run_status="failed_no_usable_data",
            summary=empty_summary,
            daily_returns=pd.DataFrame(
                columns=["date", "gross_return", "transaction_cost", "net_return", "cumulative_net_value"]
            ),
            quality_report=quality_report,
            signal_sample=pd.DataFrame(),
            components={},
            weights=pd.DataFrame(),
            signal=pd.DataFrame(),
        )

    open_prices = panels["open"]
    close_prices = panels["close"]
    volume = panels["volume"]
    adj_close = panels["adj_close"]

    components = compute_alpha2_components(
        open_prices,
        close_prices,
        volume,
        delta_periods=delta_periods,
        correlation_window=correlation_window,
    )
    signal = components["alpha"]
    weights = signal_to_dollar_neutral_weights(
        signal,
        long_quantile=long_quantile,
        short_quantile=short_quantile,
    )

    asset_returns = adj_close.pct_change(fill_method=None)
    shifted_weights = weights.shift(execution_lag).fillna(0.0)
    gross = (shifted_weights * asset_returns).sum(axis=1, min_count=1)
    turnover = shifted_weights.diff().abs().sum(axis=1).fillna(shifted_weights.abs().sum(axis=1))
    transaction_cost = turnover * (buy_bps + sell_bps) / 2.0 / 10_000.0
    net = gross - transaction_cost

    active_index = _active_backtest_index(shifted_weights)
    if active_index.empty:
        return Alpha2BacktestResult(
            run_status="failed_no_active_positions",
            summary=pd.DataFrame(
                [{
                    "strategy_name": STRATEGY_NAME,
                    "run_status": "failed_no_active_positions",
                    "requested_ticker_count": len(requested_tickers),
                    "usable_ticker_count": len(usable_tickers),
                    "rejected_ticker_count": int((~quality_report["status"].map(is_usable_ticker_status)).sum()),
                    "start_date": None,
                    "end_date": None,
                    "valid_trading_days": 0,
                    "annualized_return": 0.0,
                    "annualized_volatility": 0.0,
                    "sharpe_ratio": 0.0,
                    "maximum_drawdown": 0.0,
                    "cumulative_gross_return": 0.0,
                    "cumulative_net_return": 0.0,
                    "average_daily_turnover": 0.0,
                    "data_coverage": float(len(usable_tickers) / max(len(requested_tickers), 1)),
                }]
            ),
            daily_returns=pd.DataFrame(
                columns=["date", "gross_return", "transaction_cost", "net_return", "cumulative_net_value"]
            ),
            quality_report=quality_report,
            signal_sample=_build_signal_sample(components, signal, weights, max_rows=120),
            components=components,
            weights=weights,
            signal=signal,
        )

    gross = gross.loc[active_index]
    turnover = turnover.loc[active_index]
    transaction_cost = transaction_cost.loc[active_index]
    net = net.loc[active_index]

    cumulative_net = cumulative_returns(net.tolist())
    daily_returns = pd.DataFrame(
        {
            "date": [idx.date().isoformat() for idx in net.index],
            "gross_return": gross.to_numpy(dtype=float),
            "transaction_cost": transaction_cost.to_numpy(dtype=float),
            "net_return": net.to_numpy(dtype=float),
            "cumulative_net_value": [1.0 + value for value in cumulative_net],
        }
    )

    valid_days = int(net.dropna().shape[0])
    data_coverage = float(len(usable_tickers) / max(len(requested_tickers), 1))
    net_values = net.dropna().astype(float).tolist()
    gross_values = gross.dropna().astype(float).tolist()

    summary = pd.DataFrame(
        [{
            "strategy_name": STRATEGY_NAME,
            "run_status": "completed",
            "requested_ticker_count": len(requested_tickers),
            "usable_ticker_count": len(usable_tickers),
            "rejected_ticker_count": int((~quality_report["status"].map(is_usable_ticker_status)).sum()),
            "start_date": net.index[0].date().isoformat() if valid_days else None,
            "end_date": net.index[-1].date().isoformat() if valid_days else None,
            "valid_trading_days": valid_days,
            "annualized_return": float((np.prod([1 + value for value in net_values]) ** (TRADING_DAYS / valid_days)) - 1)
            if valid_days
            else 0.0,
            "annualized_volatility": volatility(net_values) if len(net_values) > 1 else 0.0,
            "sharpe_ratio": sharpe_ratio(net_values) if len(net_values) > 1 else 0.0,
            "maximum_drawdown": max_drawdown(net_values) if net_values else 0.0,
            "cumulative_gross_return": _compound_return(gross),
            "cumulative_net_return": _compound_return(net),
            "average_daily_turnover": float(turnover.mean()) if valid_days else 0.0,
            "data_coverage": data_coverage,
        }]
    )

    signal_sample = _build_signal_sample(components, signal, weights, max_rows=120)

    return Alpha2BacktestResult(
        run_status="completed",
        summary=summary,
        daily_returns=daily_returns,
        quality_report=quality_report,
        signal_sample=signal_sample,
        components=components,
        weights=weights,
        signal=signal,
    )


def _merge_download_failures(
    quality_report: pd.DataFrame,
    download_failures: pd.DataFrame | None,
) -> pd.DataFrame:
    if download_failures is None or download_failures.empty:
        return quality_report

    merged = quality_report.copy()
    failure_lookup = download_failures.drop_duplicates(subset=["ticker"], keep="last").set_index("ticker")
    for idx, row in merged.iterrows():
        ticker = row["ticker"]
        if ticker not in failure_lookup.index:
            continue
        failure = failure_lookup.loc[ticker]
        merged.loc[idx, "status"] = failure.get("status", row["status"])
        merged.loc[idx, "reason"] = str(failure.get("error_message", row["reason"]))
        if row["usable_observation_count"] == 0:
            merged.loc[idx, "missing_value_ratio"] = 1.0
    return merged


def _build_signal_sample(
    components: dict[str, pd.DataFrame],
    signal: pd.DataFrame,
    weights: pd.DataFrame,
    *,
    max_rows: int,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for date in signal.index:
        row = signal.loc[date].dropna()
        if row.empty:
            continue
        for ticker in row.sort_values(ascending=False).head(2).index:
            rows.append(
                {
                    "date": date.date().isoformat(),
                    "ticker": ticker,
                    "volume_delta_rank": float(components["volume_delta_rank"].loc[date, ticker]),
                    "intraday_return_rank": float(components["intraday_return_rank"].loc[date, ticker]),
                    "rolling_correlation": float(components["rolling_correlation"].loc[date, ticker]),
                    "signal": float(signal.loc[date, ticker]),
                    "position": float(weights.loc[date, ticker]),
                }
            )
        if len(rows) >= max_rows:
            break
    return pd.DataFrame(rows)


def write_alpha2_backtest_outputs(
    result: Alpha2BacktestResult,
    output_dir: str | Path,
) -> dict[str, Path]:
    """Write the minimum Alpha #2 research output package."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = {
        "strategy_summary": out / "strategy_summary.csv",
        "daily_strategy_returns": out / "daily_strategy_returns.csv",
        "data_quality_report": out / "data_quality_report.csv",
        "signal_sample": out / "signal_sample.csv",
    }
    result.summary.to_csv(paths["strategy_summary"], index=False)
    result.daily_returns.to_csv(paths["daily_strategy_returns"], index=False)
    result.quality_report.to_csv(paths["data_quality_report"], index=False)
    result.signal_sample.to_csv(paths["signal_sample"], index=False)
    return paths
