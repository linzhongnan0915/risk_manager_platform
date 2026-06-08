"""Browser verification for the Risk Manager workstation."""

from __future__ import annotations

import json
import math
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = PROJECT_ROOT / "output" / "browser_verification"
REPORT_PATH = PROJECT_ROOT / "output" / "browser_verification" / "verification_report.json"

TABS = [
  "Portfolio Command Center",
  "Strategy Monitor",
  "Allocation & Rebalance",
  "Risk Factors & Exposure",
  "Correlation & Diversification",
  "Market & Macro Monitor",
  "Backtesting & Research Lab",
  "Strategy Library & Workflow",
  "Daily Risk Report / Decision Log",
]


VERIFY_PORT = 8767
BASE_URL = f"http://127.0.0.1:{VERIFY_PORT}"


def _start_verify_server() -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, str(PROJECT_ROOT / "scripts" / "run_workstation_server.py"), "--port", str(VERIFY_PORT)],
        cwd=str(PROJECT_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _wait_for_server(timeout_seconds: int = 20) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Workstation server did not start on port {VERIFY_PORT}")


def _post_simulate(payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}/api/simulate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed; skipping browser verification")
        return 2

    server_proc = _start_verify_server()
    try:
        _wait_for_server()
        return _run_browser_verification(server_proc, sync_playwright)
    finally:
        server_proc.terminate()
        server_proc.wait(timeout=10)


def _run_browser_verification(server_proc: subprocess.Popen, sync_playwright) -> int:
    artifact = json.loads((PROJECT_ROOT / "output" / "dashboard_artifact.json").read_text(encoding="utf-8"))
    strategies = artifact.get("strategies", [])
    first_allocated = next((row for row in strategies if row.get("current_weight", 0) > 0), strategies[0])
    current_weights = {row["strategy_id"]: row.get("current_weight", 0) for row in strategies}

    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "url": f"{BASE_URL}/dashboard/index.html",
        "tabs": [],
        "console_errors": [],
        "api_checks": {},
        "checks": {},
        "screenshots": [],
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        def capture_console(msg):
            if msg.type != "error":
                return
            text = msg.text or ""
            if "favicon.ico" in text or "/api/" in text:
                return
            report["console_errors"].append(text)

        def capture_bad_response(response):
            if response.status >= 400 and "favicon" not in response.url and "/api/" not in response.url:
                report["console_errors"].append(f"{response.status} {response.url}")

        page.on("console", capture_console)
        page.on("response", capture_bad_response)
        page.goto(report["url"], wait_until="networkidle", timeout=120000)
        page.wait_for_timeout(1500)

        for index, tab in enumerate(TABS, start=1):
            page.click(f'button[data-tab="{tab}"]')
            page.wait_for_timeout(600)
            slug = f"{index:02d}_{tab.lower().replace(' & ', '_').replace(' / ', '_').replace(' ', '_')}"
            shot = SCREENSHOT_DIR / f"{slug}.png"
            page.screenshot(path=str(shot), full_page=True)
            report["screenshots"].append(str(shot.relative_to(PROJECT_ROOT)))
            report["tabs"].append({"tab": tab, "loaded": True, "screenshot": str(shot.name), "viewport": "1920x1080"})

        for viewport in ((1440, 900), (1366, 768), (1920, 1080)):
            page.set_viewport_size({"width": viewport[0], "height": viewport[1]})
            page.click('button[data-tab="Portfolio Command Center"]')
            page.wait_for_timeout(500)
            shot = SCREENSHOT_DIR / f"command_center_{viewport[0]}x{viewport[1]}.png"
            page.screenshot(path=str(shot), full_page=True)
            report["screenshots"].append(str(shot.relative_to(PROJECT_ROOT)))

        page.set_viewport_size({"width": 1440, "height": 900})
        for index, tab in enumerate(TABS, start=1):
            page.click(f'button[data-tab="{tab}"]')
            page.wait_for_timeout(500)
            slug = f"1440x900_{index:02d}_{tab.lower().replace(' & ', '_').replace(' / ', '_').replace(' ', '_')}"
            shot = SCREENSHOT_DIR / f"{slug}.png"
            page.screenshot(path=str(shot), full_page=True)
            report["screenshots"].append(str(shot.relative_to(PROJECT_ROOT)))
            report["tabs"].append({"tab": tab, "loaded": True, "screenshot": str(shot.name), "viewport": "1440x900"})

        page.click('button[data-tab="Strategy Monitor"]')
        page.wait_for_timeout(400)
        page.click("#monitorTable tr[data-strategy]")
        report["checks"]["strategy_row_opens_detail"] = page.locator("#selectedStrategyName").inner_text().strip() != "Select a strategy"

        page.click('button[data-tab="Allocation & Rebalance"]')
        page.wait_for_timeout(800)
        report["checks"]["simulation_completed"] = "simulation completed" in page.locator("#decisionAuthorityStatus").inner_text().lower()

        enabled_input = page.locator("#allocationEditorTable input.weight-input:not([disabled])").first
        original = float(enabled_input.input_value())
        enabled_input.fill(str(max(0, original - 2)))
        page.click("#simulateWeights")
        page.wait_for_timeout(1200)
        report["checks"]["custom_weight_edit_simulates"] = "simulation completed" in page.locator("#decisionAuthorityStatus").inner_text().lower()
        report["checks"]["factor_before_after_visible"] = "→" in page.locator("#simulationChecks").inner_text()

        enabled_input.fill("5")
        page.click("#simulateWeights")
        page.wait_for_timeout(1200)
        report["checks"]["underinvestment_allowed"] = "cash" in page.locator("#simulationChecks").inner_text().lower()

        enabled_input.fill("20")
        page.click("#simulateWeights")
        page.wait_for_timeout(1200)
        sim_text = page.locator("#simulationChecks").inner_text().lower()
        report["checks"]["overinvestment_blocked_in_checks"] = "cannot exceed 100%" in sim_text or "exceed 100%" in sim_text

        if not report["checks"]["overinvestment_blocked_in_checks"]:
            enabled_input.fill("20")
            page.click("#simulateWeights")
            page.wait_for_timeout(1200)
        page.fill("#decisionReviewer", "Risk Manager QA")
        page.fill("#decisionNote", "Attempt approval with hard breach")
        page.click("#approveDecision")
        page.wait_for_timeout(400)
        report["checks"]["hard_breach_blocks_approval"] = "approval blocked" in page.locator("#decisionAuthorityStatus").inner_text().lower()

        page.fill("#decisionReviewer", "")
        page.fill("#decisionNote", "")
        page.click("#approveDecision")
        report["checks"]["reviewer_validation_blocks_empty_decision"] = "required" in page.locator("#decisionAuthorityStatus").inner_text().lower()

        page.click('button[data-tab="Backtesting & Research Lab"]')
        page.wait_for_timeout(400)
        page.click("#literatureStrategyTable tr[data-literature-strategy]")
        page.wait_for_timeout(500)
        if page.locator("#strategyDialog[open]").count():
            page.click("#closeStrategyReview")
            page.wait_for_timeout(200)
        caption = page.locator("#researchLabCaption").inner_text().lower()
        report["checks"]["research_lab_updates_on_selection"] = "|" in caption and "select a literature" not in caption

        page.click('button[data-tab="Daily Risk Report / Decision Log"]')
        page.wait_for_timeout(500)
        page.click("#generateReport")
        page.wait_for_timeout(800)
        report["checks"]["report_generation"] = "daily risk report" in page.locator("#generatedReport").inner_text().lower()

        with page.expect_download() as download_info:
            page.click("#exportJson")
        report["checks"]["json_export"] = download_info.value.suggested_filename.endswith(".json")

        with page.expect_download() as download_info:
            page.click("#exportCsv")
        report["checks"]["csv_export"] = download_info.value.suggested_filename.endswith(".csv")

        disabled_inputs = page.locator("#allocationEditorTable input.weight-input:disabled").count()
        report["checks"]["invalid_allocation_blocked"] = disabled_inputs > 0

        browser.close()

    try:
        under = _post_simulate(
            {
                "current_weights": current_weights,
                "target_weights": {first_allocated["strategy_id"]: 0.05},
                "capital": artifact.get("initial_capital", 1_000_000),
            }
        )
        over = _post_simulate(
            {
                "current_weights": current_weights,
                "target_weights": {first_allocated["strategy_id"]: 1.2},
                "capital": artifact.get("initial_capital", 1_000_000),
            }
        )
        official = artifact.get("rebalance_simulation", {}).get("official_optimizer", {})
        report["api_checks"]["underinvestment_ok"] = (
            under.get("ok", True)
            and under.get("cash_weight", 0) > 0.9
            and any(check.get("metric") == "Cash sleeve" for check in under.get("checks", []))
        )
        report["api_checks"]["overinvestment_breach"] = any(
            check.get("metric") == "Invested weight" and check.get("status") == "breach"
            for check in over.get("checks", [])
        )
        report["api_checks"]["factor_before_not_equal_after"] = (
            official.get("factor_exposure_before", {}) != official.get("factor_exposure_after", {})
        )
        if official.get("metrics_before") and official.get("metrics_after"):
            report["api_checks"]["numeric_metrics_present"] = math.isfinite(
                float(official["metrics_before"].get("portfolio_sharpe", 0))
            )
        else:
            report["api_checks"]["numeric_metrics_present"] = False
    except Exception as exc:
        report["api_checks"]["error"] = str(exc)
        report["api_checks"]["underinvestment_ok"] = False
        report["api_checks"]["overinvestment_breach"] = False
        report["api_checks"]["factor_before_not_equal_after"] = False
        report["api_checks"]["numeric_metrics_present"] = False

    report["checks"]["no_console_errors"] = len(report["console_errors"]) == 0
    unique_tabs = {entry["tab"] for entry in report["tabs"]}
    report["passed"] = all(report["checks"].values()) and all(
        value is True for key, value in report["api_checks"].items() if key != "error"
    ) and len(unique_tabs) == 9
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"checks": report["checks"], "api_checks": report["api_checks"]}, indent=2))
    print(f"Console errors: {len(report['console_errors'])}")
    print(f"Wrote {REPORT_PATH}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
