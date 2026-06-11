"""C2A2_001 frozen signal definition for the minimal strategy factory."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def residual_reversal_score(context: StrategyContext) -> pd.DataFrame:
    recent_stock = context.panels["adj_close"].div(context.panels["adj_close"].shift(5)).sub(1.0)
    recent_market = context.market_return.add(1.0).rolling(5, min_periods=5).apply(np.prod, raw=True).sub(1.0)
    return -recent_stock.sub(context.lagged_beta.mul(recent_market, axis=0))


SPEC = StrategySpec(
    strategy_id="C2A2_001",
    version="c2a2_001_residual_reversal_baseline_v1",
    name="Liquidity-Filtered Market-Residual Short-Term Reversal",
    hypothesis="Temporary stock-specific price pressure partially reverses.",
    signal_function=residual_reversal_score,
    rebalance_every=5,
    require_beta_history=True,
)
