"""Strategy expansion phase 2: reproducibility, robustness, and universe proposals."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.risk.performance import sharpe_ratio
from src.strategies.literature_backtests import (
    BUY_BPS,
    SELL_BPS,
    TRADING_DAYS,
    StrategyPrototype,
    load_price_returns,
)
from src.strategies.literature_backtests import _active_strategy_index, _rebalance_only, _summary_metrics
from src.strategies.strategy_expansion_v1 import (
    NON_RETIRED_EXPANSION_IDS,
    RETIRED_EXPANSION_IDS,
    baseline_net_series_from_payload,
    correlation_against_baseline,
    ensure_literature_baseline,
    expansion_strategy_prototypes,
    run_strategy_expansion_v1,
)

CURRENT_DASHBOARD_STRATEGY_IDS = [
    "PROTO_WQ_ALPHA_ETF",
    "PROTO_HF_REPLICATION",
    "PROTO_BUSINESS_CYCLE",
    "PROTO_MARKOV_DEFENSIVE",
    "PROTO_MANAGED_FUTURES",
    "CAND_EQUITY_MARKET_NEUTRAL",
    "CAND_CREDIT_CARRY_STRESS_GATE",
    "CAND_RATES_DURATION_REGIME",
    "CAND_TREASURY_CURVE_RV",
    "CAND_VOL_CARRY_CRASH_FILTER",
    "CAND_TAIL_HEDGE_CRISIS",
    "CAND_MERGER_ARB_PROXY",
    "CAND_CONVERTIBLE_ARB_PROXY",
    "CAND_COMMODITY_INFLATION_SHOCK",
    "CAND_USD_MACRO_PRESSURE",
    "CAND_EM_MACRO_RISK",
    "CAND_RISK_PARITY_OVERLAY",
    "CAND_GLOBAL_VALUE_ROTATION",
    "CAND_INDEX_ARBITRAGE_PROXY",
    "CAND_EVENT_DRIVEN_SECTOR_PROXY",
]

ARCHIVED_STRATEGY_ID = "CAND_INDEX_ARBITRAGE_PROXY"
REPLACEMENT_CANDIDATE_ID = "EXP_EQUITY_BOND_CORR_REGIME"

ROBUSTNESS_REBALANCE_DAYS = [5, 10, 21]
ROBUSTNESS_COST_BPS = [5, 10, 20]
BASELINE_COST_BPS = 5

STRESS_PERIODS: dict[str, tuple[str, str]] = {
    "global_financial_crisis": ("2007-10-01", "2009-03-31"),
    "european_debt_stress": ("2011-07-01", "2011-12-31"),
    "taper_tantrum": ("2013-05-01", "2013-09-30"),
    "covid_crash": ("2020-02-01", "2020-04-30"),
    "inflation_shock_2022": ("2022-01-01", "2022-12-31"),
    "rate_hike_2023": ("2023-01-01", "2023-10-31"),
}

SUBPERIODS: dict[str, tuple[str, str]] = {
    "pre_gfc": ("2000-01-01", "2007-09-30"),
    "post_gfc_pre_covid": ("2009-04-01", "2020-01-31"),
    "post_covid": ("2020-05-01", "2099-12-31"),
}

GOVERNED_GATES = {
    "net_sharpe": 0.5,
    "max_drawdown": -0.35,
    "annualized_turnover": 12.0,
    "annualized_cost_drag": 0.015,
    "average_oos_sharpe": 0.0,
    "positive_oos_windows": 0.45,
    "max_abs_correlation": 0.75,
}


def build_data_provenance(
    price_path: str | Path,
    returns: pd.DataFrame,
    required_tickers: set[str],
) -> dict[str, Any]:
    panel = pd.read_csv(price_path)
    panel["date"] = pd.to_datetime(panel["date"])
    available = set(panel["ticker"].unique())
    missing_tickers = sorted(required_tickers - available)
    ticker_first_last: dict[str, dict[str, str | None]] = {}
    missing_counts: dict[str, int] = {}
    for ticker in sorted(required_tickers):
        ticker_rows = panel[panel["ticker"] == ticker].sort_values("date")
        if ticker_rows.empty:
            ticker_first_last[ticker] = {"first_valid_date": None, "last_valid_date": None}
            missing_counts[ticker] = int(panel["date"].nunique())
            continue
        valid = ticker_rows[ticker_rows["adj_close"].notna()]
        ticker_first_last[ticker] = {
            "first_valid_date": valid["date"].min().date().isoformat() if not valid.empty else None,
            "last_valid_date": valid["date"].max().date().isoformat() if not valid.empty else None,
        }
        aligned = returns[ticker] if ticker in returns.columns else pd.Series(index=returns.index, dtype=float)
        missing_counts[ticker] = int(aligned.isna().sum())

    return {
        "price_path": str(price_path),
        "data_snapshot_date": returns.index.max().date().isoformat(),
        "return_panel_first_date": returns.index.min().date().isoformat(),
        "return_panel_last_date": returns.index.max().date().isoformat(),
        "return_panel_observations": int(len(returns)),
        "ticker_coverage": {
            "required_count": len(required_tickers),
            "available_count": len(required_tickers - set(missing_tickers)),
            "missing_tickers": missing_tickers,
            "first_last_valid_dates": ticker_first_last,
            "missing_return_counts": missing_counts,
        },
    }


def run_parameterized_backtest(
    strategy: StrategyPrototype,
    returns: pd.DataFrame,
    *,
    rebalance_days: int = 1,
    buy_bps: float = BUY_BPS,
    sell_bps: float = SELL_BPS,
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    subset = returns.loc[start:end] if start or end else returns
    weights = strategy.builder(subset).reindex(index=subset.index, columns=subset.columns).fillna(0.0)
    if rebalance_days > 1:
        weights = _rebalance_only(weights, every=rebalance_days)
    shifted = weights.shift(1).fillna(0.0)
    gross = (shifted * subset).sum(axis=1, min_count=1)
    turnover = shifted.diff().abs().sum(axis=1).fillna(shifted.abs().sum(axis=1))
    cost = turnover * (buy_bps + sell_bps) / 2 / 10_000
    net = gross - cost
    active_index = _active_strategy_index(shifted)
    if active_index.empty:
        empty = pd.Series(dtype=float)
        return {
            "observations": 0,
            "gross_metrics": _summary_metrics(empty),
            "net_metrics": _summary_metrics(empty),
            "turnover": {
                "average_daily_turnover": 0.0,
                "annualized_turnover": 0.0,
                "total_cost_drag": 0.0,
                "annualized_cost_drag": 0.0,
            },
            "return_series": {"dates": [], "gross_returns": [], "net_returns": []},
            "status": "missing_data",
        }
    gross = gross.loc[active_index]
    turnover = turnover.loc[active_index]
    cost = cost.loc[active_index]
    net = net.loc[active_index]
    return {
        "observations": int(net.dropna().shape[0]),
        "gross_metrics": _summary_metrics(gross),
        "net_metrics": _summary_metrics(net),
        "turnover": {
            "average_daily_turnover": float(turnover.mean()),
            "annualized_turnover": float(turnover.mean() * TRADING_DAYS),
            "total_cost_drag": float(cost.sum()),
            "annualized_cost_drag": float(cost.mean() * TRADING_DAYS),
        },
        "return_series": {
            "dates": [idx.date().isoformat() for idx in net.index],
            "gross_returns": [float(value) for value in gross.reindex(net.index)],
            "net_returns": [float(value) for value in net],
        },
        "status": "complete",
    }


def run_parameterized_walk_forward(
    strategy: StrategyPrototype,
    returns: pd.DataFrame,
    *,
    rebalance_days: int = 1,
    buy_bps: float = BUY_BPS,
    sell_bps: float = SELL_BPS,
    train_days: int = 504,
    test_days: int = 126,
) -> dict[str, Any]:
    weights = strategy.builder(returns).reindex(index=returns.index, columns=returns.columns).fillna(0.0)
    if rebalance_days > 1:
        weights = _rebalance_only(weights, every=rebalance_days)
    shifted = weights.shift(1).fillna(0.0)
    gross = (shifted * returns).sum(axis=1, min_count=1)
    turnover = shifted.diff().abs().sum(axis=1).fillna(shifted.abs().sum(axis=1))
    net = gross - turnover * (buy_bps + sell_bps) / 2 / 10_000
    active_index = _active_strategy_index(shifted)
    if active_index.empty:
        return {
            "windows": [],
            "train_days": train_days,
            "test_days": test_days,
            "number_of_windows": 0,
            "positive_window_rate": 0.0,
            "average_test_sharpe": 0.0,
            "status": "missing_data",
        }
    net = net.loc[active_index]
    windows = []
    start = 0
    while start + train_days + test_days <= len(net):
        train = net.iloc[start : start + train_days]
        test = net.iloc[start + train_days : start + train_days + test_days]
        windows.append(
            {
                "train_sharpe": sharpe_ratio(train.tolist()),
                "test_sharpe": sharpe_ratio(test.tolist()),
                "test_return": float((1 + test).prod() - 1.0),
            }
        )
        start += test_days
    if not windows:
        return {
            "windows": [],
            "train_days": train_days,
            "test_days": test_days,
            "number_of_windows": 0,
            "positive_window_rate": 0.0,
            "average_test_sharpe": 0.0,
            "status": "insufficient_history",
        }
    return {
        "windows": windows,
        "train_days": train_days,
        "test_days": test_days,
        "number_of_windows": len(windows),
        "positive_window_rate": float(np.mean([w["test_sharpe"] > 0 for w in windows])),
        "average_test_sharpe": float(np.mean([w["test_sharpe"] for w in windows])),
        "status": "complete",
    }


def _economic_rebalance_prior(strategy_id: str, rebalance_days: int) -> int:
    priors = {
        "EXP_EQUITY_BOND_CORR_REGIME": {21: 3, 10: 2, 5: 1},
        "EXP_VOL_TARGET_EQUITY_TREND": {10: 3, 21: 2, 5: 1},
        "EXP_REAL_ASSET_INFLATION": {21: 3, 10: 2, 5: 1},
    }
    return priors.get(strategy_id, {}).get(rebalance_days, 0)


def _spec_stability_score(subperiod_results: list[dict[str, Any]]) -> float:
    sharpes = [float(item["net_metrics"].get("sharpe", 0.0)) for item in subperiod_results if item.get("status") == "complete"]
    if len(sharpes) < 2:
        return 0.0
    spread = float(np.std(sharpes))
    return max(0.0, 2.0 - spread)


def select_canonical_specification(strategy_id: str, grid: list[dict[str, Any]]) -> dict[str, Any]:
    baseline_rows = [row for row in grid if row["buy_bps"] == BASELINE_COST_BPS and row["sell_bps"] == BASELINE_COST_BPS]
    scored: list[tuple[float, dict[str, Any]]] = []
    for row in baseline_rows:
        net = row["full_history"]["net_metrics"]
        gross = row["full_history"]["gross_metrics"]
        walk = row["walk_forward"]
        turnover = row["full_history"]["turnover"]
        cost20 = next(
            (
                item
                for item in grid
                if item["rebalance_days"] == row["rebalance_days"]
                and item["buy_bps"] == 20
                and item["sell_bps"] == 20
            ),
            None,
        )
        net20 = cost20["full_history"]["net_metrics"] if cost20 else net
        score = 0.0
        score += _economic_rebalance_prior(strategy_id, row["rebalance_days"])
        score += _spec_stability_score(row.get("subperiods", []))
        if float(gross.get("sharpe", 0.0)) > 0:
            score += 1.0
        if float(net.get("sharpe", 0.0)) >= 0.5:
            score += 1.5
        if float(walk.get("average_test_sharpe", -999.0)) >= 0:
            score += 1.5
        if float(walk.get("positive_window_rate", 0.0)) >= 0.45:
            score += 1.0
        if float(turnover.get("annualized_turnover", 999.0)) <= 12:
            score += 1.5
        if float(net20.get("sharpe", 0.0)) >= 0.25:
            score += 1.0
        if float(net.get("max_drawdown", -1.0)) > -0.35:
            score += 0.5
        if float(walk.get("average_test_sharpe", 0.0)) > 1.5:
            score -= 0.5
        scored.append((score, row))
    if not scored:
        raise ValueError(f"No baseline-cost robustness rows found for {strategy_id}.")
    scored.sort(key=lambda item: (-item[0], -item[1]["full_history"]["net_metrics"].get("sharpe", 0.0)))
    best_score, best = scored[0]
    return {
        "strategy_id": strategy_id,
        "selection_method": "economic_rationale_stability_cost_oos_not_max_sharpe",
        "selection_score": float(best_score),
        "rebalance_days": best["rebalance_days"],
        "buy_bps": best["buy_bps"],
        "sell_bps": best["sell_bps"],
        "economic_rationale": (
            f"{best['rebalance_days']}-day rebalance chosen for regime persistence, turnover control, "
            "and OOS consistency rather than highest backtest Sharpe."
        ),
        "metrics": _canonical_metrics_row(best),
    }


def _canonical_metrics_row(row: dict[str, Any]) -> dict[str, Any]:
    full = row["full_history"]
    walk = row["walk_forward"]
    gross = full["gross_metrics"]
    net = full["net_metrics"]
    turnover = full["turnover"]
    return {
        "rebalance_days": row["rebalance_days"],
        "buy_bps": row["buy_bps"],
        "sell_bps": row["sell_bps"],
        "gross_sharpe": float(gross.get("sharpe", 0.0)),
        "net_sharpe": float(net.get("sharpe", 0.0)),
        "annual_return": float(net.get("annual_return", 0.0)),
        "max_drawdown": float(net.get("max_drawdown", 0.0)),
        "annualized_turnover": float(turnover.get("annualized_turnover", 0.0)),
        "annualized_cost_drag": float(turnover.get("annualized_cost_drag", 0.0)),
        "average_oos_sharpe": float(walk.get("average_test_sharpe", 0.0)),
        "positive_oos_windows": float(walk.get("positive_window_rate", 0.0)),
    }


def run_robustness_grid(
    strategy: StrategyPrototype,
    returns: pd.DataFrame,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for rebalance_days in ROBUSTNESS_REBALANCE_DAYS:
        for cost_bps in ROBUSTNESS_COST_BPS:
            full = run_parameterized_backtest(
                strategy,
                returns,
                rebalance_days=rebalance_days,
                buy_bps=cost_bps,
                sell_bps=cost_bps,
            )
            walk = run_parameterized_walk_forward(
                strategy,
                returns,
                rebalance_days=rebalance_days,
                buy_bps=cost_bps,
                sell_bps=cost_bps,
            )
            stress = {
                name: run_parameterized_backtest(
                    strategy,
                    returns,
                    rebalance_days=rebalance_days,
                    buy_bps=cost_bps,
                    sell_bps=cost_bps,
                    start=start,
                    end=end,
                )
                for name, (start, end) in STRESS_PERIODS.items()
            }
            subperiods = [
                run_parameterized_backtest(
                    strategy,
                    returns,
                    rebalance_days=rebalance_days,
                    buy_bps=cost_bps,
                    sell_bps=cost_bps,
                    start=start,
                    end=end,
                )
                for start, end in SUBPERIODS.values()
            ]
            rows.append(
                {
                    "strategy_id": strategy.strategy_id,
                    "rebalance_days": rebalance_days,
                    "buy_bps": cost_bps,
                    "sell_bps": cost_bps,
                    "full_history": full,
                    "walk_forward": walk,
                    "stress_periods": stress,
                    "subperiods": subperiods,
                }
            )
    return rows


def diagnose_retired_strategy(item: dict[str, Any]) -> dict[str, Any]:
    backtest = item["backtest"]
    walk = item["walk_forward"]
    gross = backtest.get("gross_metrics", {})
    net = backtest.get("net_metrics", {})
    turnover = backtest.get("turnover", {})
    corr = backtest.get("correlation_vs_existing_strategies", {})
    causes: list[str] = []
    gross_sharpe = float(gross.get("sharpe", 0.0))
    net_sharpe = float(net.get("sharpe", 0.0))
    ann_turn = float(turnover.get("annualized_turnover", 0.0))
    max_dd = float(net.get("max_drawdown", 0.0))
    avg_oos = float(walk.get("average_test_sharpe", 0.0))
    max_corr = float(corr.get("max_abs_correlation", 0.0))

    if gross_sharpe <= 0:
        causes.append("negative_gross_alpha")
    if gross_sharpe > 0 and net_sharpe <= 0:
        causes.append("transaction_cost_failure")
    if ann_turn > 24:
        causes.append("excessive_turnover")
    elif ann_turn > 12 and gross_sharpe > net_sharpe + 0.15:
        causes.append("excessive_turnover")
    if max_dd < -0.45:
        causes.append("drawdown_failure")
    if avg_oos < -0.25:
        causes.append("weak_oos_evidence")
    elif avg_oos < 0:
        causes.append("weak_oos_evidence")
    if max_corr >= 0.75:
        causes.append("duplicate_exposure")

    primary = "mixed_failure"
    if "negative_gross_alpha" in causes:
        primary = "negative_gross_alpha"
    elif "weak_oos_evidence" in causes and gross_sharpe <= 0:
        primary = "weak_oos_evidence"
    elif "transaction_cost_failure" in causes or ("excessive_turnover" in causes and gross_sharpe > 0):
        primary = "transaction_cost_failure"
    elif "drawdown_failure" in causes:
        primary = "drawdown_failure"
    elif "duplicate_exposure" in causes:
        primary = "duplicate_exposure"

    retest_lower_frequency = (
        gross_sharpe > 0
        and avg_oos >= -0.25
        and primary in {"transaction_cost_failure", "excessive_turnover"}
        and "negative_gross_alpha" not in causes
    )
    return {
        "strategy_id": backtest["strategy_id"],
        "name": backtest["name"],
        "failure_causes": causes,
        "primary_failure": primary,
        "gross_sharpe": gross_sharpe,
        "net_sharpe": net_sharpe,
        "annualized_turnover": ann_turn,
        "max_drawdown": max_dd,
        "average_oos_sharpe": avg_oos,
        "max_abs_correlation": max_corr,
        "retest_lower_frequency": retest_lower_frequency,
    }


def retest_retired_lower_frequency(
    strategy: StrategyPrototype,
    returns: pd.DataFrame,
    diagnosis: dict[str, Any],
) -> dict[str, Any] | None:
    if not diagnosis.get("retest_lower_frequency"):
        return None
    row = run_parameterized_backtest(strategy, returns, rebalance_days=21, buy_bps=BASELINE_COST_BPS, sell_bps=BASELINE_COST_BPS)
    walk = run_parameterized_walk_forward(
        strategy,
        returns,
        rebalance_days=21,
        buy_bps=BASELINE_COST_BPS,
        sell_bps=BASELINE_COST_BPS,
    )
    net = row["net_metrics"]
    turnover = row["turnover"]
    improved = (
        float(net.get("sharpe", 0.0)) > diagnosis["net_sharpe"]
        and float(turnover.get("annualized_turnover", 999.0)) < diagnosis["annualized_turnover"]
    )
    return {
        "strategy_id": strategy.strategy_id,
        "rebalance_days": 21,
        "improved_vs_daily": improved,
        "net_sharpe": float(net.get("sharpe", 0.0)),
        "gross_sharpe": float(row["gross_metrics"].get("sharpe", 0.0)),
        "annualized_turnover": float(turnover.get("annualized_turnover", 0.0)),
        "average_oos_sharpe": float(walk.get("average_test_sharpe", 0.0)),
        "verdict": "still_retire" if not improved or float(net.get("sharpe", 0.0)) < 0 else "research_hold_only",
    }


def passes_governed_gates(metrics: dict[str, Any], max_corr: float) -> tuple[bool, list[str]]:
    failures = []
    if float(metrics.get("net_sharpe", 0.0)) < GOVERNED_GATES["net_sharpe"]:
        failures.append("net_sharpe")
    if float(metrics.get("max_drawdown", 0.0)) < GOVERNED_GATES["max_drawdown"]:
        failures.append("max_drawdown")
    if float(metrics.get("annualized_turnover", 999.0)) > GOVERNED_GATES["annualized_turnover"]:
        failures.append("annualized_turnover")
    if float(metrics.get("annualized_cost_drag", 999.0)) > GOVERNED_GATES["annualized_cost_drag"]:
        failures.append("annualized_cost_drag")
    if float(metrics.get("average_oos_sharpe", -999.0)) < GOVERNED_GATES["average_oos_sharpe"]:
        failures.append("average_oos_sharpe")
    if float(metrics.get("positive_oos_windows", 0.0)) < GOVERNED_GATES["positive_oos_windows"]:
        failures.append("positive_oos_windows")
    if max_corr >= GOVERNED_GATES["max_abs_correlation"]:
        failures.append("max_abs_correlation")
    return not failures, failures


def build_universe_proposals(
    canonical_specs: dict[str, dict[str, Any]],
    baseline_payload: dict[str, Any],
    expansion_v1_payload: dict[str, Any],
) -> dict[str, Any]:
    replacement = canonical_specs.get(REPLACEMENT_CANDIDATE_ID)
    replacement_metrics = replacement["metrics"] if replacement else {}
    replacement_corr = float(replacement.get("max_abs_correlation", 0.0)) if replacement else 0.0
    replacement_eligible, replacement_failures = passes_governed_gates(replacement_metrics, replacement_corr)

    legacy_non_archived = [sid for sid in CURRENT_DASHBOARD_STRATEGY_IDS if sid != ARCHIVED_STRATEGY_ID]
    sandbox_members = legacy_non_archived.copy()
    sandbox_labels: dict[str, str] = {sid: "legacy_dashboard" for sid in legacy_non_archived}

    if replacement:
        sandbox_members.append(REPLACEMENT_CANDIDATE_ID)
        sandbox_labels[REPLACEMENT_CANDIDATE_ID] = "expansion_research_only"

    research_only_ids = [
        sid
        for sid in NON_RETIRED_EXPANSION_IDS
        if sid != REPLACEMENT_CANDIDATE_ID
    ] + RETIRED_EXPANSION_IDS

    governed_members = legacy_non_archived.copy()
    governed_labels: dict[str, str] = {sid: "governed_legacy" for sid in legacy_non_archived}
    governed_blocked: dict[str, str] = {
        ARCHIVED_STRATEGY_ID: "archived_historical_only_reduce_only_if_legacy_weight_exists"
    }

    replacement_in_governed = False
    if replacement_eligible:
        governed_members.append(REPLACEMENT_CANDIDATE_ID)
        governed_labels[REPLACEMENT_CANDIDATE_ID] = "governed_candidate_pending_manual_promotion"
        replacement_in_governed = True

    if len(sandbox_members) != 20:
        raise ValueError(f"research_sandbox_universe must contain exactly 20 strategies, found {len(sandbox_members)}.")

    return {
        "research_sandbox_universe": {
            "count": len(sandbox_members),
            "members": [
                {
                    "strategy_id": sid,
                    "label": sandbox_labels[sid],
                    "research_only": sid.startswith("EXP_"),
                    "hypothetical_weights_allowed": True,
                    "governed_allocation_allowed": False if sid.startswith("EXP_") else True,
                }
                for sid in sandbox_members
            ],
            "notes": [
                "Exactly 20 non-archived strategies for what-if simulation.",
                "Expansion sleeves remain research-only and cannot be committed to governed allocation in phase 2.",
            ],
        },
        "governed_allocation_universe": {
            "count": len(governed_members),
            "members": [
                {
                    "strategy_id": sid,
                    "label": governed_labels[sid],
                    "governed_allocation_allowed": True,
                    "new_positive_weight_allowed": sid != ARCHIVED_STRATEGY_ID,
                }
                for sid in governed_members
            ],
            "blocked_or_reduce_only": [
                {
                    "strategy_id": ARCHIVED_STRATEGY_ID,
                    "policy": governed_blocked[ARCHIVED_STRATEGY_ID],
                }
            ],
            "index_arbitrage_replacement": {
                "removed": ARCHIVED_STRATEGY_ID,
                "candidate": REPLACEMENT_CANDIDATE_ID,
                "accepted_into_governed_universe": replacement_in_governed,
                "governed_gate_failures": replacement_failures,
                "canonical_spec": replacement,
            },
        },
        "excluded_from_sandbox_count_20": {
            "archived": [ARCHIVED_STRATEGY_ID],
            "research_only_not_in_core_twenty": research_only_ids,
        },
    }


def render_final_strategy_review(
    canonical_specs: dict[str, dict[str, Any]],
    retired_diagnoses: list[dict[str, Any]],
    lower_frequency_retests: list[dict[str, Any]],
    universe_proposal: dict[str, Any],
) -> str:
    lines = [
        "# Strategy Expansion Phase 2 — Final Review",
        "",
        "## Canonical Specifications (Non-Retired Expansion Candidates)",
        "",
        "| Strategy | Canonical Spec | Gross Sharpe | Net Sharpe | Ann Return | Max DD | Turnover | Cost Drag | Avg OOS Sharpe | +OOS Windows | Max |Corr| | Decision |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for strategy_id in NON_RETIRED_EXPANSION_IDS:
        spec = canonical_specs[strategy_id]
        metrics = spec["metrics"]
        corr = spec.get("max_abs_correlation", 0.0)
        decision = spec.get("final_decision", "Research Hold")
        canonical = f"{metrics['rebalance_days']}d / {metrics['buy_bps']}bp"
        lines.append(
            f"| {spec['strategy_id']} | {canonical} | {metrics['gross_sharpe']:.2f} | {metrics['net_sharpe']:.2f} | "
            f"{metrics['annual_return']:.2%} | {metrics['max_drawdown']:.2%} | {metrics['annualized_turnover']:.1f} | "
            f"{metrics['annualized_cost_drag']:.2%} | {metrics['average_oos_sharpe']:.2f} | "
            f"{metrics['positive_oos_windows']:.0%} | {corr:.2f} | {decision} |"
        )
    lines.extend(["", "## Retired Expansion Diagnoses", ""])
    for diag in retired_diagnoses:
        lines.append(
            f"- **{diag['strategy_id']}** — primary: `{diag['primary_failure']}`; causes: {', '.join(diag['failure_causes'])}"
        )
    if lower_frequency_retests:
        lines.extend(["", "## Lower-Frequency Retests (21-day, gross-positive / cost-driven only)", ""])
        for row in lower_frequency_retests:
            lines.append(
                f"- **{row['strategy_id']}**: net Sharpe {row['net_sharpe']:.2f}, turnover {row['annualized_turnover']:.1f}, verdict `{row['verdict']}`"
            )
    repl = universe_proposal["governed_allocation_universe"]["index_arbitrage_replacement"]
    lines.extend(
        [
            "",
            "## Proposed 20-Strategy Membership",
            "",
            f"- **Research sandbox (20):** "
            + ", ".join(item["strategy_id"] for item in universe_proposal["research_sandbox_universe"]["members"]),
            f"- **Governed allocation ({universe_proposal['governed_allocation_universe']['count']}):** "
            + ", ".join(item["strategy_id"] for item in universe_proposal["governed_allocation_universe"]["members"]),
            f"- **Index Arbitrage replacement accepted:** {repl['accepted_into_governed_universe']}",
            "",
            "Phase 2 does not update dashboard weights, eligibility flags, or Render deployment.",
        ]
    )
    return "\n".join(lines)


def run_strategy_expansion_phase2(
    price_path: str | Path = "data/processed/market_price_history.csv",
    literature_path: str | Path = "output/literature_strategy_backtests.json",
    expansion_v1_path: str | Path = "output/strategy_expansion_v1/strategy_expansion_v1_backtests.json",
) -> dict[str, Any]:
    price_path = Path(price_path)
    literature_path = Path(literature_path)
    baseline_payload = ensure_literature_baseline(literature_path, price_path)
    baseline_series = baseline_net_series_from_payload(baseline_payload)

    _, returns = load_price_returns(price_path)
    prototypes = {item.strategy_id: item for item in expansion_strategy_prototypes()}
    required_tickers = set()
    for proto in prototypes.values():
        required_tickers.update(proto.universe)
    provenance = build_data_provenance(price_path, returns, required_tickers)

    if Path(expansion_v1_path).exists():
        expansion_v1_payload = json.loads(Path(expansion_v1_path).read_text(encoding="utf-8"))
    else:
        expansion_v1_payload = run_strategy_expansion_v1(price_path=price_path, literature_path=literature_path)

    for item in expansion_v1_payload["results"]:
        item["backtest"]["correlation_vs_existing_strategies"] = correlation_against_baseline(
            item["backtest"],
            baseline_series,
        )

    robustness: dict[str, Any] = {}
    canonical_specs: dict[str, dict[str, Any]] = {}
    for strategy_id in NON_RETIRED_EXPANSION_IDS:
        strategy = prototypes[strategy_id]
        grid = run_robustness_grid(strategy, returns)
        canonical = select_canonical_specification(strategy_id, grid)
        canonical_backtest = run_parameterized_backtest(
            strategy,
            returns,
            rebalance_days=canonical["rebalance_days"],
            buy_bps=canonical["buy_bps"],
            sell_bps=canonical["sell_bps"],
        )
        corr = correlation_against_baseline(
            {"strategy_id": strategy_id, "return_series": canonical_backtest["return_series"]},
            baseline_series,
        )
        canonical["max_abs_correlation"] = corr["max_abs_correlation"]
        eligible, failures = passes_governed_gates(canonical["metrics"], corr["max_abs_correlation"])
        if strategy_id == REPLACEMENT_CANDIDATE_ID and eligible:
            canonical["final_decision"] = "Promote to governed candidate (replace Index Arbitrage)"
        elif eligible:
            canonical["final_decision"] = "Research Hold (passes gates but research-only in phase 2)"
        elif corr["max_abs_correlation"] >= GOVERNED_GATES["max_abs_correlation"]:
            canonical["final_decision"] = "Research Hold (duplicate exposure)"
        else:
            canonical["final_decision"] = "Research Hold (robustness gates not met)"
        canonical["governed_gate_failures"] = failures
        canonical_specs[strategy_id] = canonical
        robustness[strategy_id] = {"grid": grid, "canonical": canonical}

    retired_items = [item for item in expansion_v1_payload["results"] if item["backtest"]["strategy_id"] in RETIRED_EXPANSION_IDS]
    retired_diagnoses = [diagnose_retired_strategy(item) for item in retired_items]
    lower_frequency_retests = []
    for diag in retired_diagnoses:
        strategy = prototypes[diag["strategy_id"]]
        retest = retest_retired_lower_frequency(strategy, returns, diag)
        if retest:
            lower_frequency_retests.append(retest)

    universe_proposal = build_universe_proposals(canonical_specs, baseline_payload, expansion_v1_payload)

    return {
        "phase": "strategy_expansion_phase2",
        "data_provenance": provenance,
        "literature_baseline": {
            "path": str(literature_path),
            "strategy_count": len(baseline_series),
            "generated_during_run": bool(baseline_payload.get("generated_during_run", False)),
        },
        "robustness_candidates": robustness,
        "retired_diagnoses": retired_diagnoses,
        "lower_frequency_retests": lower_frequency_retests,
        "canonical_specifications": canonical_specs,
        "universe_proposal": universe_proposal,
    }
