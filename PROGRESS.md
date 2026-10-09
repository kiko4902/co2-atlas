# PROGRESS — co2-atlas

Checklist za nastavak rada u novoj sesiji. `[x]` gotovo, `[~]` djelomično, `[ ]` nije.

**Okruženje (Windows):**
- Node: `C:\Users\Kristian\AppData\Local\Programs\node-v24.21.0-win-x64` (portable, nije u PATH-u; u bashu: `export PATH="/c/Users/Kristian/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"`)
- Python: preko `uv` (CPython 3.13, `pipeline/.python-version`)
- Sirovi podaci: `pipeline/.cache/raw/` (gitignored)

## Faza 0 — Provjera podataka
- [x] Preuzet GCB2025v15 sa Zenoda, MD5 provjeren
- [x] Usporedba kolona, jedinica, entiteta, godina i agregata s GCB2022v27
- [x] Per capita: `percapita_flat.csv` ≈ Total/Population; stupac `Per Capita` u MtCO2 ima greške prije 1950.
- [x] Usporedba 2021. za CHN, USA, DEU, HRV, IND (+FRA, WLD)
- [x] Zapisano u DECISIONS.md (D0, D1)

## Faza 1 — Data pipeline
- [x] Konfiguracija na jednom mjestu (`pipeline/config.toml`)
- [x] Preuzimanje s checksum provjerom (Zenodo MD5 iz API-ja, Natural Earth SHA-256), cache u .gitignore
- [x] Čišćenje: države / agregati / povijesni entiteti; 0 ≠ null
- [x] Izvoz `public/data/` (shema u pipeline/README.md): emissions.json 772 KB (249 KB gz), aggregates.json 10 KB, CSV 1750–2024
- [x] TopoJSON iz Natural Earth 1:50m: 275 KB (95 KB gz), 247 featurea, pravila za teritorije u kodu
- [x] Validacija (neupareni entiteti, iznimke, zastarjele iznimke, duplikati ISO, agregati, per capita)
- [x] pytest testovi s fixtureima (31 test), ruff čist
- Pokretanje: `cd pipeline && uv run co2-pipeline build` (ili `--offline`)

## STANJE PRI PREKIDU (sesija 1, 10. 10. 2026.)
- Faze 0–1 gotove. Faza 2 gotova u kodu (svi moduli, 58 Vitest testova, 20 Playwright E2E testova prolaze).
- `scripts/verify.mjs` radi (headless): docs/verification.json, docs/screenshots/*, demo.gif, public/og-image.png.
  Izmjereno: handler slidera medijan 0,4 ms (stari 91 ms); input→paint (Event Timing, headless softverski raster)
  medijan 24 ms zatvoren panel / 16 ms otvoren, baseline <16; stari projekt medijan 104 ms.
  Podaci 1,08 MB (357 KB gz) vs stari 18,9 MB; učitavanje 4 Mbit/s: 1,16 s vs 37,1 s.
- OTVORENO: `--headed --measure-only` pokretanje pada (exit 1, nije dijagnosticirano) — provjeriti
  `.tmp/verify-headed.out`. Ponovno pokrenuti verify nakon zadnje optimizacije (fill samo kad se promijeni).
- PREOSTALO: Faza 3 (README, LICENSE, GitHub Actions ci/deploy/update-data s pinanim SHA, ruff već radi),
  Faza 4 (finalna verifikacija + status K/V iz AUDIT §9), SUMMARY.md, DECISIONS D6+ (paleta, Antarktika
  se ne crta, dark mode izostavljen, udio svijeta uključuje bunkere, focus heuristika, PW_CHANNEL).

## Faza 2 — Frontend
- [ ] Vite + npm projekt, d3-* paketi s fiksiranim verzijama
- [ ] Moduli: data, state, scales, map, legend, panel, charts/*, tooltip, format, a11y
- [ ] Skala: fixed / relative, legenda iz iste skale
- [ ] Karta: putanje jednom, fill na slider, non-scaling stroke, selected highlight, puna širina
- [ ] Zoom: scaleExtent, svjesnost panela, najveći poligon
- [ ] Panel: brojke, rang, udio, trake izvora, kombinirani graf s crosshairom
- [ ] Format, loading, error
- [ ] Pristupačnost: slider, fokus, Enter/Escape, combobox pretraga, tap tooltip, reduced motion
- [ ] Mobitel: bottom sheet
- [ ] Footer/About s citatima
- [ ] Favicon, meta, OG
- [ ] Vitest testovi

## Faza 3 — Kvaliteta i repo
- [ ] ESLint + Prettier + ruff bez upozorenja
- [ ] README.md
- [ ] LICENSE, .gitignore, .editorconfig
- [ ] GitHub Actions: ci.yml, deploy.yml, update-data.yml (fiksirane verzije)

## Faza 4 — Verifikacija
- [ ] build + preview + Playwright (konzola, screenshotovi, klik test, tipkovnica, ms/slider, veličina podataka)
- [ ] Svi testovi i linteri prolaze
- [ ] Status K/V stavki iz AUDIT.md §9

## Završni izvještaj
- [ ] SUMMARY.md
