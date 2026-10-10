# SUMMARY — co2-atlas

Studentski projekt (D3 karta emisija CO₂, 1950–2021) prepravljen je u portfolio projekt u novom repozitoriju `co2-atlas`. Projekt ima reproducibilni Python pipeline, podatke GCB2025v15 do 2024., modularni Vite/D3 frontend, tri razine testova i GitHub Actions za CI, deploy i ažuriranje podataka. Stari projekt nije mijenjan. Ništa nije pushano.

## Što je napravljeno, po fazama

**Faza 0 — provjera podataka.**
- GCB2025v15 preuzet je preko Zenodo API-ja (MD5 provjeren) i uspoređen s GCB2022v27.
- Struktura i jedinice su iste, pa nije bilo razloga za zaustavljanje.
- Detalji su u DECISIONS.md, odluka D0.

**Faza 1 — pipeline (`pipeline/`).**
- Konfiguracija u jednoj datoteci; nova verzija podataka je promjena jednog broja (Zenodo record ID).
- Preuzimanje s provjerom checksuma.
- Države, agregati i povijesni entiteti su razdvojeni, a 0 i null se ne miješaju.
- TopoJSON 1:50m ima 275 KB.
- Pravila za teritorije su deklarativna u `config.toml`.
- Validacija ruši build pri bilo kakvom neočekivanom neslaganju.
- 32 pytest testa, ruff čist.

**Faza 2 — frontend (`src/`).**
- ES moduli s centralnim stanjem i JSDoc tipovima.
- Fiksna i relativna skala, legenda iz iste skale.
- Panel s rangom, udjelom, trakama po izvorima i kombiniranim grafom.
- Zoom svjestan panela, pretraga, puna podrška za tipkovnicu i bottom sheet na mobitelu.
- 58 Vitest testova.

**Faza 3 — kvaliteta i repo.**
- ESLint, Prettier, tsc i ruff bez upozorenja.
- README sa screenshotom, GIF-om i mermaid dijagramom; MIT LICENSE.
- Tri workflowa (`ci`, `deploy`, `update-data`), actions fiksirane na commit SHA.

**Faza 4 — verifikacija.**
- 20 Playwright E2E testova na produkcijskom buildu (desktop 1440×900 i mobitel 390×844).
- Konzola je bez grešaka i bez 404.
- Klik test za 10 država (Srbija, Kosovo, Australija, Francuska, Francuska Gvajana, Somalija, Cipar, Zapadna Sahara, Kina, Hrvatska) provjerava naslov panela i vrijednost prema CSV-u. Vrijednosti su dodatno provjerene i prema izvornoj GCP datoteci (razlika ≤ 2·10⁻⁵, samo zaokruživanje).
- Tipkovnica: Tab → pretraga → slider → skala → država; Enter otvara, Escape zatvara i vraća fokus.
- Status svih K/V stavki iz AUDIT.md §9 nalazi se u PROGRESS.md: **sve riješeno**.

## Izmjerene brojke

Izvor: `docs/verification.json` i `docs/verification-headed.json`, Edge na ovom računalu. Stari projekt je mjeren istom skriptom.

| Mjera | Stari projekt | co2-atlas |
|---|---:|---:|
| Podaci koje preglednik preuzima | 18,9 MB (GeoJSON 17,8 MB + CSV 1,1 MB) | **1,08 MB** (357 KB gzip) |
| Ukupno s JS/CSS/HTML | ~19 MB | 1,22 MB (406 KB gzip) |
| Učitavanje, localhost | 563 ms | **172 ms** |
| Učitavanje, 4 Mbit/s + 70 ms latencije (bez gzipa) | 37,4 s | **1,14 s** |
| Handler slidera (`performance.now`), medijan / p95 | 92 ms / 107 ms | **0,4 ms / 0,6 ms** |
| Pritisak tipke → iscrtavanje (Event Timing API), medijan / p95 | 104 ms / 128 ms | **24 ms / 32 ms** (panel zatvoren), 16 / 32 ms (panel otvoren) |

Napomena uz zadnji red:
- Cilj „< 16 ms po pomaku slidera“ mjeren oko handlera, kako je zadano, **ispunjen je** (0,4 ms).
- Puni ciklus do iscrtavanja ima medijan oko 1,5 frame-a. Usko grlo je rasterizacija SVG karte s ~70 000 vrhova, isto u headless i headed Edgeu.
- Bazna linija (pritisak tipke koji ništa ne mijenja) je ispod 16 ms.
- Daljnje ubrzanje traži canvas renderiranje (prijedlog za fazu 2).

## Razlike GCB2022v27 → GCB2025v15

- **Raspon:** 1750–2021 → 1750–**2024**.
- **Kolone:** nova kolona `UN M49` i nova datoteka populacije.
- **Agregati:** `International Transport` (XIT) razdvojen je na `International Aviation` (XIA) i `International Shipping` (XIS).
- **Null vs nula:** GCP sada razlikuje pravu nulu i „nema podataka“. Od 1950. postoji 936 null vrijednosti u `Total`; prije su to bile nule.
- **Francuski prekomorski departmani i Portoriko** više nisu zasebni entiteti. DOM-ovi su uključeni u Francusku (GCP metodologija, §2.2.18); za Portoriko GCP ne navodi gdje je uključen.
- **Povijesni entiteti bez ISO koda** (French Equatorial/West Africa, Leeward Islands) disagregirani su po današnjim državama.
- **Imena:** Czechia, Eswatini, Türkiye, State of Palestine.
- **Per capita:** stupac `Per Capita` u glavnoj datoteci ima greške prije 1950. (faktor ~1000). Pipeline zato koristi `percapita_flat.csv`, koja odgovara Total/populacija.
- **Revizije za 2021.:** CHN −1,6 %, USA +0,3 %, DEU +0,5 %, HRV −1,7 %, IND −1,3 %, svijet −0,7 %.
- **Najveće revizije:** Nigerija 1994–99 do +166 %, Angola 1997–98 do +127 %, „Kuwaiti Oil Fires“ 1991 s 478 na 0,23 Mt.

## Odluke ukratko (DECISIONS.md)

- **D0** — podaci su konzistentni; per capita iz zasebne datoteke.
- **D1** — DOM-ovi su zasebni poligoni sa statusom „included in France“, jer vlastitih podataka više nema.
- **D2** — Node 24 LTS kao portable zip (bez admin prava).
- **D3** — TopoJSON se gradi Python paketom; tolerancija 0,07° daje 275 KB.
- **D4** — kodovi iz Natural Earth `ISO_A3_EH` uz nadjačavanja:
  - Kosovo → `KSV`;
  - map_units razdvajaju Francusku, Nizozemsku (`BES`) i Indian Ocean Ter. (`CXR`);
  - imena prema GCP/UN gdje je potrebno.
- **D5** — kolumnarni JSON po godinama, 1950–2024 za aplikaciju; puna povijest kao CSV za preuzimanje.
- **D6** — 6 log razreda po dekadama (fiksni) i kvantilni razredi (relativni). Jednobojna OKLCH paleta validirana je (najsvjetliji razred 2,03:1), a boje izvora su iz validirane kategoričke palete.
- **D7** — Antarktika se ne crta; udio svijeta uključuje bunkere; zadana godina 2024; zoom heuristika umjesto ručnih koordinata; bez tamnog načina; način mjerenja performansi.
- **D8** — citat: dataset (Andrew & Peters, doi:10.5281/zenodo.17417124) i Friedlingstein et al. 2026, ESSD 18, 3211–3288, doi:10.5194/essd-18-3211-2026. Metadata u datasetu navodi zastarjeli citat iz 2020.

## Što nije napravljeno i zašto

- **Tamni način:** izostavljen radi opsega (D7). Paleta bi trebala zasebno validirane tamne korake.
- **Input→paint ispod 16 ms sa zatvorenim panelom:** ograničenje SVG rasterizacije (vidi gore).
- **GIF** je snimljen iz statičnih frameova (gifenc), a ne kao video, jer ffmpeg nije dostupan. Veličina je 1,6 MB.
- **CI workflowi nisu pokrenuti na GitHubu** jer remote ne postoji. Lokalno prolaze isti koraci: ruff, pytest, eslint, prettier, tsc, vitest, build i Playwright. Na GitHubu se E2E pokreće s Playwrightovim Chromiumom, ne s Edgeom.
- **`update-data.yml` nije isproban do kraja** jer traži GitHub. Isti koraci (sed, pipeline, testovi) rade lokalno.

## Koraci koje moraš napraviti ti

1. Na GitHubu napravi **prazan** javni repozitorij `kiko4902/co2-atlas`, bez README-a, licence i .gitignore-a.
2. Poveži ga i pushaj:
   ```bash
   cd "F:/projekti/Vizualizacija podataka/co2-atlas"
   git remote add origin https://github.com/kiko4902/co2-atlas.git
   git push -u origin main
   ```
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.** Zatim pričekaj workflow „Deploy to GitHub Pages“ (ili ga ponovno pokreni u kartici Actions). Stranica će biti na https://kiko4902.github.io/co2-atlas/.
4. Za `update-data` workflow uključi **Settings → Actions → General → Workflow permissions → „Allow GitHub Actions to create and approve pull requests“**.
5. Provjeri da su CI testovi zeleni u kartici Actions.
6. Arhiviraj stari repozitorij:
   - po želji, u README starog repozitorija dodaj redak „Rebuilt as https://github.com/kiko4902/co2-atlas“;
   - zatim **Settings → General → Danger Zone → Archive this repository**;
   - stari GitHub Pages link prestaje se ažurirati, ali ostaje dostupan dok ga ne isključiš.
7. Po želji: u About sekciji repozitorija dodaj opis, link na live stranicu i teme (`d3`, `data-visualization`, `climate`, `co2-emissions`, `python`, `vite`).
8. Po želji: instaliraj Node 24 LTS normalno i obriši portable mapu `%LOCALAPPDATA%\Programs\node-v24.21.0-win-x64`.
9. Kad izađe GCB2026 (obično u studenom), pokreni workflow **Update data** s novim Zenodo record ID-om.

## Prijedlog plana za fazu 2

1. ~~**Per capita na karti**~~ (napravljeno, vidi DECISIONS D9 i D11):
   - arhitektura je spremna: `MAP_METRICS.perCapita` s fiksnim razredima 0,5/1/2/5/10 t već postoji i testirana je;
   - treba prekidač metrike u legendi i oprez s malim državama (GCP upozorava da per capita ističe male države s lošijim podacima).
2. **Kumulativne emisije od 1750.** (~1 dan):
   - pipeline dodaje metriku `cumulative` (izvor je CSV s cijelom poviješću), uz napomenu o nesigurnosti prije 1950.;
   - legenda u Gt.
3. **Territorial vs consumption-based** (~2–3 dana):
   - consumption-based emisije **nisu u ovom Zenodo datasetu**; nalaze se u datoteci *GCB National Fossil Carbon Emissions* (Excel, jedinica **MtC**);
   - pipeline mora dodati drugi izvor s vlastitom checksum provjerom i pretvoriti MtC u MtCO₂ (**×3,664**);
   - prikaz: karta „neto uvoznika/izvoznika“ emisija (divergentna skala plavo–crveno sa sivom sredinom) i treća metrika u panelu.
4. **Usporedba država** (~2 dana):
   - odabir 2–5 država i indeks **1990 = 100** na jednoj osi (bez dvije y-osi);
   - boje iz kategoričke palete: najviše 3 za oblike koji uspoređuju sve parove, više uz izravne oznake.
5. ~~**Stanje u URL-u**~~ (napravljeno, vidi DECISIONS D10):
   - `?year=1990&country=DEU&mode=relative&metric=perCapita`;
   - `history.replaceState` pri promjeni stanja; deep linkovi za dijeljenje.
6. **Play animacija kroz godine** (~0,5 dana):
   - gumb play/pause uz slider, ~150 ms po godini;
   - poštuje `prefers-reduced-motion` (tada se godina mijenja bez animacije), a Space pauzira.
7. **Performanse:** iscrtavanje karte na `<canvas>` (SVG ostaje za outline, fokus i hit-testing) da i puni ciklus iscrtavanja padne ispod 16 ms.
8. **Tamni način:** zasebni koraci palete validirani prema tamnoj pozadini.
