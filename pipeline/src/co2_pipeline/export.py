"""Writes the static files consumed by the web app (schema: pipeline/README.md)."""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

import pandas as pd

from .emissions import KIND_AGGREGATE, KIND_COUNTRY, VALUE_COLUMNS, round_significant

SCHEMA_VERSION = 1

# Exported metric key -> tidy column. camelCase keys because the consumer is JavaScript.
METRICS = {
    "total": "total",
    "coal": "coal",
    "oil": "oil",
    "gas": "gas",
    "cement": "cement",
    "flaring": "flaring",
    "other": "other",
    "perCapita": "per_capita",
}
UNITS = {key: "Mt CO2" for key in METRICS} | {"perCapita": "t CO2 per person"}

AGGREGATE_NAMES = {"WLD": "World"}


def format_number(value: float | None, digits: int) -> str:
    """Compact JSON number with `digits` significant digits; NaN becomes null."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "null"
    if value == 0:
        return "0"
    text = format(value, f".{digits}g")
    if "e" in text:
        mantissa, exponent = text.split("e")
        text = f"{mantissa}e{int(exponent)}"
    return text


def value_matrix(
    frame: pd.DataFrame, column: str, codes: Sequence[str], years: Sequence[int]
) -> list[list[float | None]]:
    """Year-major matrix: result[year_index][entity_index]."""
    pivot = frame.pivot(index="year", columns="code", values=column).reindex(
        index=list(years), columns=list(codes)
    )
    return [[None if pd.isna(v) else float(v) for v in row] for row in pivot.to_numpy()]


def _matrix_json(matrix: Iterable[Iterable[float | None]], digits: int) -> str:
    rows = ("[" + ",".join(format_number(v, digits) for v in row) + "]" for row in matrix)
    return "[" + ",".join(rows) + "]"


def series_payload(
    frame: pd.DataFrame,
    entities: list[dict[str, str]],
    years: Sequence[int],
    digits_mt: int,
    digits_per_capita: int,
    extra: dict[str, Any] | None = None,
) -> str:
    """Serialise the columnar payload (hand-written JSON to keep numbers compact)."""
    codes = [e["iso"] for e in entities]
    header: dict[str, Any] = {
        "schema": SCHEMA_VERSION,
        "years": [int(years[0]), int(years[-1])],
        "units": UNITS,
        "entities": entities,
    }
    if extra:
        header |= extra
    parts = []
    for key, column in METRICS.items():
        digits = digits_per_capita if key == "perCapita" else digits_mt
        parts.append(f'"{key}":' + _matrix_json(value_matrix(frame, column, codes, years), digits))
    head = json.dumps(header, ensure_ascii=False, separators=(",", ":"))
    return head[:-1] + ',"values":{' + ",".join(parts) + "}}"


def app_entities(tidy: pd.DataFrame, kind: str, names: dict[str, str]) -> list[dict[str, str]]:
    rows = tidy.loc[tidy["kind"] == kind, ["code", "name"]].drop_duplicates("code")
    entities = [
        {"iso": code, "name": names.get(code, name)} for code, name in rows.itertuples(index=False)
    ]
    return sorted(entities, key=lambda e: e["name"])


def full_csv(tidy: pd.DataFrame, digits_mt: int, digits_per_capita: int) -> pd.DataFrame:
    out = tidy.copy()
    for col in VALUE_COLUMNS:
        if col == "population":
            continue
        digits = digits_per_capita if col == "per_capita" else digits_mt
        out[col] = round_significant(out[col].to_numpy(), digits)
    out["population"] = out["population"].round(0).astype("Int64")
    return out


def write_text(path: Path, text: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return path.stat().st_size


def export_all(
    tidy: pd.DataFrame,
    topology: dict[str, Any],
    feature_names: dict[str, str],
    source: dict[str, Any],
    out_dir: Path,
    year_min: int,
    digits_mt: int,
    digits_per_capita: int,
) -> dict[str, int]:
    """Write all output files and return their sizes in bytes."""
    year_max = int(tidy["year"].max())
    years = list(range(year_min, year_max + 1))
    app = tidy[tidy["year"].between(year_min, year_max)]
    sizes: dict[str, int] = {}

    countries = app_entities(app, KIND_COUNTRY, feature_names)
    sizes["emissions.json"] = write_text(
        out_dir / "emissions.json",
        series_payload(
            app[app["kind"] == KIND_COUNTRY],
            countries,
            years,
            digits_mt,
            digits_per_capita,
            extra={"source": source},
        ),
    )
    aggregates = app_entities(app, KIND_AGGREGATE, AGGREGATE_NAMES)
    sizes["aggregates.json"] = write_text(
        out_dir / "aggregates.json",
        series_payload(
            app[app["kind"] == KIND_AGGREGATE], aggregates, years, digits_mt, digits_per_capita
        ),
    )
    sizes["countries.topo.json"] = write_text(
        out_dir / "countries.topo.json",
        json.dumps(topology, ensure_ascii=False, separators=(",", ":")),
    )
    csv_name = f"co2-emissions-{source['version']}.csv"
    sizes[csv_name] = write_text(
        out_dir / csv_name,
        full_csv(tidy, digits_mt, digits_per_capita).to_csv(index=False, lineterminator="\n"),
    )
    return sizes
