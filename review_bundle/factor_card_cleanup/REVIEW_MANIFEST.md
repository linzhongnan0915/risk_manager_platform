# Factor Card Cleanup — Independent Review Bundle

## Purpose

This bundle supports review of commit **`c04abb4`** (`fix: finalize proxy factor cards and simulate API not_modeled handling`) without merging or deploying the broader strategy-expansion Phase 1–3 work on `feature/strategy-expansion-v1`.

## Branch & remote

| Item | Value |
|------|-------|
| Branch | `feature/strategy-expansion-v1` |
| Review commit | `c04abb4be22db50cbd192d8393fc04cb1a941402` |
| Parent commit (factor-fix baseline) | `bac7169f315f766c02855570fc005f96d948d6aa` |
| `main` at review time | `85723848ffb4615a2b2021953e52fd83c579780b` |
| Remote | `origin/feature/strategy-expansion-v1` (pushed; SHA matches) |

## Scope of `c04abb4` (this commit only)

11 files, +255 / −36 lines vs parent `bac7169`:

- Dashboard proxy factor card UI (`dashboard/app.js`, `components.js`, `index.html`, `styles.css`)
- Factor limit `not_modeled` handling (`src/risk/limits.py`, `risk_status_summary.py`)
- Simulate API fix for absent proxy loadings (`src/allocation/rebalance_simulation.py`)
- Regression test (`tests/test_risk_limits.py`)
- Browser verification harness tweak (`scripts/verify_dashboard_browser.py`)
- Regenerated `output/dashboard_artifact.json` (feature-branch artifact — **not** safe to copy onto `main` verbatim)
- Contract audit doc refresh (`docs/dashboard_data_contract_audit.md`)

## Out of scope (earlier commit `bac7169`)

Phase 1–3 strategy expansion: new strategy modules, governance baseline, active universe, dual allocation modes, expansion outputs, Phase 3 tests, and most artifact_generator changes. See `dependency_analysis.md`.

## Bundle contents

| File | Description |
|------|-------------|
| `base_sha.txt` | Parent of factor-fix commit (`bac7169`) |
| `final_sha.txt` | Factor-fix commit (`c04abb4`) |
| `changed_files.txt` | Paths changed in `bac7169..c04abb4` |
| `git_diff.patch` | Unified diff `bac7169..c04abb4` |
| `test_results.txt` | Verification commands run on feature branch at `c04abb4` |
| `data_validation.json` | Artifact factor-check comparison: `main` vs `c04abb4` |
| `known_limitations.md` | Residual gaps and review caveats |
| `dependency_analysis.md` | Cherry-pick feasibility and safe deploy path |

## Reviewer checklist

1. Read `dependency_analysis.md` before cherry-picking onto `main`.
2. Apply `git_diff.patch` code paths only; **do not** copy `output/dashboard_artifact.json` from the feature branch onto `main`.
3. Regenerate `output/dashboard_artifact.json` on `main` after applying code changes.
4. Confirm volatility / short_vol checks show `current_value: null`, `status: not_modeled`.
5. Confirm `/api/simulate` returns 200 for sandbox-style weight edits (no console 500).
6. Run commands listed in `test_results.txt`.

## Explicit non-actions

- **Do not merge** to `main` as part of this review bundle.
- **Do not deploy** Render from this bundle without a separate, scoped release decision.
