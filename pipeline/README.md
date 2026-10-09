# co2-atlas data pipeline

Builds every file in `public/data/` from two pinned sources:

- **Global Carbon Project fossil CO₂ emissions dataset** (Andrew & Peters), fetched
  from Zenodo by record ID. File names, version and MD5 checksums come from the
  Zenodo API. Licensed CC BY 4.0.
- **Natural Earth** 1:50m admin-0 countries and map units, fetched from the
  `nvkelso/natural-earth-vector` GitHub release tag and checked against SHA-256
  hashes stored in `config.toml`. Public domain.

```bash
cd pipeline
uv sync
uv run co2-pipeline build            # download (cached), validate, export
uv run co2-pipeline build --offline  # reuse .cache/ only (checksums still verified)
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

Downloads are cached in `pipeline/.cache/` (git-ignored). A file is only
downloaded again when its checksum no longer matches.

## Updating to a new GCP release

1. Change `gcp.zenodo_record_id` in `config.toml`.
2. Run `uv run co2-pipeline build`.
3. If validation fails, the message says which rule to update. For example, a
   territory that gained or lost a separate series must be added to or removed
   from `[[geo.no_separate_data]]`.

The `update-data` GitHub Actions workflow does the same and opens a pull request.

## Processing steps

1. **Load and tidy** (`emissions.py`):
   - Join `*_MtCO2_flat.csv` (totals and sources), `*_percapita_flat.csv` (per
     capita) and `*_population_flat.csv` into one row per entity and year.
   - Take per capita from the dedicated per-capita file. The `Per Capita` column in
     the MtCO2 file has known errors before 1950.
   - Keep empty cells as `null` and true zeros as `0`.
2. **Classify rows**:
   - `country`: has an ISO code.
   - `aggregate`: code listed in `gcp.aggregate_codes` (World, international
     aviation and shipping).
   - `historical`: no ISO code, e.g. *Kuwaiti Oil Fires*. These get a
     `HIST-<slug>` code, are exported in the CSV only and are never drawn.
3. **Build map features** (`geo.py`), with every rule declared in `config.toml`:
   - `geo.split`: replace an admin-0 feature by its map units (France → metropolitan
     France + overseas regions, Netherlands → + Caribbean Netherlands,
     Indian Ocean Ter. → Christmas I. + Cocos Is.).
   - `geo.dissolve`: merge Somaliland into Somalia and Northern Cyprus into Cyprus.
   - `geo.code_overrides`: codes for features where `ISO_A3_EH` is `-99` or collides
     (Kosovo → `KSV`).
   - `geo.names`: display names.
4. **Validate** (`validate.py`). The build fails if:
   - a map feature has no data and is not listed in `[[geo.no_separate_data]]`;
   - a GCP country has no polygon and is not listed in `[[gcp.unmapped]]`;
   - a listed exception is stale (the territory now has data, or is not on the map);
   - an `included_in` target is not a country;
   - an ISO code is used by more than one polygon;
   - an aggregate, or an unknown `WLD`/`X..` code, is classified as a country;
   - emissions are negative;
   - per capita differs from total ÷ population by more than 1 %;
   - the topology exceeds `topology.max_bytes`.
5. **Export** (`export.py`).

## Territory rule

The map shows what GCP reports separately:

- **GCP has its own series:** the territory gets its own polygon and its own data
  (e.g. Kosovo, Greenland, Caribbean Netherlands).
- **GCP counts it inside another country:** the territory gets its own polygon,
  drawn as *no separate data*, and the tooltip names that country. Cases
  documented in the GCP methodology: French overseas regions and Monaco → France,
  Western Sahara → Morocco, Vatican → Italy.
- **GCP has no series and no documented parent:** *no separate data*, without a
  claim about where the emissions are counted.
- **Somaliland and Northern Cyprus** are dissolved into Somalia and Cyprus.

## Output files (`public/data/`)

| File | Loaded by app | Contents |
|---|:-:|---|
| `emissions.json` | ✅ | Countries only, years `app_year_min`–latest, all metrics |
| `aggregates.json` | ✅ | World, International Aviation, International Shipping (same schema) |
| `countries.topo.json` | ✅ | TopoJSON, object `countries` |
| `co2-emissions-<version>.csv` | ❌ (download link) | Tidy full history 1750–latest, all entity kinds |
| `manifest.json` | ❌ | Provenance: source, input checksums, output sizes, unmatched features |

### `emissions.json` / `aggregates.json` (schema 1)

Columnar and year-major. The map reads one row per year
(`values.total[yearIndex]`), and the country panel reads one column
(`values.total[*][countryIndex]`). There is no per-row object overhead and both
lookups are O(1).

```jsonc
{
  "schema": 1,
  "years": [1950, 2024],              // inclusive; yearIndex = year - years[0]
  "units": { "total": "Mt CO2", "perCapita": "t CO2 per person", ... },
  "entities": [ { "iso": "AFG", "name": "Afghanistan" }, ... ],   // sorted by name
  "source": { "title", "authors", "version", "published", "doi", "zenodoRecord", "license", "naturalEarth" },  // emissions.json only
  "values": {
    "total":     [[/* one value per entity */], /* one row per year */],
    "coal": ..., "oil": ..., "gas": ..., "cement": ..., "flaring": ..., "other": ...,
    "perCapita": ...
  }
}
```

- Values are numbers or `null`. `null` means no data and is distinct from `0`.
- Mt values are rounded to 5 significant digits and per capita to 4.

### `countries.topo.json`

- Each geometry has `properties: { iso, name, status, includedIn? }`.
- `status` is one of:
  - `data`: values exist in `emissions.json`;
  - `included`: no separate data, counted in country `includedIn`;
  - `none`: no separate data.
- Quantized (1e5) and simplified with Douglas–Peucker (0.07°) on shared arcs, so
  neighbouring borders stay identical.

### `co2-emissions-<version>.csv`

`code,name,kind,year,total,coal,oil,gas,cement,flaring,other,per_capita,population`

- `kind` is one of `country`, `aggregate` or `historical`.
- Names are the original GCP names.
