"""Minimal long-format OHLCV loader shared by the Strategy Factory."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

OHLCV_COLUMNS = {"date", "ticker", "open", "high", "low", "close", "adj_close", "volume"}


def load_ohlcv_csv(path: str | Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    missing = OHLCV_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"OHLCV frame is missing required columns: {sorted(missing)}")
    frame["date"] = pd.to_datetime(frame["date"]).dt.date.astype(str)
    for column in OHLCV_COLUMNS - {"date", "ticker"}:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").replace([np.inf, -np.inf], np.nan)
    if frame.duplicated(["ticker", "date"]).any():
        raise ValueError("duplicate ticker-date rows found")
    return frame.sort_values(["ticker", "date"]).reset_index(drop=True)


def ohlcv_long_to_panels(
    ohlcv: pd.DataFrame,
    *,
    value_columns: tuple[str, ...] = ("open", "close", "volume", "adj_close"),
) -> dict[str, pd.DataFrame]:
    working = ohlcv.copy()
    working["date"] = pd.to_datetime(working["date"])
    return {
        column: working.pivot(index="date", columns="ticker", values=column).sort_index()
        for column in value_columns
    }
