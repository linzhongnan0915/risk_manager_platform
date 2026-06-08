# Strategy Expansion Phase 2 — Final Review

## Canonical Specifications (Non-Retired Expansion Candidates)

| Strategy | Canonical Spec | Gross Sharpe | Net Sharpe | Ann Return | Max DD | Turnover | Cost Drag | Avg OOS Sharpe | +OOS Windows | Max |Corr| | Decision |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| EXP_EQUITY_BOND_CORR_REGIME | 21d / 5bp | 0.66 | 0.65 | 3.33% | -21.07% | 1.7 | 0.09% | 0.76 | 57% | 0.63 | Promote to governed candidate (replace Index Arbitrage) |
| EXP_VOL_TARGET_EQUITY_TREND | 10d / 5bp | 0.71 | 0.67 | 6.50% | -29.43% | 8.2 | 0.41% | 0.65 | 68% | 0.84 | Research Hold (duplicate exposure) |
| EXP_REAL_ASSET_INFLATION | 21d / 5bp | 0.42 | 0.40 | 3.74% | -44.32% | 3.4 | 0.17% | 0.19 | 37% | 0.78 | Research Hold (duplicate exposure) |

## Retired Expansion Diagnoses

- **EXP_SECTOR_MOMENTUM_ROTATION** — primary: `transaction_cost_failure`; causes: excessive_turnover, drawdown_failure, duplicate_exposure
- **EXP_SECTOR_NEUTRAL_RESIDUAL_MOM** — primary: `transaction_cost_failure`; causes: transaction_cost_failure, excessive_turnover, drawdown_failure, weak_oos_evidence
- **EXP_QUALITY_VALUE_COMPOSITE** — primary: `transaction_cost_failure`; causes: excessive_turnover, drawdown_failure, duplicate_exposure
- **EXP_SIZE_REGIME** — primary: `drawdown_failure`; causes: drawdown_failure, duplicate_exposure
- **EXP_US_INTL_RELATIVE_STRENGTH** — primary: `drawdown_failure`; causes: drawdown_failure, duplicate_exposure
- **EXP_CREDIT_QUALITY_ROTATION** — primary: `transaction_cost_failure`; causes: excessive_turnover, weak_oos_evidence, duplicate_exposure
- **EXP_CROSS_ASSET_REVERSAL** — primary: `transaction_cost_failure`; causes: transaction_cost_failure, excessive_turnover, drawdown_failure, weak_oos_evidence

## Lower-Frequency Retests (21-day, gross-positive / cost-driven only)

- **EXP_SECTOR_MOMENTUM_ROTATION**: net Sharpe 0.51, turnover 7.1, verdict `research_hold_only`
- **EXP_SECTOR_NEUTRAL_RESIDUAL_MOM**: net Sharpe 0.27, turnover 7.6, verdict `research_hold_only`
- **EXP_QUALITY_VALUE_COMPOSITE**: net Sharpe 0.50, turnover 3.7, verdict `research_hold_only`

## Proposed 20-Strategy Membership

- **Research sandbox (20):** PROTO_WQ_ALPHA_ETF, PROTO_HF_REPLICATION, PROTO_BUSINESS_CYCLE, PROTO_MARKOV_DEFENSIVE, PROTO_MANAGED_FUTURES, CAND_EQUITY_MARKET_NEUTRAL, CAND_CREDIT_CARRY_STRESS_GATE, CAND_RATES_DURATION_REGIME, CAND_TREASURY_CURVE_RV, CAND_VOL_CARRY_CRASH_FILTER, CAND_TAIL_HEDGE_CRISIS, CAND_MERGER_ARB_PROXY, CAND_CONVERTIBLE_ARB_PROXY, CAND_COMMODITY_INFLATION_SHOCK, CAND_USD_MACRO_PRESSURE, CAND_EM_MACRO_RISK, CAND_RISK_PARITY_OVERLAY, CAND_GLOBAL_VALUE_ROTATION, CAND_EVENT_DRIVEN_SECTOR_PROXY, EXP_EQUITY_BOND_CORR_REGIME
- **Governed allocation (20):** PROTO_WQ_ALPHA_ETF, PROTO_HF_REPLICATION, PROTO_BUSINESS_CYCLE, PROTO_MARKOV_DEFENSIVE, PROTO_MANAGED_FUTURES, CAND_EQUITY_MARKET_NEUTRAL, CAND_CREDIT_CARRY_STRESS_GATE, CAND_RATES_DURATION_REGIME, CAND_TREASURY_CURVE_RV, CAND_VOL_CARRY_CRASH_FILTER, CAND_TAIL_HEDGE_CRISIS, CAND_MERGER_ARB_PROXY, CAND_CONVERTIBLE_ARB_PROXY, CAND_COMMODITY_INFLATION_SHOCK, CAND_USD_MACRO_PRESSURE, CAND_EM_MACRO_RISK, CAND_RISK_PARITY_OVERLAY, CAND_GLOBAL_VALUE_ROTATION, CAND_EVENT_DRIVEN_SECTOR_PROXY, EXP_EQUITY_BOND_CORR_REGIME
- **Index Arbitrage replacement accepted:** True

Phase 2 does not update dashboard weights, eligibility flags, or Render deployment.