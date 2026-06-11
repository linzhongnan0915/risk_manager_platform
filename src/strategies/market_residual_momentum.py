"""C2B2_002 market-residual momentum continuation baseline."""

from __future__ import annotations

import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def market_residual_momentum_score(context: StrategyContext) -> pd.DataFrame:
    """Continue persistent market-adjusted return trends."""
    residual = context.daily_returns.sub(context.lagged_beta.mul(context.market_return, axis=0))
    return residual.rolling(60, min_periods=60).sum()


SPEC = StrategySpec(
    strategy_id="C2B2_002", version="c2b2_002_market_residual_momentum_v1",
    name="Market-Residual Momentum Continuation",
    hypothesis="Stock-specific information may diffuse gradually after removing market movement.",
    signal_function=market_residual_momentum_score, rebalance_every=20, require_beta_history=True,
)
