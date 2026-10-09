"""Downloads source files into the local cache and verifies their checksums."""

from __future__ import annotations

import hashlib
import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .config import Config

USER_AGENT = "co2-atlas-pipeline (+https://github.com/kiko4902/co2-atlas)"
ZENODO_API = "https://zenodo.org/api/records/{record_id}"

# Suffixes of the GCP files we need, keyed by a stable role name.
GCP_FILE_ROLES = {
    "emissions": "_MtCO2_flat.csv",
    "emissions_meta": "_MtCO2_flat_metadata.json",
    "per_capita": "_percapita_flat.csv",
    "per_capita_meta": "_percapita_flat_metadata.json",
    "population": "_population_flat.csv",
}


class ChecksumError(RuntimeError):
    pass


@dataclass(frozen=True)
class GcpRelease:
    record_id: int
    version: str
    publication_date: str
    doi: str
    license: str
    files: dict[str, Path]


def file_digest(path: Path, algorithm: str) -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def fetch(url: str, dest: Path, algorithm: str, expected: str) -> Path:
    """Download `url` to `dest` unless a file with the expected checksum is cached."""
    if dest.exists() and file_digest(dest, algorithm) == expected:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(_http_get(url))
    actual = file_digest(tmp, algorithm)
    if actual != expected:
        tmp.unlink()
        raise ChecksumError(f"{url}: expected {algorithm} {expected}, got {actual}")
    tmp.replace(dest)
    return dest


def fetch_gcp_release(config: Config, offline: bool = False) -> GcpRelease:
    """Resolve the Zenodo record and download the GCP files (MD5 verified)."""
    record_dir = config.cache_dir / "raw" / str(config.zenodo_record_id)
    record_json = record_dir / "record.json"
    if offline:
        record = json.loads(record_json.read_text(encoding="utf-8"))
    else:
        record = json.loads(_http_get(ZENODO_API.format(record_id=config.zenodo_record_id)))
        record_dir.mkdir(parents=True, exist_ok=True)
        record_json.write_text(json.dumps(record, indent=2), encoding="utf-8")

    files: dict[str, Path] = {}
    for role, suffix in GCP_FILE_ROLES.items():
        matches = [f for f in record["files"] if f["key"].endswith(suffix)]
        if len(matches) != 1:
            raise RuntimeError(f"Zenodo record has {len(matches)} files ending in {suffix!r}")
        entry = matches[0]
        algorithm, expected = entry["checksum"].split(":", 1)
        dest = record_dir / entry["key"]
        if offline:
            if not dest.exists() or file_digest(dest, algorithm) != expected:
                raise ChecksumError(f"Offline mode: {dest} missing or corrupt")
            files[role] = dest
        else:
            url = entry["links"]["self"]
            files[role] = fetch(url, dest, algorithm, expected)

    meta = record["metadata"]
    return GcpRelease(
        record_id=config.zenodo_record_id,
        version=str(meta["version"]),
        publication_date=str(meta["publication_date"]),
        doi=str(record.get("doi") or meta.get("doi")),
        license=str(meta.get("license", {}).get("id", "")),
        files=files,
    )


def fetch_natural_earth(config: Config, offline: bool = False) -> dict[str, Path]:
    """Download the pinned Natural Earth GeoJSON files (SHA-256 verified)."""
    target_dir = config.cache_dir / "raw" / f"naturalearth-{config.ne_version}"
    out: dict[str, Path] = {}
    for role, name, sha in (
        ("countries", config.ne_countries_file, config.ne_countries_sha256),
        ("map_units", config.ne_map_units_file, config.ne_map_units_sha256),
    ):
        dest = target_dir / name
        if offline:
            if not dest.exists() or file_digest(dest, "sha256") != sha:
                raise ChecksumError(f"Offline mode: {dest} missing or corrupt")
            out[role] = dest
            continue
        url = f"{config.ne_base_url}/{config.ne_version}/geojson/{urllib.parse.quote(name)}"
        out[role] = fetch(url, dest, "sha256", sha)
    return out
