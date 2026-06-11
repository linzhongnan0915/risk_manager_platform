"""C2B2_006 return-autocorrelation reversal baseline."""

from __future__ import annotations

import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def return_autocorrelation_reversal_score(context: StrategyContext) -> pd.DataFrame:
    """Fade recent displacement only when trailing serial dependence is negative."""
    returns = context.daily_returns
    autocorrelation = returns.rolling(20, min_periods=20).corr(returns.shift(1)).clip(upper=0.0)
    recent_displacement = returns.rolling(3, min_periods=3).sum()
    return recent_displacement.mul(autocorrelation)


SPEC = StrategySpec(
    strategy_id="C2B2_006", version="c2b2_006_return_autocorrelation_reversal_v1",
    name="Return-Autocorrelation Reversal",
    hypothesis="Negative serial dependence identifies temporary price displacement likely to reverse.",
    signal_function=return_autocorrelation_reversal_score, rebalance_every=3,
)
