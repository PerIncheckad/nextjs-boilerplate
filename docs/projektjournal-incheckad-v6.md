# Projektjournal — Incheckad.se
## Senast uppdaterad: 2026-03-09 (v6 — designspec för /status-editering klar)
## Syfte: Kondenserad historik för framtida AI-assistenter

---

## 1. PROJEKTET I KORTHET

**Vad:** incheckad.se — webbaserat fordonshanteringssystem för MABI Syd (biluthyrning, ~25 anställda, franchisetagare under Albarone/Hedin Bil). Systemet hanterar incheckning av hyresbilar, skadedokumentation, nybilsinventering och ankomstregistrering.

**Vem:** Per är teknisk ledare och ensam utvecklare (icke-kodare — arbetar via AI-assistenter). Teammedlemmar Noor och Nimet utför incheckningar. Oliwer utför också incheckningar. Anders = operativ chef, Latif = underhållschef. Isak Brandeby utför nybilsregistreringar. Leo Hedenberg, Haris Poricanin, Lukas Svensson, Maciej och Oliver Fredriksson nämns som incheckare i diverse händelser.

**Stack:** Next.js 14.2.5, TypeScript, Supabase (databas + auth + storage), Vercel (deploy), GitHub (PerIncheckad/nextjs-boilerplate).

**Arbetsmetod:** Per arbetar direkt i webbläsaren (ingen lokal dev-miljö). Alla kodändringar görs via GitHub web/PR:er. Vercel auto-deployar vid merge till main. Per kräver steg-för-steg-instruktioner med exakta sök-och-ersätt-mönster. Per kan inte koda — ge aldrig instruktioner som förutsätter kodkunskap.

---

## 2. SYSTEMETS SIDOR OCH FLÖDEN

| Sida | Syfte |
|------|-------|
| `/check` | Fullständig incheckning med skadekontroll, utrustning, tankning |
| `/status` | Fordonshistorik och status (skador, händelser, fordonsinformation) — **NÄSTA: görs editerbar** |
| `/nybil` | Nybilsregistrering (inventering vid leverans) |
| `/ankomst` | Snabbregistrering av ankomst ("prella" — mini-incheckning) |
| `/rapport` | Statistik och rapporter |
| `/media/{folder}` | Visning av uppladdade skadefoton/video |

**Dataflöde vid incheckning (/check):**
1. Autocomplete hämtar reg.nr via RPC `get_all_allowed_plates()` med `.range(0, 4999)`
2. Sålda bilar filtreras bort från autocomplete (kollar `nybil_inventering.is_sold` + `vehicles.is_sold`) — **OBS: inga bilar är markerade som sålda idag (2026-03-09), filtret väntar på att "Markera som såld"-funktionen byggs i /status**
3. Fordonsinfo hämtas: `vehicles` + `nybil_inventering` + `damages_external` (BUHS)
4. Befintliga BUHS-skador visas i faktarutan — incheckaren markerar: documented / existing / not_found
5. Nya skador registreras med positioner, foton, video
6. Vid submit: `checkins`-rad + `checkin_damages`-rader + `damages`-rad skapas
7. E-post skickas via `app/api/notify/route.ts` till station och/eller Bilkontroll

**KRITISKT: E-post skickas EFTER databas-insert.** Om DB-insert misslyckas loggas felet men mejl skickas ändå (se fuel_level-buggen i 3g).

**Dataflöde vid statusvisning (/status):**
1. `getVehicleStatus()` i `lib/vehicle-status.ts` — CENTRAL FUNKTION (2800+ rader)
2. Hämtar parallellt: `nybil_inventering`, `vehicles`, `damages`, `damages_external`, `checkins`, `arrivals`
3. TWÅ KODVÄGAR baserat på datakälla:
   - **Kodväg 1** (~rad 1375-1665): `source === 'checkins'` — tidigt return
   - **Kodväg 2** (~rad 2278-2720): nybilData finns — huvudvägen
4. Bygger `DamageRecord[]` och `HistoryRecord[]`
5. **KRITISKT:** Ändringar måste göras i BÅDA kodvägarna — tidigare bottar har konsekvent missat detta

**Statusvisningens sektioner (feb 2026):**
- Senaste händelser (summary-kort med ⚠️ vid avvikelser)
- Fordonsinformation (reg.nr, märke/modell, mätarställning med källa+datum, däck, drivmedel, saludatum, såld-status)
- Avtalsvillkor (eget Card sedan PR #278 — serviceintervall, max km/mån, avgift över-km; auto-hide när allt är '---')
- Uppkoppling (MBme/VW Connect aktivering — visas bara för MB/VW-bilar)
- Utrustning (med auto-hide)
- Förvaring (instruktionsbok, COC, extranycklar — med auto-hide)
- Saluinfo (eget Card — visas när saludatum finns)
- Skador — **NÄSTA: delas upp i 4 kategorier (se designspec)**
- Övrig info vid leverans
- Historik (expanderbar, med filter: Incheckningar/Inkommen/Nybil/Manuella ändringar/Alla)

**Nybil-modal (popup vid klick på nybilsregistrering i historik):**
- Visar fullständig nybilsdata inklusive instruktionsbok/COC förvaring (ort + specifikation), MBme/VW Connect-aktivering (villkorat på bilmärke), och alla leveransdetaljer

**Dataflöde vid ankomst (/ankomst):**
1. Autocomplete hämtar reg.nr (samma RPC som /check)
2. Faktaruta visar bilmodell (drivmedel borttaget ur boxen)
3. Om bränsletyp känd → dynamisk sektion (Tankstatus / Laddstatus)
4. Om okänd → 5-val (Bensin, Diesel, Hybrid (bensin), Hybrid (diesel), 100% el) → sparas till `vehicles.bransletyp`
5. Vid submit: `arrivals`-rad skapas → mejl till Huvudstation
6. Mejlämne: `🔵 PRELLA: [reg.nr] - [station]`
7. Inget mejl till Bilkontroll
8. **BUGGFIX 2026-02-27 (PR #281):** `inferDrivmedelstyp()` kollade `includes('el')` före `includes('diesel')`, vilket matchade "Di**el**" som elbil. Fix: kolla bensin/diesel/gas FÖRST.

**Dataflöde vid CSV-import (Skadefilen/BUHS):**
1. Per laddar ner ny Skadefil (CSV) från Albarone/BUHS
2. Importerar via Supabase UI till staging-tabell, sedan UPSERT till `damages` + synk till `damages_external`
3. Processen dokumenterad i wiki: `CSV-import-skador - gör så här.md`

**"Good enough"-matchning (idempotens vid re-import):**
- Identifierar "samma skada" via `regnr + damage_date + damage_type` (loose key)
- INTE via `legacy_damage_source_text` (den ändras när BUHS uppdaterar anteckningar)
- Resultat: redan dokumenterad skada triggar INTE ny dokumentation vid nästa import
- Men ny BUHS-text (t.ex. "Repa, går att polera") uppdaterar `note_customer` utan ny dokumentation

---

## 3. KÄNDA SPECIALFALL OCH BUGGAR

### 3a. GEU29F — Feature flag i koden
**Status:** Aktivt specialfall — `const isGEU29F = cleanedRegnr === 'GEU29F'`
**Problem:** Dataintegritetsproblem i BUHS-skadorna. Saknar user_positions, har inkonsistent media. 6 BUHS-skador saknade uploads.folder trots dokumentation av Nimet 2025-12-16.
**Flaggan finns på två ställen:**
1. `lib/vehicle-status.ts` — hoppar över BUHS↔checkin_damages-matchning, sätter folder=undefined
2. `app/api/vehicle-info/route.ts` — `SPECIAL_FORCE_UNDOCUMENTED = ['GEU29F']` → tvingar alla BUHS-skador att visas som "behöver dokumenteras" i /check
**Åtgärd:** Vid nästa incheckning: incheckaren dokumenterar alla 6 BUHS-skador korrekt → ta bort isGEU29F-flaggan från BÅDA filerna.
**Relaterat:** 6 av 9 `checkin_damages`-rader med `type=existing` tillhör GEU29F (se 3r).

### 3b. MJB18C — Dubblett-skada
**Status:** Känt men ej åtgärdat.
**Problem:** 1 fysisk skada visas som 2 i /status pga BUHS↔checkin_damages-matchningsfel.

### 3c. ZAG53Y — "Repa" vs "Repor"
**Status:** Löst (jan 2026). Typnormalisering uppdaterad.

### 3d. Autocomplete — 1000-gränsen
**Status:** Löst (feb 2026, PR #275). `.range(0, 4999)` tillagt.

### 3e. INVANDIG_SKADA-formateringen
**Status:** Löst (feb 2026, PR #275). `addNewDamagesToRecords()` använde `cd.damage_type` direkt utan `formatDamageTypeSwedish()`.

### 3f. Bildkomprimering — BUHS 10MB-gräns
**Status:** Löst (feb 2026, PR #263).
**Rotorsak:** `handleMediaUpdate()` skickade bilder till annotatorn som skippade `processFiles()` helt — `compressImage()` anropades aldrig för bilder (bara video).
**Fix:** Lade till `compressImage()` i `handleAnnotatorSave()`.
**Parametrar:** TARGET_SIZE 8MB, MAX_DIMENSION 2560px, INITIAL_QUALITY 0.85. Resultat: ~2-3MB JPEG.

### 3g. fuel_level-buggen — 7 förlorade incheckningar
**Status:** Löst (dec 2025, PR #204).
**Problem:** `notify/route.ts` refererade `fuel_level` (existerar ej i checkins). PGRST204-fel.
**Effekt:** ALLA checkins-inserts failade tyst 2025-12-12 till 2025-12-16 14:04.
**Förlorad data:** 7 incheckningar av Nimet i Malmö. Återskapade manuellt via INSERT.

### 3h. source='CHECK' för BUHS-skador
**Status:** Löst (dec 2025 SQL + jan 2026 import-process ändrad).

### 3i. JBK29K — 10 skador syns inte i faktarutan
**Status:** Löst (dec 2025, PR #208-209).

### 3j. 98 "spökrader" från 2025-11-03-importen
**Status:** Löst (dec 2025). Rensade med SQL.

### 3k. LRA75R — HISTORIK-buggen (den stora sagan)
**Status:** LÖST (feb 2026, PR #258).
**Problem:** Under INCHECKNING 2026-01-19 visades bara 1 av 3 hanterade skador.
**Rotorsak (Lager 1):** `.map(cd => ...).find()` i HISTORIK-matchningen ignorerade `cd`-variabeln.
**Rotorsak (Lager 2):** `checkinWhereDocumented` sattes inte korrekt pga matchningsproblem (OVRIG_SKADA ≠ OVRIGT).
**Misslyckade PRs:** 10+ försök. 7+ bottar.
**Lektion:** Den enklaste fixar ibland kräver flest försök.

### 3l. YNK43N — Försvunnen incheckning + felincheckning
**Status:** Dokumenterat.

### 3m. CCC03L — Befintliga skador visas om och om igen
**Status:** Löst (feb 2026). Saknade `.not('user_type', 'is', null)`.

### 3n. Medialänkar trasiga i HISTORIK
**Status:** Löst (feb 2026, PR #259).

### 3o. "Senaste incheckning" visade fel i faktarutan
**Status:** Löst (feb 2026).

### 3p. Bränsletyp saknades i fordonsinfo
**Status:** Löst (feb 2026).

### 3q. Diesel felklassad som elbil i /ankomst
**Status:** Löst (2026-02-27, PR #281).

### 3r. `type=existing` i checkin_damages — relik från dag 1
**Status:** Utredd 2026-03-09, ingen åtgärd behövs.
**Fakta:** 9 rader totalt, alla från 2025-12-16 (appens första riktiga användningsdag). Tre bilar: GEU29F (6 rader), KDU100 (2 rader), MMX48U (1 rad).
**Varför de finns:** Tidigt i appen kunde incheckaren markera en befintlig skada som "existing" (bekräftad utan vidare åtgärd). Den funktionen togs bort — nuvarande kod skapar ALDRIG `type=existing`.
**Påverkan framåt:** I skadekategoriseringen (designspec) behandlas de som "Dokumenterade skador" (bekräftade att existera, men utan foto).
**KDU100 + MMX48U:** Alla deras BUHS-skador har `user_type=null` i damages → visas som "behöver dokumenteras" vid nästa incheckning. Ingen `SPECIAL_FORCE_UNDOCUMENTED`-flagga behövs (till skillnad från GEU29F).

---

## 4. HISTORIK ÖVER TIDIGARE AI-ASSISTENTER

### September–oktober 2025: "Cirkulär debugging"
- Tidiga försök att bygga /check-formuläret
- JSX-syntaxfel pga obalanserade klamrar — 4+ bot-instanser misslyckades
- **Lektion:** Gissa inte radnummer. Revert vid cirkulärt debugging.

### November 2025: Grundfunktioner + första import
- nybil_inventering migration, första CSV-import (2025-11-03 — skapade 98 spökrader)
- Laddnivå/tankstatus i /nybil (PR #175), nybilsbilder i /status
- Data sparades inte till checkins (checkins-tabellen skapades först 2025-11-18)

### December 2025: Intensiv buggfixning
- **Vecka 1-2:** CSV-import stabiliserad. Stationer uppdaterade. PR #168, #181, #184
- **Vecka 2:** PR #197-202: expanderbar historik, nybilslänk, utskrift. PR #199-200 misslyckades (4+ bottar)
- **16 dec:** fuel_level-buggen fixad (PR #204). 7 incheckningar förlorade, återskapade manuellt.
- **17 dec:** source-fix, skador i faktaruta, galleri-val (PR #205, #208-212)
- **22-23 dec:** Misslyckade PR #218-222 (BUHS-matchning). Bot-sessions avbröts.

### Januari 2026: Import, matching-fixes + stabilisering
- **Vecka 1 (5-8 jan):** BUHS-matchning i /status. PR #225-227. GEU29F specialbehandling.
- **Vecka 2 (9-12 jan):** Per identifierade TVÅ KODVÄGAR. PR #230, #233.
- **Vecka 3 (13-16 jan):** Source-fix (569 BUHS-skador). Bilfakta+Bilkontroll import. Skadefil-import. Loose matching.
- **Vecka 4 (19-27 jan):** LRA75R-sagan börjar. PR #248-249.

### Februari 2026: HISTORIK-buggen löst + stora features
- **Vecka 1-2:** Copilot + LRA75R. 10+ misslyckade PR:er, 7+ bottar.
- **13 feb:** HISTORIK-buggen löst (PR #258). Medialänkar fixade (PR #259). CCC03L fixad.
- **16 feb:** Bildkomprimering fixad (PR #263).
- **17 feb:** E-postförbättringar + /nybil-fixar.
- **17-20 feb:** /ankomst komplett feature (PR #272).
- **20-23 feb:** /status-integration av ankomster, multi-select filter, slutpolish (PR #275).
- **27 feb:** 6 PR:er på en dag (#276-#281): Nybil-modal, mätarställning med källa, avtalsvillkor Card, sold-filter, avbryt-modal, diesel→elbil-fix.
- **27 feb:** Journal v5 + handoff-dokument.

### Mars 2026: Design av /status-editering
- **9 mar (Claude Opus 4.6, session 2):** Designfas — ingen kod ändrad.
  - Läste igenom alla 5 delar av konversation 20260224-20260227, journal v5, handoff
  - Verifierade databasläge (1077 vehicles, 78 nybil, 1294 checkins, 12 arrivals, 925 damages)
  - Beslutade: `vehicle_edits`-tabell (override-modell, överlever CSV-reimport)
  - Beslutade: `damage_comments`-tabell (knuten till damage_id)
  - Beslutade: 4 skadekategorier (Dokumenterade / Ej återfunna / Ej återfunna däck-fälg / Ej hanterade i incheckad.se)
  - Utredde `type=existing` (9 rader, relik, ingen åtgärd) — se 3r
  - Utredde KDU100/MMX48U (fixar sig vid nästa incheckning, inget behov av SPECIAL_FORCE_UNDOCUMENTED)
  - Verifierade GEU29F-flaggan: finns i vehicle-status.ts + vehicle-info/route.ts
  - Identifierade TIRE_WHEEL_MAPPING i `normalizeDamageType.ts` för att skilja däck/fälgskador
  - Skapade komplett designspec: `docs/wiki/designspec-status-editering.md`

---

## 5. REGLER FÖR AI-ASSISTENTER

1. **Inga gissningar** — Verifiera mot faktisk databas/kod innan ändringar
2. **Små PR:er** — En funktion per PR
3. **SQL i var sin box** — Per kopierar en åt gången
4. **Fråga före åtgärd** — Ställ frågor innan du gör ändringar
5. **Exakta sök-och-ersätt** — Per arbetar via GitHub web editor, ge söksträngar och ersättningar (inte radnummer som kan skifta)
6. **Testa med specifika reg.nr** — ZAG53Y, LRA75R, ARA97Z, JBU34P (MB, elbil), XGP07K (VW, nybil), NGW96M (MB, diesel) etc.
7. **Rensa testdata efteråt**
8. **Revert vid cirkulärt debugging**
9. **Dubbelkolla BÅDA kodvägarna** i vehicle-status.ts
10. **Om 3 försök misslyckas** — sammanfatta och erkänn
11. **Förstå verkligheten** — Fråga Per om affärslogiken. Inga bilar är markerade som sålda. 78 av 1077 bilar har nybilsregistrering. Fråga "hur många rader påverkas?" innan du bygger filter/features.

---

## 6. VANLIGA FALLGROPAR

| Fallgrop | Exempel | Lösning |
|----------|---------|---------|
| Referera till kolumner som inte finns | `vehicle_id`, `fuel_level`, `inchecker_name` | Schema-query FÖRST |
| Missa andra kodvägen | Ändring i kodväg 1 men inte 2 | Sök ALLA förekomster |
| Bygga oanvända tabeller/views | active_damages, vehicle_damage_summary | Läs faktisk kod |
| SQL med fel kolumnnamn | Bottar gissar kolumnnamn | Per: "100% koll krävs" |
| SQL i en enda box | Per kan inte kopiera | En SQL per kodblock |
| "Kompilerar" = "fungerar" | PR #218-222, #228 passerade TS men failade runtime | Testa i preview |
| Fortsätta utan framsteg | 10+ meddelanden på samma problem | Erkänn efter 3 försök |
| Inte läsa wiki | Bot förstod inte att "dokumentera en BUHS-skada igen" är omöjligt | Läs ALLA docs i /wiki |
| Anta att matchning är enkel | OVRIG_SKADA ≠ OVRIGT, Repa ≠ Repor | Normalisera + fuzzy match |
| Ändra fel kodblock i stor fil | 7+ bottar ändrade rad ~2325 men inte ~1435 (eller tvärtom) | Sök med exakt textsträng |
| Bilden går via annotatorn | compressImage aldrig anropad — processFiles skippas | Kolla handleAnnotatorSave |
| `includes('el')` matchar 'diesel' | PR #281 — alla dieselbilar blev elbilar i /ankomst | Kolla matchningsordning |
| Bygga filter utan data | PR #279 filtrerar is_sold men inga bilar har det värdet | Kör COUNT-query först |

---

## 7. PLANERADE FUNKTIONER

### Buggar och grundläggande fixes

| # | Funktion | Status |
|---|----------|--------|
| 1 | notify/route.ts: sluta skriva dubblett till damages vid dokumenterad BUHS | Kvarstår |
| 2 | GEU29F: ta bort flagga vid nästa incheckning | Väntar |
| 3 | MJB18C: dubblett-skada i /status | Känt, ej åtgärdat |
| 4 | Röda flaggor i Bilkontroll-mejl (Rekond, Rökning, Husdjur) | Kvarstår |

### /status-editering (detaljerad designspec i `docs/wiki/designspec-status-editering.md`)

| Fas | Innehåll | Status |
|-----|----------|--------|
| **Fas 1** | `vehicle_edits`-tabell + grundläggande editering av fordonsfakta + historikloggning | **NÄSTA ATT IMPLEMENTERA** |
| **Fas 2** | "Markera som såld" (egen knapp, reverserbar, banner) + utöka sold-filter till vehicles.is_sold | Designad, ej påbörjad |
| **Fas 3** | Skadekategorisering (4 kategorier) + `damage_comments`-tabell + utskriftsstöd | Designad, ej påbörjad |

### Övriga funktioner

| # | Funktion | Status |
|---|----------|--------|
| 6 | Dubbel mätarställning i mejl | Ej gjord |
| 7 | Kvittobild vid tankning | Ej gjord |
| 8 | Datum för "Däck som sitter på" | Ej gjord |
| 10 | Serviceintervall-varningar | Ej påbörjad |
| 11 | Smart validering (mätarställning/hjultyp) | Ej påbörjad |
| 12 | Rollbaserad autentisering | Ej påbörjad |
| 13 | Databasrensning (~27 tabeller) | Analyserat |
| 14 | Bättre filnamn nybil-photos | Ej gjord |
| 15 | Fontstorlekar + utskrift CSS | Parkerad |
| 16 | Stabil numrering per skada per reg.nr | Diskuterat, ej påbörjat |
| 17 | Historik-emoji på collapsed poster med avvikelser | Diskuterat, ej påbörjat |
| 18 | /nybil dubbletthantering: "Skriv över befintligt" | Parkerad |

---

## 8. E-POSTÖVERSIKT (feb 2026)

| Mejl | Mottagare | Ämnesrad | Emojis |
|------|-----------|----------|--------|
| /check incheckning | Huvudstation | `[emojis] INCHECKAD: [regnr] - [station]` | ⚡ låg laddning, 🛑 saludatum, ⚠️ skador/varningar |
| /check incheckning | Bilkontroll | `[emojis] INCHECKAD: [regnr] - [station]` | 🛑 saludatum, ⚠️ skador |
| /nybil nybilsregistrering | Bilkontroll | `NYBIL: [regnr]` | — |
| /ankomst ankomst | Huvudstation | `🔵 PRELLA: [regnr] - [station]` | 🔵 alltid |

---

## 9. DATABASFAKTA (snapshot 2026-03-09)

**Aktiva tabeller:** checkins (1294), vehicles (1077), damages (925), damages_external (727), checkin_damages (~604; 221 new, 123 documented, 251 not_found, 9 existing), nybil_inventering (78), damage_type_ref (8), stations (6), employees (4), arrivals (12)

**Sålda bilar:** 0 i nybil_inventering, 0 i vehicles (2026-03-09). Ingen mekanism finns ännu — byggs i fas 2.

**Tabeller som INTE finns ännu:** `vehicle_edits`, `damage_comments` — skapas i fas 1 resp. fas 3.

**checkin_damages.type-distribution (2026-03-09):**
- new: 221
- not_found: 251
- documented: 123
- existing: 9 (relik, se 3r)

**Nyckelfält:**
- `damages.source` = 'CHECK' | 'BUHS' | 'csv_import_20260114'
- `damages.legacy_damage_source_text` = originaltext från BUHS
- `damages.original_damage_date` = BUHS-skadedatum
- `checkin_damages.type` = 'new' | 'documented' | 'existing' | 'not_found'
- `checkin_damages.positions` = JSONB array med {carPart, position}
- `damages.uploads` = JSONB med {folder: "..."}
- `checkins.checklist` = JSONB med avvikelseflaggor
- `vehicles.bransletyp` = text (Bensin, Diesel, Hybrid (bensin), Hybrid (diesel), El (full))
- `vehicles.is_sold` = boolean (alltid null/false idag)
- `nybil_inventering.is_sold` = boolean (alltid null/false idag)

**RPC:** `get_all_allowed_plates()`, `get_damages_by_trimmed_regnr()`, `get_vehicle_by_trimmed_regnr()`, `get_nybil_baseline()`

---

## 10. KRONOLOGISK TIDSLINJE

| Datum | Händelse | PR |
|-------|---------|-----|
| 2025-08 | Första /check | — |
| 2025-09 | JSX-debugging, revert-strategi | — |
| 2025-10 | Stationer konfigurerade | — |
| 2025-11-03 | Första CSV-import (98 spökrader) | — |
| 2025-11-18 | checkins-tabellen skapad | — |
| 2025-11-20 | /nybil laddnivå, nybilsbilder /status | #175 |
| 2025-12-02 | Stationer cleanup | #168 |
| 2025-12-05 | Varberg + dubbletter | #181, #184 |
| 2025-12-08 | Expanderbar historik, nybilslänk | #197-198 |
| 2025-12-12 | fuel_level-bugg börjar | — |
| 2025-12-16 | fuel_level fixad | #204 |
| 2025-12-17 | source-fix, faktaruta, galleri | #205-212 |
| 2025-12-22 | Misslyckade BUHS-matchnings-PRs | #218-222 |
| 2026-01-05 | BUHS-matchning /status (text-baserad) | #225 |
| 2026-01-05 | GEU29F /check + /status | #226, #227 |
| 2026-01-08 | TLJ05S-försök (fail) | #228 |
| 2026-01-09 | Media-fix, Database.md | #233 |
| 2026-01-12 | /nybil-förbättringar | #230 |
| 2026-01-13 | Source-fix: 569 skador CHECK→BUHS | — |
| 2026-01-14 | Bilkontroll+Bilfakta import, +15 kolumner | — |
| 2026-01-15 | legacy_damage_source_text, YNK43N→JBK29K | — |
| 2026-01-16 | Skadefil-import, damage_type_ref, loose matching | #235 |
| 2026-01-23 | LRA75R-debugging börjar | — |
| 2026-01-26 | Matchningsfix + formatering | #248, #249 |
| 2026-02-13 | **HISTORIK-buggen löst!** | #258 |
| 2026-02-13 | Medialänkar i HISTORIK fixade | #259 |
| 2026-02-16 | Bildkomprimering fixad | #263 |
| 2026-02-18 | /ankomst komplett feature | #272 |
| 2026-02-23 | INVANDIG_SKADA, autocomplete, slutpolish | #275 |
| 2026-02-27 | 6 PR:er: modal, mätarställning, avtalsvillkor, sold-filter, avbryt, diesel-fix | #276-281 |
| 2026-02-27 | Journal v5 + handoff | — |
| **2026-03-09** | **Designspec /status-editering klar. Journal v6.** | — |

---

## 11. VIKTIGA TESTREG.NR

| Reg.nr | Varför viktigt |
|--------|---------------|
| LRA75R | HISTORIK-buggen (3 BUHS-skador, 10+ PR-försök). Primärt testfall feb 2026. |
| ZAG53Y | Repa/Repor-normalisering. Testreg.nr för saludatum + /ankomst. KIA EV6 (elbil). |
| GEU29F | Feature flag, 6 BUHS-skador, dataintegritetsproblem, 6 `existing`-rader |
| CCC03L | Befintliga skador visades om och om igen (user_type null) |
| MJB18C | Dubblett-problem (ej åtgärdat) |
| NGE97D | Dedup-problem: visar 2 istf 1 |
| TLJ05S | not_found-display, "Källa BUHS"-clutter |
| JBK29K | 10 CHECK + 1 BUHS, felincheckning fixad |
| JBU34P | MB elbil — testfall för UPPKOPPLING-sektion + MBme |
| XGP07K | VW, nybilsregistrerad — testfall för nybil-data i /status |
| NGW96M | MB CITAN, diesel — upptäckte diesel→elbil-buggen i /ankomst |
| KDU100 | 6 BUHS-skador, 2 `existing`-rader, alla user_type=null → omdokumenteras vid nästa incheckning |
| MMX48U | 3 BUHS-skador, 1 `existing`-rad, user_type=null → omdokumenteras vid nästa incheckning |

---

## 12. DESIGNDOKUMENT

| Fil | Syfte | Skapad |
|-----|-------|--------|
| `docs/wiki/designspec-status-editering.md` | **Komplett designspec för /status-editering + skadekategorisering + damage_comments** | 2026-03-09 |
| `handoff-status-editering-20260227.md` | Handoff från session 2026-02-27 (ersatt av designspec, men bevarad som historik) | 2026-02-27 |

---

*Journal v6: Täcker sep 2025 – mar 2026. Uppdaterad 2026-03-09 med: designspec för /status-editering (3 faser), utredning av type=existing (3r), uppdaterade databasfakta, KDU100/MMX48U-verifiering, GEU29F-flaggans två platser, ny tidslinje-rad, nya testreg.nr.*
