"""Validation rules. Any error fails the build; warnings are only printed."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import Config
from .emissions import KIND_COUNTRY
from .geo import MapFeature

# Relative tolerance between GCP per capita and total / population.
PER_CAPITA_TOLERANCE = 0.01


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    features_without_data: list[tuple[str, str, str]] = field(default_factory=list)
    data_without_feature: list[tuple[str, str, str]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        lines = ["Map features without a GCP series:"]
        lines += [f"  {code:<5} {name:<40} {why}" for code, name, why in self.features_without_data]
        lines.append("GCP countries without a map feature:")
        lines += [f"  {code:<5} {name:<40} {why}" for code, name, why in self.data_without_feature]
        if not self.data_without_feature:
            lines.append("  (none)")
        lines += [f"WARNING: {w}" for w in self.warnings]
        lines += [f"ERROR: {e}" for e in self.errors]
        return "\n".join(lines)


def check_aggregates(tidy: pd.DataFrame, config: Config, report: Report) -> None:
    countries = set(tidy.loc[tidy["kind"] == KIND_COUNTRY, "code"])
    leaked = countries & set(config.aggregate_codes)
    if leaked:
        report.errors.append(f"Aggregates classified as countries: {sorted(leaked)}")
    # GCP marks non-country rows with WLD or user-assigned X.. codes; an unknown one
    # means a new aggregate appeared and must be added to gcp.aggregate_codes.
    suspicious = {c for c in countries if c == "WLD" or c.startswith("X")}
    if suspicious:
        report.errors.append(
            f"Unknown aggregate-like codes {sorted(suspicious)}: add them to gcp.aggregate_codes"
        )
    if config.world_code not in set(tidy["code"]):
        report.errors.append(f"World total {config.world_code} not found")


def check_unique_feature_codes(features: list[MapFeature], report: Report) -> None:
    names: dict[str, set[str]] = defaultdict(set)
    for f in features:
        names[f.code].add(f.name)
    counts: dict[str, int] = defaultdict(int)
    for f in features:
        counts[f.code] += 1
    for code, n in counts.items():
        if n > 1:
            detail = sorted(names[code])
            report.errors.append(f"ISO code {code} is used by {n} polygons ({detail})")


def check_matching(
    tidy: pd.DataFrame, features: list[MapFeature], config: Config, report: Report
) -> None:
    country_names = (
        tidy.loc[tidy["kind"] == KIND_COUNTRY, ["code", "name"]]
        .drop_duplicates("code")
        .set_index("code")["name"]
        .to_dict()
    )
    data_codes = set(country_names)
    feature_names = {f.code: f.name for f in features}
    feature_codes = set(feature_names)
    exceptions = config.no_separate_data_by_code
    unmapped = {u.code: u for u in config.unmapped}

    for code in sorted(feature_codes - data_codes):
        item = exceptions.get(code)
        if item is None:
            report.errors.append(
                f"Map feature {code} ({feature_names[code]}) has no GCP data and is not listed "
                "in [[geo.no_separate_data]]"
            )
            continue
        why = f"included in {item.included_in}" if item.included_in else "no separate data"
        report.features_without_data.append((code, feature_names[code], why))

    for code in sorted(data_codes - feature_codes):
        item = unmapped.get(code)
        if item is None:
            report.errors.append(
                f"GCP country {code} ({country_names[code]}) has no map feature and is not "
                "listed in [[gcp.unmapped]]"
            )
            continue
        report.data_without_feature.append((code, country_names[code], item.reason))

    for code in sorted(set(exceptions) & data_codes):
        report.errors.append(
            f"{code} is listed in [[geo.no_separate_data]] but now has GCP data: remove the entry"
        )
    for code in sorted(set(exceptions) - feature_codes):
        report.errors.append(f"{code} is listed in [[geo.no_separate_data]] but is not on the map")
    for item in exceptions.values():
        if item.included_in and item.included_in not in data_codes:
            report.errors.append(
                f"{item.code}: included_in={item.included_in} is not a GCP country"
            )
    for code in sorted(set(unmapped) & feature_codes):
        report.errors.append(f"{code} is listed in [[gcp.unmapped]] but has a map feature")


def check_values(tidy: pd.DataFrame, report: Report) -> None:
    value_cols = ["total", "coal", "oil", "gas", "cement", "flaring", "other"]
    negative = (tidy[value_cols] < 0).sum()
    if negative.any():
        report.errors.append(f"Negative emissions: {negative[negative > 0].to_dict()}")

    rows = tidy[(tidy["kind"] == KIND_COUNTRY) & (tidy["population"] > 0)].dropna(
        subset=["total", "per_capita"]
    )
    implied = rows["total"] * 1e6 / rows["population"]
    with np.errstate(divide="ignore", invalid="ignore"):
        rel = ((implied - rows["per_capita"]).abs() / rows["per_capita"]).where(
            rows["per_capita"] > 0, 0.0
        )
    bad = rows[rel > PER_CAPITA_TOLERANCE]
    if len(bad):
        sample = bad[["code", "year"]].head(5).to_dict("records")
        report.errors.append(
            f"{len(bad)} rows where per capita != total / population (>1%), e.g. {sample}"
        )

    sources = tidy[["coal", "oil", "gas", "cement", "flaring", "other"]].sum(axis=1, min_count=1)
    over = tidy[(sources - tidy["total"]) > 0.01 + 0.001 * tidy["total"]]
    if len(over):
        report.warnings.append(f"{len(over)} rows where the sum of sources exceeds the total")


def validate(tidy: pd.DataFrame, features: list[MapFeature], config: Config) -> Report:
    report = Report()
    check_aggregates(tidy, config, report)
    check_unique_feature_codes(features, report)
    check_matching(tidy, features, config, report)
    check_values(tidy, report)
    return report
