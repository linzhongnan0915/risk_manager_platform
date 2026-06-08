"""Load intraday refresh configuration."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG_PATH = Path("data/config/intraday_refresh.yaml")


@lru_cache(maxsize=1)
def load_intraday_config(path: str | Path = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    payload = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    cfg = dict(payload.get("intraday_refresh") or {})
    cfg.setdefault("enabled", True)
    cfg.setdefault("default_interval_minutes", 30)
    cfg.setdefault("allowed_intervals_minutes", [10, 30])
    cfg.setdefault("provider", "yfinance")
    cfg.setdefault("bar_interval_by_refresh", {10: "5m", 30: "15m"})
    cfg.setdefault("timezone", "America/New_York")
    cfg.setdefault("regular_session_only", True)
    cfg.setdefault("stale_after_minutes", 45)
    cfg.setdefault("request_timeout_seconds", 20)
    cfg.setdefault("retry_attempts", 3)
    cfg.setdefault("backoff_seconds", [5, 15, 30])
    cfg.setdefault("min_success_ticker_ratio", 0.6)
    cfg.setdefault("snapshot_dir", "output/intraday_snapshots")
    cfg.setdefault("latest_pointer_path", "output/intraday_latest.json")
    cfg.setdefault("status_path", "output/intraday_refresh_status.json")
    cfg.setdefault("lock_path", "output/intraday_refresh.lock")
    cfg.setdefault("market_holidays", [])
    # Normalize bar interval map keys to int minutes.
    raw_map = cfg.get("bar_interval_by_refresh") or {}
    cfg["bar_interval_by_refresh"] = {int(k): str(v) for k, v in raw_map.items()}
    cfg["allowed_intervals_minutes"] = [int(v) for v in cfg.get("allowed_intervals_minutes") or [10, 30]]
    cfg["default_interval_minutes"] = int(cfg.get("default_interval_minutes") or 30)
    return cfg


def bar_interval_for_refresh(config: dict[str, Any], interval_minutes: int | None = None) -> str:
    minutes = int(interval_minutes or config.get("default_interval_minutes") or 30)
    mapping = config.get("bar_interval_by_refresh") or {}
    if minutes not in mapping:
        allowed = sorted(mapping.keys())
        if not allowed:
            return "15m"
        minutes = min(allowed, key=lambda value: abs(value - minutes))
    return str(mapping[minutes])
