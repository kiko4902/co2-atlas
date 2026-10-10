# PROGRESS — co2-atlas

Checklist za nastavak rada u novoj sesiji. `[x]` gotovo, `[~]` djelomično, `[ ]` nije.

**Okruženje (Windows):**
- Node: `C:\Users\Kristian\AppData\Local\Programs\node-v24.21.0-win-x64` (portable, nije u PATH-u). U bashu: `export PATH="/c/Users/Kristian/AppData/Local/Programs/node-v24.21.0-win-x64:$PATH"`.
- Python preko `uv` (CPython 3.13, `pipeline/.python-version`).
- Sirovi podaci: `pipeline/.cache/raw/` (gitignored).
- Playwright lokalno: `PW_CHANNEL=msedge`.

## Faza 0 — Provjera podataka
- [x] Preuzet GCB2025v15 sa Zenoda, MD5 provjeren
- [x] Usporedba kolona, jedinica, entiteta, godina i agregata s GCB2022v27
- [x] Per capita: `percapita_flat.csv` ≈ Total/Population; stupac `Per Capita` u MtCO2 ima greške prije 1950.
- [x] Usporedba 2021. za CHN, USA, DEU, HRV, IND (+FRA, WLD)
- [x] Zapisano u DECISIONS.md (D0, D1)

## Faza 1 — Data pipeline
- [x] Konfiguracija na jednom mjestu (`pipeline/config.toml`, jedan record ID)
- [x] Preuzimanje s checksum provjerom (Zenodo MD5 iz API-ja, Natural Earth SHA-256), cache u .gitignore
- [x] Čišćenje: države / agregati / povijesni entiteti; 0 ≠ null
- [x] Izvoz `public/data/` (shema u pipeline/README.md)
- [x] TopoJSON 1:50m: 275 KB, pravila za teritorije u kodu, smjer prstena ispravljen i validiran
- [x] Validacija (neupareni entiteti, zastarjele iznimke, duplikati ISO, agregati, per capita, smjer prstena, veličina)
- [x] pytest (32), ruff čist

## Faza 2 — Frontend
- [x] Vite 8 + npm, d3-* paketi s fiksiranim verzijama
- [x] Moduli: data, state, scales, map, legend, panel, charts/*, tooltip, search, format, a11y, geo-focus
- [x] Skala fixed/relative, legenda iz iste skale, animira se samo fill
- [x] Putanje se crtaju jednom; fill se mijenja samo kad se razred promijeni; non-scaling stroke; istaknuta odabrana država
- [x] Zoom: scaleExtent, svjesnost panela i bottom sheeta, heuristika najvećeg poligona
- [x] Panel: brojke, rang, udio, trake izvora s n/a, kombinirani graf s crosshairom i oznakom godine
- [x] Formatiranje en-US, Mt/Gt; loading i error
- [x] Pristupačnost: slider, fokus, Enter/Escape, combobox, tap tooltip, reduced motion, focus ring
- [x] Mobitel: bottom sheet (50 %, može se proširiti)
- [x] Footer/About s citatima i pravilom za teritorije; favicon, meta, OG slika
- [x] Vitest (58)

## Faza 3 — Kvaliteta i repo
- [x] ESLint + Prettier + tsc (JSDoc) + ruff bez upozorenja
- [x] README.md (screenshot, GIF, mermaid, upute, citati)
- [x] LICENSE (MIT), .gitignore, .editorconfig, .gitattributes, .nvmrc
- [x] GitHub Actions: ci.yml, deploy.yml, update-data.yml (actions fiksirane na commit SHA)

## Faza 4 — Verifikacija
- [x] build + preview + Playwright: 20 E2E testova (konzola bez grešaka i 404, klik test za 10 država, slider, skala, tipkovnica, pretraga, touch)
- [x] Vrijednosti iz klik testa provjerene i prema izvornom GCP CSV-u (razlika ≤ 2·10⁻⁵, zaokruživanje)
- [x] Screenshotovi 1440×900 i 390×844 (2024, 1950, relative, selected) u `docs/screenshots/`, GIF i OG slika
- [x] Mjerenja u `docs/verification.json` (headless) i `docs/verification-headed.json`
- [x] Svi testovi i linteri prolaze

### Status stavki iz AUDIT.md §9

| # | Status | Napomena |
|---|---|---|
| K1 | riješeno | Agregati su u zasebnoj datoteci; skala ih nikad ne vidi (fiksne granice; relativne samo iz država). |
| K2 | riješeno | Ime se uzima iz kliknutog featurea; svaki ISO kod je na jednom poligonu (validacija + E2E za Srbiju i Australiju). |
| K3 | riješeno | Kosovo je zaseban poligon s kodom `KSV` i vlastitim podacima. |
| K4 | riješeno | Legenda se generira iz iste skale; nema sive na početku; posebni kvadratići za 0 / no data / no separate data. |
| K5 | riješeno | 6 razreda od < 0,1 Mt naviše; male države se razlikuju. |
| K6 | riješeno | About/footer/README s citatima i CC BY 4.0; MIT LICENSE. |
| K7 | riješeno | Bottom sheet, zoom iznad sheeta, tap tooltip; E2E na 390×844. |
| V1 | riješeno | Karta je puna širina; panel je overlay, a zoom uzima u obzir njegovu širinu. |
| V2 | riješeno | Handler slidera 0,4 ms (bio 91 ms). Do iscrtavanja medijan 24 ms sa zatvorenim panelom (bio 104 ms); vidi D7. |
| V3 | riješeno | 1,08 MB podataka (357 KB gz) umjesto 18,9 MB; neiskorištene karte se ne prenose. |
| V4 | riješeno | `vector-effect: non-scaling-stroke`; šrafura se skalira s 1/k. |
| V5 | riješeno | 0 je bijelo „0 Mt“, null je sivo „No data“. |
| V6 | riješeno | Fiksna skala je zadana; relativna je izborna i jasno označena. |
| V7 | riješeno | DOM-ovi su zasebni poligoni sa „included in France“. |
| V8 | riješeno | Tipkovnica, ARIA, combobox, focus ring, reduced motion (bez tamnog načina, D7). |
| V9 | riješeno | Loading indikator i poruka s gumbom „Reload“. |
| V10 | riješeno | Pipeline s checksumima, validacijom i testovima. |
| V11 | riješeno | GCB2025v15, podaci do 2024. |
| V12 | riješeno | Programski zoom je ograničen na scaleExtent [1, 24]. |

## Završni izvještaj
- [x] SUMMARY.md
