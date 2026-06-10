"""Portfolio return and transaction-cost helpers for Alpha #2 research."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

EXECUTION_MODE_NEXT_OPEN_TO_CLOSE = "next_open_to_close"
EXECUTION_MODE_CLOSE_TO_CLOSE_LAG2 = "close_to_close_lag2"

SUPPORTED_EXECUTION_MODES = frozenset(
    {EXECUTION_MODE_NEXT_OPEN_TO_CLOSE, EXECUTION_MODE_CLOSE_TO_CLOSE_LAG2}
)

EXECUTION_MODE_SPECS: dict[str, dict[str, int | str]] = {
    EXECUTION_MODE_NEXT_OPEN_TO_CLOSE: {
        "execution_lag": 1,
        "return_definition": "open_to_close",
    },
    EXECUTION_MODE_CLOSE_TO_CLOSE_LAG2: {
        "execution_lag": 2,
        "return_definition": "close_to_close",
    },
}


@dataclass(frozen=True)
class PortfolioReturnResult:
    executed_weights: pd.DataFrame
    gross_return: pd.Series
    turnover: pd.Series
    transaction_cost: pd.Series
    net_return: pd.Series
    execution_lag: int
    return_definition: str


def validate_execution_mode(execution_mode: str) -> str:
    normalized = str(execution_mode).strip()
    if normalized not in SUPPORTED_EXECUTION_MODES:
        supported = ", ".join(sorted(SUPPORTED_EXECUTION_MODES))
        raise ValueError(f"execution_mode must be one of: {supported}")
    return normalized


def resolve_execution_spec(execution_mode: str) -> tuple[int, str]:
    normalized = validate_execution_mode(execution_mode)
    spec = EXECUTION_MODE_SPECS[normalized]
    return int(spec["execution_lag"]), str(spec["return_definition"])


def build_asset_return_panel(
    open_prices: pd.DataFrame,
    close_prices: pd.DataFrame,
    adj_close: pd.DataFrame,
    *,
    execution_mode: str,
) -> pd.DataFrame:
    """Build the asset return panel aligned to the selected execution convention."""
    normalized = validate_execution_mode(execution_mode)
    if normalized == EXECUTION_MODE_NEXT_OPEN_TO_CLOSE:
        with np.errstate(divide="ignore", invalid="ignore"):
            returns = close_prices / open_prices - 1.0
        return returns.replace([np.inf, -np.inf], np.nan)
    return adj_close.pct_change(fill_method=None)


def compute_portfolio_returns_from_weights(
    target_weights: pd.DataFrame,
    asset_returns: pd.DataFrame,
    *,
    execution_lag: int,
    buy_bps: float,
    sell_bps: float,
    return_definition: str,
) -> PortfolioReturnResult:
    """Apply execution lag, gross PnL, symmetric turnover costs, and net PnL."""
    if execution_lag <= 0:
        raise ValueError("execution_lag must be positive")

    executed_weights = target_weights.shift(execution_lag).fillna(0.0)
    gross_return = (executed_weights * asset_returns).sum(axis=1, min_count=1).fillna(0.0)
    turnover = executed_weights.diff().abs().sum(axis=1).fillna(executed_weights.abs().sum(axis=1))
    transaction_cost = turnover * (buy_bps + sell_bps) / 2.0 / 10_000.0
    net_return = gross_return - transaction_cost

    return PortfolioReturnResult(
        executed_weights=executed_weights,
        gross_return=gross_return,
        turnover=turnover,
        transaction_cost=transaction_cost,
        net_return=net_return,
        execution_lag=execution_lag,
        return_definition=return_definition,
    )
