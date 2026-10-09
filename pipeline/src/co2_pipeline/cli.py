"""Command line entry point: `uv run co2-pipeline build`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import DEFAULT_CONFIG, load_config
from .download import fetch_gcp_release, fetch_natural_earth, file_digest
from .emissions import KIND_COUNTRY, load_tidy
from .export import export_all, write_text
from .geo import (
    build_features,
    counter_clockwise_exteriors,
    load_feature_collection,
    to_topology,
)
from .validate import validate

DATASET_TITLE = "The Global Carbon Project's fossil CO2 emissions dataset"
DATASET_AUTHORS = "Andrew, R. M. and Peters, G. P."


def build(config_path: Path, offline: bool) -> int:
    config = load_config(config_path)
    print(f"Zenodo record {config.zenodo_record_id}, Natural Earth {config.ne_version}")
    release = fetch_gcp_release(config, offline=offline)
    ne_files = fetch_natural_earth(config, offline=offline)
    print(f"GCP release {release.version} ({release.publication_date}), DOI {release.doi}")

    tidy = load_tidy(release.files, set(config.aggregate_codes))
    features = build_features(
        load_feature_collection(ne_files["countries"]),
        load_feature_collection(ne_files["map_units"]),
        config.geo,
    )

    report = validate(tidy, features, config)
    print(report.render())
    if not report.ok:
        print(f"Validation failed with {len(report.errors)} error(s).", file=sys.stderr)
        return 1

    data_codes = set(tidy.loc[tidy["kind"] == KIND_COUNTRY, "code"])
    included = {item.code: item.included_in for item in config.geo.no_separate_data}
    topology = to_topology(
        features, data_codes, included, config.quantization, config.simplify_epsilon
    )

    inverted = counter_clockwise_exteriors(topology)
    if inverted:
        print(f"Exterior rings not clockwise (would render inverted): {inverted}", file=sys.stderr)
        return 1

    source = {
        "title": DATASET_TITLE,
        "authors": DATASET_AUTHORS,
        "version": release.version,
        "published": release.publication_date,
        "doi": release.doi,
        "zenodoRecord": release.record_id,
        "license": "CC BY 4.0",
        "naturalEarth": f"Natural Earth {config.ne_version} (1:50m, public domain)",
    }
    out_dir = config.output_dir
    for stale in out_dir.glob("co2-emissions-*.csv"):
        stale.unlink()
    sizes = export_all(
        tidy,
        topology,
        {f.code: f.name for f in features},
        source,
        out_dir,
        config.app_year_min,
        config.sig_digits_mt,
        config.sig_digits_per_capita,
    )

    topo_size = sizes["countries.topo.json"]
    if topo_size > config.max_topology_bytes:
        print(
            f"countries.topo.json is {topo_size} bytes (limit {config.max_topology_bytes})",
            file=sys.stderr,
        )
        return 1

    manifest = {
        "source": source,
        "inputs": {
            path.name: f"md5:{file_digest(path, 'md5')}"
            for path in [*release.files.values(), *ne_files.values()]
        },
        "outputs": dict(sorted(sizes.items())),
        "years": [int(tidy["year"].min()), int(tidy["year"].max())],
        "appYears": [config.app_year_min, int(tidy["year"].max())],
        "countries": len(data_codes),
        "mapFeatures": len(features),
        "featuresWithoutData": [
            {"code": c, "name": n, "note": why} for c, n, why in report.features_without_data
        ],
    }
    write_text(out_dir / "manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    for name, size in sorted(sizes.items()):
        print(f"  {name:<34} {size / 1024:8.1f} KB")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="co2-pipeline", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build_cmd = sub.add_parser("build", help="download, validate and export all data")
    build_cmd.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    build_cmd.add_argument(
        "--offline", action="store_true", help="use cached downloads only (still verified)"
    )
    args = parser.parse_args(argv)
    if args.command == "build":
        return build(args.config, args.offline)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
