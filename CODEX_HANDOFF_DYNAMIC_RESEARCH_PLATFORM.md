# Codex Handoff — Dynamic US-Equity Research Platform

## Project

- **Path:** `D:/Global_Ai/risk_manager_platform`
- **Branch:** `feature/worldquant-alpha2`
- **Final commit SHA:** `4c667ee`

## Current architecture

Combined Portfolio (`COMBINED_PORTFOLIO_V1`) is a **research-only** equal-weight composite:

- **Membership source:** `eligible_composite_constituent_ids()` in `src/strategies/composite_membership.py`
- **ACTIVE gate:** `run_valid == true`, `cumulative_net_return > 0`, `net_sharpe > 0`, strategy in `RAPID_BACKTEST_IDS`, excludes Combined Portfolio itself
- **Weighting:** `weight_i = 1 / N` where `N = len(eligible_ids)`
- **Dynamic membership:** enabled — N expands/contracts as eligibility changes
- **Research eligibility field:** `research_composite_eligible` (bundle + catalog)
- **Live allocation approval:** `live_allocation_approved = false` for all research strategies and architecture metadata

### Current counts (verified at handoff)

| Metric | Value |
|---|---|
| Tested candidate strategies | 31 |
| Research-composite eligible (ACTIVE retained) | 13 |
| REFERENCE_ONLY | 18 |
| Combined Portfolio N | 13 |
| Equal weight | 1/13 ≈ 7.6923% |

### Constituent IDs (runtime, not hardcoded)

`C2A2_004`, `C2A2_020`, `C3A1_001`, `C3A1_002`, `C3A1_003`, `C3A1_004`, `C3A1_005`, `C3A1_006`, `C3A1_012`, `C3A1_013`, `C3A1_015`, `C3A2_008`, `C3A2_009`

### Deprecated historical metadata

`DEPRECATED_HISTORICAL_PLATFORM_MEMBER_IDS` in `platform_registry.py` is **not** used for runtime composite membership. Runtime constituents come only from the eligibility gate.

## Modified files (this phase)

### Backend
- `src/strategies/composite_membership.py`
- `src/strategies/rapid_20plus1.py`
- `src/strategies/platform_registry.py`
- `src/reporting/strategy_factory_research_adapter.py`

### Dashboard
- `dashboard/app.js`
- `dashboard/index.html`
- `dashboard/research_universe.js`
- `dashboard/styles.css`
- `dashboard/data/us_equity_research_bundle.json` (**committed for clean checkout**)

### Tests / scripts
- `tests/test_composite_membership.py`
- `tests/test_strategy_factory_research_adapter.py`
- `tests/test_rapid_20plus1.py`
- `scripts/smoke_dashboard_research.py`

## Rebuild commands (no individual strategy backtests)

```powershell
cd D:\Global_Ai\risk_manager_platform
python -c "from pathlib import Path; from src.strategies.rapid_20plus1 import finalize_rapid_artifacts; finalize_rapid_artifacts(Path('.'))"
python scripts/build_us_equity_dashboard_bundle.py
```

Serve dashboard locally:

```powershell
cd dashboard
python -m http.server 8765
```

## Validation

```powershell
python -m pytest tests/test_composite_membership.py tests/test_strategy_factory_research_adapter.py tests/test_rapid_20plus1.py -q
python scripts/smoke_dashboard_research.py
```

**Results at handoff:** 24 passed (pytest); SMOKE PASS (ACTIVE=13, equal_weight=0.0769)

## Generated artifacts (local, not committed)

| Location | Purpose |
|---|---|
| `artifacts/rapid_20plus1/` | Composite leaderboard, correlation matrix, combined portfolio CSV/JSON |
| `output/research/strategy_factory_v1/` | Per-strategy factory backtest outputs |
| `output/research/strategy_21_research_composite_v1/` | Combined portfolio research outputs |
| `output/dashboard_review/` | Screenshot review artifacts |

## UI notes

- Strategies table (`#shadowStrategyTable`) uses viewport-height scrolling via `.strategy-registry-viewport`
- Sticky headers retained; horizontal scroll preserved
- Research vs live allocation shown as separate columns: **Research Composite** / **Live Allocation**

## Known limitations

- Research platform uses survivorship-biased Pilot 500 universe
- Walk-forward windows not available in current baseline
- `composite_eligible` retained as backward-compatible alias of `research_composite_eligible` in bundle payloads
- Legacy platform docs may still mention “20 strategies” at workstation scope — distinct from dynamic Combined Portfolio membership

## Intentionally deferred to Codex

- Allocation risk summary
- Rolling Sharpe allocation table
- Research risk limits
- Risk factors
- Risk contribution
- Command Center data binding
- Correlation page enhancement
- Workflow and Daily Report migration
- Further independent strategy research

## Do not

- Rerun individual strategy backtests unless ACTIVE membership gate inputs change
- Redesign dashboard pages in this phase
- Deploy until explicitly requested
