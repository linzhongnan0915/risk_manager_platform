import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_shadow_bundle_dashboard_contract():
    bundle = json.loads((ROOT / "dashboard/data/shadow_live_bundle.json").read_text(encoding="utf-8"))
    shadow = bundle["shadow_live"]
    assert bundle["live_capital_percent"] == 0
    assert bundle["live_allocation_approved"] is False
    assert bundle["execution_enabled"] is False
    assert len(shadow["strategy_summary"]) == 16
    assert shadow["runner_mode"] == "RAW DATA SIGNAL RUNNER"
    assert shadow["accepted_series_historical_reference_only"] is True
    assert shadow["configured_strategy_count"] == shadow["successful_strategy_count"] == 16
    assert shadow["partial_strategy_count"] == shadow["unavailable_strategy_count"] == 0
    assert shadow["entry_eligibility_universe_size"] == 229
    assert shadow["operational_pricing_universe_size"] == 301
    assert shadow["segments"]["transition_nav"] > 1_000_000
    assert shadow["correlation"]["status"] == "NOT ENOUGH LIVE HISTORY"
    assert shadow["correlation"]["observations"] < 20
    assert shadow["correlation"]["minimum_observations"] == 20
    assert shadow["reconciliation"]["active_sleeves_equal_1_16"] is True
    assert shadow["reconciliation"]["trade_costs_equal_strategy_ledger_costs"] is True


def test_dashboard_separates_shadow_live_from_research():
    index = (ROOT / "dashboard/index.html").read_text(encoding="utf-8")
    app = (ROOT / "dashboard/app.js").read_text(encoding="utf-8")
    for marker in (
        "Shadow-Live Pipeline",
        "Shadow-Live Simulated Trade Log",
        "Shadow-Live Correlation",
        "Separate From Research Backtest",
        "shadowTradeDateFromFilter",
        "shadowTradeDateToFilter",
        "shadowTradeStrategyFilter",
        "shadowTradeTickerFilter",
        "shadowTradeActionFilter",
    ):
        assert marker in index
    for marker in (
        "loadShadowLiveBundle",
        "mergeShadowLiveBundle",
        "renderShadowOperationalPanels",
        "renderResearchLabShadowDetail",
        "Research and shadow-live returns are not mixed.",
        "NO LIVE FILL",
        "RAW DATA SIGNAL RUNNER",
        "accepted-series historical reference only",
    ):
        assert marker in app
