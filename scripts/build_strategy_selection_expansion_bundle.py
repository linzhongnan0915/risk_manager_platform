"""Apply the strategy-selection batch to the committed dashboard research bundle."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.reporting.strategy_factory_research_adapter import _annual_return, _risk_packet
from src.strategies.platform_registry import (
    COMPOSITE_ID,
    FUNDAMENTAL_RESEARCH_CANDIDATE_IDS,
    STRATEGY_SELECTION_STATUS,
)

BUNDLE_PATH = ROOT / "dashboard/data/us_equity_research_bundle.json"
PACK_ROOT = ROOT / "output/research/fundamental_strategy_expansion_v1"
ACTIVE_IDS = tuple(
    strategy_id
    for strategy_id, decision in STRATEGY_SELECTION_STATUS.items()
    if decision["status"] == "ACTIVE"
)


def _series_metrics(returns: pd.Series) -> dict[str, float]:
    packet = _risk_packet(
        returns,
        pd.Series(0.0, index=returns.index),
        pd.Series(0.0, index=returns.index),
        pd.DataFrame(index=returns.index),
    )
    return {
        "cumulative_return": float(returns.add(1).prod() - 1),
        "annual_return": float(_annual_return(returns)),
        "annual_volatility": float(packet["summary_statistics"]["annual_volatility"]),
        "sharpe": float(packet["summary_statistics"]["sharpe"]),
        "max_drawdown": float(packet["drawdown_behavior"]["max_drawdown"]),
    }


def _apply_old_statuses(results: list[dict]) -> None:
    for item in results:
        strategy_id = item["strategy_id"]
        if strategy_id not in STRATEGY_SELECTION_STATUS:
            continue
        decision = STRATEGY_SELECTION_STATUS[strategy_id]
        status = decision["status"]
        backtest = item["backtest"]
        factory = backtest["factory_research"]
        eligible = status == "ACTIVE"
        item["research_group"] = status
        backtest["lifecycle_status"] = status
        backtest["research_composite_eligible"] = eligible
        factory["membership"] = status
        factory["research_status"] = status
        factory["research_composite_eligible"] = eligible
        factory["composite_eligible"] = eligible
        factory["decision_reason"] = decision["reason"]
        backtest["action"] = {
            "action": "Use in research composite" if eligible else status,
            "reason_code": status.lower(),
            "interpretation": decision["reason"],
        }


def _candidate_items(correlation: pd.DataFrame) -> list[dict]:
    summary = pd.read_csv(PACK_ROOT / "candidate_summary.csv").set_index("strategy_id")
    daily = pd.read_csv(PACK_ROOT / "daily_net_returns.csv", parse_dates=["date"])
    holdings = pd.read_csv(PACK_ROOT / "holdings.csv")
    manifest = json.loads((PACK_ROOT / "run_manifest.json").read_text(encoding="utf-8"))
    retained_corr = correlation.loc[list(FUNDAMENTAL_RESEARCH_CANDIDATE_IDS), list(ACTIVE_IDS)]
    output = []
    for strategy_id in FUNDAMENTAL_RESEARCH_CANDIDATE_IDS:
        row = summary.loc[strategy_id]
        returns = daily.loc[daily["strategy_id"] == strategy_id].sort_values("date")
        net = pd.Series(returns["net_return"].values, index=returns["date"])
        gross = pd.Series(returns["gross_return"].values, index=returns["date"])
        turnover = pd.Series(returns["turnover"].values, index=returns["date"])
        packet = _risk_packet(net, pd.Series(0.0, index=net.index), turnover, pd.DataFrame(index=net.index))
        candidate_holdings = holdings.loc[holdings["strategy_id"] == strategy_id].to_dict(orient="records")
        corr_row = retained_corr.loc[strategy_id].abs()
        output.append(
            {
                "research_group": "RESEARCH_CANDIDATE",
                "strategy_id": strategy_id,
                "backtest": {
                    "strategy_id": strategy_id,
                    "name": strategy_id.replace("_", " ").title(),
                    "literature_source": "SEC point-in-time fundamental expansion batch",
                    "research_source": manifest["pack_id"],
                    "hypothesis": "; ".join(manifest["candidate_formulas"][strategy_id]),
                    "universe": manifest["universe_rule"],
                    "rebalance": "Every 20 trading days",
                    "signal_summary": "; ".join(manifest["candidate_formulas"][strategy_id]),
                    "failure_modes": "Current-listed diagnostic universe; survivorship bias present.",
                    "observations": int(row["observations"]),
                    "asset_class": "US individual equities",
                    "strategy_family": "point_in_time_fundamental",
                    "lifecycle_status": "RESEARCH_CANDIDATE",
                    "allocation_eligible": False,
                    "live_allocation_approved": False,
                    "research_composite_eligible": False,
                    "test_period_start": row["test_period_start"],
                    "test_period_end": row["test_period_end"],
                    "latest_data_date": row["test_period_end"],
                    "gross_metrics": {
                        "cumulative_return": float(row["gross_cumulative_return"]),
                        "annual_return": float(_annual_return(gross)),
                    },
                    "net_metrics": {
                        "cumulative_return": float(row["net_cumulative_return"]),
                        "annual_return": float(row["annualized_net_return"]),
                        "annual_volatility": float(row["annualized_volatility"]),
                        "sharpe": float(row["net_sharpe"]),
                        "max_drawdown": float(row["max_drawdown"]),
                    },
                    "turnover": {
                        "average_daily_turnover": float(row["average_daily_turnover"]),
                        "annualized_turnover": float(row["annualized_turnover"]),
                        "total_cost_drag": float(row["total_cost_drag"]),
                        "annualized_cost_drag": float(returns["transaction_cost"].mean() * 252),
                    },
                    "return_series": {
                        "dates": [date.date().isoformat() for date in returns["date"]],
                        "gross_returns": [round(float(value), 6) for value in gross],
                        "net_returns": [round(float(value), 6) for value in net],
                    },
                    "risk_packet": {
                        "summary_statistics": packet["summary_statistics"],
                        "drawdown_behavior": packet["drawdown_behavior"],
                        "chart_series": {
                            "drawdown": packet["chart_series"]["drawdown"],
                            "rolling_63d_sharpe": packet["chart_series"]["rolling_63d_sharpe"],
                        },
                    },
                    "action": {
                        "action": row["recommendation"],
                        "reason_code": "research_candidate",
                        "interpretation": "Research only; no promotion in this batch.",
                    },
                    "holdings": candidate_holdings,
                    "factory_research": {
                        "membership": "RESEARCH_CANDIDATE",
                        "research_status": row["recommendation"],
                        "research_composite_eligible": False,
                        "composite_eligible": False,
                        "live_allocation_approved": False,
                        "decision_reason": "Research only; current-listed diagnostic with survivorship bias.",
                        "limitations": [
                            "CURRENT_LISTED_DIAGNOSTIC",
                            "SURVIVORSHIP_BIAS_PRESENT",
                            "SEC XBRL tag and filing coverage varies by issuer.",
                        ],
                        "preliminary_oos_start": row["preliminary_oos_start"],
                        "preliminary_oos_net_return": float(row["preliminary_oos_net_return"]),
                        "preliminary_oos_sharpe": float(row["preliminary_oos_sharpe"]),
                        "average_abs_correlation_with_retained": float(corr_row.mean()),
                        "max_abs_correlation_with_retained": float(corr_row.max()),
                        "highest_corr_retained_strategy": str(corr_row.idxmax()),
                        "trade_cost_reconciliation_error": float(row["trade_cost_reconciliation_error"]),
                    },
                },
                "walk_forward": {
                    "windows": [],
                    "status": "PRELIMINARY CHRONOLOGICAL OOS ONLY",
                    "number_of_windows": 1,
                    "positive_window_rate": float(row["preliminary_oos_net_return"] > 0),
                    "average_test_sharpe": float(row["preliminary_oos_sharpe"]),
                },
            }
        )
    return output


def _rebuild_composite(results: list[dict], shared_dates: list[str]) -> None:
    by_id = {item["strategy_id"]: item for item in results}
    active = [by_id[strategy_id] for strategy_id in ACTIVE_IDS]
    weight = 1.0 / len(active)
    gross = pd.DataFrame(
        {item["strategy_id"]: item["backtest"]["return_series"]["gross_returns"] for item in active},
        index=pd.to_datetime(shared_dates),
    ).mean(axis=1)
    net_panel = pd.DataFrame(
        {item["strategy_id"]: item["backtest"]["return_series"]["net_returns"] for item in active},
        index=pd.to_datetime(shared_dates),
    )
    net = net_panel.mean(axis=1)
    corr = net_panel.corr()
    pairwise = [
        {"strategy_left": left, "strategy_right": right, "correlation": float(corr.loc[left, right])}
        for pos, left in enumerate(ACTIVE_IDS)
        for right in ACTIVE_IDS[pos + 1 :]
    ]
    item = by_id[COMPOSITE_ID]
    backtest = item["backtest"]
    packet = _risk_packet(net, pd.Series(0.0, index=net.index), pd.Series(0.0, index=net.index), pd.DataFrame(index=net.index))
    item["research_group"] = "COMBINED_PORTFOLIO"
    backtest["hypothesis"] = f"Equal-weight composite of all {len(active)} eligible ACTIVE underlying strategies - research only."
    backtest["universe"] = f"Composite of {len(active)} active US-equity research strategies"
    backtest["rebalance"] = f"Dynamic equal weight 1/N where N={len(active)}"
    backtest["gross_metrics"] = {
        "cumulative_return": float(gross.add(1).prod() - 1),
        "annual_return": float(_annual_return(gross)),
    }
    backtest["net_metrics"] = _series_metrics(net)
    member_cost_drag = [member["backtest"]["turnover"]["total_cost_drag"] for member in active]
    member_turnover = [member["backtest"]["turnover"]["average_daily_turnover"] for member in active]
    backtest["turnover"] = {
        "average_daily_turnover": float(sum(member_turnover) * weight),
        "annualized_turnover": float(sum(member_turnover) * weight * 252),
        "total_cost_drag": float(sum(member_cost_drag) * weight),
        "annualized_cost_drag": float(sum(member_cost_drag) * weight / len(net) * 252),
    }
    backtest["return_series"] = {
        "gross_returns": [round(float(value), 6) for value in gross],
        "net_returns": [round(float(value), 6) for value in net],
    }
    backtest["risk_packet"] = {
        "summary_statistics": packet["summary_statistics"],
        "drawdown_behavior": packet["drawdown_behavior"],
        "chart_series": {
            "drawdown": packet["chart_series"]["drawdown"],
            "rolling_63d_sharpe": packet["chart_series"]["rolling_63d_sharpe"],
        },
    }
    composite = {
        "N": len(active),
        "equal_weight": weight,
        "weight_formula": "weight_i = 1 / N",
        "dynamic_membership": True,
        "membership_rule": "Includes ACTIVE strategies only; equal-weight 1/N.",
        "members": [
            {
                "strategy_id": member["strategy_id"],
                "name": member["backtest"]["name"],
                "weight": weight,
                "sharpe": member["backtest"]["net_metrics"]["sharpe"],
                "research_status": "ACTIVE",
                "membership": "ACTIVE",
            }
            for member in active
        ],
        "constituent_ids": list(ACTIVE_IDS),
        "eligible_member_ids": list(ACTIVE_IDS),
        "reference_only_ids": [
            row["strategy_id"]
            for row in results
            if row["backtest"]["factory_research"].get("membership") != "ACTIVE"
            and row["strategy_id"] != COMPOSITE_ID
        ],
        "current_constituents": [
            {"strategy_id": strategy_id, "weight": weight, "side": "constituent"}
            for strategy_id in ACTIVE_IDS
        ],
        "weights": {strategy_id: weight for strategy_id in ACTIVE_IDS},
        "constituent_sharpes": {
            member["strategy_id"]: member["backtest"]["net_metrics"]["sharpe"] for member in active
        },
        "pairwise_analysis": pairwise,
        "correlation_matrix": corr.to_dict(),
        "common_start_date": shared_dates[0],
        "common_end_date": shared_dates[-1],
    }
    backtest["factory_research"]["combined_portfolio"] = composite
    backtest["factory_research"]["strategy_21"] = composite
    backtest["factory_research"]["decision_reason"] = (
        f"Equal-weight Combined Portfolio of {len(active)} ACTIVE strategies; research only."
    )


def build_bundle() -> dict:
    payload = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    catalog = payload["factory_strategy_research"]
    results = catalog["results"]
    _apply_old_statuses(results)
    results[:] = [item for item in results if item["strategy_id"] not in FUNDAMENTAL_RESEARCH_CANDIDATE_IDS]
    correlation = pd.read_csv(PACK_ROOT / "correlation_matrix.csv", index_col=0)
    composite = next(item for item in results if item["strategy_id"] == COMPOSITE_ID)
    results.remove(composite)
    results.extend(_candidate_items(correlation))
    results.append(composite)
    _rebuild_composite(results, payload["shared_dates"])
    counts = {
        status: sum(
            item["backtest"]["factory_research"].get("membership") == status for item in results
        )
        for status in ("ACTIVE", "REPAIR", "RESEARCH_CANDIDATE", "REFERENCE_ONLY", "ARCHIVED")
    }
    arch = catalog["architecture"]
    arch.update(
        {
            "research_composite_eligible_count": counts["ACTIVE"],
            "eligible_active_count": counts["ACTIVE"],
            "composite_constituent_count": counts["ACTIVE"],
            "composite_equal_weight": 1.0 / counts["ACTIVE"],
            "tested_candidate_count": len(results) - 1,
            "active_retained_count": counts["ACTIVE"],
            "repair_count": counts["REPAIR"],
            "research_candidate_count": counts["RESEARCH_CANDIDATE"],
            "reference_only_count": counts["REFERENCE_ONLY"],
            "archived_count": counts["ARCHIVED"],
        }
    )
    catalog["groups"] = [
        {"id": "ACTIVE", "label": "ACTIVE"},
        {"id": "REPAIR", "label": "REPAIR"},
        {"id": "RESEARCH_CANDIDATE", "label": "RESEARCH CANDIDATE"},
        {"id": "REFERENCE_ARCHIVED", "label": "REFERENCE ONLY / ARCHIVED"},
        {"id": "COMBINED_PORTFOLIO", "label": "Combined Portfolio"},
    ]
    catalog["results_count"] = len(results)
    catalog["source"] = "strategy_selection_expansion_batch_v1"
    payload["bundle_version"] = 3
    return payload


def main() -> int:
    payload = build_bundle()
    BUNDLE_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {BUNDLE_PATH} ({payload['factory_strategy_research']['results_count']} results)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
