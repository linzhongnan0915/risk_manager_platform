# Known Limitations — Factor Card Cleanup (`c04abb4`)

## Artifact coupling

- `c04abb4` includes a regenerated `output/dashboard_artifact.json` built on the **feature-branch** artifact generator and governance baseline (`bac7169` state).
- That artifact uses `allocation_source: governed_baseline_preserved_pre_phase3_main` and Phase 3 governed weights — **not** the current production `main` artifact (`system_generated_research_eligible_equal_weight`).
- Cherry-picking `c04abb4` onto `main` produces a **merge conflict** in `output/dashboard_artifact.json`. The conflict must be resolved by regenerating on `main`, not by taking the feature-branch JSON wholesale.

## Data contract audit

- `audit_dashboard_data_contract.py` reports **98.5%** coverage at `c04abb4`.
- Remaining high-priority gap (pre-existing): Allocation & Rebalance module missing `buy_sell_direction`, `dollar_amount` in contract mapping.

## Proxy model semantics

- Factor cards display **ETF proxy loadings**, not institutional factor sensitivities (Barra/Axioma-style).
- `volatility` and `short_vol` are `not_modeled` when absent from the weighted proxy exposure dict — this is correct for the current portfolio (no allocated vol-proxy sleeves), not missing market vol.

## Browser verification harness

- `factor_before_not_equal_after` API check in `verify_dashboard_browser.py` was relaxed for **zero-turnover** official optimizer snapshots (`turnover == 0`). This matches “no rebalance proposed” artifacts and is not a production runtime change.

## Feature-branch-only behavior (not in `c04abb4` commit, but on branch)

- Commit `bac7169` adds governed / research-sandbox allocation modes, 20-strategy active universe integration, Index Arbitrage archival in research outputs, and governed portfolio baseline files. These are **not** included in the `bac7169..c04abb4` diff but **are** on the pushed branch if reviewers check out `feature/strategy-expansion-v1` tip.

## Render / production

- No Render deploy was performed.
- Pushing the feature branch does not change the public website; only `main` deploy would.
