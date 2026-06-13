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
    assert shadow["correlation"]["status"] == "NOT ENOUGH LIVE HISTORY"
    assert shadow["correlation"]["observations"] == 3
    assert shadow["correlation"]["minimum_observations"] == 20
    assert shadow["reconciliation"]["active_sleeves_equal_1_16"] is True
    assert shadow["reconciliation"]["weights_sum_to_one"] is True


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
    ):
        assert marker in app
