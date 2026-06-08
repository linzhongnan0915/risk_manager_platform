import json

import pandas as pd

from src.strategies.strategy_expansion_phase2 import (
    ARCHIVED_STRATEGY_ID,
    CURRENT_DASHBOARD_STRATEGY_IDS,
    REPLACEMENT_CANDIDATE_ID,
    build_universe_proposals,
    diagnose_retired_strategy,
    run_strategy_expansion_phase2,
)
from src.strategies.strategy_expansion_v1 import (
    baseline_net_series_from_payload,
    ensure_literature_baseline,
    run_strategy_expansion_v1,
)


def _write_synthetic_price_panel(path, periods: int = 700) -> None:
    dates = pd.date_range("2022-01-03", periods=periods, freq="B")
    tickers = [
        "SPY",
        "IWM",
        "MDY",
        "EFA",
        "EEM",
        "QUAL",
        "VLUE",
        "IVE",
        "MTUM",
        "USMV",
        "TLT",
        "IEF",
        "HYG",
        "JNK",
        "LQD",
        "GLD",
        "DBC",
        "USO",
        "TIP",
        "UUP",
        "BIL",
        "VIX",
        "XLE",
        "XLF",
        "XLK",
        "XLV",
        "XLI",
        "XLY",
        "XLP",
        "XLU",
        "XLB",
        "XLRE",
        "XLC",
    ]
    rows = []
    for ti, ticker in enumerate(tickers):
        price = 100.0 + ti
        for i, date in enumerate(dates):
            price *= 1.0 + 0.00015 + ((i + ti) % 11 - 5) * 0.0004
            rows.append({"date": date.date().isoformat(), "ticker": ticker, "adj_close": price})
    pd.DataFrame(rows).to_csv(path, index=False)


def test_ensure_literature_baseline_generates_when_missing(tmp_path):
    price_path = tmp_path / "prices.csv"
    literature_path = tmp_path / "literature.json"
    _write_synthetic_price_panel(price_path, periods=700)

    payload = ensure_literature_baseline(literature_path, price_path)

    assert literature_path.exists()
    assert payload.get("generated_during_run") is True
    assert len(payload["results"]) >= 20


def test_correlation_review_never_uses_missing_baseline(tmp_path):
    price_path = tmp_path / "prices.csv"
    literature_path = tmp_path / "literature.json"
    _write_synthetic_price_panel(price_path, periods=700)
    baseline = ensure_literature_baseline(literature_path, price_path)
    baseline_net_series_from_payload(baseline)

    expansion_payload = run_strategy_expansion_v1(price_path=price_path, literature_path=literature_path)

    for item in expansion_payload["results"]:
        corr = item["backtest"]["correlation_vs_existing_strategies"]
        assert corr["status"] in {"complete", "missing_strategy_data"}
        assert "missing_baseline" not in json.dumps(corr)
        if corr["status"] == "complete":
            assert corr["baseline_strategy_count"] >= 19


def test_research_sandbox_has_twenty_non_archived_members():
    canonical = {
        REPLACEMENT_CANDIDATE_ID: {
            "metrics": {
                "net_sharpe": 0.7,
                "max_drawdown": -0.2,
                "annualized_turnover": 4.0,
                "annualized_cost_drag": 0.002,
                "average_oos_sharpe": 0.5,
                "positive_oos_windows": 0.55,
            }
        }
    }
    proposal = build_universe_proposals(canonical, {"results": []}, {"results": []})
    members = proposal["research_sandbox_universe"]["members"]
    assert len(members) == 20
    member_ids = [item["strategy_id"] for item in members]
    assert ARCHIVED_STRATEGY_ID not in member_ids
    assert REPLACEMENT_CANDIDATE_ID in member_ids
    assert all(item["strategy_id"] in CURRENT_DASHBOARD_STRATEGY_IDS or item["strategy_id"].startswith("EXP_") for item in members)


def test_governed_universe_blocks_archived_and_requires_gate_pass_for_replacement():
    passing = {
        REPLACEMENT_CANDIDATE_ID: {
            "metrics": {
                "net_sharpe": 0.7,
                "max_drawdown": -0.2,
                "annualized_turnover": 4.0,
                "annualized_cost_drag": 0.002,
                "average_oos_sharpe": 0.5,
                "positive_oos_windows": 0.55,
            }
        }
    }
    expansion_v1 = {
        "results": [
            {
                "backtest": {
                    "strategy_id": REPLACEMENT_CANDIDATE_ID,
                    "correlation_vs_existing_strategies": {"max_abs_correlation": 0.5},
                }
            }
        ]
    }
    proposal = build_universe_proposals(passing, {"results": []}, expansion_v1)
    governed_ids = [item["strategy_id"] for item in proposal["governed_allocation_universe"]["members"]]
    assert ARCHIVED_STRATEGY_ID not in governed_ids
    assert REPLACEMENT_CANDIDATE_ID in governed_ids
    blocked = proposal["governed_allocation_universe"]["blocked_or_reduce_only"][0]
    assert blocked["strategy_id"] == ARCHIVED_STRATEGY_ID


def test_diagnose_retired_strategy_does_not_retest_negative_gross_alpha():
    item = {
        "backtest": {
            "strategy_id": "EXP_CROSS_ASSET_REVERSAL",
            "name": "Cross-Asset Short-Term Reversal",
            "gross_metrics": {"sharpe": -0.2},
            "net_metrics": {"sharpe": -0.5, "max_drawdown": -0.5},
            "turnover": {"annualized_turnover": 90.0},
            "correlation_vs_existing_strategies": {"max_abs_correlation": 0.3},
        },
        "walk_forward": {"average_test_sharpe": -0.7},
    }
    diag = diagnose_retired_strategy(item)
    assert "negative_gross_alpha" in diag["failure_causes"]
    assert diag["retest_lower_frequency"] is False


def test_phase2_pipeline_runs_on_synthetic_panel(tmp_path):
    price_path = tmp_path / "prices.csv"
    literature_path = tmp_path / "literature.json"
    _write_synthetic_price_panel(price_path, periods=700)
    ensure_literature_baseline(literature_path, price_path)

    payload = run_strategy_expansion_phase2(
        price_path=price_path,
        literature_path=literature_path,
        expansion_v1_path=tmp_path / "missing_v1.json",
    )

    assert payload["phase"] == "strategy_expansion_phase2"
    assert payload["data_provenance"]["ticker_coverage"]["required_count"] > 0
    assert len(payload["canonical_specifications"]) == 3
    assert len(payload["retired_diagnoses"]) == 7
    assert payload["universe_proposal"]["research_sandbox_universe"]["count"] == 20
