"""C2B2_005 volume-confirmed residual continuation baseline."""

from __future__ import annotations

import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def volume_confirmed_residual_continuation_score(context: StrategyContext) -> pd.DataFrame:
    """Continue residual moves supported by abnormal prior-day volume."""
    residual = context.daily_returns.sub(context.lagged_beta.mul(context.market_return, axis=0))
    volume = context.panels["volume"]
    abnormal_lagged_volume = volume.shift(1).div(volume.rolling(20, min_periods=20).mean().shift(2))
    return residual.rolling(5, min_periods=5).sum().mul(abnormal_lagged_volume)


SPEC = StrategySpec(
    strategy_id="C2B2_005", version="c2b2_005_volume_confirmed_residual_continuation_v1",
    name="Volume-Confirmed Residual Continuation",
    hypothesis="Stock-specific moves supported by abnormal prior volume may reflect gradual information diffusion.",
    signal_function=volume_confirmed_residual_continuation_score, rebalance_every=5, require_beta_history=True,
)
