# Dependency Analysis — `c04abb4` vs Strategy Expansion Phase 1–3

## Executive summary

**`c04abb4` is logically separable from Phase 1–3 as a single commit**, but it is **not cleanly cherry-pickable onto current `main` without manual steps** because it bundles a feature-branch artifact JSON that conflicts with `main`. The **code changes** in `c04abb4` (11 files) are largely self-contained and do **not** import Phase 3 modules (`active_universe`, `strategy_expansion_*`, governance records).

---

## 1. Can `c04abb4` be cherry-picked onto current `main`?

| Aspect | Result |
|--------|--------|
| Cherry-pick dry-run | **Fails with conflict** in `output/dashboard_artifact.json` only |
| Other files in commit | Auto-merge cleanly onto `main` (dashboard JS/CSS, Python limits/simulate, tests, verify script) |
| Code compiles standalone? | **Yes** — `_factor_not_modeled`, UI helpers, and simulate fix are fully contained in `c04abb4` |
| Artifact in commit | **No** — must regenerate on `main`; do not resolve conflict by accepting feature-branch artifact |

**Verdict:** Cherry-pick is **possible but not clean** — treat as **code cherry-pick + artifact regeneration**, not a one-click apply.

---

## 2. Which earlier feature-branch commits does it depend on?

| Commit | SHA | Relationship to `c04abb4` |
|--------|-----|---------------------------|
| `main` | `8572384` | Direct merge-base; cherry-pick target |
| `bac7169` | `bac7169` | **Immediate parent** — Phase 1–3 research-only commit |
| Phase 1–3 content | in `bac7169` | **Not required** for `c04abb4` code to run on `main` |

### Runtime dependencies inside `c04abb4` code

- **`src/risk/limits.py`**: Adds `_factor_not_modeled`, `evaluate_factor_limits` absent-key branch, `worst_status` skip — no imports from expansion modules.
- **`src/allocation/rebalance_simulation.py`**: Guards governance check text when `current_value is None` — no expansion imports.
- **`dashboard/*`**: Factor card rendering only; `c04abb4` diff vs `bac7169` does **not** add governance/sandbox session code (that lives in `bac7169`, not in this commit).
- **`tests/test_risk_limits.py`**: New test for absent proxy loadings — standalone.

### What `c04abb4` does **not** depend on (from `bac7169`)

- `src/strategies/active_universe.py`
- `src/strategies/strategy_expansion_v1.py` / `phase2.py`
- `data/config/governed_portfolio_baseline.json`
- `data/config/strategy_governance_records.json`
- Phase 3 dashboard allocation mode selector / sandbox isolation
- `artifact_generator.py` Phase 3 active-universe integration

---

## 3. Would cherry-picking `c04abb4` alone change…?

| Concern | If cherry-pick **code only** + regenerate artifact on `main` | If entire commit applied including feature artifact |
|---------|--------------------------------------------------------------|-----------------------------------------------------|
| Strategy membership | **No change** — `main` generator unchanged | **Would change** — 20-strategy governed universe, Index Arbitrage excluded from active tabs |
| Portfolio weights | **No change** — `main` weights preserved | **Would change** — governed baseline weights from Phase 3 |
| Allocation modes (Governed / Sandbox) | **No change** — not in `c04abb4` diff vs `main` for app.js | **No** from `c04abb4` alone; **Yes** if whole branch merged (`bac7169`) |
| Dashboard artifact strategy universe | **No change** after regen on `main` | **Yes** — Phase 3 artifact |
| Render behavior | **No change** until deploy | **No change** until deploy; deploy from wrong artifact would change site |

**Important:** Checking out `feature/strategy-expansion-v1` tip includes **`bac7169` + `c04abb4`**. Reviewers must not confuse branch tip with isolated `c04abb4`.

---

## 4. Safest method to deploy only factor-card + simulate-API fixes

### Recommended: scoped PR from `main` (not full feature branch)

1. Branch from **`main`** (`8572384`): e.g. `fix/proxy-factor-cards-v1`.
2. Cherry-pick **`c04abb4`** with conflict resolution:
   ```bash
   git checkout main
   git checkout -b fix/proxy-factor-cards-v1
   git cherry-pick c04abb4
   # Resolve output/dashboard_artifact.json by discarding cherry-pick version
   git checkout --ours output/dashboard_artifact.json   # keep main version temporarily
   ```
3. Apply **code-only** files from cherry-pick (all except artifact, or regenerate):
   ```bash
   python -c "from pathlib import Path; from src.reporting.artifact_generator import generate_dashboard_artifact; generate_dashboard_artifact(Path('data/config/strategy_registry.json'), Path('output/dashboard_artifact.json'))"
   ```
4. Verify artifact factor checks:
   - `volatility`: `current_value: null`, `status: not_modeled`
   - `short_vol`: same
   - `allocation_source`: remains `main` value (not governed Phase 3 string)
   - strategy count / weights unchanged from pre-fix `main`
5. Run full verification suite (see `test_results.txt`).
6. Merge **`fix/proxy-factor-cards-v1` → `main`** only after review.
7. Deploy Render **only** from merged `main` — single-purpose release notes.

### Alternative: manual patch

Apply `review_bundle/factor_card_cleanup/git_diff.patch` excluding `output/dashboard_artifact.json`, then regenerate artifact on `main`. Equivalent to cherry-pick with explicit file control.

### Do **not** do

- Merge `feature/strategy-expansion-v1` into `main` to “get the factor fix.”
- Copy `output/dashboard_artifact.json` from `c04abb4` onto `main`.
- Deploy from the feature branch.

---

## Cherry-pick evidence (2026-06-08)

```
git worktree add ... main
git cherry-pick --no-commit c04abb4
→ Auto-merging dashboard/app.js, components.js, index.html, ...
→ CONFLICT (content): output/dashboard_artifact.json
```

This confirms separation: **code merges; artifact does not.**
