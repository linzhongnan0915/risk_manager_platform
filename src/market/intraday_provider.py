"""Intraday yfinance provider adapter for research proxy bars."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

from src.market.intraday_config import load_intraday_config


def fetch_intraday_bars(
    tickers: list[str],
    *,
    bar_interval: str,
    timeout_seconds: int | None = None,
    retry_attempts: int | None = None,
    backoff_seconds: list[int] | None = None,
    target_timezone: str = "America/New_York",
) -> dict[str, Any]:
    """Fetch intraday proxy bars for the given tickers.

    Returns normalized rows plus provider metadata. Does not mutate snapshots.
    """
    cfg = load_intraday_config()
    timeout_seconds = int(timeout_seconds or cfg.get("request_timeout_seconds") or 20)
    retry_attempts = int(retry_attempts or cfg.get("retry_attempts") or 3)
    backoff_seconds = list(backoff_seconds or cfg.get("backoff_seconds") or [5, 15, 30])
    unique = sorted({ticker for ticker in tickers if ticker})
    if not unique:
        raise ValueError("no tickers requested for intraday fetch")

    last_error: Exception | None = None
    raw = pd.DataFrame()
    for attempt in range(retry_attempts):
        try:
            raw = yf.download(
                tickers=unique,
                period="1d",
                interval=bar_interval,
                auto_adjust=False,
                progress=False,
                group_by="ticker",
                threads=True,
                timeout=timeout_seconds,
            )
            if raw.empty:
                raise ValueError("yfinance returned empty intraday panel")
            break
        except Exception as exc:  # pragma: no cover - retried in tests via monkeypatch
            last_error = exc
            if attempt + 1 >= retry_attempts:
                raise
            time.sleep(backoff_seconds[min(attempt, len(backoff_seconds) - 1)])
    if raw.empty:
        raise ValueError(str(last_error or "intraday fetch failed"))

    rows, missing, stale = _normalize_intraday_panel(
        raw,
        unique,
        bar_interval=bar_interval,
        target_timezone=target_timezone,
        stale_after_minutes=int(cfg.get("stale_after_minutes") or 45),
    )
    latest_ts = max((row["observation_ts_et"] for row in rows), default=None)
    return {
        "provider": "yfinance",
        "bar_interval": bar_interval,
        "requested_tickers": unique,
        "rows": rows,
        "missing_tickers": missing,
        "stale_tickers": stale,
        "ticker_count_requested": len(unique),
        "ticker_count_successful": len({row["source_ticker"] for row in rows}),
        "latest_observation_ts_et": latest_ts,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "incomplete_bar_label": cfg.get("incomplete_bar_label") or "incomplete_current_bar",
    }


def _normalize_intraday_panel(
    data: pd.DataFrame,
    tickers: list[str],
    *,
    bar_interval: str,
    target_timezone: str,
    stale_after_minutes: int,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    tz = ZoneInfo(target_timezone)
    now_et = datetime.now(tz=ZoneInfo("UTC")).astimezone(tz)
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    multi = isinstance(data.columns, pd.MultiIndex)
    successful: set[str] = set()

    for ticker in tickers:
        if multi:
            if ticker not in data.columns.get_level_values(0):
                continue
            frame = data[ticker].copy()
        else:
            frame = data.copy()
        frame = frame.reset_index()
        time_col = next((name for name in ("Datetime", "Date", "index") if name in frame.columns), frame.columns[0])
        for _, row in frame.iterrows():
            close = row.get("Close")
            if pd.isna(close):
                continue
            ts = pd.to_datetime(row[time_col])
            if ts.tzinfo is None:
                ts = ts.tz_localize("UTC")
            ts_et = ts.astimezone(tz)
            key = (ticker, ts_et.isoformat())
            if key in seen:
                continue
            seen.add(key)
            open_px = _float(row.get("Open"))
            close_px = _float(close)
            intraday_return = None
            if open_px and open_px != 0:
                intraday_return = close_px / open_px - 1.0
            rows.append(
                {
                    "source_ticker": ticker,
                    "observation_ts_et": ts_et.isoformat(),
                    "session_date": ts_et.date().isoformat(),
                    "open": open_px,
                    "high": _float(row.get("High")),
                    "low": _float(row.get("Low")),
                    "close": close_px,
                    "volume": _float(row.get("Volume")),
                    "bar_interval": bar_interval,
                    "intraday_return_from_open": intraday_return,
                    "timezone": target_timezone,
                }
            )
            successful.add(ticker)

    missing = [ticker for ticker in tickers if ticker not in successful]
    stale: list[str] = []
    if rows:
        latest_by_ticker: dict[str, datetime] = {}
        for row in rows:
            ticker = row["source_ticker"]
            ts = datetime.fromisoformat(row["observation_ts_et"])
            latest_by_ticker[ticker] = max(latest_by_ticker.get(ticker, ts), ts)
        for ticker, ts in latest_by_ticker.items():
            age_minutes = (now_et - ts).total_seconds() / 60.0
            if age_minutes > stale_after_minutes:
                stale.append(ticker)
    rows.sort(key=lambda item: (item["source_ticker"], item["observation_ts_et"]))
    return rows, missing, stale


def latest_bar_by_ticker(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        ticker = row["source_ticker"]
        if ticker not in latest or row["observation_ts_et"] > latest[ticker]["observation_ts_et"]:
            latest[ticker] = row
    return latest


def _float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)
