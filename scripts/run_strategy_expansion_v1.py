"""Run strategy expansion v1 backtests and write ranked research review."""

from __future__ import annotations

import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.strategies.strategy_expansion_v1 import EXPANSION_STRATEGY_IDS, run_strategy_expansion_v1


def _render_review_markdown(payload: dict) -> str:
    lines = [
        "# Strategy Expansion V1 Review",
        "",
        f"- As of: {payload['as_of']}",
        f"- Cost assumption: {payload['cost_assumption']}",
        f"- Walk-forward: {payload['walk_forward_design']['train_days']} train / {payload['walk_forward_design']['test_days']} OOS",
        f"- Allocation policy: {payload['allocation_policy']}",
        "",
        "| Rank | Strategy | Decision | Net Sharpe | Ann Return | Max DD | Turnover | Cost Drag | Avg OOS Sharpe | +OOS Windows | Reason |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for index, row in enumerate(payload["ranked_strategy_review"], start=1):
        lines.append(
            f"| {index} | {row['name']} | {row['decision']} | {row['net_sharpe']:.2f} | "
            f"{row['annualized_return']:.2%} | {row['max_drawdown']:.2%} | {row['annualized_turnover']:.1f} | "
            f"{row['annualized_cost_drag']:.2%} | {row['average_oos_sharpe']:.2f} | {row['positive_oos_windows']:.0%} | {row['reason']} |"
        )
    lines.extend(["", "## Notes", "", "- Expansion candidates remain research-only (`auto_eligible=False`).", "- Index Arbitrage Proxy is archived; historical evidence is retained separately.", ""])
    return "\n".join(lines)


def main() -> None:
    price_path = PROJECT_ROOT / "data/processed/market_price_history.csv"
    literature_path = PROJECT_ROOT / "output/literature_strategy_backtests.json"
    output_dir = PROJECT_ROOT / "output/strategy_expansion_v1"
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = run_strategy_expansion_v1(price_path=price_path, literature_path=literature_path)
    json_path = output_dir / "strategy_expansion_v1_backtests.json"
    review_path = output_dir / "strategy_expansion_v1_review.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    review_path.write_text(_render_review_markdown(payload), encoding="utf-8")

    print(f"Wrote {json_path}")
    print(f"Wrote {review_path}")
    for row in payload["ranked_strategy_review"]:
        if row["strategy_id"] in EXPANSION_STRATEGY_IDS or row.get("archived"):
            print(
                f"{row['strategy_id']}: decision={row['decision']}, sharpe={row['net_sharpe']:.2f}, "
                f"avg_oos={row['average_oos_sharpe']:.2f}"
            )


if __name__ == "__main__":
    main()
