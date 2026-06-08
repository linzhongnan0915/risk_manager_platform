# Strategy Expansion V1 Review

- As of: 2026-06-08
- Cost assumption: 5 bps buy and 5 bps sell; turnover-based daily rebalance cost
- Walk-forward: 504 train / 126 OOS
- Allocation policy: Expansion candidates are research-only; auto_eligible=False and excluded from dashboard weights in this phase.

| Rank | Strategy | Decision | Net Sharpe | Ann Return | Max DD | Turnover | Cost Drag | Avg OOS Sharpe | +OOS Windows | Reason |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Equity-Bond Correlation Regime | Keep | 0.70 | 3.58% | -17.13% | 4.2 | 0.21% | 0.80 | 53% | Net Sharpe, OOS stability, drawdown, and turnover pass expansion review gates. |
| 2 | Volatility-Targeted Equity Trend | Research Hold | 0.63 | 5.85% | -31.66% | 22.0 | 1.10% | 0.53 | 61% | High overlap with existing sleeve (max |corr| 0.84). |
| 3 | Real-Asset Inflation Rotation | Research Hold | 0.43 | 3.88% | -38.96% | 15.1 | 0.76% | 0.20 | 38% | High overlap with existing sleeve (max |corr| 0.80). |
| 4 | Quality-Value Composite Rotation | Retire | 0.46 | 7.23% | -61.32% | 31.6 | 1.58% | 0.92 | 76% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 5 | Small-Cap vs Large-Cap Regime | Retire | 0.41 | 4.74% | -47.73% | 19.1 | 0.96% | 0.75 | 69% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 6 | US-International Relative Strength | Retire | 0.35 | 3.35% | -49.32% | 11.7 | 0.59% | 0.63 | 51% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 7 | Sector Momentum Rotation | Retire | 0.34 | 4.63% | -53.12% | 39.2 | 1.96% | 0.64 | 65% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 8 | Credit Quality Rotation | Retire | 0.19 | 0.59% | -21.30% | 24.9 | 1.24% | -0.56 | 43% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 9 | Sector-Neutral Residual Momentum | Retire | -0.09 | -1.45% | -55.04% | 41.3 | 2.06% | -0.00 | 56% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 10 | Cross-Asset Short-Term Reversal | Retire | -0.50 | -3.57% | -64.65% | 91.1 | 4.55% | -0.69 | 32% | Fails core research-quality thresholds on Sharpe, drawdown, turnover, or average OOS Sharpe. |
| 11 | Index Arbitrage Proxy | Retire | -7.95 | -9.92% | -93.37% | 294.0 | 14.70% | -15.28 | 4% | Archived Index Arbitrage Proxy; historical evidence preserved, not eligible for allocation. |

## Notes

- Expansion candidates remain research-only (`auto_eligible=False`).
- Index Arbitrage Proxy is archived; historical evidence is retained separately.
