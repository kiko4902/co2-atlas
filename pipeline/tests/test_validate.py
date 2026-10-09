import dataclasses

from co2_pipeline.config import NoSeparateData
from co2_pipeline.geo import MapFeature, build_features
from co2_pipeline.validate import validate

from .conftest import ne_feature, square


def features_for(ne_countries, ne_map_units, config):
    return build_features(ne_countries, ne_map_units, config.geo)


def test_fixture_dataset_is_valid(tidy_frame, ne_countries, ne_map_units, config):
    report = validate(tidy_frame, features_for(ne_countries, ne_map_units, config), config)
    assert report.errors == []
    assert ("AAO", "Alpha Overseas", "included in AAA") in report.features_without_data
    assert ("ZZZ", "Zed Island", "no separate data") in report.features_without_data


def test_unlisted_feature_without_data_fails(tidy_frame, ne_countries, ne_map_units, config):
    countries = [*ne_countries, ne_feature("NEW", "NEW", "Newland", square(9, 9))]
    report = validate(tidy_frame, features_for(countries, ne_map_units, config), config)
    assert any("NEW" in e and "not listed" in e for e in report.errors)


def test_country_without_feature_fails(tidy_frame, ne_countries, ne_map_units, config):
    countries = [f for f in ne_countries if f["properties"]["ADM0_A3"] != "GGK"]
    report = validate(tidy_frame, features_for(countries, ne_map_units, config), config)
    assert any("GGG" in e and "no map feature" in e for e in report.errors)


def test_stale_exception_fails(tidy_frame, ne_countries, ne_map_units, config):
    stale = NoSeparateData(code="BBB", reason="was missing once")
    geo = dataclasses.replace(config.geo, no_separate_data=[*config.geo.no_separate_data, stale])
    cfg = dataclasses.replace(config, geo=geo)
    report = validate(tidy_frame, features_for(ne_countries, ne_map_units, cfg), cfg)
    assert any("BBB" in e and "now has GCP data" in e for e in report.errors)


def test_duplicate_iso_with_different_names_fails(tidy_frame, ne_countries, ne_map_units, config):
    features = features_for(ne_countries, ne_map_units, config)
    features.append(MapFeature("BBB", "Beta Islands", features[0].geometry, "BBI"))
    report = validate(tidy_frame, features, config)
    assert any("BBB" in e and "2 polygons" in e for e in report.errors)


def test_unknown_aggregate_code_fails(tidy_frame, ne_countries, ne_map_units, config):
    frame = tidy_frame.copy()
    frame.loc[frame["code"] == "XIA", "kind"] = "country"
    cfg = dataclasses.replace(config, aggregate_codes=["WLD"])
    report = validate(frame, features_for(ne_countries, ne_map_units, cfg), cfg)
    assert any("XIA" in e and "aggregate" in e for e in report.errors)


def test_inconsistent_per_capita_fails(tidy_frame, ne_countries, ne_map_units, config):
    frame = tidy_frame.copy()
    frame.loc[(frame["code"] == "AAA") & (frame["year"] == 2000), "per_capita"] = 50.0
    report = validate(frame, features_for(ne_countries, ne_map_units, config), config)
    assert any("per capita" in e for e in report.errors)
