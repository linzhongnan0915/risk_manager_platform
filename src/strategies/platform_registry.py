"""Platform registry for Combined Portfolio members and extended reference baselines."""

from __future__ import annotations

from src.strategies.c3a1_signals import (
    breakout_persistence,
    downside_beta,
    improving_liquidity,
    low_amihud_illiquidity,
    low_gap_risk,
    low_max_effect,
    low_rolling_drawdown,
    low_tail_loss,
    low_downside_volatility,
    price_efficiency,
    relative_strength_12_1,
    relative_strength_6_1,
    residual_momentum_12_1,
    stable_dollar_volume,
    trend_quality,
    volatility_adjusted_momentum,
    volume_confirmed_trend,
)
from src.strategies.c3a2_signals import (
    distance_from_200dma,
    low_idiosyncratic_volatility_60d,
    low_intraday_range_volatility,
    low_market_beta_60d,
    low_realized_volatility_60d,
    medium_term_reversal_22d,
    short_term_reversal_5d,
    slow_momentum_9_1,
    high_log_dollar_volume_63d,
)
from src.strategies.c3a1_registry import C3A1_SPECS, C3A1_IDS
from src.strategies.downside_beta_defensive import SPEC as C2B2_003_SPEC
from src.strategies.liquidity_resilience import SPEC as C2A2_020_SPEC
from src.strategies.low_residual_volatility import SPEC as C2A2_002_SPEC
from src.strategies.overnight_gap_reversal import SPEC as C2A2_004_SPEC
from src.strategies.realized_skewness import SPEC as C2B2_004_SPEC
from src.strategies.strategy_factory import StrategySpec

COMPOSITE_ID = "COMBINED_PORTFOLIO_V1"
COMPOSITE_NAME = "Combined Portfolio"
COMPOSITE_LABEL = "Equal-weight composite of all eligible ACTIVE underlying strategies — research only."

C3A2_SPECS: tuple[StrategySpec, ...] = (
    StrategySpec("C3A2_001", "c3a2_001_short_term_reversal_5d_v1", "Short-Term Reversal 5D",
                 "Fade 5-day moves; long recent losers and short recent winners.", short_term_reversal_5d, 20),
    StrategySpec("C3A2_002", "c3a2_002_low_realized_volatility_60d_v1", "Low Realized Volatility 60D",
                 "Long lower 60-day realized volatility.", low_realized_volatility_60d, 20),
    StrategySpec("C3A2_003", "c3a2_003_low_market_beta_60d_v1", "Low Market Beta 60D",
                 "Long lower trailing market beta.", low_market_beta_60d, 20, require_beta_history=True),
    StrategySpec("C3A2_004", "c3a2_004_medium_term_reversal_22d_v1", "Medium-Term Reversal 22D",
                 "Contrarian signal over roughly one trading month.", medium_term_reversal_22d, 20),
    StrategySpec("C3A2_005", "c3a2_005_low_idiosyncratic_volatility_60d_v1", "Low Idiosyncratic Volatility 60D",
                 "Long lower residual volatility after removing market movement.", low_idiosyncratic_volatility_60d, 20),
    StrategySpec("C3A2_006", "c3a2_006_distance_from_200dma_v1", "Distance From 200D MA",
                 "Long names below the 200-day average; short extended names.", distance_from_200dma, 20),
    StrategySpec("C3A2_007", "c3a2_007_low_intraday_range_volatility_v1", "Low Intraday Range Volatility",
                 "Long names with lower normalized daily high-low range.", low_intraday_range_volatility, 20),
    StrategySpec("C3A2_008", "c3a2_008_slow_momentum_9_1_v1", "Slow Momentum 9-1",
                 "Long stronger 9-1 momentum; short weaker momentum.", slow_momentum_9_1, 20),
    StrategySpec("C3A2_009", "c3a2_009_high_log_dollar_volume_63d_v1", "High Log Dollar Volume 63D",
                 "Long higher trailing dollar volume; short lower-liquidity names.",
                 high_log_dollar_volume_63d, 20),
)

# Pre-registered members that failed the positive-Sharpe gate but remain backtested for reference.
FAILED_PLATFORM_MEMBER_IDS: tuple[str, ...] = ("C3A2_001",)

C3A2_IDS = tuple(spec.strategy_id for spec in C3A2_SPECS)

# Deprecated historical pre-registration list. Runtime Combined Portfolio membership
# is derived only via eligible_composite_constituent_ids() — never this tuple.
DEPRECATED_HISTORICAL_PLATFORM_MEMBER_IDS: tuple[str, ...] = (
    "C2A2_002",
    "C2A2_020",
    "C2B2_004",
    "C3A1_002",
    "C3A1_003",
    "C3A1_006",
    "C3A1_008",
    "C3A1_009",
    "C3A1_011",
    "C3A1_012",
    "C3A1_013",
    "C3A1_017",
    "C3A2_002",
    "C3A2_003",
    "C3A2_004",
    "C3A2_005",
    "C3A2_006",
    "C3A2_007",
    "C3A2_008",
    "C3A2_009",
)

REFERENCE_ONLY_IDS: tuple[str, ...] = tuple(
    strategy_id for strategy_id in C3A1_IDS if strategy_id not in DEPRECATED_HISTORICAL_PLATFORM_MEMBER_IDS
)

# Additional backtested candidates eligible for in-sample composite replacement screening.
REPLACEMENT_CANDIDATE_IDS: tuple[str, ...] = ("C2B2_003", "C2A2_004")

RAPID_ACTIVE_UNDERLYING_IDS = (
    DEPRECATED_HISTORICAL_PLATFORM_MEMBER_IDS + REFERENCE_ONLY_IDS + FAILED_PLATFORM_MEMBER_IDS
)
RAPID_BACKTEST_IDS: tuple[str, ...] = tuple(
    dict.fromkeys(RAPID_ACTIVE_UNDERLYING_IDS + REPLACEMENT_CANDIDATE_IDS)
)

SPEC_BY_ID: dict[str, StrategySpec] = {
    C2A2_002_SPEC.strategy_id: C2A2_002_SPEC,
    C2A2_004_SPEC.strategy_id: C2A2_004_SPEC,
    C2A2_020_SPEC.strategy_id: C2A2_020_SPEC,
    C2B2_004_SPEC.strategy_id: C2B2_004_SPEC,
    C2B2_003_SPEC.strategy_id: C2B2_003_SPEC,
    **{spec.strategy_id: spec for spec in C3A1_SPECS},
    **{spec.strategy_id: spec for spec in C3A2_SPECS},
}

ALL_RAPID_SPECS: tuple[StrategySpec, ...] = tuple(
    SPEC_BY_ID[strategy_id] for strategy_id in RAPID_BACKTEST_IDS if strategy_id in SPEC_BY_ID
)
