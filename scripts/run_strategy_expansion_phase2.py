"""Run strategy expansion phase 2 robustness validation and universe proposal."""

from __future__ import annotations

import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.strategies.strategy_expansion_phase2 import (
    render_final_strategy_review,
    run_strategy_expansion_phase2,
)


def main() -> None:
    output_dir = PROJECT_ROOT / "output/strategy_expansion_v1"
    output_dir.mkdir(parents=True, exist_ok=True)
    price_path = PROJECT_ROOT / "data/processed/market_price_history.csv"
    literature_path = PROJECT_ROOT / "output/literature_strategy_backtests.json"

    payload = run_strategy_expansion_phase2(
        price_path=price_path,
        literature_path=literature_path,
        expansion_v1_path=output_dir / "strategy_expansion_v1_backtests.json",
    )

    robustness_path = output_dir / "robustness_results.json"
    review_path = output_dir / "final_strategy_review.md"
    universe_path = output_dir / "final_20_strategy_universe_proposal.json"

    robustness_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    review_path.write_text(
        render_final_strategy_review(
            payload["canonical_specifications"],
            payload["retired_diagnoses"],
            payload["lower_frequency_retests"],
            payload["universe_proposal"],
        ),
        encoding="utf-8",
    )
    universe_path.write_text(
        json.dumps(
            {
                "phase": "strategy_expansion_phase2",
                "data_provenance": payload["data_provenance"],
                "canonical_specifications": payload["canonical_specifications"],
                "universe_proposal": payload["universe_proposal"],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Wrote {robustness_path}")
    print(f"Wrote {review_path}")
    print(f"Wrote {universe_path}")
    sandbox = payload["universe_proposal"]["research_sandbox_universe"]["members"]
    governed = payload["universe_proposal"]["governed_allocation_universe"]["members"]
    print("Research sandbox (20):", ", ".join(item["strategy_id"] for item in sandbox))
    print("Governed allocation:", ", ".join(item["strategy_id"] for item in governed))
    repl = payload["universe_proposal"]["governed_allocation_universe"]["index_arbitrage_replacement"]
    print("Index Arbitrage replacement accepted:", repl["accepted_into_governed_universe"])


if __name__ == "__main__":
    main()
