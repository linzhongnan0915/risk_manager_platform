"""C2B2_001 common-factor residual mean-reversion baseline."""

from __future__ import annotations

import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def common_factor_residual_reversal_score(context: StrategyContext) -> pd.DataFrame:
    """Fade moves after removing a robust trailing cross-sectional common factor."""
    common = (context.daily_returns.mean(axis=1) + context.daily_returns.median(axis=1)) / 2.0
    residual = context.daily_returns.sub(common, axis=0)
    return -residual.rolling(5, min_periods=5).sum()


SPEC = StrategySpec(
    strategy_id="C2B2_001", version="c2b2_001_common_factor_residual_reversal_v1",
    name="PCA-Equivalent Common-Factor Residual Mean Reversion",
    hypothesis="Temporary moves remaining after robust common-factor removal may reverse.",
    signal_function=common_factor_residual_reversal_score, rebalance_every=5,
)
