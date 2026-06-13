import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.strategies.shadow_live_operations import run_shadow_live

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the accepted ACTIVE shadow-live portfolio incrementally.")
    parser.add_argument("--freeze-date", help="Last date labeled RETROSPECTIVE_PAPER_BACKFILL (YYYY-MM-DD).")
    args = parser.parse_args()
    print(run_shadow_live(ROOT, freeze_date=args.freeze_date))
