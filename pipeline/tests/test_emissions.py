import math

import numpy as np
import pytest

from co2_pipeline.emissions import (
    KIND_AGGREGATE,
    KIND_COUNTRY,
    KIND_HISTORICAL,
    SchemaError,
    historical_code,
    round_significant,
    tidy,
)


def row(frame, code, year):
    match = frame[(frame["code"] == code) & (frame["year"] == year)]
    assert len(match) == 1
    return match.iloc[0]


def test_aggregates_are_separated_from_countries(tidy_frame):
    kinds = tidy_frame.drop_duplicates("code").set_index("code")["kind"].to_dict()
    assert kinds["WLD"] == KIND_AGGREGATE
    assert kinds["XIA"] == KIND_AGGREGATE
    assert kinds["AAA"] == KIND_COUNTRY
    assert kinds["BBB"] == KIND_COUNTRY


def test_zero_and_missing_are_kept_apart(tidy_frame):
    assert row(tidy_frame, "BBB", 2000)["total"] == 0
    assert math.isnan(row(tidy_frame, "BBB", 2001)["total"])


def test_empty_other_stays_null(tidy_frame):
    assert math.isnan(row(tidy_frame, "AAA", 2000)["other"])
    assert row(tidy_frame, "GGG", 2000)["other"] == pytest.approx(0.2)


def test_historical_entities_get_a_flagged_code(tidy_frame):
    old = tidy_frame[tidy_frame["name"] == "Old Empire"]
    assert set(old["kind"]) == {KIND_HISTORICAL}
    assert set(old["code"]) == {"HIST-old-empire"}
    assert row(tidy_frame, "HIST-old-empire", 2001)["total"] == 0


def test_per_capita_comes_from_the_per_capita_file(tidy_frame):
    # The 'Per Capita' column of the MtCO2 file is deliberately wrong (999) in the fixture.
    assert row(tidy_frame, "AAA", 2000)["per_capita"] == pytest.approx(5.0)
    assert row(tidy_frame, "AAA", 2000)["population"] == 2_000_000


def test_missing_column_raises(raw_tables, config):
    broken = raw_tables["emissions"].drop(columns=["Coal"])
    with pytest.raises(SchemaError, match="Coal"):
        tidy(broken, raw_tables["per_capita"], raw_tables["population"], {"WLD"})


def test_duplicate_rows_raise(raw_tables):
    doubled = raw_tables["emissions"].iloc[[0, 0]]
    with pytest.raises(SchemaError, match="Duplicate"):
        tidy(doubled, raw_tables["per_capita"], raw_tables["population"], {"WLD"})


def test_historical_code_is_ascii_slug():
    assert historical_code("Pacific Islands (Palau)") == "HIST-pacific-islands-palau"
    assert historical_code("Réunion") == "HIST-reunion"


def test_round_significant_keeps_zero_and_nan():
    values = np.array([12289.036755, 0.0031494123, 0.0, np.nan, -1.23456])
    out = round_significant(values, 3)
    assert out[0] == 12300
    assert out[1] == pytest.approx(0.00315)
    assert out[2] == 0
    assert math.isnan(out[3])
    assert out[4] == pytest.approx(-1.23)
