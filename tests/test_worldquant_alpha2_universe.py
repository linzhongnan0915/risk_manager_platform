"""Unit tests for WorldQuant Alpha #2 US security master builder (Phase 1C.1)."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from src.strategies.worldquant.universe import (
    NASDAQ_LISTED_SOURCE,
    OTHER_LISTED_SOURCE,
    build_security_master,
    build_universe_from_text,
    classify_security,
    filter_common_stock_candidates,
    is_footer_row,
    mark_duplicate_symbols,
    parse_nasdaq_listed_text,
    parse_other_listed_text,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "worldquant_alpha2"


def _load_fixture(name: str) -> str:
    return (FIXTURE_DIR / name).read_text(encoding="utf-8")


def _sample_frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    return (
        parse_nasdaq_listed_text(_load_fixture("nasdaqlisted_sample.txt")),
        parse_other_listed_text(_load_fixture("otherlisted_sample.txt")),
    )


def test_is_footer_row():
    assert is_footer_row("File Creation Time: 0609202614:02|||||||")
    assert not is_footer_row("AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N")


def test_parse_nasdaq_listed_removes_footer_and_preserves_fields():
    frame = parse_nasdaq_listed_text(_load_fixture("nasdaqlisted_sample.txt"))

    assert len(frame) == 10
    assert "File Creation Time" not in frame["symbol_raw"].values
    aapl = frame.loc[frame["symbol_raw"] == "AAPL"].iloc[0]
    assert aapl["security_name"] == "Apple Inc. - Common Stock"
    assert aapl["listing_exchange"] == "NASDAQ"
    assert aapl["source_file"] == NASDAQ_LISTED_SOURCE
    assert aapl["etf_flag"] == "N"
    assert aapl["test_issue_flag"] == "N"
    assert aapl["market_category"] == "Q"
    assert aapl["financial_status"] == "N"
    assert aapl["nasdaq_symbol"] == "AAPL"


def test_parse_other_listed_removes_footer_and_preserves_fields():
    frame = parse_other_listed_text(_load_fixture("otherlisted_sample.txt"))

    assert len(frame) == 9
    agilent = frame.loc[frame["symbol_raw"] == "A"].iloc[0]
    assert agilent["security_name"] == "Agilent Technologies, Inc. Common Stock"
    assert agilent["listing_exchange"] == "NYSE"
    assert agilent["source_file"] == OTHER_LISTED_SOURCE
    assert agilent["cqs_symbol"] == "A"
    assert agilent["nasdaq_symbol"] == "A"


def test_etf_exclusion():
    result = classify_security(
        {
            "symbol_raw": "ZTOP",
            "security_name": "F/m High Yield 100 ETF",
            "etf_flag": "Y",
            "test_issue_flag": "N",
        }
    )
    assert result.classification == "etf_flag"
    assert result.eligible_candidate is False
    assert result.exclusion_reason == "etf_flag"


def test_test_issue_exclusion():
    result = classify_security(
        {
            "symbol_raw": "ZVZZT",
            "security_name": "NASDAQ TEST STOCK",
            "etf_flag": "N",
            "test_issue_flag": "Y",
        }
    )
    assert result.classification == "test_issue"
    assert result.eligible_candidate is False
    assert result.exclusion_reason == "test_issue"


def test_preferred_warrant_and_unit_classification():
    preferred = classify_security(
        {
            "symbol_raw": "BAC-PL",
            "security_name": "Bank of America Corporation Preferred Stock",
            "etf_flag": "N",
            "test_issue_flag": "N",
        }
    )
    warrant = classify_security(
        {
            "symbol_raw": "ACHR-W",
            "security_name": "Archer Aviation Inc. Warrants",
            "etf_flag": "N",
            "test_issue_flag": "N",
        }
    )
    units = classify_security(
        {
            "symbol_raw": "AACBU",
            "security_name": "Artius II Acquisition Inc. - Units",
            "etf_flag": "N",
            "test_issue_flag": "N",
        }
    )
    rights = classify_security(
        {
            "symbol_raw": "AACBR",
            "security_name": "Artius II Acquisition Inc. - Rights",
            "etf_flag": "N",
            "test_issue_flag": "N",
        }
    )

    assert preferred.classification == "preferred_share"
    assert preferred.eligible_candidate is False
    assert warrant.classification == "warrant"
    assert warrant.eligible_candidate is False
    assert units.classification == "units"
    assert units.eligible_candidate is False
    assert rights.classification == "rights"
    assert rights.eligible_candidate is False


def test_adr_tagging_without_automatic_exclusion():
    adr = classify_security(
        {
            "symbol_raw": "ZTO",
            "security_name": (
                "ZTO Express (Cayman) Inc. American Depositary Shares, "
                "each representing one Class A ordinary share."
            ),
            "etf_flag": "N",
            "test_issue_flag": "N",
        }
    )
    assert adr.is_adr is True
    assert adr.classification == "adr_depositary"
    assert adr.eligible_candidate is True
    assert adr.exclusion_reason == ""


def test_ambiguous_security_needs_review():
    ambiguous = classify_security(
        {
            "symbol_raw": "COOP",
            "security_name": "Ambiguous Operating Company Inc.",
            "etf_flag": "N",
            "test_issue_flag": "N",
        }
    )
    assert ambiguous.classification == "needs_review_ambiguous"
    assert ambiguous.eligible_candidate is False
    assert ambiguous.needs_review is True


def test_duplicate_symbol_detection():
    nasdaq_frame, other_frame = _sample_frames()
    master = build_security_master(nasdaq_frame, other_frame)

    dup_rows = master.loc[master["symbol_normalized"] == "DUP"]
    assert len(dup_rows) == 2
    assert dup_rows["duplicate_symbol"].all()

    candidates = filter_common_stock_candidates(master)
    assert "DUP" not in set(candidates["symbol_normalized"])


def test_build_universe_from_text_summary_counts():
    master, candidates, summary = build_universe_from_text(
        _load_fixture("nasdaqlisted_sample.txt"),
        _load_fixture("otherlisted_sample.txt"),
    )

    assert summary["nasdaq_listed_rows"] == 10
    assert summary["other_exchange_rows"] == 9
    assert summary["etf_exclusions"] >= 2
    assert summary["test_issue_exclusions"] >= 2
    assert summary["adr_count"] >= 2
    assert summary["needs_review_count"] >= 1
    assert summary["duplicate_symbol_rows"] == 2
    assert summary["eligible_candidate_count"] == int(master["eligible_candidate"].astype(bool).sum())
    assert len(candidates) == summary["eligible_candidate_count"] - 2

    eligible_symbols = set(candidates["symbol_normalized"])
    assert "AAPL" in eligible_symbols
    assert "A" in eligible_symbols
    assert "ZTO" in eligible_symbols
    assert "ZTOP" not in eligible_symbols
    assert "ZVZZT" not in eligible_symbols
    assert "AACBU" not in eligible_symbols


def test_symbol_raw_preserved_separately_from_normalized():
    nasdaq_frame, _ = _sample_frames()
    row = nasdaq_frame.loc[nasdaq_frame["symbol_raw"] == "BAC-PL"].iloc[0]
    assert row["symbol_raw"] == "BAC-PL"
    assert row["symbol_normalized"] == "BAC-PL"

    marked = mark_duplicate_symbols(
        pd.DataFrame(
            {
                "symbol_raw": ["brk.a", "BRK.A"],
                "symbol_normalized": ["BRK.A", "BRK.A"],
            }
        )
    )
    assert marked["duplicate_symbol"].all()
