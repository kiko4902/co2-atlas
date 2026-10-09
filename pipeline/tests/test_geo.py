import pytest

from co2_pipeline.geo import (
    STATUS_DATA,
    STATUS_INCLUDED,
    STATUS_NONE,
    GeoError,
    build_features,
    feature_status,
    to_topology,
)

from .conftest import ne_feature, square


def by_code(features):
    return {f.code: f for f in features}


def test_split_replaces_parent_with_map_units(ne_countries, ne_map_units, config):
    features = by_code(build_features(ne_countries, ne_map_units, config.geo))
    assert {"AAA", "AAO"} <= set(features)
    assert features["AAO"].name == "Alpha Overseas"
    # The metropolitan unit keeps only its own polygon, not the overseas one.
    assert features["AAA"].geometry.area == pytest.approx(1.0)


def test_dissolve_merges_into_target(ne_countries, ne_map_units, config):
    features = by_code(build_features(ne_countries, ne_map_units, config.geo))
    assert "BBS" not in features
    assert features["BBB"].geometry.area == pytest.approx(2.0)
    assert features["BBB"].name == "Beta"


def test_code_override_and_name_override(ne_countries, ne_map_units, config):
    features = by_code(build_features(ne_countries, ne_map_units, config.geo))
    assert features["GGG"].name == "Gamma Republic"


def test_missing_iso_without_override_fails(ne_map_units, config):
    countries = [ne_feature("QQQ", "-99", "Nowhere", square(0, 0))]
    with pytest.raises(GeoError, match="no ISO code"):
        build_features(countries, ne_map_units, config.geo)


def test_missing_map_unit_fails(ne_countries, config):
    with pytest.raises(GeoError, match="Map unit AAX"):
        build_features(ne_countries, [], config.geo)


def test_feature_status():
    included = {"AAO": "AAA", "ZZZ": None}
    assert feature_status("AAA", {"AAA"}, included) == (STATUS_DATA, None)
    assert feature_status("AAO", {"AAA"}, included) == (STATUS_INCLUDED, "AAA")
    assert feature_status("ZZZ", {"AAA"}, included) == (STATUS_NONE, None)
    with pytest.raises(GeoError):
        feature_status("QQQ", {"AAA"}, included)


def test_topology_keeps_every_feature_and_its_properties(ne_countries, ne_map_units, config):
    features = build_features(ne_countries, ne_map_units, config.geo)
    included = {item.code: item.included_in for item in config.geo.no_separate_data}
    topo = to_topology(features, {"AAA", "BBB", "GGG"}, included, 10_000, 0.0)
    geometries = topo["objects"]["countries"]["geometries"]
    props = {g["properties"]["iso"]: g["properties"] for g in geometries}
    assert set(props) == {"AAA", "AAO", "BBB", "GGG", "ZZZ"}
    assert props["AAO"] == {
        "iso": "AAO",
        "name": "Alpha Overseas",
        "status": "included",
        "includedIn": "AAA",
    }
    assert props["ZZZ"]["status"] == "none"
    assert all(g.get("arcs") for g in geometries)
