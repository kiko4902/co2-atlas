"""Loads and cleans the GCP fossil CO2 tables into one tidy frame.

Conventions kept from the source data:
- a missing value (empty cell, "NODATA" in GCP terms) stays NaN and is exported as null;
- a true zero stays 0. The two are never merged.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

SOURCES = ["Coal", "Oil", "Gas", "Cement", "Flaring", "Other"]
ISO_COL = "ISO 3166-1 alpha-3"

# Tidy output columns (snake_case) in export order.
VALUE_COLUMNS = [
    "total",
    "coal",
    "oil",
    "gas",
    "cement",
    "flaring",
    "other",
    "per_capita",
    "population",
]

KIND_COUNTRY = "country"
KIND_AGGREGATE = "aggregate"
KIND_HISTORICAL = "historical"

REQUIRED_COLUMNS = {
    "emissions": {"Country", ISO_COL, "Year", "Total", *SOURCES},
    "per_capita": {"Country", ISO_COL, "Year", "Total"},
    "population": {"ISO3", "Year", "Population"},
}


class SchemaError(RuntimeError):
    pass


def check_columns(frame: pd.DataFrame, role: str) -> None:
    missing = REQUIRED_COLUMNS[role] - set(frame.columns)
    if missing:
        raise SchemaError(f"{role} file is missing columns: {sorted(missing)}")


def historical_code(name: str) -> str:
    """Stable identifier for GCP rows without an ISO code (e.g. 'Kuwaiti Oil Fires')."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return f"HIST-{slug}"


def classify(iso: str | float, aggregate_codes: set[str]) -> str:
    if not isinstance(iso, str) or iso == "":
        return KIND_HISTORICAL
    if iso in aggregate_codes:
        return KIND_AGGREGATE
    return KIND_COUNTRY


def tidy(
    emissions: pd.DataFrame,
    per_capita: pd.DataFrame,
    population: pd.DataFrame,
    aggregate_codes: set[str],
) -> pd.DataFrame:
    """Combine the three GCP tables into one row per (entity, year)."""
    check_columns(emissions, "emissions")
    check_columns(per_capita, "per_capita")
    check_columns(population, "population")

    em = emissions.copy()
    em["kind"] = [classify(iso, aggregate_codes) for iso in em[ISO_COL]]
    em["code"] = [
        iso if kind != KIND_HISTORICAL else historical_code(name)
        for iso, name, kind in zip(em[ISO_COL], em["Country"], em["kind"], strict=True)
    ]
    if em.duplicated(["code", "Year"]).any():
        dupes = em.loc[em.duplicated(["code", "Year"], keep=False), ["code", "Year"]]
        raise SchemaError(f"Duplicate (code, year) rows: {dupes.head().to_dict('records')}")

    # Per capita comes from the dedicated per-capita file; the 'Per Capita' column of the
    # MtCO2 file has known errors before 1950 (see DECISIONS.md, D0).
    pc = per_capita[["Country", "Year", "Total"]].rename(columns={"Total": "per_capita"})
    out = em.merge(pc, on=["Country", "Year"], how="left", validate="one_to_one")

    pop = population[["ISO3", "Year", "Population"]].rename(
        columns={"ISO3": "code", "Population": "population"}
    )
    out = out.merge(pop, on=["code", "Year"], how="left", validate="many_to_one")

    out = out.rename(columns={"Country": "name", "Year": "year", "Total": "total"})
    out = out.rename(columns={s: s.lower() for s in SOURCES})
    out["year"] = out["year"].astype(int)
    for col in VALUE_COLUMNS:
        out[col] = pd.to_numeric(out[col], errors="raise").astype(float)
    columns = ["code", "name", "kind", "year", *VALUE_COLUMNS]
    return out[columns].sort_values(["kind", "code", "year"]).reset_index(drop=True)


def load_tidy(files: dict[str, Path], aggregate_codes: set[str]) -> pd.DataFrame:
    return tidy(
        pd.read_csv(files["emissions"]),
        pd.read_csv(files["per_capita"]),
        pd.read_csv(files["population"]),
        aggregate_codes,
    )


def round_significant(values: np.ndarray, digits: int) -> np.ndarray:
    """Round to `digits` significant digits, keeping NaN and 0 untouched."""
    values = np.asarray(values, dtype=float)
    out = values.copy()
    mask = np.isfinite(values) & (values != 0)
    magnitude = np.floor(np.log10(np.abs(values[mask])))
    factor = 10.0 ** (digits - 1 - magnitude)
    out[mask] = np.round(values[mask] * factor) / factor
    return out
