"""C2A2_019 correlation-crowding reversal baseline."""

from __future__ import annotations

import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def correlation_crowding_reversal_score(context: StrategyContext) -> pd.DataFrame:
    """Higher scores fade extreme residual moves in highly synchronized stocks."""
    crowding = context.daily_returns.rolling(60, min_periods=60).corr(context.market_return)
    residual_move = context.daily_returns.sub(context.lagged_beta.mul(context.market_return, axis=0))
    return -residual_move.mul(crowding.clip(lower=0.0))


SPEC = StrategySpec(
    strategy_id="C2A2_019",
    version="c2a2_019_correlation_crowding_reversal_baseline_v1",
    name="Cross-Sectional Correlation Crowding Reversal",
    hypothesis="Extreme residual moves in highly synchronized stocks may reverse as crowded common flows subside.",
    signal_function=correlation_crowding_reversal_score,
    rebalance_every=5,
    require_beta_history=True,
)
