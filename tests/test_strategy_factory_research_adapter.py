from __future__ import annotations

from pathlib import Path

import pytest

from src.reporting.strategy_factory_research_adapter import (
    COMPOSITE_ID,
    FACTORY_STRATEGY_IDS,
    build_factory_research_catalog,
)
from src.strategies.platform_registry import RAPID_BACKTEST_IDS

PROJECT_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def catalog() -> dict:
    return build_factory_research_catalog(PROJECT_ROOT)


def test_catalog_contains_all_underlying_strategies_and_composite(catalog: dict) -> None:
    ids = [item["strategy_id"] for item in catalog["results"]]
    assert ids == list(RAPID_BACKTEST_IDS) + [COMPOSITE_ID]
    assert set(FACTORY_STRATEGY_IDS) == set(RAPID_BACKTEST_IDS)
    assert catalog["results_count"] == len(RAPID_BACKTEST_IDS) + 1


def test_default_strategy_has_full_research_payload(catalog: dict) -> None:
    item = next(row for row in catalog["results"] if row["strategy_id"] == "C2A2_020")
    backtest = item["backtest"]
    assert len(backtest["return_series"]["dates"]) > 100
    assert backtest["factory_research"]["composite_eligible"] is True


def test_combined_portfolio_uses_only_active_members(catalog: dict) -> None:
    item = next(row for row in catalog["results"] if row["strategy_id"] == COMPOSITE_ID)
    composite = item["backtest"]["factory_research"]["combined_portfolio"]
    active_members = [row for row in catalog["results"] if row["backtest"]["factory_research"].get("composite_eligible")]
    active_count = len(active_members)
    assert composite["N"] == active_count
    assert active_count >= 1
    assert pytest.approx(sum(composite["weights"].values())) == 1.0
    assert all(weight == pytest.approx(1.0 / composite["N"]) for weight in composite["weights"].values())
    assert "C3A1_010" not in composite["constituent_ids"]
    assert item["research_group"] == "COMBINED_PORTFOLIO"
    assert composite.get("target_platform_slots") == 20
    assert pytest.approx(composite.get("target_equal_weight", 0)) == 0.05


def test_reference_strategy_marked_reference_only(catalog: dict) -> None:
    item = next(row for row in catalog["results"] if row["strategy_id"] == "C3A1_010")
    assert item["research_group"] == "REFERENCE_US_EQUITY_RESEARCH"
    assert item["backtest"]["lifecycle_status"] == "REFERENCE ONLY"
    assert item["backtest"]["factory_research"]["composite_eligible"] is False


def test_catalog_architecture_documents_interim_pool(catalog: dict) -> None:
    arch = catalog["architecture"]
    active_members = [row for row in catalog["results"] if row["backtest"]["factory_research"].get("composite_eligible")]
    assert arch["target_underlying_count"] == 20
    assert pytest.approx(arch["target_equal_weight"]) == 0.05
    assert arch["active_retained_count"] == len(active_members)
    assert arch["interim_composite_count"] == len(active_members)
    assert pytest.approx(arch["interim_equal_weight"]) == pytest.approx(1.0 / len(active_members))
