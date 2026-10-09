"""Builds the map features from Natural Earth and applies the territory rules.

No source file is edited by hand: splits, dissolves and code overrides are all
declared in config.toml and applied here.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path
from typing import Any

import topojson
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from .config import GeoRules

STATUS_DATA = "data"
STATUS_INCLUDED = "included"
STATUS_NONE = "none"

INVALID_CODES = {"", "-99", None}


class GeoError(RuntimeError):
    pass


@dataclass
class MapFeature:
    code: str
    name: str
    geometry: BaseGeometry
    source: str  # Natural Earth ADM0_A3 / GU_A3 the feature came from


def load_feature_collection(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def _display_name(props: dict[str, Any]) -> str:
    return props.get("NAME_EN") or props.get("NAME") or props.get("ADMIN") or "?"


def _resolve_code(props: dict[str, Any], key: str, rules: GeoRules) -> str:
    code = rules.code_overrides.get(props.get(key, "")) or props.get("ISO_A3_EH")
    if code in INVALID_CODES:
        raise GeoError(
            f"{_display_name(props)} ({key}={props.get(key)}) has no ISO code and no override "
            "in [geo.code_overrides]"
        )
    return code


def build_features(
    countries: list[dict[str, Any]],
    map_units: list[dict[str, Any]],
    rules: GeoRules,
) -> list[MapFeature]:
    """Apply split / dissolve / override rules and return one feature per map code."""
    units_by_gu = {f["properties"]["GU_A3"]: f for f in map_units}
    features: list[MapFeature] = []
    to_dissolve: dict[str, list[BaseGeometry]] = defaultdict(list)

    for feature in countries:
        props = feature["properties"]
        adm0 = props["ADM0_A3"]
        if adm0 in rules.split:
            for gu in rules.split[adm0]:
                unit = units_by_gu.get(gu)
                if unit is None:
                    raise GeoError(f"Map unit {gu} (split of {adm0}) not found")
                unit_props = unit["properties"]
                features.append(
                    MapFeature(
                        code=_resolve_code(unit_props, "GU_A3", rules),
                        name=_display_name(unit_props),
                        geometry=shape(unit["geometry"]),
                        source=gu,
                    )
                )
            continue
        if adm0 in rules.dissolve:
            to_dissolve[rules.dissolve[adm0]].append(shape(feature["geometry"]))
            continue
        features.append(
            MapFeature(
                code=_resolve_code(props, "ADM0_A3", rules),
                name=_display_name(props),
                geometry=shape(feature["geometry"]),
                source=adm0,
            )
        )

    by_code: dict[str, list[MapFeature]] = defaultdict(list)
    for f in features:
        by_code[f.code].append(f)
    for target, geometries in to_dissolve.items():
        targets = by_code.get(target, [])
        if len(targets) != 1:
            raise GeoError(f"Dissolve target {target} matches {len(targets)} features")
        targets[0].geometry = unary_union([targets[0].geometry, *geometries])

    for f in features:
        f.name = rules.names.get(f.code, f.name)
    return features


def feature_status(
    code: str, data_codes: set[str], included: dict[str, str | None]
) -> tuple[str, str | None]:
    if code in data_codes:
        return STATUS_DATA, None
    if code in included:
        target = included[code]
        return (STATUS_INCLUDED, target) if target else (STATUS_NONE, None)
    raise GeoError(f"Feature {code} has no data and is not listed in [[geo.no_separate_data]]")


def orient_for_d3(geometry: BaseGeometry) -> BaseGeometry:
    """Clockwise exterior rings, as d3-geo expects (spherical winding).

    GeoJSON (RFC 7946) and shapely use the opposite convention; d3 would then draw
    each country as "the whole globe except the country".
    """
    if isinstance(geometry, Polygon):
        return orient(geometry, sign=-1.0)
    if isinstance(geometry, MultiPolygon):
        return MultiPolygon([orient(p, sign=-1.0) for p in geometry.geoms])
    raise GeoError(f"Unsupported geometry type {geometry.geom_type}")


def decode_rings(
    topology: dict[str, Any], all_rings: bool = False
) -> dict[str, list[list[list[float]]]]:
    """Decode exterior rings (or all rings, in order) of every polygon in a topology."""
    transform = topology.get("transform")
    arcs: list[list[list[float]]] = []
    for arc in topology["arcs"]:
        points, x, y = [], 0.0, 0.0
        for dx, dy in arc:
            if transform:
                x, y = x + dx, y + dy
                sx, sy = transform["scale"]
                tx, ty = transform["translate"]
                points.append([x * sx + tx, y * sy + ty])
            else:
                points.append([dx, dy])
        arcs.append(points)

    def ring(indexes: list[int]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in indexes:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    rings: dict[str, list[list[list[float]]]] = {}
    for geom in topology["objects"]["countries"]["geometries"]:
        polygons = [geom["arcs"]] if geom["type"] == "Polygon" else geom["arcs"]
        rings[geom["properties"]["iso"]] = [
            ring(r) for polygon in polygons for r in (polygon if all_rings else polygon[:1])
        ]
    return rings


def signed_area(ring: list[list[float]]) -> float:
    """Planar shoelace area; negative for clockwise rings (x east, y north)."""
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in pairwise(ring))


def fix_winding(topology: dict[str, Any]) -> dict[str, Any]:
    """Reverse rings whose orientation the topology builder flipped.

    Happens for enclaves (Lesotho, exclaves of Armenia and Tajikistan) whose whole
    boundary is one arc shared with a neighbour's hole. Exterior rings must be
    clockwise and holes counter-clockwise for d3-geo.
    """
    rings_by_iso = decode_rings(topology, all_rings=True)
    for geom in topology["objects"]["countries"]["geometries"]:
        polygons = [geom["arcs"]] if geom["type"] == "Polygon" else geom["arcs"]
        decoded = rings_by_iso[geom["properties"]["iso"]]
        k = 0
        for polygon in polygons:
            for r, indexes in enumerate(polygon):
                area = signed_area(decoded[k])
                k += 1
                exterior = r == 0
                if (exterior and area > 0) or (not exterior and area < 0):
                    polygon[r] = [~i for i in reversed(indexes)]
    return topology


def counter_clockwise_exteriors(topology: dict[str, Any]) -> list[str]:
    """ISO codes whose exterior rings are not clockwise (would render inverted in d3)."""
    bad = []
    for iso, rings in decode_rings(topology).items():
        if any(signed_area(r) > 0 for r in rings if len(r) >= 4):
            bad.append(iso)
    return sorted(bad)


def to_topology(
    features: list[MapFeature],
    data_codes: set[str],
    included: dict[str, str | None],
    quantization: int,
    simplify_epsilon: float,
) -> dict[str, Any]:
    """Convert features to a quantized, simplified TopoJSON topology."""
    collection = {"type": "FeatureCollection", "features": []}
    for f in sorted(features, key=lambda f: f.code):
        status, target = feature_status(f.code, data_codes, included)
        props: dict[str, Any] = {"iso": f.code, "name": f.name, "status": status}
        if target:
            props["includedIn"] = target
        collection["features"].append(
            {"type": "Feature", "properties": props, "geometry": mapping(orient_for_d3(f.geometry))}
        )

    # Simplifying the shared arcs after building the topology keeps neighbouring borders
    # identical. (The library's `topoquantize`/`prevent_oversimplify` options are avoided:
    # they make the 1:50m build take minutes instead of under a second.)
    topo = topojson.Topology(collection, object_name="countries", prequantize=quantization)
    return fix_winding(json.loads(topo.toposimplify(simplify_epsilon).to_json()))
