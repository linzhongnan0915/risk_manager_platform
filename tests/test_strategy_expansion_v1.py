import json

import pandas as pd

from src.strategies.literature_backtests import strategy_prototypes
from src.strategies.strategy_expansion_v1 import (
    EXPANSION_STRATEGY_IDS,
    expansion_strategy_prototypes,
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
        "IVV",
        "VOO",
    ]
    rows = []
    for ti, ticker in enumerate(tickers):
        price = 100.0 + ti
        for i, date in enumerate(dates):
            price *= 1.0 + 0.00015 + ((i + ti) % 11 - 5) * 0.0004
            rows.append({"date": date.date().isoformat(), "ticker": ticker, "adj_close": price})
    pd.DataFrame(rows).to_csv(path, index=False)


def test_expansion_prototypes_cover_ten_candidates():
    prototypes = expansion_strategy_prototypes()
    assert len(prototypes) == 10
    assert [item.strategy_id for item in prototypes] == EXPANSION_STRATEGY_IDS
    assert all(item.expansion_only for item in prototypes)
    assert all(item.auto_eligible is False for item in prototypes)


def test_index_arbitrage_proxy_is_archived_not_auto_eligible():
    prototype = next(item for item in strategy_prototypes() if item.strategy_id == "CAND_INDEX_ARBITRAGE_PROXY")
    assert prototype.archived is True
    assert prototype.auto_eligible is False


def test_strategy_expansion_v1_runs_backtests_and_review(tmp_path):
    price_path = tmp_path / "prices.csv"
    literature_path = tmp_path / "literature.json"
    _write_synthetic_price_panel(price_path)
    literature_path.write_text(
        json.dumps(
            {
                "results": [
                    {
                        "backtest": {
                            "strategy_id": "CAND_WQ_STYLE_ROTATION",
                            "return_series": {
                                "dates": pd.date_range("2022-01-03", periods=700, freq="B").strftime("%Y-%m-%d").tolist(),
                                "net_returns": [0.0001] * 700,
                            },
                        }
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    payload = run_strategy_expansion_v1(price_path=price_path, literature_path=literature_path)

    assert payload["phase"] == "strategy_expansion_v1"
    assert len(payload["results"]) == 10
    assert len(payload["ranked_strategy_review"]) == 11
    assert payload["archived_strategies"]
    first = payload["results"][0]["backtest"]
    assert first["auto_eligible"] is False
    assert first["expansion_only"] is True
    assert "correlation_vs_existing_strategies" in first
    assert first["correlation_vs_existing_strategies"]["status"] == "complete"
    assert payload["results"][0]["walk_forward"]["train_days"] == 504
    assert payload["results"][0]["walk_forward"]["test_days"] == 126
    assert all(row["decision"] in {"Keep", "Research Hold", "Retire"} for row in payload["ranked_strategy_review"])
