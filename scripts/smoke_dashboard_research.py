"""Minimal dashboard smoke checks for US-equity research integration."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8765"


def fetch(path: str) -> str:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=10) as response:
        return response.read().decode("utf-8")


def main() -> int:
    errors: list[str] = []
    index = fetch("/index.html")
    if "research_universe.js" not in index or index.find("research_universe.js") > index.find("app.js"):
        errors.append("index.html must load research_universe.js before app.js")
    for script in ("research_universe.js", "app.js"):
        body = fetch(f"/{script}")
        if "ResearchUniverse" in script and "rowFromCatalogItem" in body and "researchWeights()" in body.split("function strategyRows")[0]:
            if "function strategyRows" in body and body.index("rowFromCatalogItem") < body.index("function strategyRows"):
                pass
        if script == "research_universe.js" and "function strategyRows()" in body:
            before_rows = body.split("function strategyRows()")[0]
            if "rowFromCatalogItem" in before_rows and "researchWeights()" in before_rows.split("function rowFromCatalogItem")[1].split("function strategyRows")[0]:
                if "activeUnderlyingIds()" in before_rows.split("function rowFromCatalogItem")[1]:
                    errors.append("research_universe.js recursion: rowFromCatalogItem still depends on activeUnderlyingIds/researchWeights cycle")

    bundle_path = ROOT / "dashboard/data/us_equity_research_bundle.json"
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    research = bundle["factory_strategy_research"]
    arch = research["architecture"]
    active = sum(
        1
        for row in research["results"]
        if row.get("backtest", {}).get("factory_research", {}).get("research_composite_eligible")
        or row.get("backtest", {}).get("factory_research", {}).get("composite_eligible")
    )
    reference = sum(1 for row in research["results"] if row.get("backtest", {}).get("factory_research", {}).get("membership") == "REFERENCE_ONLY")
    repair = sum(1 for row in research["results"] if row.get("backtest", {}).get("factory_research", {}).get("membership") == "REPAIR")
    candidates = sum(1 for row in research["results"] if row.get("backtest", {}).get("factory_research", {}).get("membership") == "RESEARCH_CANDIDATE")
    archived = sum(1 for row in research["results"] if row.get("backtest", {}).get("factory_research", {}).get("membership") == "ARCHIVED")
    composite = sum(1 for row in research["results"] if row.get("strategy_id") == "COMBINED_PORTFOLIO_V1")
    if active < 1:
        errors.append(f"expected at least 1 eligible ACTIVE strategy, found {active}")
    if arch.get("eligible_active_count") != active:
        errors.append("architecture eligible_active_count must match eligible ACTIVE count")
    if arch.get("composite_constituent_count") != active:
        errors.append("architecture composite_constituent_count must match eligible ACTIVE count")
    if composite != 1:
        errors.append(f"expected 1 Combined Portfolio, found {composite}")
    if arch.get("live_allocation_approved") is not False:
        errors.append("architecture live_allocation_approved must be false for research bundle")
    if arch.get("dynamic_membership") is not True:
        errors.append("architecture dynamic_membership must be true")
    if "target_underlying_count" in arch:
        errors.append("architecture must not include fixed target_underlying_count")
    etf_active = [row for row in research["results"] if "ETF" in (row.get("backtest", {}).get("name") or "") and row.get("backtest", {}).get("factory_research", {}).get("composite_eligible")]
    if etf_active:
        errors.append("ETF strategy appears ACTIVE")

    bundle_http = json.loads(fetch("/data/us_equity_research_bundle.json"))
    if bundle_http["factory_strategy_research"]["results_count"] != research["results_count"]:
        errors.append("bundle not served correctly from dashboard/data")

    if errors:
        print("SMOKE FAIL")
        for error in errors:
            print("-", error)
        return 1
    print("SMOKE PASS")
    print(f"ACTIVE={active} REPAIR={repair} CANDIDATE={candidates} REFERENCE={reference} ARCHIVED={archived} COMPOSITE={composite} equal_weight={arch.get('composite_equal_weight'):.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
