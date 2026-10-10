import json

import pandas as pd

from co2_pipeline.emissions import KIND_COUNTRY
from co2_pipeline.export import (
    app_entities,
    export_all,
    format_number,
    full_csv,
    series_payload,
    value_matrix,
)


def test_format_number():
    assert format_number(None, 5) == "null"
    assert format_number(float("nan"), 5) == "null"
    assert format_number(0.0, 5) == "0"
    assert format_number(12289.036755, 5) == "12289"
    assert format_number(0.0031494123, 4) == "0.003149"
    assert format_number(0.0000123456, 3) == "1.23e-5"
    json.loads("[" + format_number(0.0000123456, 3) + "]")


def test_value_matrix_is_year_major(tidy_frame):
    matrix = value_matrix(tidy_frame, "total", ["AAA", "BBB"], [2000, 2001])
    assert matrix == [[10.0, 0.0], [12.0, None]]


def test_payload_is_valid_json_without_aggregates(tidy_frame):
    countries = tidy_frame[tidy_frame["kind"] == KIND_COUNTRY]
    entities = app_entities(countries, KIND_COUNTRY, {"GGG": "Gamma Republic"})
    payload = json.loads(series_payload(countries, entities, [2000, 2001], 5, 4))
    codes = [e["iso"] for e in payload["entities"]]
    assert codes == ["AAA", "BBB", "GGG"]  # sorted by display name
    assert "WLD" not in codes and "XIA" not in codes
    assert payload["years"] == [2000, 2001]
    assert payload["values"]["total"][1][1] is None  # Beta 2001: missing, not zero
    assert payload["values"]["total"][0][1] == 0  # Beta 2000: true zero
    assert payload["values"]["perCapita"][0][0] == 5
    assert payload["entities"][2]["name"] == "Gamma Republic"


def test_full_csv_keeps_null_and_zero(tidy_frame, tmp_path):
    out = full_csv(tidy_frame, 5, 4)
    path = tmp_path / "out.csv"
    out.to_csv(path, index=False)
    back = pd.read_csv(path)
    beta = back[back["code"] == "BBB"].set_index("year")
    assert beta.loc[2000, "total"] == 0
    assert pd.isna(beta.loc[2001, "total"])


def test_export_all_writes_every_file(tidy_frame, tmp_path):
    topology = {"type": "Topology", "objects": {}, "arcs": []}
    sizes = export_all(tidy_frame, topology, {}, {"version": "test"}, tmp_path, 2000, 5, 4)
    assert set(sizes) == {
        "emissions.json",
        "aggregates.json",
        "countries.topo.json",
        "co2-emissions-test.csv",
    }
    aggregates = json.loads((tmp_path / "aggregates.json").read_text(encoding="utf-8"))
    assert [e["iso"] for e in aggregates["entities"]] == ["XIA", "WLD"]
    assert aggregates["entities"][1]["name"] == "World"
    # The app shows GCP's global per-capita value as the world average.
    assert aggregates["values"]["perCapita"][0][1] == 3
