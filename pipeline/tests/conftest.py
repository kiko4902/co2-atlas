from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from co2_pipeline.config import Config, load_config
from co2_pipeline.emissions import tidy

FIXTURES = Path(__file__).parent / "fixtures"


def square(x: float, y: float, size: float = 1.0) -> dict[str, Any]:
    ring = [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]
    return {"type": "Polygon", "coordinates": [ring]}


def ne_feature(adm0: str, iso: str, name: str, geometry: dict[str, Any], **extra) -> dict:
    props = {"ADM0_A3": adm0, "ISO_A3_EH": iso, "NAME_EN": name, "NAME": name, **extra}
    return {"type": "Feature", "properties": props, "geometry": geometry}


@pytest.fixture
def config() -> Config:
    return load_config(FIXTURES / "config.toml")


@pytest.fixture
def raw_tables() -> dict[str, pd.DataFrame]:
    return {
        "emissions": pd.read_csv(FIXTURES / "emissions.csv"),
        "per_capita": pd.read_csv(FIXTURES / "per_capita.csv"),
        "population": pd.read_csv(FIXTURES / "population.csv"),
    }


@pytest.fixture
def tidy_frame(raw_tables, config) -> pd.DataFrame:
    return tidy(
        raw_tables["emissions"],
        raw_tables["per_capita"],
        raw_tables["population"],
        set(config.aggregate_codes),
    )


@pytest.fixture
def ne_countries() -> list[dict[str, Any]]:
    """Admin-0 layer: Alpha is split, Beta-South dissolves into Beta, Gamma has no ISO."""
    return [
        ne_feature("AAA", "AAA", "Alpha", square(0, 0)),
        ne_feature("BBB", "BBB", "Beta", square(2, 0)),
        ne_feature("BBS", "-99", "Beta South", square(2, -1)),
        ne_feature("GGK", "-99", "Gamma", square(4, 0)),
        ne_feature("ZZZ", "ZZZ", "Zed Island", square(6, 0, 0.5)),
    ]


@pytest.fixture
def ne_map_units() -> list[dict[str, Any]]:
    return [
        ne_feature("AAA", "AAA", "Alpha", square(0, 0), GU_A3="AAX"),
        ne_feature("AAA", "AAO", "Alpha Overseas", square(0, 5, 0.5), GU_A3="AAO"),
    ]
