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
- [ ] Konfiguracija na jednom mjestu (`pipeline/config.toml`)
- [ ] Preuzimanje s checksum provjerom (Zenodo + Natural Earth), cache u .gitignore
- [ ] Čišćenje: države / agregati / povijesni entiteti; 0 ≠ null
- [ ] Izvoz `public/data/` (shema u pipeline/README.md)
- [ ] TopoJSON iz Natural Earth 1:50m < 300 KB, pravila za teritorije u kodu
- [ ] Validacija (neupareni entiteti, iznimke, duplikati ISO, agregati)
- [ ] pytest testovi s fixtureima

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
