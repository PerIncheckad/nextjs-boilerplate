# Steg 3.1 — Datamodell- och databasberoendeinventering

**Status:** Read-only Production-baseline efter genomförd Steg 3.1A-säkerhetsreparation — redo för låsbeslut  
**Datum:** 2026-08-18  
**Kodbaseline:** `8b152db4d1dbfec202d0dc207ab3ff8fa499cc3f` (`main`)  
**Production-projekt:** Supabase `incheckad` (`ufioaijcmaujlvmveyra`)  
**Arbetsprincip:** `behålla → reparera → ta bort → addera`

## 1. Syfte och avgränsning

Steg 3.1 fastställer vad Production-datamodellen faktiskt bär, vad aktuell applikation och dokumenterade driftprocesser faktiskt använder samt vilka relationer, källor och redundanser som måste förstås innan cleanup eller redesign.

Själva inventeringen är read-only. Den har använt metadata- och SELECT-frågor mot Production samt läsning av aktuell kod och drift-/importdokumentation.

Steg 3.1 gör **inte** följande:

- raderar tabeller, kolumner, historik eller media,
- ändrar affärsdata,
- skapar nya domänobjekt,
- normaliserar schema i bulk,
- byter processmotor,
- gör write probes för att bevisa datamodellfynd.

Steg 3.1A var en separat säkerhetsreparation. Den är genomförd och verifierad; detta dokument beskriver dess slutläge men applicerar ingen säkerhetsmigration.

Ingen tabell eller kolumn godkänns för DROP genom 3.1.

## 2. Färsk Production-baseline

Live-verifierat efter Steg 3.1A:

| Mått | Production 2026-08-18 |
|---|---:|
| Tabeller i `public` | **44** |
| Views i `public` | **6** |
| Relationsobjekt totalt | **50** |
| Kolumner | **802** |
| Index | **59** |
| Funktioner | **14** |
| `SECURITY DEFINER`-funktioner | **7** |
| Foreign keys | **9** |
| RLS-policies | **25** |
| Triggers | **3** |
| Objekt med `regnr`-liknande kolumn | **41 av 50** |

Repoets migrationsmapp är därmed inte ensam source of truth för historisk Production-struktur. Live-metadata ska användas för varje förändringsbeslut.

## 3. Steg 3.1A — den röda accessblockeraren är stängd

Den tidigare 3.1-inventeringen upptäckte direkt Supabase-access som låg parallellt med det säkrade `/api`-lagret. Det reparerades separat i PR #318 och #319 och verifierades därefter i Production.

Aktuellt live-läge:

- `anon` har inga tabellgrants i `public`,
- `authenticated` har endast den verifierade browser-allowlisten,
- `authenticated` har 11 SELECT-grants, 2 INSERT-grants, 1 UPDATE-grant och 0 DELETE-grants,
- de tre browser-RPC:erna `get_all_allowed_plates`, `get_vehicle_by_trimmed_regnr` och `get_damages_by_trimmed_regnr` är `SECURITY INVOKER`,
- `anon` kan inte exekvera någon av de 14 `public`-funktionerna,
- de kvarvarande 7 `SECURITY DEFINER`-funktionerna är inte exekverbara av vanlig `authenticated`; service role behåller serverkontrakten.

Den röda accessblockeraren ska därför **inte** längre stå som ett öppet 3.1-fynd.

## 4. Huvudslutsats

Databasen bär en verklig operativ kärna och ska inte ersättas som om den vore tom eller misslyckad.

Det centrala strukturfyndet är i stället:

> Fordonets och skadans aktuella bild rekonstrueras från många objekt genom registreringsnummer, historiska textfält, RPC:er, fallbackkedjor, importer och manuella overrides. Databasen fungerar operativt, men relationell identitet och source-of-truth är inte konsekvent genom hela kedjan.

Att **41 av 50** `public`-objekt har ett `regnr`-liknande fält visar hur starkt registreringsnummer används som integrationsnyckel mellan delmodeller.

## 5. Operativ kärna — live snapshot

Row counts är ett ögonblicksfoto och kan ändras medan verksamheten använder Production.

| Objekt | Rader | Verifierad roll | Klassning |
|---|---:|---|---|
| `checkins` | 3 737 | Incheckningar och historik | **BEHÅLL / REPARERA relationell identitet** |
| `checkin_damages` | 1 296 | Skador dokumenterade vid Check | **BEHÅLL** |
| `damages` | 1 370 | Central skadehistorik från BUHS/CHECK/NYBIL | **BEHÅLL / REPARERA source-of-truth** |
| `vehicles` | 1 261 | Fordonsmaster / Bilkontroll | **BEHÅLL** |
| `nybil_inventering` | 195 | Nybilsinventering | **BEHÅLL / REPARERA alias** |
| `arrivals` | 184 | Ankomsthistorik | **BEHÅLL** |
| `vehicle_receipts` | 125 | Kvittoevidens | **BEHÅLL / REPARERA FK** |
| `vehicle_edits` | 3 | Override-/ändringshistorik | **BEHÅLL** |
| `employees` | 4 | DB-side accesskontrakt för aktiva employees | **BEHÅLL** |

## 6. Foreign keys — strukturen finns, men används ojämnt

Production har 9 FK-kontrakt:

1. `checkin_damages.checkin_id → checkins.id`
2. `checkins.completed_by → auth.users.id`
3. `checkins.employee_id → employees.id`
4. `checkins.locked_by → auth.users.id`
5. `checkins.started_by → auth.users.id`
6. `checkins.station_id → stations.id`
7. `damage_media.damage_id → damages.id`
8. `damage_positions.damage_id → damages.id`
9. `damage_type_ref.parent_code → damage_type_ref.code`

Tre logiska relationer saknar FK, men deras nuvarande data är redan referentiellt ren:

| Logisk relation | Populerade referenser | Orphans |
|---|---:|---:|
| `vehicle_receipts.checkin_id → checkins.id` | **125** | **0** |
| `damages.nybil_inventering_id → nybil_inventering.id` | **5** | **0** |
| `damage_comments.damage_id → damages.id` | **0** | **0** |

Detta gör dem till tydliga **REPARERA-kandidater** för senare kontrollerad constraint-migration, utan att 3.1 själv lägger till constraints.

## 7. `checkins`: relationell scaffolding är i praktiken oanvänd

Live-data visar:

- `employee_id`: 0 av 3 737 rader,
- `started_by`: 0,
- `completed_by`: 0,
- `locked_by`: 0,
- `station_id`: 0,
- `completed_at`: 3 737.

Samtidigt är textkontrakten i aktiv användning:

- `station`: 3 736 rader,
- `current_station`: 3 737 rader,
- `checker_email`: 3 729 rader,
- `station_other`: 0 rader.

Datamodellen har alltså relationsfält och FK:er för användare/station, men verksamhetshistoriken bärs fortfarande nästan helt av textfält.

**Klassning: REPARERA source-of-truth och identitet innan någon av de gamla eller nya fälten tas bort.**

## 8. Stationer: två parallella modeller

`public.stations` innehåller 6 aktiva huvudstationer: Halmstad, Helsingborg, Lund, Malmö, Trelleborg och Varberg.

Aktuell kod har samtidigt en statisk `STATIONS`-struktur med betydligt mer granularitet, exempelvis verkstäder och underdestinationer per ort.

`checkins.station_id` är aldrig populär i nuvarande 3 737 rader, medan `checkins.station` har 25 olika textvärden.

Det betyder att `stations`-FK:n är **strukturell scaffolding**, inte faktisk nuvarande source of truth.

**Klassning: REPARERA/VERIFIERA.** Ingen stationstabell eller statisk lista tas bort innan en kanonisk stationsmodell är beslutad.

## 9. Nybil: aliasen är live-verifierat synkroniserade

Nuvarande Nybil-kod dual-skriver flera semantiskt överlappande fält. Live-data visar att paren är fullständigt synkroniserade i nuvarande data:

| Aliaspar | Populerat | Mismatch |
|---|---:|---:|
| `modell` / `bilmodell` | 195 / 195 | **0** |
| `registreringsdatum` / `ankomstdatum` | 195 / 195 | **0** |
| `hjultyp` / `monterade_dack` | 195 / 195 | **0** |
| `hjul_ej_monterade` / `hjul_till_forvaring` | 195 / 195 | **0** |
| `hjul_forvaring_ort` / `hjul_forvaring_station` | 173 / 173 | **0** |
| `dackkompressor` / `kompressor` | 195 / 195 | **0** |

Detta är stark evidens för att aliasen kan konsolideras senare, men endast efter att aktuell kod, views, notifieringar och historiska exportbehov flyttats till ett kanoniskt fält per betydelse.

**Klassning: REPARERA; stark retirement-kandidat efter kodmigrering.**

## 10. Check: flera gamla alias är nästan helt tomma

Live-data visar en tydlig skillnad mellan nuvarande och äldre representationer:

- `hjultyp`: 3 719 populära rader,
- `wheel_type`: 1,
- `tires_type`: 0,
- `fuel_level`: 2 120,
- `fuel_level_percent`: 0,
- `charge_cables_count`: 749,
- `charging_cables`: 1,
- `chargers_count`: 0.

Detta gör `wheel_type`, `tires_type`, `fuel_level_percent`, `charging_cables` och `chargers_count` till **starka retirement-kandidater**, men inte DROP-godkända i 3.1. Kodreferenser och historiska export-/rollbackkrav ska stängas först.

## 11. BUHS: aktiv data dupliceras i två tabeller

`damages` innehåller nu:

- **727** BUHS-rader,
- **638** CHECK-rader,
- **5** NYBIL-rader.

Senaste `imported_at` för BUHS-rader är 2026-01-16. Detta är ett freshness-observandum, inte i sig bevis på att processen är avslutad.

`damages_external` innehåller samtidigt **727** rader. En symmetrisk read-only jämförelse av de sju BUHS-fälten visar:

- BUHS-rader som saknas i `damages_external`: **0**,
- rader i `damages_external` som inte finns i BUHS-delen av `damages`: **0**.

`damages_external` är alltså i dagens snapshot en exakt kopia av BUHS-delen som den aktiva RPC:n `get_damages_by_trimmed_regnr` läser.

Driftdokumentationen beskriver dessutom att `damages_external` ska tömmas och fyllas på manuellt efter BUHS-import.

**Klassning: REPARERA.** Bevara RPC-kontraktet, men utvärdera senare om det kan härledas direkt från `damages WHERE source='BUHS'` via view/RPC i stället för manuell dubbel lagring.

## 12. Manuell import och backup är fortfarande en del av dokumenterad drift

Repoets CSV-importinstruktion beskriver explicit:

- backup av `damages` före BUHS-import,
- staging via `mabi_damage_data_raw_new`,
- UPSERT till `damages`,
- manuell synkning till `damages_external`,
- backup av `vehicles` före Bilkontroll-import,
- staging via `vehicles_staging`,
- UPSERT till `vehicles`.

Production innehåller **14 namngivna backup-tabeller med totalt 8 254 rader**. De är därför inte "tomma gamla tabeller".

Aktuella staging/importobjekt innehåller bland annat:

- `mabi_damage_data_raw_new`: 489 rader,
- `skador_staging`: 521,
- `vehicles_staging`: 1 004,
- `mabi_damage_data`: 523,
- `mabi_damage_data_raw`: 566.

**Klassning: VERIFIERA/ARKIVERA senare.** Innan backup-/stagingtabeller flyttas eller tas bort måste importprocessen ersättas, retention definieras och återställningsbehov säkras utanför `public`.

## 13. Legacy DB-side lager har dolda beroenden

Tre service-only `SECURITY DEFINER`-funktioner — `car_lookup_any`, `damages_lookup_any` och `wheel_lookup_any` — bygger dynamisk SQL genom att inspektera `information_schema` och söka bland tabeller med matchande kolumnnamn.

De har ingen nuvarande repo-konsument funnen i aktuell `main`, men deras design innebär att backup-, staging- och legacytabeller kan bli indirekta datakällor så länge funktionerna finns.

Övriga DB-side kontrakt utan nuvarande reporeferens inkluderar bland annat:

- `try_lock_checkin`, `heartbeat_lock`, `release_lock`,
- `get_documented_legacy_texts`,
- `get_nybil_baseline`,
- `upsert_vehicles_from_staging`.

Efter 3.1A är de inte browseröppna, vilket gör dem mindre akuta, men de ska **verifieras/retireras kontraktsvis** innan relaterade tabeller tas bort.

## 14. Två konkreta legacy-/redundansfynd

### 14.1 `allowed_plates` är inte source of truth för den aktiva allowlist-RPC:n

`allowed_plates` innehåller 820 rader, men `get_all_allowed_plates()` använder inte tabellen. RPC:n härleder i stället plåtar från `vehicles`, `nybil_inventering` och `checkins`.

Jämförelse mot dagens härledda mängd:

- `allowed_plates`: 820,
- härledd aktiv mängd: 1 289,
- endast i `allowed_plates`: 10,
- endast i härledd mängd: 479.

**Klassning: VERIFIERA / stark retirement-kandidat.**

### 14.2 `active_damages` är en projektion av `car_data`

Både `active_damages` och `car_data` har 460 rader och samma 213 distinkta registreringsnummer. Multiset-jämförelse på de gemensamma fälten `regnr`, `brand_model`, `damage_text` ger 0 differenser åt båda håll.

`vehicle_damage_summary` bygger på `active_damages`, men ingen aktuell reporeferens till vyn har hittats.

**Klassning: VERIFIERA / konsolideringskandidat**, inte DROP ännu eftersom legacy DB-side dynamiska funktioner först måste stängas.

## 15. Tomma och sparsamma kontrakt ska separeras från verkligt döda objekt

| Objekt | Rader | Aktuell evidens | Klassning |
|---|---:|---|---|
| `checkin_drafts` | 0 | UI-läsare finns; dubbla update-triggers | **VERIFIERA / REPARERA trigger** |
| `checkins_submissions` | 0 | Ingen aktuell reporeferens hittad | **VERIFIERA** |
| `damage_comments` | 0 | Status/API-kontrakt finns | **BEHÅLL KONTRAKT / REPARERA FK** |
| `damage_media` | 0 | Rapportkod läser tabellen | **BEHÅLL KONTRAKT / VERIFIERA media** |
| `damage_positions` | 0 | Ingen aktuell appreferens hittad | **VERIFIERA** |
| `damages_current` | 0 | Ingen aktuell reporeferens hittad | **VERIFIERA** |
| `tire_storage` | 0 | DB-view finns; ingen aktuell appreferens hittad | **VERIFIERA** |
| `vehicle_status_log` | 0 | Ingen aktuell reporeferens hittad | **VERIFIERA** |
| `checkin_damage_photos` | 2 | Ingen aktuell appreferens; båda rader från 2025-08-26 | **BEHÅLL EVIDENS / VERIFIERA migration** |
| `duplicates_to_delete` | 32 | Ingen aktuell reporeferens hittad | **VERIFIERA provenance** |
| `damage_type_ref` | 8 | SQL/backfill-dokumentation, ingen aktuell appreferens | **VERIFIERA** |

Tomhet är inte borttagningsbevis. Historisk media/evidens ska särskilt skyddas.

## 16. Views — sex stycken, alla `security_invoker=true`

- `mabi_damage_view` ← `mabi_damage_data_raw`
- `simple_mabi_damage` ← `mabi_damage_data`
- `tire_storage_summary` ← `tire_storage`
- `v_nybil_baseline` ← `nybil_inventering`
- `v_wheel_storage_precedence` ← `vehicles` + `v_nybil_baseline`
- `vehicle_damage_summary` ← `active_damages`

Alla sex kör med `security_invoker=true`.

Flera saknar aktuell reporeferens och hör därför hemma i **VERIFIERA**, inte i automatisk BEHÅLL eller TA BORT.

## 17. Funktioner — 14 stycken

### Aktiva browserkontrakt

- `get_all_allowed_plates`
- `get_vehicle_by_trimmed_regnr`
- `get_damages_by_trimmed_regnr`

Dessa är nu `SECURITY INVOKER` och behålls.

### Infrastruktur

- `set_updated_at`
- `_coalesce_expr`

### Legacy/service-only att verifiera

- `car_lookup_any`
- `damages_lookup_any`
- `wheel_lookup_any`
- `get_documented_legacy_texts`
- `get_nybil_baseline`
- `try_lock_checkin`
- `heartbeat_lock`
- `release_lock`
- `upsert_vehicles_from_staging`

## 18. Triggers — dubblering i drafts

Production har tre apptriggers:

- `checkins.trg_set_updated_at` → `set_updated_at()` före UPDATE,
- `checkin_drafts.trg_drafts_updated_at` → `set_updated_at()` före UPDATE,
- `checkin_drafts.trg_set_updated_at` → `set_updated_at()` före UPDATE.

`checkin_drafts` har alltså två BEFORE UPDATE-triggers som gör samma sak trots att tabellen nu har 0 rader.

**Klassning: REPARERA när drafts-kontraktet tas upp; inte akut Production-risk.**

## 19. Exakta redundanta index

Live-indexdefinitionerna visar två verifierade dubletter:

- `damages_regnr_idx` och `idx_damages_regnr` är båda vanliga btree-index på `damages(regnr)`,
- `vehicles_pkey` och `vehicles_regnr_key` är båda unika btree-index på `vehicles(regnr)`.

Detta är lågkomplex teknisk skuld, men index tas inte bort i 3.1. Constraint-/PK-semantik ska bevaras när `vehicles_regnr_key` bedöms.

## 20. Status och vehicle-info visar den verkliga precedensproblematiken

`lib/vehicle-status.ts` kombinerar i samma fordonsbild bland annat:

1. `nybil_inventering`,
2. `get_vehicle_by_trimmed_regnr`,
3. `damages`,
4. `get_damages_by_trimmed_regnr`,
5. `checkins`,
6. `arrivals`,
7. `vehicle_edits`,
8. `damage_comments`,
9. `checkin_damages` via skyddat server-API.

Vehicle-info kombinerar motsvarande kärnkällor server-side.

BUHS-resultat saknar `damages.id` i det externa RPC-kontraktet, vilket gör att applikationen måste matcha BUHS-rader till `damages` med sammansatta text-/datumfält.

**Klassning: REPARERA precedens och kanonisk skadeidentitet.**

## 21. Media är fortfarande fragmenterat

Aktuell modell innehåller flera representationer:

- `damages.uploads`,
- `checkin_damages.photo_urls` / `video_urls`,
- Storage-mappar,
- `damage_media`,
- Nybil `photo_urls` / `media_folder`,
- `vehicle_receipts` för kvittofiler,
- legacy `checkin_damage_photos`.

`damage_media` är tom medan aktiv skadeevidens finns i andra representationer. `checkin_damage_photos` har två äldre rader.

**Klassning: REPARERA/VERIFIERA.** Ingen mediakälla tas bort innan evidensmigrering och läsare är verifierade.

## 22. Atomitet är en separat integritetsfråga

Check persisterar en affärshändelse över flera writes, bland annat `checkins`, `vehicles`, `damages`, `checkin_damages`, `vehicle_receipts` och notifiering. Ankomst har motsvarande flerledat flöde kring `arrivals`, fordonsuppdatering och notifiering.

Detta är inte ett argument för schema-redesign i 3.1, men det är en senare **REPARERA data-integritet**-punkt: affärshändelser kan annars bli delvis persisterade vid fel.

## 23. Klassning enligt revisionsordningen

### BEHÅLL

Operativ kärna och evidens:

- `checkins`
- `checkin_damages`
- `damages`
- `vehicles`
- `nybil_inventering`
- `arrivals`
- `vehicle_receipts`
- `vehicle_edits`
- access-/historikkontrakt som aktuell kod faktiskt använder
- befintlig media/evidens tills migrerad och verifierad

### REPARERA — nästa ordning

1. **Relationell integritet:** förbered de tre saknade FK-kontrakten som nu har 0 orphans.
2. **BUHS source of truth:** eliminera senare manuell dubbel lagring `damages` → `damages_external` utan att ändra RPC-beteende.
3. **Station/användaridentitet:** avgör kanonisk modell innan textfält eller FK-scaffolding pensioneras.
4. **Nybil-/Check-alias:** flytta läsare/skrivare till kanoniska fält och pensionera gamla alias stegvis.
5. **Legacy DB-side kontrakt:** retire/ersätt dynamiska RPC:er och dokumentera importvägar innan legacytabeller arkiveras.
6. **Redundanta index:** ta bort endast efter constraint-/query-verifiering.
7. **Media och atomitet:** konsolidera utan att förlora evidens eller fungerande flöden.

### VERIFIERA / ARKIVERA

- 14 backup-tabeller och retention,
- staging-/importtabeller,
- `allowed_plates`,
- `active_damages` / `car_data`,
- tomma/sparsamma legacykontrakt,
- views och service-only RPC:er utan aktuell repokonsument.

### TA BORT

**0 objekt godkända för borttagning i Steg 3.1.**

### ADDERA

**0 nya domänobjekt behövs för att stänga Steg 3.1.**

## 24. Rekommenderat nästa steg — Steg 3.2

Steg 3.1 har nu tillräcklig evidens för att stängas som inventeringsfas.

Nästa steg bör vara **Steg 3.2 — relationer och source-of-truth**, i små reversibla delsteg:

1. verifiera migrationsteknik för de tre saknade FK:erna och applicera först när CI/regression är definierad,
2. designa en beteendebevarande ersättning för `damages_external`,
3. besluta stations-/användaridentitet och precedens,
4. därefter alias-/legacyretirement.

Backup-/stagingcleanup och större schemaförenkling ska komma **efter** dessa kontrakt, inte före.

## 25. Låst princip

> Historik, evidens och fungerande kärnflöden är tillgångar. Databasstädning får inte börja med namn, ålder eller upplevd redundans. Varje förändring ska först visa vilken aktuell konsument, relation, accessgräns, datahistorik och fallback den ersätter.

**Behålla → reparera → ta bort → addera.**
