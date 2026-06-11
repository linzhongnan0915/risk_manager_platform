"""Adapt Strategy Factory artifacts into Research Lab literature-compatible payloads."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from src.strategies.common_factor_residual_reversal import SPEC as C2B2_001_SPEC
from src.strategies.correlation_crowding_reversal import SPEC as C2A2_019_SPEC
from src.strategies.downside_beta_defensive import SPEC as C2B2_003_SPEC
from src.strategies.liquidity_resilience import SPEC as C2A2_020_SPEC
from src.strategies.literature_backtests import TRADING_DAYS, _annual_return, _compound_return, _risk_packet
from src.strategies.low_residual_volatility import SPEC as C2A2_002_SPEC
from src.strategies.market_residual_momentum import SPEC as C2B2_002_SPEC
from src.strategies.overnight_gap_reversal import SPEC as C2A2_004_SPEC
from src.strategies.range_compression_breakout import SPEC as C2A2_008_SPEC
from src.strategies.realized_skewness import SPEC as C2B2_004_SPEC
from src.strategies.residual_reversal import SPEC as C2A2_001_SPEC
from src.strategies.return_autocorrelation_reversal import SPEC as C2B2_006_SPEC
from src.strategies.strategy_factory import StrategySpec
from src.strategies.volume_confirmed_residual_continuation import SPEC as C2B2_005_SPEC

FACTORY_STRATEGY_IDS = (
    "C2A2_001",
    "C2A2_002",
    "C2A2_004",
    "C2A2_008",
    "C2A2_019",
    "C2A2_020",
    "C2B2_001",
    "C2B2_002",
    "C2B2_003",
    "C2B2_004",
    "C2B2_005",
    "C2B2_006",
)
CURRENT_RESEARCH_IDS = {"C2A2_020", "C2B2_004"}
COMPOSITE_ID = "STRATEGY_21_RESEARCH_COMPOSITE_V1"
DEFAULT_STRATEGY_ID = "C2A2_020"

SPEC_BY_ID: dict[str, StrategySpec] = {
    spec.strategy_id: spec
    for spec in (
        C2A2_001_SPEC,
        C2A2_002_SPEC,
        C2A2_004_SPEC,
        C2A2_008_SPEC,
        C2A2_019_SPEC,
        C2A2_020_SPEC,
        C2B2_001_SPEC,
        C2B2_002_SPEC,
        C2B2_003_SPEC,
        C2B2_004_SPEC,
        C2B2_005_SPEC,
        C2B2_006_SPEC,
    )
}

RESEARCH_GROUPS = (
    {"id": "CURRENT_US_EQUITY_RESEARCH", "label": "Current US-Equity Research"},
    {"id": "ARCHIVED_US_EQUITY_RESEARCH", "label": "Archived / Rejected US-Equity Research"},
    {"id": "STRATEGY_21", "label": "Strategy 21"},
    {"id": "LEGACY_PROXY", "label": "Research Reference / Legacy Proxy"},
)

FACTOR_INTERPRETATIONS: dict[str, list[dict[str, str]]] = {
    "C2A2_002": [
        {"label": "Low-volatility / defensive exposure", "kind": "ECONOMIC INTERPRETATION", "detail": "Long low residual volatility and short high residual volatility after beta estimation."},
        {"label": "Market beta", "kind": "PROXY", "detail": "Beta-neutral construction is intended, but residual low-vol can still behave defensively in stress."},
    ],
    "C2A2_020": [
        {"label": "Liquidity-resilience / defensive exposure", "kind": "ECONOMIC INTERPRETATION", "detail": "Lower price impact during market and volume stress is treated as a resilience premium."},
        {"label": "Turnover sensitivity", "kind": "MEASURED", "detail": "Average daily turnover is exported in the baseline daily returns file."},
    ],
    "C2B2_004": [
        {"label": "Skewness / lottery-demand exposure", "kind": "ECONOMIC INTERPRETATION", "detail": "Long negative realized skew and short positive skew targets crash-risk compensation versus lottery demand."},
        {"label": "Downside-risk exposure", "kind": "ECONOMIC INTERPRETATION", "detail": "Negative-skew names can cluster in stress even in a dollar-neutral book."},
    ],
}

DECISION_REASONS: dict[str, str] = {
    "C2A2_002": "Economic duplicate of C2A2_020; removed from Strategy 21 because of high overlap with liquidity-resilience/defensive exposure.",
    "C2A2_020": "Retained research-composite member with positive cost-adjusted baseline; not allocation approved.",
    "C2B2_004": "Retained research-composite member with positive cost-adjusted baseline; not allocation approved.",
}


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _read_csv(path: Path) -> pd.DataFrame | None:
    if not path.exists():
        return None
    return pd.read_csv(path)


def _load_candidate_pool(root: Path) -> dict[str, dict[str, Any]]:
    pool_path = root / "data/config/strategy_candidate_pool_2026_06_10.json"
    if not pool_path.exists():
        return {}
    payload = json.loads(pool_path.read_text(encoding="utf-8"))
    return {row["candidate_id"]: row for row in payload.get("candidates", [])}


def _research_group(strategy_id: str) -> str:
    if strategy_id == COMPOSITE_ID:
        return "STRATEGY_21"
    if strategy_id in CURRENT_RESEARCH_IDS:
        return "CURRENT_US_EQUITY_RESEARCH"
    return "ARCHIVED_US_EQUITY_RESEARCH"


def _lifecycle_status(strategy_id: str, summary: dict[str, Any]) -> str:
    if strategy_id == COMPOSITE_ID:
        return "RESEARCH COMPOSITE"
    if strategy_id in CURRENT_RESEARCH_IDS:
        return "RETAINED RESEARCH CANDIDATE"
    if strategy_id == "C2A2_002":
        return "ECONOMIC DUPLICATE"
    if summary.get("decision") == "ARCHIVE" and float(summary.get("net_sharpe") or 0) < 0:
        return "REJECTED"
    if summary.get("decision") == "ARCHIVE":
        return "ARCHIVED"
    return "RESEARCH CANDIDATE"


def _decision_reason(strategy_id: str, summary: dict[str, Any], gates: dict[str, bool]) -> str:
    if strategy_id in DECISION_REASONS:
        return DECISION_REASONS[strategy_id]
    if not gates.get("positive_gross_edge"):
        return "Gross edge is not positive after the baseline screening gates."
    if not gates.get("gross_edge_exceeds_cost"):
        return "Transaction costs exceed gross edge in the current baseline."
    if not gates.get("positive_mean_ic"):
        return "Mean IC is not positive; signal separation is weak."
    if not gates.get("positive_d10_minus_d1"):
        return "Decile spread (D10-D1) is not positive; IC does not translate cleanly into portfolio return."
    if float(summary.get("net_sharpe") or 0) < 0:
        return "Net Sharpe is negative after transaction costs."
    if summary.get("decision") == "ARCHIVE":
        return "Archived after Strategy Factory screening; retained only for research reference."
    return "Passed baseline screening gates; retained for further research review only."


def _action_from_summary(strategy_id: str, summary: dict[str, Any]) -> dict[str, str]:
    lifecycle = _lifecycle_status(strategy_id, summary)
    if lifecycle in {"RETAINED RESEARCH CANDIDATE", "RESEARCH COMPOSITE"}:
        return {"action": "Keep Researching", "reason_code": "retained_research", "interpretation": _decision_reason(strategy_id, summary, summary.get("decision_gates") or {})}
    if lifecycle == "ECONOMIC DUPLICATE":
        return {"action": "Reject", "reason_code": "economic_duplicate", "interpretation": _decision_reason(strategy_id, summary, summary.get("decision_gates") or {})}
    if lifecycle == "REJECTED":
        return {"action": "Reject", "reason_code": "negative_net_sharpe", "interpretation": _decision_reason(strategy_id, summary, summary.get("decision_gates") or {})}
    return {"action": "Pause", "reason_code": "archived_baseline", "interpretation": _decision_reason(strategy_id, summary, summary.get("decision_gates") or {})}


def _logic_explanation(spec: StrategySpec, candidate: dict[str, Any] | None) -> dict[str, str]:
    candidate = candidate or {}
    return {
        "economic_hypothesis": spec.hypothesis,
        "expected_return_driver": candidate.get("expected_return_driver") or "See screening report for the baseline return driver.",
        "signal_inputs": ", ".join(candidate.get("required_data") or []) or "Daily adjusted OHLCV and cross-sectional eligibility screens.",
        "score_direction": "Higher score -> long; lower score -> short after cross-sectional ranking.",
        "long_leg": f"Top {int(spec.side_fraction * 100)}% ranked names by signal score.",
        "short_leg": f"Bottom {int(spec.side_fraction * 100)}% ranked names by signal score.",
        "rebalance_frequency": f"Every {spec.rebalance_every} trading days.",
        "execution_timing": spec.execution_mode.replace("_", " "),
        "transaction_cost_assumption": f"{spec.buy_bps:g} bps buy / {spec.sell_bps:g} bps sell applied to turnover.",
        "likely_failure_regime": candidate.get("major_implementation_risk") or "See screening report for implementation risks.",
    }


def _ic_decile_packet(path: Path) -> dict[str, Any]:
    frame = _read_csv(path)
    if frame is None or frame.empty:
        return {"available": False}
    values = {str(row["metric"]): float(row["value"]) for _, row in frame.iterrows()}
    deciles = {key: value for key, value in values.items() if key.startswith("decile_")}
    return {
        "available": True,
        "mean_ic": values.get("mean_ic"),
        "deciles": deciles,
        "d1": values.get("decile_1"),
        "d10": values.get("decile_10"),
        "decile_spread": float(values.get("decile_10", 0) - values.get("decile_1", 0)) if "decile_10" in values and "decile_1" in values else None,
        "ic_time_series_available": False,
    }


def _attribution_packet(daily: pd.DataFrame) -> dict[str, Any]:
    required = {"long_contribution", "short_contribution"}
    if not required.issubset(daily.columns):
        return {"available": False, "message": "NOT AVAILABLE IN CURRENT BASELINE"}
    long_total = float(daily["long_contribution"].sum())
    short_total = float(daily["short_contribution"].sum())
    gross_total = float(daily["gross_return"].sum()) if "gross_return" in daily.columns else long_total + short_total
    return {
        "available": True,
        "long_contribution_total": long_total,
        "short_contribution_total": short_total,
        "gross_return_total": gross_total,
        "long_share": float(long_total / gross_total) if gross_total else None,
        "short_share": float(short_total / gross_total) if gross_total else None,
    }


def _limitations(summary: dict[str, Any]) -> list[str]:
    return [
        "Pilot 500 / current-listed survivorship-biased universe.",
        "Incomplete point-in-time universe; no full historical membership reconstruction.",
        "No complete borrow-cost model or market-impact model in the baseline.",
        "No formal factor neutralization in the current factory baseline.",
        "No full walk-forward validation in the current baseline artifacts.",
        "yfinance OHLCV limitations and hypothetical backfill where noted in summary.json.",
        "Historical research evidence is not live performance or shadow PnL.",
        "Missing execution returns are tracked separately and can invalidate a run when exposure thresholds are breached.",
        f"Survivorship flag: {summary.get('survivorship_biased_current_listed_universe', 'unknown')}.",
    ]


def _build_factory_item(
    strategy_id: str,
    factory_root: Path,
    candidate_pool: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    spec = SPEC_BY_ID[strategy_id]
    strategy_dir = factory_root / strategy_id
    summary = _read_json(strategy_dir / "summary.json")
    daily = _read_csv(strategy_dir / "daily_returns.csv")
    if summary is None or daily is None or daily.empty:
        return None
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily.sort_values("date")
    net = pd.Series(daily["net_return"].astype(float).values, index=daily["date"])
    gross = pd.Series(daily["gross_return"].astype(float).values, index=daily["date"])
    turnover = pd.Series(daily["turnover"].astype(float).values, index=daily["date"])
    benchmark = pd.Series(0.0, index=net.index)
    market_returns = pd.DataFrame(index=net.index)
    risk_packet = _risk_packet(net, benchmark, turnover, market_returns)
    candidate = candidate_pool.get(strategy_id, {})
    ic_packet = _ic_decile_packet(strategy_dir / "ic_decile_summary.csv")
    ann_return = _annual_return(net)
    group = _research_group(strategy_id)
    lifecycle = _lifecycle_status(strategy_id, summary)
    return {
        "research_group": group,
        "strategy_id": strategy_id,
        "backtest": {
            "strategy_id": strategy_id,
            "name": spec.name,
            "literature_source": "US equity Strategy Factory baseline",
            "research_source": "strategy_factory_v1",
            "hypothesis": spec.hypothesis,
            "universe": candidate.get("initial_us_equity_universe") or "Pilot 500 US common stocks",
            "rebalance": f"Every {spec.rebalance_every} trading days",
            "signal_summary": candidate.get("security_selection_concept") or spec.hypothesis,
            "failure_modes": candidate.get("major_implementation_risk") or "See screening report.",
            "observations": int(summary.get("observations") or len(daily)),
            "asset_class": "US individual equities",
            "strategy_family": candidate.get("strategy_family") or spec.version,
            "lifecycle_status": lifecycle,
            "allocation_eligible": False,
            "test_period_start": daily["date"].iloc[0].date().isoformat(),
            "test_period_end": daily["date"].iloc[-1].date().isoformat(),
            "latest_data_date": daily["date"].iloc[-1].date().isoformat(),
            "gross_metrics": {
                "cumulative_return": float(summary.get("cumulative_gross_return") or daily["cumulative_gross"].iloc[-1]),
                "annual_return": _annual_return(gross),
            },
            "net_metrics": {
                "cumulative_return": float(summary.get("cumulative_net_return") or daily["cumulative_net"].iloc[-1]),
                "annual_return": ann_return,
                "annual_volatility": float(summary.get("annualized_net_volatility") or risk_packet["summary_statistics"]["annual_volatility"]),
                "sharpe": float(summary.get("net_sharpe") or risk_packet["summary_statistics"]["sharpe"]),
                "max_drawdown": float(summary.get("max_drawdown") or risk_packet["drawdown_behavior"]["max_drawdown"]),
            },
            "turnover": {
                "average_daily_turnover": float(summary.get("average_daily_turnover") or turnover.mean()),
                "annualized_turnover": float((summary.get("average_daily_turnover") or turnover.mean()) * TRADING_DAYS),
                "total_cost_drag": float(summary.get("transaction_cost_sum") or daily["transaction_cost"].sum()),
                "annualized_cost_drag": float(daily["transaction_cost"].mean() * TRADING_DAYS),
            },
            "return_series": {
                "dates": [idx.date().isoformat() for idx in net.index],
                "gross_returns": [float(value) for value in gross.values],
                "net_returns": [float(value) for value in net.values],
            },
            "risk_packet": risk_packet,
            "action": _action_from_summary(strategy_id, summary),
            "factory_research": {
                "mean_ic": summary.get("mean_ic"),
                "decile_spread": summary.get("d10_minus_d1"),
                "ic_packet": ic_packet,
                "attribution": _attribution_packet(daily),
                "logic": _logic_explanation(spec, candidate),
                "limitations": _limitations(summary),
                "decision_reason": _decision_reason(strategy_id, summary, summary.get("decision_gates") or {}),
                "factor_interpretation": FACTOR_INTERPRETATIONS.get(strategy_id, []),
                "screening_report_path": str(strategy_dir / "screening_report.md"),
                "artifacts_present": {
                    name: (strategy_dir / name).exists()
                    for name in (
                        "summary.json",
                        "daily_returns.csv",
                        "positions_summary.csv",
                        "ic_decile_summary.csv",
                        "equity_curve.png",
                        "drawdown.png",
                        "decile_chart.png",
                        "screening_report.md",
                        "missing_execution_returns.csv",
                        "rebalance_audit.csv",
                    )
                },
            },
        },
        "walk_forward": {
            "windows": [],
            "status": "NOT AVAILABLE IN CURRENT BASELINE",
            "number_of_windows": 0,
            "positive_window_rate": 0.0,
            "average_test_sharpe": None,
        },
    }


def _build_strategy_21_item(composite_root: Path, factory_root: Path) -> dict[str, Any] | None:
    summary = _read_json(composite_root / "strategy_21_summary.json")
    daily = _read_csv(composite_root / "strategy_21_daily_returns.csv")
    overlap = _read_json(composite_root / "candidate_overlap_summary.json")
    pairwise = _read_csv(composite_root / "candidate_pairwise_analysis.csv")
    if summary is None or daily is None or daily.empty:
        return None
    daily["date"] = pd.to_datetime(daily["date"])
    daily = daily.sort_values("date")
    net = pd.Series(daily["net_return"].astype(float).values, index=daily["date"])
    turnover = pd.Series(0.0, index=net.index)
    benchmark = pd.Series(0.0, index=net.index)
    risk_packet = _risk_packet(net, benchmark, turnover, pd.DataFrame(index=net.index))
    gross = net.copy()
    members = [
        {"strategy_id": "C2A2_020", "name": C2A2_020_SPEC.name, "weight": 0.5},
        {"strategy_id": "C2B2_004", "name": C2B2_004_SPEC.name, "weight": 0.5},
    ]
    pairwise_rows = []
    if pairwise is not None:
        pairwise_rows = pairwise.to_dict(orient="records")
    return {
        "research_group": "STRATEGY_21",
        "strategy_id": COMPOSITE_ID,
        "backtest": {
            "strategy_id": COMPOSITE_ID,
            "name": "Strategy 21 Research Composite v1",
            "literature_source": "Strategy 21 research composite baseline",
            "research_source": "strategy_factory_v1",
            "hypothesis": "Combine retained US-equity research members with low pairwise overlap after economic de-duplication.",
            "universe": "Composite of retained Strategy Factory members",
            "rebalance": "Static 50% / 50% member weights on overlapping history",
            "signal_summary": "Equal-weight blend of C2A2_020 and C2B2_004 net returns.",
            "failure_modes": "Member overlap, composite concentration, and incomplete shadow/live coverage are monitored separately.",
            "observations": len(daily),
            "asset_class": "US individual equities (research composite)",
            "strategy_family": "research_composite",
            "lifecycle_status": "RESEARCH COMPOSITE",
            "allocation_eligible": False,
            "test_period_start": daily["date"].iloc[0].date().isoformat(),
            "test_period_end": daily["date"].iloc[-1].date().isoformat(),
            "latest_data_date": daily["date"].iloc[-1].date().isoformat(),
            "gross_metrics": {"cumulative_return": float(summary["cumulative_return"]), "annual_return": _annual_return(net)},
            "net_metrics": {
                "cumulative_return": float(summary["cumulative_return"]),
                "annual_return": _annual_return(net),
                "annual_volatility": float(summary["annualized_volatility"]),
                "sharpe": float(summary["sharpe"]),
                "max_drawdown": float(summary["max_drawdown"]),
            },
            "turnover": {
                "average_daily_turnover": None,
                "annualized_turnover": None,
                "total_cost_drag": None,
                "annualized_cost_drag": None,
            },
            "return_series": {
                "dates": [idx.date().isoformat() for idx in net.index],
                "gross_returns": [float(value) for value in gross.values],
                "net_returns": [float(value) for value in net.values],
            },
            "risk_packet": risk_packet,
            "action": {
                "action": "Keep Researching",
                "reason_code": "research_composite",
                "interpretation": "Research/shadow composite only; historical research is separate from current shadow status.",
            },
            "factory_research": {
                "strategy_21": {
                    "members": members,
                    "weights": summary.get("weights") or {"C2A2_020": 0.5, "C2B2_004": 0.5},
                    "component_contribution": summary.get("component_contribution") or {},
                    "component_contribution_share": summary.get("component_contribution_share") or {},
                    "alerts": summary.get("alerts") or {},
                    "pairwise_analysis": pairwise_rows,
                    "overlap_summary": overlap or {},
                    "excluded_members": [{"strategy_id": "C2A2_002", "reason": DECISION_REASONS["C2A2_002"]}],
                    "report_path": str(composite_root / "report.md"),
                },
                "limitations": _limitations({"survivorship_biased_current_listed_universe": True}),
                "decision_reason": "Composite retained for research/shadow monitoring; not allocation approved.",
                "factor_interpretation": [
                    {"label": "Member overlap", "kind": "MEASURED", "detail": "Pairwise correlation and drawdown overlap exported in Strategy 21 artifacts."},
                    {"label": "Concentration alert", "kind": "MEASURED", "detail": "Component contribution share flags when one member exceeds 50% of composite PnL."},
                ],
            },
        },
        "walk_forward": {
            "windows": [],
            "status": "NOT AVAILABLE IN CURRENT BASELINE",
            "number_of_windows": 0,
            "positive_window_rate": 0.0,
            "average_test_sharpe": None,
        },
    }


def build_factory_research_catalog(project_root: str | Path) -> dict[str, Any]:
    root = Path(project_root)
    factory_root = root / "output/research/strategy_factory_v1"
    composite_root = root / "output/research/strategy_21_research_composite_v1"
    candidate_pool = _load_candidate_pool(root)
    results: list[dict[str, Any]] = []
    for strategy_id in FACTORY_STRATEGY_IDS:
        item = _build_factory_item(strategy_id, factory_root, candidate_pool)
        if item:
            results.append(item)
    composite_item = _build_strategy_21_item(composite_root, factory_root)
    if composite_item:
        results.append(composite_item)
    return {
        "source": "strategy_factory_v1",
        "default_strategy_id": DEFAULT_STRATEGY_ID,
        "groups": list(RESEARCH_GROUPS),
        "results": results,
        "results_count": len(results),
    }
