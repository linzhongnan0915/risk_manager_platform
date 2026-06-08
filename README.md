# Risk Manager Platform

## Start Here

- Current MVP state: `docs/PROJECT_STATE.md`
- Weekend learning guide: `docs/WEEKEND_LEARNING_GUIDE.md`
- Next actions: `docs/NEXT_ACTIONS.md`
- Requirements traceability: `docs/REQUIREMENTS_TRACEABILITY.md`
- Dashboard artifact: `output/dashboard_artifact.json`

Run the workstation (recommended: API-backed simulation server):

```powershell
python scripts/run_workstation_server.py
```

Then open `http://127.0.0.1:8765/dashboard/index.html`.

Static-only fallback:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

## Primary Workflow

The project-wide institutional workflow is documented and rendered here:

- `docs/workflows/risk_manager_platform_workflow.md`
- `output/workflows/risk_manager_platform_workflow.html`
- `output/workflows/risk_manager_platform_workflow.png`

The workflow separates Portfolio Management proposals, independent risk review, human decision authority, execution, and expectation-versus-realized monitoring.

Created: 2026-06-05

## Mission

Build a multi-strategy portfolio risk management platform for a hedge fund / asset manager workflow.

The platform starts from June 4, 2026 with USD 1,000,000 initial capital. It monitors 20 strategies today and is designed to scale to 30-40 strategies. It calculates strategy-level and portfolio-level risk/performance and helps the risk manager decide allocation changes.

This is not a single-strategy dashboard and not a trader tick-by-tick terminal. It is a risk manager workstation for strategy monitoring, portfolio allocation, factor risk, backtesting, and decision logging.

## What Is Real Today

### Implemented and verified

- 20-strategy registry with hypothesis, universe, signal, failure modes, and evidence metadata.
- 10 allocated strategies and 10 research-only strategies at zero live weight.
- Long-history ETF-proxy backtests from yfinance (`output/literature_strategy_backtests.json`).
- Walk-forward out-of-sample evidence, transaction costs (5 bps buy / 5 bps sell), and strategy risk packets.
- Portfolio risk, factor limits, correlation diagnostics, conservative optimizer proposal, and double-check governance.
- Nine-tab institutional dashboard driven by `output/dashboard_artifact.json`.
- Tested Python rebalance simulation (`src/allocation/rebalance_simulation.py`) embedded in the artifact and exposed through `POST /api/simulate` when using `scripts/run_workstation_server.py`.

### Provisional / proxy research (not live fund data)

- Strategy returns are literature-derived ETF-proxy backtests, not boss live strategy feeds.
- Factor exposures use a transparent proxy model, not licensed Barra.
- Risk limits in `data/config/risk_limits.yaml` are provisional research thresholds pending PM / risk approval.
- News and some market context may still use sample snapshots when boss APIs are unavailable.

## Non-Negotiable Standards

- No look-ahead bias in backtests.
- No automatic execution of allocation changes.
- Human approval and audit trail required for every decision.
- Research-quality failures are not live breaches.
- Historical max drawdown is evidence; current live limits use current drawdown and configured thresholds.
- Optimizer balances diversification, correlation, drawdown, turnover, cost, factor concentration, and limits. It does not blindly maximize Sharpe.

## Generate Dashboard Artifact

```powershell
python scripts/generate_dashboard_artifact.py
```

Output:

```text
output/dashboard_artifact.json
```

## API-Ready Refresh Workflow

```powershell
python scripts/refresh_platform.py
```

This runs yfinance pull, hedge fund replication clone, literature-derived strategy prototype backtests, and dashboard artifact generation.

Writes:

```text
data/raw/yfinance_price_history.csv
data/processed/market_price_history.csv
output/market_snapshot.json
output/dashboard_artifact.json
output/literature_strategy_backtests.json
```

Recommendations are monitoring outputs only. Any real allocation change still requires human approval.

## Open Dashboard

The dashboard is a static HTML/CSS/JS shell that reads `output/dashboard_artifact.json`.

Use the workstation server so custom weight edits can call the tested Python simulation API:

```powershell
python scripts/run_workstation_server.py
```

Opening `dashboard/index.html` through `file://` may block JSON loading in some browsers.

## Run Tests And Validation

```powershell
python -m pytest -q
python scripts/validate_framework.py
python scripts/audit_dashboard_data_contract.py
python scripts/generate_dashboard_artifact.py
python scripts/verify_dashboard_browser.py
```

## Pending Boss / Production Inputs

- Live strategy return feeds and position-level reconciliation.
- Boss API market/news ingestion with lineage and timestamp controls.
- Calibrated production risk limits and mandate-specific factor model.
- Named users, role-based approval, and persistent server-side audit storage.
