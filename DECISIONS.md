# DECISIONS — co2-atlas

Dnevnik odluka donesenih tijekom samostalnog rada. Format: **što** · **zašto** · **alternative**.
Odluke koje je donio vlasnik projekta (u zadatku) ovdje nisu ponovljene osim kad ih je trebalo protumačiti.

---

## D0 — Faza 0: provjera GCB2025v15 naspram GCB2022v27

**Rezultat: podaci su konzistentni, pipeline smije nastaviti.** Nijedan uvjet za zaustavljanje (a) nije ispunjen.

Preuzeto preko Zenodo API-ja (`/api/records/17417124`), sve MD5 sume se podudaraju.

| Provjera | GCB2022v27 (Kaggle) | GCB2025v15 (Zenodo) |
|---|---|---|
| Kolone (`MtCO2_flat`) | Country, ISO 3166-1 alpha-3, Year, Total, Coal, Oil, Gas, Cement, Flaring, Other, Per Capita | iste + **`UN M49`** (novo) |
| Jedinice | Mt CO₂; t CO₂/osobi | iste (metadata JSON) |
| Godine | 1750–2021 | **1750–2024** |
| Broj entiteta | 232 | 222 |
| Agregati | `Global` (WLD), `International Transport` (XIT) | `Global` (WLD), **`International Aviation` (XIA)**, **`International Shipping` (XIS)** (XIT je razdvojen 2023.) |
| Entiteti bez ISO koda | 6 (French Equatorial/West Africa, Kuwaiti Oil Fires, Leeward Islands, Pacific Islands (Palau), Ryukyu Islands) | 3 (Kuwaiti Oil Fires, Pacific Islands (Palau), Ryukyu Islands) |
| Nule vs. nedostajuće | nema `NaN` u `Total` (sve je 0) | **936 `NaN` u `Total` od 1950.**; GCP od 2023v43 razlikuje „true zero“ i „NODATA“ |
| Populacija | nije u paketu | `population_flat.csv` (CountryName, ISO3, UNcode, Year, Population), 215 entiteta, 1750–2024 |

**Promjene entiteta (2022 → 2025):**
- Preimenovanja (isti ISO): Czech Republic → Czechia, Swaziland → Eswatini, Turkey → Türkiye, Occupied Palestinian Territory → State of Palestine, St. Kitts-Nevis-Anguilla → Saint Kitts and Nevis.
- **Uklonjeni kao zasebni entiteti:**
  - French Guiana, Guadeloupe, Martinique, Réunion, Mayotte. PDF §2.2.18: Francuska više ne izvještava zasebno za njih, pa su uključeni u Francusku (KP granice).
  - Puerto Rico. U PDF-u nema objašnjenja.
  - Panama Canal Zone (→ Panama), Ryukyu (→ Japan, ali red bez ISO ostaje s nulama).
  - French Equatorial/West Africa (disagregirani po današnjim državama).
  - Leeward Islands.

**Per capita:**
- `percapita_flat.csv` → `Total` se slaže s `Total × 10⁶ / Population` (od 1950.: najveća relativna razlika 6,7·10⁻⁴; ukupno samo 3 odstupanja > 0,1 %, sva prije 1870.).
- Stupac `Per Capita` u `MtCO2_flat.csv` ima **pogreške prije 1950.** (1 592 retka, 1820–1949; npr. Nizozemska 1918. = 2 185 t/osobi, što je faktor ~1000). Od 1950. oba izvora su identična.
- **Odluka:** per capita se uzima iz `percapita_flat.csv`, a ne iz stupca `Per Capita`. Pipeline to i provjerava (validacija `Total/Population`).
- Usporedba starog stupca `Per Capita` (2022) s novim (2025) za 1950–2021: medijan relativne razlike 0,97 %, p90 8,1 % (posljedica revizije UN WPP populacije).

**Revizije vrijednosti za 2021.:**

| ISO | Total 2022v27 | Total 2025v15 | Δ | Per capita Δ |
|---|---:|---:|---:|---:|
| CHN | 11 472,37 | 11 284,40 | −1,64 % | −1,68 % |
| USA | 5 007,34 | 5 020,11 | +0,26 % | −0,68 % |
| DEU | 674,75 | 678,00 | +0,48 % | +0,13 % |
| HRV | 17,70 | 17,40 | −1,69 % | +1,71 % |
| IND | 2 709,68 | 2 675,78 | −1,25 % | −1,71 % |
| FRA | 305,96 | 307,27 | +0,43 % | −1,93 % |
| WLD | 37 123,85 | 36 866,86 | −0,69 % | −1,26 % |

Za cijelo razdoblje 1950–2021 (redovi s Total > 0) medijan revizije je 0,02 %, p90 6,9 %, p99 54 %. 12 % redaka promijenilo se za više od 5 %.

Najveće revizije:
- Nigerija 1994–1999: +130 do +166 %, nova procjena za flaring i naftu.
- Angola 1997–98: +116 do +127 %.
- „Kuwaiti Oil Fires“ 1991: 478 Mt → 0,23 Mt.

**Zašto nije razlog za zaustavljanje:** struktura stupaca i jedinice su iste. Promjene entiteta su promjene definicije teritorija koje pravilo „prikazujemo ono što GCP vodi zasebno“ (odluka 4) pokriva. Pipeline ih eksplicitno validira.

---

## D1 — Francuski prekomorski departmani (tumačenje odluke 4)

**Što:** GUF, GLP, MTQ, REU i MYT crtaju se kao **zasebni poligoni** (iz Natural Earth `admin_0_map_units`), ali sa statusom **„No separate data — included in France“**, a ne s vlastitim podacima.

**Zašto:**
- Odluka 4 traži vlastite podatke za njih, ali u GCB2025v15 oni **više ne postoje kao zasebne serije**. GCP ih od 2024. pribraja Francuskoj (PDF §2.2.18).
- Vlasnik projekta zadao je pravilo „prikazujemo ono što GCP vodi zasebno“, i ono ima prednost pred nabrojanim primjerima.
- Bojanje Francuske Gvajane francuskim totalom (~300 Mt) bila bi ista pogreška kao u starom projektu (AUDIT V7). Zato se poligoni razdvajaju, a tooltip kaže gdje su podaci.

**Alternative:**
- Ostaviti ih u France MultiPolygonu: tada bi bili obojani francuskim totalom, što je odbačeno.
- Koristiti GCB2022 vrijednosti za njih: miješanje izdanja je odbačeno.
- Ako GCP u GCB2026 vrati zasebne serije (najavljuju to u §2.2.18), pipeline ih automatski spoji jer validacija traži podatke za te kodove. Status „included“ tada treba maknuti iz `config.toml`, a validacija će javiti da je unos nepotreban.

## D2 — Portable Node.js

**Što:** Node.js 24.21.0 LTS raspakiran je kao portable zip u `%LOCALAPPDATA%\Programs\node-v24.21.0-win-x64` (SHA256 provjeren prema `SHASUMS256.txt`). Nije sistemski instaliran i nije dodan u PATH.

**Zašto:** Node nije bio instaliran, a za Vite je nužan. Portable verzija ne traži admin prava ni UAC i ne mijenja sustav.

**Alternative:** `winget install OpenJS.NodeJS.LTS` (traži UAC, a radim bez nadzora). Za vlastiti rad preporučujem normalnu instalaciju Node 24 LTS (`.nvmrc` u repozitoriju to navodi).

## D3 — Alat za TopoJSON: Python paket `topojson` (bez `topoquantize`)

**Što:** topologija se gradi Python paketom `topojson` (mattijn): `Topology(prequantize=1e5)` i zatim `.toposimplify(0.07)` (Douglas–Peucker na zajedničkim lukovima).

**Zašto:** pipeline ostaje čisto Python + uv, kako je zadano. Pojednostavljivanje nakon izgradnje topologije čuva zajedničke granice bez rupa. Opcije `topoquantize=True` i `prevent_oversimplify=True` izgradnju 1:50m karte produljuju s <1 s na >10 min, pa se ne koriste.

**Tolerancija 0,07°:** daje 275 KB (cilj < 300 KB). Za usporedbu: 0,03° → 388 KB, 0,05° → 315 KB, 0,1° → 244 KB. Nijedan feature ne nestaje (provjereno i za Monako, Vatikan, Bahrein, Maltu i Singapur, sve su prisutne).

**Alternative:** mapshaper (Node, brži i standardan alat), ali to bi u Python pipeline uvelo Node ovisnost. Druga opcija je 1:110m karta, koja je manja, ali bez mnogih otoka i malih država.

## D4 — Kodovi i imena na karti

- **Kod:** primarno Natural Earth `ISO_A3_EH`. Nadjačavanja su u `config.toml`: Kosovo → `KSV`, a Siachen i Ashmore & Cartier dobivaju vlastite kodove (`KAS`, `ATC`), jer bi se inače sudarili s IND/AUS ili imali `-99`.
- **Razdvajanje preko `admin_0_map_units`:**
  - FRA → metropolitanska Francuska + 5 DOM-ova;
  - NLD → Nizozemska + Karipska Nizozemska (`BES`, GCP je vodi zasebno);
  - Indian Ocean Ter. → Christmas I. (`CXR`, GCP je vodi zasebno) + Cocos Is.
- **Imena:** Natural Earth `NAME_EN` (uobičajeni engleski nazivi) uz 7 nadjačavanja prema GCP/UN nazivima (China, Czechia, Türkiye, Côte d'Ivoire, Timor-Leste, Micronesia, Cocos (Keeling) Islands). U aplikaciji se koristi isto ime na karti, u pretrazi i u panelu. CSV za preuzimanje zadržava originalne GCP nazive.
- **Puerto Rico:** u 2025v15 nema zasebne serije, a GCP ne navodi gdje je uključen. Prikazuje se kao „No separate data“, bez tvrdnje „included in USA“.
- **Rezultat:** 0 neuparenih GCP država, 31 feature bez zasebnih podataka (svi s razlogom u `config.toml`), od kojih 8 s dokumentiranim „included in“.

## D5 — Format podataka za frontend

**Što:** kolumnarni JSON po metrikama, matrica `values[metric][yearIndex][countryIndex]` (schema 1, opisana u `pipeline/README.md`). Brojevi su ručno serijalizirani s 5 značajnih znamenki (per capita s 4).

**Zašto:** karta po godini čita jedan red, a panel po državi jedan stupac, oboje O(1). Nema ponavljanja ključeva po retku. Parsiranje 772 KB JSON-a traje nekoliko ms, a preko mreže je ~249 KB gz.

**Raspon:** aplikacija dobiva 1950–2024. Puni raspon 1750–2024 (sve vrste entiteta, uključujući populaciju) izvozi se kao tidy CSV `co2-emissions-2025v15.csv`, koji je ujedno link „Download data“ u aplikaciji. Faza 2 (kumulativne emisije) može iz istog pipelinea dodati seriju bez promjene sheme.

**Alternative:**
- Jedan JSON po državi: puno zahtjeva.
- Row-oriented JSON: oko 3× veći.
- Arrow/Parquet: dodatna JS ovisnost za ~200 KB podataka.
- Odvojeni `sources.json` za lijeno učitavanje: ušteda ~150 KB gz nije vrijedna dodatne složenosti.

## D6 — Klase i boje karte

**Fiksni razredi (zadano):** `< 0,1 | 0,1–1 | 1–10 | 10–100 | 100–1 000 | ≥ 1 000` Mt CO₂, dakle 6 razreda po dekadama.

**Zašto:** distribucija svih pozitivnih vrijednosti država 1950–2024 ima p10 ≈ 0,09, p20 ≈ 0,33, p40 ≈ 2,2, p60 ≈ 10, p80 ≈ 56, p90 ≈ 171 i p99 ≈ 1 710 Mt. Dekade daju razrede sa ~10/20/30/25/13/2 % vrijednosti i lako se čitaju. Razred ≥ 1 000 Mt namjerno ističe malu skupinu velikih emitera (SAD, Kina, Indija, Rusija, Japan…).

**Relativni način:** kvantilne granice (6 razreda s podjednakim brojem država) za odabranu godinu. Računaju se samo iz država s vrijednošću > 0; agregati, 0 i null se ne uzimaju. Granice su zaokružene na najmanji broj značajnih znamenki uz koji ostaju strogo rastuće. Kvantili su izabrani zato što „relative to year“ treba pokazati poredak unutar godine, a log-jednaki intervali bi ovisili o ekstremima jedne godine.

**Paleta:**
- Jednobojna (crveno-narančasta) sekvencijalna ljestvica sa 6 koraka, generirana u OKLCH s monotonom svjetlinom. Validirana `dataviz` validatorom kao ordinalna ljestvica: najsvjetliji razred ima 2,03:1 prema pozadini (`#fcfcfb`), pa je vidljiv i bez obruba.
- Izvori (Coal, Oil, Gas, Cement, Flaring, Other) dobivaju prvih 6 boja validirane kategoričke palete u fiksnom redoslijedu. Prolaze CVD i normalno razlikovanje. Tri boje imaju kontrast ispod 3:1, što se nadoknađuje vidljivim brojkama u tablici izvora.
- Statusi:
  - „No data“: siva `#d4d3ce`;
  - „No separate data“: šrafura pod 45°, koja se pri zumu skalira s 1/k;
  - „0 Mt“: bijela s obrubom.

**Alternative:** YlOrRd (višebojna, nije potrebna); jedinstvena kontinuirana log skala (teže čitljiva legenda).

## D7 — Ostale odluke u frontendu

- **Antarktika se ne crta.** Zauzela bi ~20 % karte za 0,0x Mt. Ostaje dostupna kroz pretragu i panel (zoom je tada no-op).
- **Udio u svijetu** računa se prema GCP „Global“ totalu, koji uključuje međunarodni zračni i pomorski promet (bunkere). Zato zbroj država daje < 100 %. Napomena stoji u panelu i u About dijalogu.
- **Rang** je natjecateljski („1224“), samo među državama s vrijednošću za tu godinu.
- **Zadana godina je 2024** (najnovija), a ne 1950.
- **Zoom heuristika** (`geo-focus.js`) zamjenjuje ručne koordinate:
  - uzima najveći poligon i spaja dijelove ≥ 2 % njegove površine kojima je razmak ≤ 0,6 dijagonale okvira;
  - spaja se u više prolaza, pa se otočni lanci povezuju (Filipini, Malezija, Indonezija);
  - provjereno na 22 države; SAD uključuje Aljasku, ali ne Havaje ni Guam.
- **Zoom poštuje `scaleExtent` [1, 24]**, pa male države stanu na k = 24 i nema skoka pri prvom kotačiću.
- **Bez tamnog načina** u ovoj verziji (opseg). Prijedlog za fazu 2.
- **Tab redoslijed:** pretraga → slider → prekidač skale → države (abecedno) → panel. Skip link vodi na pretragu.
- **Mjerenje performansi** (`scripts/verify.mjs`):
  - Mjeri se i handler slidera (`performance.now`, kako traži zadatak) i put od pravog pritiska tipke do sljedećeg iscrtavanja (Event Timing API). Druga mjera je poštenija jer uključuje stil, layout i paint.
  - Handler: 0,4 ms. Do iscrtavanja: medijan 24 ms sa zatvorenim panelom.
  - Uzrok je iscrtavanje SVG-a s ~70 k vrhova, i u headless i u headed Edgeu. Optimizirano je postavljanjem `fill` samo kad se razred promijeni. Canvas renderiranje predloženo je za fazu 2.
- **Playwright lokalno** koristi instalirani Edge (`PW_CHANNEL=msedge`), jer preuzimanje Playwrightova Chromiuma na ovom računalu nije uspjelo. CI koristi `playwright install chromium`.
- **GIF** se generira u čistom JS-u (`gifenc` + `pngjs`) jer ffmpeg nije dostupan.

## D8 — Citat Global Carbon Budget 2025

Metadata JSON u datasetu i dalje navodi „Friedlingstein et al 2020 (DOI: 10.5194/essd-12-3269-2020)“. To je zastarjeli citat koji GCP prenosi iz izdanja u izdanje. Članak za 2025 objavljen je 13. 5. 2026.: Friedlingstein, P. et al., Global Carbon Budget 2025, *Earth Syst. Sci. Data*, 18, 3211–3288, doi:10.5194/essd-18-3211-2026 (provjereno na ESSD stranici članka). Aplikacija i README citiraju dataset (Andrew & Peters, Zenodo DOI) i taj članak.

## D9 — Razredi za per capita

**Što:** fiksni razredi `< 0,5 | 0,5–1 | 1–2,5 | 2,5–5 | 5–10 | ≥ 10` t CO₂ po osobi. Relativni način koristi iste kvantile kao za total (6 razreda, samo vrijednosti > 0).

**Zašto:**
- Distribucija svih vrijednosti država 1950–2024 (15 181 vrijednost, 14 pravih nula): p10 ≈ 0,11, p30 ≈ 0,58, p40 ≈ 1,09, p50 ≈ 1,94, p60 ≈ 3,28, p70 ≈ 5,14, p80 ≈ 7,59, p90 ≈ 11,3, p95 ≈ 16,6, p99 ≈ 38,6, maksimum 793 t.
- Usporedba kandidata (udio vrijednosti po razredu, 1950–2024):

| Granice | Udjeli | 1950 | 2024 |
|---|---|---|---|
| 1 / 2,5 / 5 / 10 / 20 (prijedlog iz zadatka) | 38/16/14/18/9/4 % | 59/16/12/8/3/2 | 25/18/25/20/8/3 |
| 0,5 / 2 / 5 / 10 / 20 | 28/23/19/18/9/4 % | 49/24/14/8/3/2 | 16/21/31/20/8/3 |
| **0,5 / 1 / 2,5 / 5 / 10 (odabrano)** | **28/11/16/14/18/13 %** | 49/10/16/12/8/5 | 16/9/18/25/20/12 |

- Prijedlog iz zadatka stavlja 38 % svih vrijednosti (59 % u 1950.) u najniži razred, pa se siromašne države ne razlikuju. Gornji razred ≥ 20 t imao bi samo ~4 % vrijednosti.
- Odabrane granice daju najujednačeniju raspodjelu i slijede niz 1–2,5–5 koji se lako čita. Svjetski prosjek (2,4 t u 1950., 4,7 t u 2024.) pada u razred 2,5–5 ili tik ispod, pa „iznad prosjeka“ otprilike znači „5 t i više“.

**Outlieri (sve vrijednosti > 30 t):**
- Sint Maarten 1950-ih (do 793 t) i Curaçao 1950–2000-ih (do 117 t): rafinerije na otocima s malom populacijom.
- Katar (do 122 t), UAE (86), Kuvajt (68), Brunej (68), Trinidad i Tobago (34): proizvodnja nafte i plina, flaring.
- Luksemburg (do 41 t, čeličane i „gorivni turizam“), Bahami (44) i Karipska Nizozemska (34).

Podaci se ne izbacuju ni ne režu. Gornji razred je otvoren (`≥ 10`), pa outlieri ne razvlače fiksnu skalu. Kvantilne granice relativnog načina ionako ne ovise o maksimumu (unit test to provjerava). Točne vrijednosti uvijek su u tooltipu i panelu.

**Bez populacije:** Christmas Island (CXR) i Antarktika imaju emisije, ali nemaju populaciju, pa per capita ima vrijednost `null` i prikazuje se kao „No data“, a ne 0. Nula per capita postoji samo gdje je i total stvarna nula.

**Alternative:** 7 razreda (paleta je validirana za 6); kontinuirana log skala (teža za čitanje legende).

## D10 — Stanje u URL-u

- **Parametri:** `country` (ISO3), `year`, `metric` (`total` | `percapita`), `scale` (`fixed` | `relative`). Redoslijed u URL-u je country, year, metric, scale. Zadane vrijednosti (2024, total, fixed, bez države) izostavljaju se.
- **Interno ime ostaje `perCapita`**, a u URL-u je `percapita` (bez velikih slova). Vrijednosti se čitaju bez obzira na velika i mala slova (`hrv`, `PerCapita`).
- **Valjana država** je svaki kod koji ima seriju ili poligon na karti. Zato rade i „included in“ teritoriji (`GUF`) i Antarktika, koja se ne crta, ali je u pretrazi. Agregati (`WLD`) se ignoriraju.
- **Godina** mora imati točno 4 znamenke i biti u rasponu 1950–2024. `1990.5`, `1990abc` i `-1990` se ignoriraju.
- **Nevaljane vrijednosti:** ignoriraju se bez poruke, uz zadanu vrijednost, a URL se odmah očisti s `replaceState`. Tada se uklanjaju i nepoznati parametri (npr. `utm_*`). To je prihvatljivo jer stranica nema analitiku.
- **History:**
  - godina, metrika i skala koriste `replaceState` s debounceom od 250 ms;
  - otvaranje i zatvaranje države koristi `pushState`, a prije toga se u unos koji se napušta upiše svježa godina, metrika i skala;
  - `popstate` čita URL i postavlja stanje bez novog unosa u povijest;
  - kad Back zatvori panel, fokus se vraća na element s kojeg je panel otvoren.
- **Prvo učitavanje:** stanje se čita iz URL-a nakon učitavanja podataka, pa se panel odmah otvara i karta zumira na državu.
- **Base path:** mijenja se samo query string; `pathname` (`/co2-atlas/`) i hash ostaju isti.
- **Copy link:**
  - gumb je u zaglavlju panela i kopira `location.href` nakon što se zapiše promjena koja čeka debounce;
  - koristi `navigator.clipboard`, a ako nije dostupan, skriveni textarea i `execCommand("copy")`;
  - potvrda je tekst gumba „Copied“ (2 s) i poruka u `role="status"` regiji za čitače ekrana.

## D11 — Panel i aktivna metrika

- **Isticanje:** aktivna metrika u panelu ima akcentnu crtu s lijeve strane, podebljanu oznaku i značku „on map“, pa nije označena samo bojom.
- **Rang** se računa za aktivnu metriku (`Rank per person` ili `World rank`). Za per capita rangiraju se samo države s populacijom (2024.: 214 od 216).
- **Četvrto polje:**
  - za total prikazuje „Share of world“;
  - za per capita prikazuje „World average“, GCP-ovu globalnu per-capita vrijednost iz `aggregates.json` (svjetski total s bunkerima podijeljen sa svjetskom populacijom; 4,73 t u 2024.), uz omjer „Croatia: 1.1× the average“;
  - vrijednost se ne računa u frontendu jer populacija nije u aplikacijskim datotekama, a GCP-ova vrijednost je službena.
- **Tooltip** uvijek prikazuje obje vrijednosti, a aktivna je prva i podebljana.
- **Aria-labele** država počinju aktivnom metrikom, npr. „Croatia: 4.73 t CO₂ per person in 1990, total 22.9 Mt CO₂“.
- **Prekidač metrike** stoji ispred prekidača skale (Tab: slider → metrika → skala). Na mobitelu su oba prekidača u jednom redu, bez jedinica u oznakama, jer jedinicu daje naslov legende.
- **Jedinice** u legendi koriste neprelomivi razmak („t CO₂“ se ne lomi).
- **Mjerenje (isti stroj, headless Edge):**
  - handler slidera prije i poslije: medijan 0,4 ms (per capita 0,3 ms);
  - od tipke do iscrtavanja: medijan 16 ms prije i poslije, i za per capita;
  - URL sinkronizacija dodaje samo `clearTimeout` i `setTimeout` po pomaku.
