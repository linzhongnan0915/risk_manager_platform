"""Active 20-strategy universe registry and governance-derived eligibility."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from src.strategies.literature_backtests import (
    StrategyPrototype,
    load_price_returns,
    run_strategy_backtest,
    run_walk_forward,
    strategy_prototypes,
)
from src.strategies.strategy_expansion_phase2 import CURRENT_DASHBOARD_STRATEGY_IDS
from src.strategies.strategy_expansion_v1 import expansion_strategy_prototypes

GOVERNANCE_RECORDS_PATH = Path("data/config/strategy_governance_records.json")
GOVERNED_BASELINE_PATH = Path("data/config/governed_portfolio_baseline.json")
ARCHIVED_STRATEGY_ID = "CAND_INDEX_ARBITRAGE_PROXY"
REPLACEMENT_STRATEGY_ID = "EXP_EQUITY_BOND_CORR_REGIME"

ACTIVE_STRATEGY_IDS: list[str] = [
    strategy_id
    for strategy_id in CURRENT_DASHBOARD_STRATEGY_IDS
    if strategy_id != ARCHIVED_STRATEGY_ID
] + [REPLACEMENT_STRATEGY_ID]


def load_governance_records(path: str | Path = GOVERNANCE_RECORDS_PATH) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not payload.get("promotions") and not payload.get("archived_strategies"):
        raise ValueError(f"Governance records at {path} contain no promotions or archived entries.")
    return payload


def load_governed_portfolio_baseline(path: str | Path = GOVERNED_BASELINE_PATH) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    weights = payload.get("baseline_current_weights") or {}
    if not weights:
        raise ValueError(f"Governed portfolio baseline at {path} is missing baseline_current_weights.")
    return payload


def governed_current_weights(records: dict[str, Any] | None = None) -> dict[str, float]:
    _ = records
    baseline = load_governed_portfolio_baseline()
    weights = {strategy_id: float(baseline["baseline_current_weights"][strategy_id]) for strategy_id in ACTIVE_STRATEGY_IDS}
    if weights[REPLACEMENT_STRATEGY_ID] != 0.0:
        raise ValueError("Governance baseline requires EXP_EQUITY_BOND_CORR_REGIME current weight to remain 0%.")
    if ARCHIVED_STRATEGY_ID in weights:
        raise ValueError("Archived strategy must not appear in active governed weights.")
    return weights


def governance_promotion(strategy_id: str, records: dict[str, Any] | None = None) -> dict[str, Any] | None:
    records = records or load_governance_records()
    for item in records.get("promotions", []):
        if item.get("strategy_id") == strategy_id:
            return item
    return None


def governance_archive(strategy_id: str, records: dict[str, Any] | None = None) -> dict[str, Any] | None:
    records = records or load_governance_records()
    for item in records.get("archived_strategies", []):
        if item.get("strategy_id") == strategy_id:
            return item
    return None


def is_governance_eligible_unallocated(strategy_id: str, records: dict[str, Any] | None = None) -> bool:
    promotion = governance_promotion(strategy_id, records)
    return bool(promotion and promotion.get("decision") == "eligible_unallocated")


def derive_lifecycle_metadata(
    strategy_id: str,
    current_weight: float,
    *,
    research_status: str,
    research_eligible: bool,
    correlation_blocker: bool,
    records: dict[str, Any] | None = None,
) -> dict[str, Any]:
    records = records or load_governance_records()
    if governance_archive(strategy_id, records):
        return {
            "lifecycle_status": "archived",
            "governed_allocation_allowed": False,
            "research_sandbox_allowed": False,
            "new_positive_weight_allowed": False,
            "reduce_only": False,
            "research_only": False,
            "active_universe_member": False,
        }
    if is_governance_eligible_unallocated(strategy_id, records) and current_weight <= 0:
        promotion = governance_promotion(strategy_id, records)
        return {
            "lifecycle_status": "eligible_unallocated",
            "governed_allocation_allowed": True,
            "research_sandbox_allowed": True,
            "new_positive_weight_allowed": True,
            "reduce_only": False,
            "research_only": False,
            "active_universe_member": True,
            "canonical_specification": promotion.get("canonical_specification") if promotion else None,
        }
    if current_weight > 0:
        under_review = research_status == "breach" or not research_eligible or correlation_blocker
        return {
            "lifecycle_status": "existing_allocation_under_review" if under_review else "existing_allocation",
            "governed_allocation_allowed": True,
            "research_sandbox_allowed": True,
            "new_positive_weight_allowed": not under_review,
            "reduce_only": under_review,
            "research_only": False,
            "active_universe_member": True,
        }
    blocked = research_status == "breach" or not research_eligible or correlation_blocker
    return {
        "lifecycle_status": "research_only_blocked",
        "governed_allocation_allowed": False,
        "research_sandbox_allowed": True,
        "new_positive_weight_allowed": False,
        "reduce_only": False,
        "research_only": True,
        "active_universe_member": strategy_id in ACTIVE_STRATEGY_IDS,
    }


def strategy_lifecycle_metadata(
    strategy_id: str,
    records: dict[str, Any] | None = None,
    *,
    current_weight: float = 0.0,
    research_status: str = "ok",
    research_eligible: bool = True,
    correlation_blocker: bool = False,
) -> dict[str, Any]:
    return derive_lifecycle_metadata(
        strategy_id,
        current_weight,
        research_status=research_status,
        research_eligible=research_eligible,
        correlation_blocker=correlation_blocker,
        records=records,
    )


def _prototype_lookup() -> dict[str, StrategyPrototype]:
    lookup = {item.strategy_id: item for item in strategy_prototypes()}
    for item in expansion_strategy_prototypes():
        lookup[item.strategy_id] = item
    return lookup


def _canonical_spec_for(strategy_id: str, records: dict[str, Any]) -> dict[str, Any] | None:
    promotion = governance_promotion(strategy_id, records)
    if not promotion:
        return None
    return promotion.get("canonical_specification")


def build_canonical_literature_item(
    strategy_id: str,
    returns,
    records: dict[str, Any] | None = None,
) -> dict[str, Any]:
    records = records or load_governance_records()
    prototypes = _prototype_lookup()
    if strategy_id not in prototypes:
        raise KeyError(f"Unknown strategy prototype: {strategy_id}")
    prototype = prototypes[strategy_id]
    spec = _canonical_spec_for(strategy_id, records) or {}
    rebalance_days = int(spec.get("rebalance_days", 1))
    buy_bps = float(spec.get("buy_bps", 5))
    sell_bps = float(spec.get("sell_bps", 5))
    backtest = run_strategy_backtest(
        prototype,
        returns,
        rebalance_days=rebalance_days,
        buy_bps=buy_bps,
        sell_bps=sell_bps,
    )
    walk_forward = run_walk_forward(
        prototype,
        returns,
        rebalance_days=rebalance_days,
        buy_bps=buy_bps,
        sell_bps=sell_bps,
    )
    backtest["governance_lifecycle"] = "eligible_unallocated"
    backtest["canonical_specification"] = spec
    backtest["expansion_only"] = False
    backtest["auto_eligible"] = True
    return {"backtest": backtest, "walk_forward": walk_forward}


def build_active_literature_results(
    literature_payload: dict[str, Any],
    price_path: str | Path = "data/processed/market_price_history.csv",
    records: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records = records or load_governance_records()
    by_id = {
        item["backtest"]["strategy_id"]: item
        for item in literature_payload.get("results", [])
        if item.get("backtest", {}).get("strategy_id")
    }
    _, returns = load_price_returns(price_path)

    active: list[dict[str, Any]] = []
    archived_evidence: list[dict[str, Any]] = []

    if ARCHIVED_STRATEGY_ID in by_id:
        archived_item = deepcopy(by_id[ARCHIVED_STRATEGY_ID])
        archived_item["backtest"]["archived"] = True
        archived_item["backtest"]["auto_eligible"] = False
        archived_item["backtest"]["governance_lifecycle"] = "archived"
        archived_evidence.append(archived_item)

    if REPLACEMENT_STRATEGY_ID not in by_id:
        active.append(build_canonical_literature_item(REPLACEMENT_STRATEGY_ID, returns, records))
    else:
        active.append(deepcopy(by_id[REPLACEMENT_STRATEGY_ID]))

    for strategy_id in ACTIVE_STRATEGY_IDS:
        if strategy_id == REPLACEMENT_STRATEGY_ID:
            continue
        if strategy_id not in by_id:
            raise ValueError(f"Active strategy {strategy_id} missing from literature backtests.")
        active.append(deepcopy(by_id[strategy_id]))

    active.sort(key=lambda item: ACTIVE_STRATEGY_IDS.index(item["backtest"]["strategy_id"]))
    if len(active) != 20:
        raise ValueError(f"Active literature results must contain exactly 20 strategies, found {len(active)}.")
    return active, archived_evidence


def governance_audit_block(records: dict[str, Any] | None = None) -> dict[str, Any]:
    records = records or load_governance_records()
    baseline = load_governed_portfolio_baseline()
    return {
        "source": str(GOVERNANCE_RECORDS_PATH),
        "promotions": records.get("promotions", []),
        "archived_strategies": records.get("archived_strategies", []),
        "active_strategy_ids": list(ACTIVE_STRATEGY_IDS),
        "governed_portfolio_baseline_path": str(GOVERNED_BASELINE_PATH),
        "governed_portfolio_baseline_source": baseline.get("source_branch"),
        "eligibility_derivation": "explicit_manual_governance_records_only",
    }


def lifecycle_summary_counts(strategy_rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in strategy_rows:
        status = row.get("lifecycle_status", "unknown")
        counts[status] = counts.get(status, 0) + 1
    archived = 1
    return {
        "allocated_existing": counts.get("existing_allocation", 0),
        "existing_under_review": counts.get("existing_allocation_under_review", 0),
        "eligible_unallocated": counts.get("eligible_unallocated", 0),
        "research_only_blocked": counts.get("research_only_blocked", 0),
        "archived": archived,
        "active_universe_total": len(strategy_rows),
    }
