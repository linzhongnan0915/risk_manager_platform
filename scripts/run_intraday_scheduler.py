"""Optional daemon to run scheduled intraday proxy refresh."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.market.intraday_config import load_intraday_config
from src.market.intraday_refresh_service import run_intraday_refresh


def main(interval_minutes: int | None = None, once: bool = False) -> None:
    cfg = load_intraday_config()
    interval = int(interval_minutes or cfg.get("default_interval_minutes") or 30)
    print(f"Intraday scheduler started · cadence={interval}m · provider={cfg.get('provider')}")
    while True:
        if cfg.get("enabled", True):
            result = run_intraday_refresh(interval_minutes=interval, force=False)
            state = "skipped" if result.get("skipped") else ("ok" if result.get("ok") else "failed")
            print(
                f"[{state}] snapshot={result.get('snapshot_id')} "
                f"market={result.get('market_status')} "
                f"error={result.get('error') or result.get('reason') or ''}"
            )
        if once:
            break
        time.sleep(interval * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run intraday proxy refresh scheduler.")
    parser.add_argument("--interval-minutes", type=int, default=None, help="10 or 30 minute cadence.")
    parser.add_argument("--once", action="store_true", help="Run one scheduled attempt then exit.")
    args = parser.parse_args()
    main(interval_minutes=args.interval_minutes, once=args.once)
