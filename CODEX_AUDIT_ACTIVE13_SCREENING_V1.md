# Active 13 Strategy Screening Audit V1

Audit date: 2026-06-12

Accepted baseline: implementation `4c667ee`; handoff `a8941b2`

Audit branch/worktree: `audit/active13-screening-v1` / `D:\Global_Ai\risk_manager_platform_active13_audit`

## 1. Executive Summary

This is a read-only audit of the 13 strategies marked `ACTIVE` in the committed US-equity research bundle. It is not an investment approval, does not change ACTIVE membership, and does not change Combined Portfolio membership.

- Committed bundle state: 31 candidates, 13 ACTIVE, 18 REFERENCE_ONLY, one Combined Portfolio, and equal research weight `1/13 = 0.0769230769`.
- Preliminary non-binding Sharpe screen: **1 KEEP_CANDIDATE, 8 REVIEW, 4 REJECT_CANDIDATE**.
- Net Sharpe below 0.20: `C2A2_020`, `C3A1_006`, `C3A1_012`, and `C3A2_009`.
- All 13 have 2,120 finite daily net returns aligned to the bundle's 2,120 unique shared dates from 2018-01-02 through 2026-06-09.
- All 13 have current holdings snapshots, but only the top 12 long and top 12 short holdings are exported. Historical ticker-level weights/holdings are `NOT AVAILABLE`.
- All 13 are `PARTIALLY_READY` for a future simulated Trade Log. None is `TRADE_LOG_READY`.
- The focused Dashboard smoke passed. The requested focused pytest set could not collect from the clean accepted baseline because a module imported by `platform_registry.py` is absent from commit `a8941b2`.
- All research remains simulated and research-only. Live allocation is not approved, live capital deployed is 0%, and execution is disabled.

## 2. Files And Artifacts Inspected

Inspected only the requested or directly relevant committed evidence:

- `CODEX_HANDOFF_DYNAMIC_RESEARCH_PLATFORM.md`
- `dashboard/data/us_equity_research_bundle.json`
- `src/strategies/composite_membership.py`
- `src/strategies/platform_registry.py`
- `src/strategies/rapid_20plus1.py` limited to membership, correlation, composite, and current-holdings export definitions
- `src/reporting/strategy_factory_research_adapter.py` limited to bundle fields and artifact sourcing
- `src/strategies/strategy_factory.py` limited to execution, run validity, metrics, and exported artifact definitions
- `src/strategies/worldquant/portfolio_returns.py` limited to execution, turnover, and transaction-cost definitions
- `tests/test_composite_membership.py`
- `tests/test_strategy_factory_research_adapter.py`
- `tests/test_rapid_20plus1.py`
- `scripts/smoke_dashboard_research.py`

Directly referenced local research artifacts such as `output/research/strategy_factory_v1/`, `output/research/strategy_21_research_composite_v1/`, and `artifacts/rapid_20plus1/` are not committed in the clean accepted-baseline worktree and therefore are `NOT AVAILABLE` for this audit.

## 3. Focused Tests And Results

| Check | Exact result |
|---|---|
| Committed-bundle integrity check | `BUNDLE AUDIT PASS: ACTIVE=13 REFERENCE_ONLY=18 COMPOSITE_N=13 SELF_EXCLUDED=true EQUAL_WEIGHT=0.076923076923077 ACTIVE_SERIES_FINITE_ALIGNED=13/13 LIVE_ALLOCATION=false` |
| Dashboard/research smoke | `SMOKE PASS` and `ACTIVE=13 REFERENCE=18 COMPOSITE=1 equal_weight=0.0769` |
| `python -m pytest tests/test_composite_membership.py tests/test_strategy_factory_research_adapter.py tests/test_rapid_20plus1.py -q` | Failed during collection: 3 errors, 0 tests run. All three errors are `ModuleNotFoundError: No module named 'src.strategies.downside_beta_defensive'`, imported by committed `src/strategies/platform_registry.py`. |

The pytest collection failure is a committed-baseline reproducibility blocker. The missing module exists only as an unrelated uncommitted file in the original dirty working tree and was not copied, staged, or used.

## 4. Audit Table For All 13 ACTIVE Strategies

Common confirmed assumptions for every row:

- Asset class/universe type: US individual equities, Pilot 500 survivorship-biased/current-listed research universe.
- Execution convention: `NEXT_OPEN_TO_OPEN`; signals use information through the prior close and positions earn open-to-open returns.
- Transaction cost: 5 bps buy / 5 bps sell applied to turnover; symmetric implementation charges `turnover * 5 bps`.
- Turnover unit: **CONFIRMED** as daily sum of absolute changes in executed portfolio weights, `sum(abs(weight_t - weight_t-1))`; annualized turnover is average daily turnover multiplied by 252. A value of `1.0` means absolute weight changes totaling 100% of portfolio notional.
- `run_valid`: Direct per-strategy field is `NOT AVAILABLE` in the committed bundle. `TRUE (IMPLIED BY ACTIVE ELIGIBILITY GATE)` is shown because ACTIVE eligibility requires `run_valid == true`, positive cumulative net return, and positive net Sharpe. It cannot be independently reproduced without the uncommitted summary/missing-execution artifacts.
- Cost drag below is total summed transaction-cost return and annualized transaction-cost return. Percentages are return units, not dollars.

| ID | Strategy / signal family and economic hypothesis | Universe | Run valid | Cum. net return | Net Sharpe | Max drawdown | Avg daily / annualized turnover | Total / annualized cost drag | Preliminary recommendation |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| C2A2_020 | Cross-Sectional Liquidity Resilience; lower price impact during market/volume stress may earn a resilience premium | Pilot 500 common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 9.833% | 0.150 | -33.499% | 6.197% / 15.616x | 6.568% / 0.781% | REJECT_CANDIDATE |
| C3A1_002 | Relative Strength 12-1; long high and short low 12-1 momentum | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 33.547% | 0.345 | -24.867% | 2.628% / 6.623x | 2.786% / 0.331% | REVIEW |
| C3A1_003 | Relative Strength 6-1; long high and short low 6-1 momentum | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 24.014% | 0.271 | -22.195% | 3.628% / 9.142x | 3.845% / 0.457% | REVIEW |
| C3A1_006 | Breakout Persistence; long names near 252-day highs and short names far below highs | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 13.429% | 0.177 | -40.386% | 3.212% / 8.095x | 3.405% / 0.405% | REJECT_CANDIDATE |
| C3A1_012 | Stable Dollar Volume; long stable and short unstable trailing liquidity | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 9.155% | 0.157 | -27.637% | 3.710% / 9.349x | 3.932% / 0.467% | REJECT_CANDIDATE |
| C3A1_013 | Low Amihud Illiquidity; long lower and short higher illiquidity | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 28.540% | 0.358 | -27.957% | 1.713% / 4.317x | 1.816% / 0.216% | REVIEW |
| C3A2_008 | Slow Momentum 9-1; long stronger and short weaker 9-1 momentum | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 41.371% | 0.398 | -22.354% | 2.920% / 7.360x | 3.096% / 0.368% | REVIEW |
| C3A2_009 | High Log Dollar Volume 63D; long higher dollar volume and short lower-liquidity names | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 5.062% | 0.118 | -24.013% | 1.721% / 4.338x | 1.825% / 0.217% | REJECT_CANDIDATE |
| C3A1_001 | Residual Momentum 12-1; long persistent SPY-adjusted residual momentum | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 44.238% | 0.438 | -20.136% | 2.185% / 5.507x | 2.316% / 0.275% | KEEP_CANDIDATE |
| C3A1_004 | Volatility-Adjusted Momentum; long high 12-1 momentum scaled by realized volatility | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 15.996% | 0.219 | -20.066% | 2.726% / 6.868x | 2.889% / 0.343% | REVIEW |
| C3A1_005 | Trend Quality; long smooth positive log-price trends adjusted by residual volatility | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 25.521% | 0.291 | -18.782% | 3.440% / 8.669x | 3.646% / 0.433% | REVIEW |
| C3A1_015 | Price Efficiency; long efficient positive paths and short inefficient/negative trends | Pilot 500 US common stocks | TRUE (IMPLIED); direct field NOT AVAILABLE | 25.288% | 0.290 | -17.314% | 3.433% / 8.650x | 3.639% / 0.433% | REVIEW |
| C2A2_004 | Equity Overnight-Gap Reversal With Liquidity Controls; temporary attention/liquidity gaps may reverse | Pilot 500 liquid common stocks with valid entry prices | TRUE (IMPLIED); direct field NOT AVAILABLE | 38.218% | 0.390 | -17.473% | 59.174% / 149.119x | 62.725% / 7.456% | REVIEW |

### Availability And Warnings

| ID | Current holdings | Daily net-return series | Historical ticker weights/holdings | Obvious warnings |
|---|---|---|---|---|
| C2A2_020 | AVAILABLE: 2026-06-10; top 12 long + top 12 short only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Sharpe <0.20; cost is 27.18% of summed gross return; holdings date is after last return date; direct run-valid/missing-execution evidence unavailable |
| C3A1_002 | AVAILABLE: 2026-05-29; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Strong momentum overlap; max absolute correlation 0.905 with C3A1_004; direct run-valid/missing-execution evidence unavailable |
| C3A1_003 | AVAILABLE: 2026-05-20; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Momentum overlap; max absolute correlation 0.822 with C3A1_015; direct run-valid/missing-execution evidence unavailable |
| C3A1_006 | AVAILABLE: 2026-05-29; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Sharpe <0.20; largest drawdown among ACTIVE at -40.386%; trend/momentum overlap; direct run-valid/missing-execution evidence unavailable |
| C3A1_012 | AVAILABLE: 2026-05-15; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Sharpe <0.20; cost is 23.75% of summed gross return; liquidity-family overlap; direct run-valid/missing-execution evidence unavailable |
| C3A1_013 | AVAILABLE: 2026-05-18; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Liquidity-family overlap; max absolute correlation 0.792 with a reference strategy; direct run-valid/missing-execution evidence unavailable |
| C3A2_008 | AVAILABLE: 2026-05-26; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Sharpe 0.398 is just below KEEP threshold; momentum overlap; correlation 0.865 with C3A1_002; direct run-valid/missing-execution evidence unavailable |
| C3A2_009 | AVAILABLE: 2026-05-15; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Sharpe 0.118; cost is 20.50% of summed gross return; liquidity-family overlap; direct run-valid/missing-execution evidence unavailable |
| C3A1_001 | AVAILABLE: 2026-05-18; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Momentum overlap despite the strongest ACTIVE Sharpe; direct run-valid/missing-execution evidence unavailable |
| C3A1_004 | AVAILABLE: 2026-05-29; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Sharpe only 0.219; strong momentum overlap; correlation 0.905 with C3A1_002; direct run-valid/missing-execution evidence unavailable |
| C3A1_005 | AVAILABLE: 2026-05-21; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Near-duplicate evidence with C3A1_015: correlation 0.961; direct run-valid/missing-execution evidence unavailable |
| C3A1_015 | AVAILABLE: 2026-05-21; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Near-duplicate evidence with C3A1_005: correlation 0.961; direct run-valid/missing-execution evidence unavailable |
| C2A2_004 | AVAILABLE: 2026-06-10; top 12 + top 12 only | AVAILABLE: 2,120 finite aligned values | NOT AVAILABLE | Extreme 149.119x annualized turnover; cost is 62.28% of summed gross return; holdings date is after last return date; execution-price evidence unavailable |

No NaN or shared-date alignment failure was found in the committed ACTIVE daily net-return arrays. The arrays are rounded in the bundle, causing immaterial differences of a few millionths between summed gross-minus-net values and exported total cost drag.

## 5. Preliminary Recommendation Summary

These recommendations apply only the requested net-Sharpe sorting aid and are non-binding:

| Recommendation | Count | Strategies |
|---|---:|---|
| KEEP_CANDIDATE | 1 | C3A1_001 |
| REVIEW | 8 | C3A1_002, C3A1_003, C3A1_004, C3A1_005, C3A1_013, C3A1_015, C3A2_008, C2A2_004 |
| REJECT_CANDIDATE | 4 | C2A2_020, C3A1_006, C3A1_012, C3A2_009 |

Sharpe alone is not a final rejection rule. No membership changes are recommended or made by this screen.

## 6. Strategies With Net Sharpe Below 0.20

| ID | Net Sharpe | Screening observation | Existing diversification evidence |
|---|---:|---|---|
| C3A2_009 | 0.118 | Near 0.1; low return after costs | Meaningful exception: lowest ACTIVE average absolute correlation at 0.239; pairwise correlation evidence exists, but no marginal composite-contribution test is available |
| C2A2_020 | 0.150 | Cost materially weakens gross edge; high overlap with several liquidity/defensive signals | No clear exception: ACTIVE average absolute correlation is 0.563 |
| C3A1_012 | 0.157 | Cost materially weakens gross edge; liquidity-family overlap | Possible diversification value versus momentum signals, but no marginal composite-contribution test is available |
| C3A1_006 | 0.177 | Largest ACTIVE drawdown and substantial trend-family overlap | No clear exception: ACTIVE average absolute correlation is 0.592 |

## 7. Obvious Signal-Family Duplication Or Overlap

The committed correlation matrix confirms that diversification has been tested at the daily strategy-return level. Marginal contribution to Combined Portfolio Sharpe/drawdown has **NOT YET TESTED** in the accepted evidence.

- **Momentum/trend cluster:** `C3A1_001`, `C3A1_002`, `C3A1_003`, `C3A1_004`, `C3A1_005`, `C3A1_006`, `C3A1_015`, and `C3A2_008`. The clearest duplication flags are `C3A1_005` / `C3A1_015` at 0.961 correlation, `C3A1_002` / `C3A1_004` at 0.905, and `C3A1_002` / `C3A2_008` at 0.865.
- **Liquidity/resilience cluster:** `C2A2_020`, `C3A1_012`, `C3A1_013`, and `C3A2_009`. Notable correlations include `C2A2_020` / `C3A1_013` at 0.762, `C2A2_020` / `C3A1_012` at 0.721, `C3A1_012` / `C3A1_013` at 0.731, and `C3A1_013` / `C3A2_009` at 0.672.
- **Distinct reversal profile:** `C2A2_004` is economically distinct and has low or negative correlations with many ACTIVE signals. That is a diversification exception, but its 149.119x annualized turnover and 62.28% cost/gross-sum ratio require review.

## 8. Trade Log Readiness

Every future trade record remains `SIMULATED`, `RESEARCH ONLY`, with no actual live fill, no broker connection, and execution disabled.

The committed bundle provides current ticker, current target weight, side, a current-holdings date, strategy ID, and the 5 bps buy / 5 bps sell assumption. It does not provide a full historical sequence of target weights or executions.

| Strategy | Classification | Ticker | Signal date | Rebalance date | Execution date | Previous target weight | New target weight | Delta weight | Side | Simulated execution price | Cost rate | Ticker turnover/cost | Run ID/version |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C2A2_020 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | NOT AVAILABLE |
| C3A1_002 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_003 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_006 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_012 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_013 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A2_008 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A2_009 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_001 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_004 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_005 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C3A1_015 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | Strategy-family version only; run ID NOT AVAILABLE |
| C2A2_004 | PARTIALLY_READY | Current snapshot only | NOT AVAILABLE | Current snapshot date only | NOT AVAILABLE | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | Current snapshot only | NOT AVAILABLE | AVAILABLE: 5/5 bps | NOT AVAILABLE | NOT AVAILABLE |

Trade Log readiness summary: `TRADE_LOG_READY=0`, `PARTIALLY_READY=13`, `NOT_READY=0`.

## 9. Evidence Limitations

- The clean accepted baseline is not self-contained for the focused Python tests: `src/strategies/downside_beta_defensive.py` is imported but not committed.
- Direct per-strategy `summary.json`, `daily_returns.csv`, `positions_summary.csv`, `rebalance_audit.csv`, `missing_execution_returns.csv`, and screening reports are `NOT AVAILABLE` in the clean accepted-baseline worktree.
- Direct `run_valid` values and missing-execution-return counts are not present in the committed bundle. ACTIVE membership implies validity but does not replace the missing audit records.
- Current holdings are truncated to the top 12 long and top 12 short positions by the adapter/export path; they are not complete portfolio holdings.
- Historical ticker-level target/executed weights, execution prices, ticker-level turnover, and ticker-level costs are `NOT AVAILABLE`.
- `C2A2_020` and `C2A2_004` current-holdings dates are 2026-06-10, one day after the return series ends on 2026-06-09. The bundle does not explain or reconcile this date difference.
- The Pilot 500 is survivorship biased/current listed, lacks full point-in-time membership, uses yfinance OHLCV/hypothetical backfill, lacks a complete borrow-cost/market-impact model, lacks formal factor neutralization, and lacks full walk-forward validation.
- The correlation matrix supports overlap/diversification observations, but marginal strategy contribution, regime robustness, and replacement impact are `NOT YET TESTED`.

## 10. Smallest Recommended Next Step

Without changing membership or rerunning all candidate backtests, make the accepted baseline reproducible by committing the missing imported strategy module(s) and the already-accepted per-strategy audit artifacts needed for read-only verification, especially `summary.json`, `rebalance_audit.csv`, and `missing_execution_returns.csv`. Then rerun only the same focused tests and audit the four sub-0.20 Sharpe strategies plus the highest-overlap pairs.

Do not build the Trade Log until historical target/executed weights, previous/new/delta weights, execution dates/prices, ticker-level costs, and run/version identifiers are available.

## 11. Explicit Change Confirmation

- No strategy logic was changed.
- No strategy membership was changed.
- No Combined Portfolio membership or logic was changed.
- No Dashboard page, universe definition, or backtest assumption was changed.
- No full 31-strategy backtest rerun occurred.
- No Trade Log was implemented.
- No live allocation was enabled; `live_allocation_approved` remains false, live capital deployed remains 0%, and execution remains disabled.
