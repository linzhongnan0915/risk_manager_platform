from __future__ import annotations

from pathlib import Path

import pytest

from src.reporting.strategy_factory_research_adapter import (
    COMPOSITE_ID,
    DEFAULT_STRATEGY_ID,
    FACTORY_STRATEGY_IDS,
    build_factory_research_catalog,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def catalog() -> dict:
    return build_factory_research_catalog(PROJECT_ROOT)


def test_catalog_contains_all_twelve_factory_strategies_and_composite(catalog: dict) -> None:
    ids = {item["strategy_id"] for item in catalog["results"]}
    assert set(FACTORY_STRATEGY_IDS).issubset(ids)
    assert COMPOSITE_ID in ids
    assert catalog["default_strategy_id"] == DEFAULT_STRATEGY_ID


def test_default_strategy_has_full_research_payload(catalog: dict) -> None:
    item = next(row for row in catalog["results"] if row["strategy_id"] == DEFAULT_STRATEGY_ID)
    backtest = item["backtest"]
    assert backtest["research_source"] == "strategy_factory_v1"
    assert len(backtest["return_series"]["dates"]) > 100
    assert len(backtest["return_series"]["net_returns"]) == len(backtest["return_series"]["dates"])
    assert backtest["risk_packet"]["chart_series"]["drawdown"]
    assert backtest["factory_research"]["ic_packet"]["available"] is True


def test_strategy_21_composite_payload(catalog: dict) -> None:
    item = next(row for row in catalog["results"] if row["strategy_id"] == COMPOSITE_ID)
    s21 = item["backtest"]["factory_research"]["strategy_21"]
    assert s21["weights"]["C2A2_020"] == 0.5
    assert s21["weights"]["C2B2_004"] == 0.5
    assert s21["weights"]["C2A2_002"] == 0.0
    assert item["backtest"]["net_metrics"]["sharpe"] == pytest.approx(0.798, rel=1e-2)


def test_archived_strategy_keeps_factory_metrics_without_legacy_substitution(catalog: dict) -> None:
    item = next(row for row in catalog["results"] if row["strategy_id"] == "C2A2_001")
    assert item["research_group"] == "ARCHIVED_US_EQUITY_RESEARCH"
    assert item["backtest"]["literature_source"].startswith("US equity Strategy Factory")
