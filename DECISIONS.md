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
