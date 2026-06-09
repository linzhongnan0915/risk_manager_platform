"""Build the WorldQuant Alpha #2 US-listed security master and candidate universe."""

from __future__ import annotations

from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.strategies.worldquant.universe import (
    DEFAULT_CANDIDATES_OUTPUT,
    DEFAULT_MASTER_OUTPUT,
    build_universe_from_download,
    format_audit_summary,
    write_universe_outputs,
)


def main() -> None:
    master, candidates, summary = build_universe_from_download()
    master_path, candidates_path = write_universe_outputs(
        master,
        candidates,
        master_path=DEFAULT_MASTER_OUTPUT,
        candidates_path=DEFAULT_CANDIDATES_OUTPUT,
    )
    print(format_audit_summary(summary))
    print(f"Wrote security master: {master_path}")
    print(f"Wrote common-stock candidates: {candidates_path}")


if __name__ == "__main__":
    main()
