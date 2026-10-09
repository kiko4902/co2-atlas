"""Loads pipeline/config.toml into typed objects."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = PIPELINE_DIR / "config.toml"


@dataclass(frozen=True)
class NoSeparateData:
    code: str
    reason: str
    included_in: str | None = None


@dataclass(frozen=True)
class Unmapped:
    code: str
    reason: str


@dataclass(frozen=True)
class GeoRules:
    split: dict[str, list[str]] = field(default_factory=dict)
    dissolve: dict[str, str] = field(default_factory=dict)
    code_overrides: dict[str, str] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)
    no_separate_data: list[NoSeparateData] = field(default_factory=list)


@dataclass(frozen=True)
class Config:
    zenodo_record_id: int
    aggregate_codes: list[str]
    world_code: str
    unmapped: list[Unmapped]
    ne_version: str
    ne_base_url: str
    ne_countries_file: str
    ne_countries_sha256: str
    ne_map_units_file: str
    ne_map_units_sha256: str
    output_dir: Path
    app_year_min: int
    sig_digits_mt: int
    sig_digits_per_capita: int
    quantization: int
    simplify_epsilon: float
    max_topology_bytes: int
    geo: GeoRules
    cache_dir: Path

    @property
    def no_separate_data_by_code(self) -> dict[str, NoSeparateData]:
        return {item.code: item for item in self.geo.no_separate_data}


def load_config(path: Path = DEFAULT_CONFIG) -> Config:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    base = path.parent
    gcp, ne, out, topo, geo = (
        raw["gcp"],
        raw["naturalearth"],
        raw["output"],
        raw["topology"],
        raw.get("geo", {}),
    )
    rules = GeoRules(
        split={k: list(v) for k, v in geo.get("split", {}).items()},
        dissolve=dict(geo.get("dissolve", {})),
        code_overrides=dict(geo.get("code_overrides", {})),
        names=dict(geo.get("names", {})),
        no_separate_data=[NoSeparateData(**item) for item in geo.get("no_separate_data", [])],
    )
    return Config(
        zenodo_record_id=int(gcp["zenodo_record_id"]),
        aggregate_codes=list(gcp["aggregate_codes"]),
        world_code=gcp["world_code"],
        unmapped=[Unmapped(**item) for item in gcp.get("unmapped", [])],
        ne_version=ne["version"],
        ne_base_url=ne["base_url"],
        ne_countries_file=ne["countries_file"],
        ne_countries_sha256=ne["countries_sha256"],
        ne_map_units_file=ne["map_units_file"],
        ne_map_units_sha256=ne["map_units_sha256"],
        output_dir=(base / out["dir"]).resolve(),
        app_year_min=int(out["app_year_min"]),
        sig_digits_mt=int(out["sig_digits_mt"]),
        sig_digits_per_capita=int(out["sig_digits_per_capita"]),
        quantization=int(topo["quantization"]),
        simplify_epsilon=float(topo["simplify_epsilon"]),
        max_topology_bytes=int(topo["max_bytes"]),
        geo=rules,
        cache_dir=base / ".cache",
    )
