"""C2A2_008 range-compression breakout baseline."""

from __future__ import annotations

import pandas as pd

from src.strategies.strategy_factory import StrategyContext, StrategySpec


def range_compression_breakout_score(context: StrategyContext) -> pd.DataFrame:
    """Higher scores are stronger directional moves after tighter trailing ranges."""
    close = context.panels["close"]
    normalized_range = context.panels["high"].sub(context.panels["low"]).div(close)
    prior_short_range = normalized_range.rolling(5, min_periods=5).mean().shift(1)
    prior_long_range = normalized_range.rolling(20, min_periods=20).mean().shift(1)
    compression_strength = prior_long_range.div(prior_short_range)
    return close.pct_change(fill_method=None).mul(compression_strength)


SPEC = StrategySpec(
    strategy_id="C2A2_008",
    version="c2a2_008_range_compression_breakout_baseline_v1",
    name="Cross-Sectional Range-Compression Breakout",
    hypothesis="Directional price expansion after a compressed trading range may continue as information diffuses.",
    signal_function=range_compression_breakout_score,
    rebalance_every=5,
)
