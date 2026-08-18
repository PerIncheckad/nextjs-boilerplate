# Steg 3.1 — Datamodell- och databasberoendeinventering

**Status:** Read-only Production-baseline med öppet rött säkerhetsfynd — inga schemaändringar  
**Datum:** 2026-08-18  
**Kodbaseline:** `d1bbf5f318405028113f12c5dd162662b7065464` (`main` efter Steg 2.6)  
**Production-projekt:** Supabase `incheckad` (`ufioaijcmaujlvmveyra`)  
**Arbetsprincip:** `behålla → reparera → ta bort → addera`

## 1. Syfte och avgränsning

Steg 3.1 ska fastställa vad datamodellen faktiskt bär, vad applikationen faktiskt använder och var relationer, källor eller accessgränser är otydliga innan någon databasmigrering, normalisering eller borttagning övervägs.

I detta steg har endast **read-only metadatafrågor** körts mot Production. Ingen DDL eller DML har körts och inga verksamhetsrader har ändrats.

Detta dokument gör därför **inte** följande:

- ändrar tabeller, vyer, funktioner, constraints, index, grants eller policies,
- skapar eller applicerar migrationer,
- raderar legacy-/backupobjekt,
- redesignar domänmodellen,
- ändrar app-, API- eller affärslogik,
- utför write probes mot Production.

Ingen tabell eller kolumn är godkänd för borttagning genom detta dokument.

## 2. Evidensnivåer

Inventeringen bygger på tre separata evidenslager.

### A. Aktuell kodevidens — 2026-08-18

Exakt `main` på commit `d1bbf5f318405028113f12c5dd162662b7065464` har granskats för direkta Supabase-anrop, RPC-anrop, server-side service-role-vägar, klientskrivningar och datakällor i de centrala flödena.

Detta är stark evidens för **vilka objekt den nuvarande applikationen refererar till**.

### B. Historisk Production-schemaevidens — 2026-08-16

Tidigare schemaexport gav omfattningen cirka **50 tabeller/vyer, 802 kolumndefinitioner, 59 index, 35 RLS-policies, 14 databasfunktioner och 6 foreign keys**. Den äldre rapportens constraint-tal byggde på en annan räknemetod och jämförs därför inte direkt med `pg_constraint` nedan.

### C. Färsk live-metadata — 2026-08-18

Supabase Production har nu inventerats direkt med read-only metadatafrågor.

Verifierat live:

| Mått | Production 2026-08-18 |
|---|---:|
| Vanliga/partitionerade tabeller i `public` | 44 |
| Views/materialized views i `public` | 6 |
| Relationsobjekt totalt | **50** |
| Kolumner | **802** |
| Index | **59** |
| Funktioner | **14** |
| Foreign keys | **9** |
| RLS-policies | **35** |
| Triggers | **3** |

Detta bekräftar att repoets migrationsmapp **inte** är ett komplett facit för Production.

## 3. Nytt rött fynd — direkt Supabase-access kringgår `/api`-gränsen

Steg 2.1 reparerade den verifierade kedjan:

`användare → klient → /api → verifierad serveridentitet → service role → Supabase`

Live-databasen visar nu en **separat accessväg** som inte passerar `/api`:

`extern klient → Supabase REST/RPC → RLS/grants → Production-data`

Detta är ett nytt, separat säkerhetsfynd och innebär inte att Steg 2.1-reparationen var fel. API-gränsen fungerar som avsett; problemet är att vissa databaskontrakt fortfarande tillåter direkt access vid sidan av den.

### 3.1 `checkins` — anonym läsning och skrivning är explicit tillåten

Production har samtidigt table grants för `anon` och följande permissiva RLS-policies:

- `SELECT` för `anon` med `USING (true)`,
- `INSERT` för `anon` med `WITH CHECK (true)`,
- `UPDATE` för `anon` med `USING (true)` och `WITH CHECK (true)`.

`checkins` innehåller cirka **3 729 rader**.

Detta betyder att server-API-autentiseringen inte är den enda gränsen runt incheckningsdata.

**Klassning: RÖD — REPARERA före fortsatt datamodellstädning.**

### 3.2 `checkin_damages` — anonym läsning och insert är explicit tillåten

Production har cirka **1 289 rader** och permissiva `anon`-policies för:

- `SELECT` med `USING (true)`,
- `INSERT` med `WITH CHECK (true)`.

**Klassning: RÖD — REPARERA.**

### 3.3 Fler direktaccesskontrakt måste klassificeras

Live-policyerna visar också bland annat:

- `vehicles`: publik SELECT med `USING (true)`; cirka **1 261 rader**,
- `nybil_inventering`: `authenticated` har `ALL` med `USING/WITH CHECK (true)`; cirka **26 rader**,
- `arrivals`: autentiserade användare får SELECT/INSERT med `true`; cirka **18 rader**,
- `checkin_damage_photos`: `anon` SELECT/INSERT med `true` (tabellen är tom nu),
- `employees`: `anon` får läsa rader där `active` är true (tabellen är tom nu),
- `checkin_drafts`: policies är kopplade till `user_email = auth.email()` och är därför inte samma typ av öppen `true`-policy.

Att en tabell är tom idag gör inte en öppen policy säker för framtida data. Samtidigt ska inte alla publika reads automatiskt stängas utan att vi först verifierar vilka direkta klientflöden som fortfarande behöver dem.

### 3.4 Anonyma `SECURITY DEFINER`-RPC:er

Supabase Security Advisor flaggar att följande `SECURITY DEFINER`-funktioner kan exekveras av `anon` via `/rest/v1/rpc/...`:

- `car_lookup_any`,
- `damages_lookup_any`,
- `get_all_allowed_plates`,
- `get_damages_by_trimmed_regnr`,
- `get_documented_legacy_texts`,
- `get_vehicle_by_trimmed_regnr`,
- `heartbeat_lock`,
- `release_lock`,
- `try_lock_checkin`,
- `wheel_lookup_any`.

Flera av dessa är gamla eller aktiva lookup-/lock-kontrakt. `get_vehicle_by_trimmed_regnr` och `get_damages_by_trimmed_regnr` är bekräftat använda av aktuell applikation.

Detta måste repareras **kontraktsvis**, inte genom mass-revoke utan regressionstest.

Supabase Advisor flaggar dessutom mutable `search_path` på flera funktioner och att aktuell Postgres-build har säkerhetspatchar tillgängliga. Dessa är separata säkerhetshärdningar och ska inte blandas ihop med den primära direkta anon-exponeringen.

## 4. Huvudslutsats för datamodellen

Databasen ska **inte** behandlas som ett tomt eller misslyckat schema som bör ersättas. Den bär verklig operativ data, historik, skadebevis, nybilsinventering, incheckningar, ankomster och ekonomiskt relevanta kvitton.

Det huvudsakliga strukturfyndet är:

> Applikationen rekonstruerar fordons- och skadebilden från flera källor med registreringsnummer, RPC-funktioner, fallbackkedjor, manuella overrides, text-/datum-matchning och applikationslogik. Datamodellen fungerar operativt, men en gemensam kanonisk relations- och precedensmodell är inte tydligt etablerad genom hela kedjan.

**Men innan relationsstädning fortsätter måste den nyupptäckta direkta Supabase-accessgränsen repareras.**

## 5. Live-inventering av aktiv kärna

| Objekt | Live-rader | Aktuell användning | Klassning |
|---|---:|---|---|
| `checkins` | 3 729 | Check skriver; Status/vehicle-info läser | **BEHÅLL / RÖD ACCESSREPARATION** |
| `checkin_damages` | 1 289 | Check skriver; Status/vehicle-info läser | **BEHÅLL / RÖD ACCESSREPARATION / REPARERA relation** |
| `damages` | 1 369 | Central skadehistorik | **BEHÅLL / REPARERA** |
| `vehicles` | 1 261 | Fordonsmaster | **BEHÅLL / VERIFIERA publik read-intention** |
| `nybil_inventering` | 26 | Nybil skriver direkt; flera flöden läser | **BEHÅLL / REPARERA access + alias** |
| `arrivals` | 18 | Ankomst skriver; Status/vehicle-info läser | **BEHÅLL / REPARERA access** |
| `vehicle_receipts` | 125 | Kvittoevidens från Check | **BEHÅLL / REPARERA relation** |
| `vehicle_edits` | 0 | Kod stödjer manuell override/historik | **BEHÅLL KONTRAKT / VERIFIERA live-användning** |
| `damage_comments` | 0 | Kod stödjer kommentarer | **BEHÅLL KONTRAKT / REPARERA relation** |
| `damage_media` | 0 | Rapport läser tabellen | **VERIFIERA / REPARERA mediamodell** |
| `employees` | 0 | Authz-källa tillsammans med whitelist | **BEHÅLL KONTRAKT / REPARERA accessmodell** |
| `checkin_drafts` | 0 | Drafts-läsare finns i repo | **VERIFIERA livscykel** |
| `vehicle_status_log` | 0 | Ingen aktuell reporeferens hittad | **VERIFIERA** |

Row counts från Supabase-verktyget används här som aktuell metadata. Tomma tabeller är inte automatiskt borttagningskandidater.

## 6. Verifierade foreign keys — 9 totalt

Production har följande FK-kontrakt:

1. `checkin_damages.checkin_id → checkins.id`
2. `checkins.completed_by → auth.users.id`
3. `checkins.employee_id → employees.id`
4. `checkins.locked_by → auth.users.id`
5. `checkins.started_by → auth.users.id`
6. `checkins.station_id → stations.id`
7. `damage_media.damage_id → damages.id`
8. `damage_positions.damage_id → damages.id`
9. `damage_type_ref.parent_code → damage_type_ref.code`

Tre viktiga relationer som appen behandlar som logiska kopplingar saknar däremot FK:

- `damage_comments.damage_id` är UUID men har **ingen FK** till `damages.id`,
- `vehicle_receipts.checkin_id` är UUID men har **ingen FK** till `checkins.id`,
- `damages.nybil_inventering_id` är UUID men har **ingen FK** till `nybil_inventering.id`.

Detta är nu live-verifierade **REPARERA-fynd**.

## 7. Nybil-ID är nu live-verifierat

Production har:

- `nybil_inventering.id`: **UUID**, primary key, default `gen_random_uuid()`,
- `damages.nybil_inventering_id`: **UUID**, nullable,
- `duplicate_group_id`: UUID,
- `original_registration_id`: fortfarande BIGINT och utan aktiv FK i live-schemat.

Den tidigare osäkerheten är därmed stängd: aktuell runtime-kod ligger i linje med UUID-PK:n, medan äldre migrationer beskriver historisk modellutveckling.

**Klassning: BEHÅLL UUID-kontraktet; REPARERA legacy/alias-relationer senare.**

## 8. Views — samtliga sex använder `security_invoker=true`

Live-verifierade views:

- `mabi_damage_view`,
- `simple_mabi_damage`,
- `tire_storage_summary`,
- `v_nybil_baseline`,
- `v_wheel_storage_precedence`,
- `vehicle_damage_summary`.

Samtliga sex har `security_invoker=true`. Det är positivt och innebär att de inte ska återklassificeras som ett gammalt security-definer-view-fynd.

## 9. Funktioner — 14 totalt

Live-funktioner:

- `_coalesce_expr`
- `car_lookup_any`
- `damages_lookup_any`
- `get_all_allowed_plates`
- `get_damages_by_trimmed_regnr`
- `get_documented_legacy_texts`
- `get_nybil_baseline`
- `get_vehicle_by_trimmed_regnr`
- `heartbeat_lock`
- `release_lock`
- `set_updated_at`
- `try_lock_checkin`
- `upsert_vehicles_from_staging`
- `wheel_lookup_any`

Tio är `SECURITY DEFINER`; dessa är listade i det röda accessfyndet ovan eftersom de också är anropbara av `anon` enligt Supabase Advisor.

## 10. Triggers — 3 totalt

Production har:

- `checkins.trg_set_updated_at` → `set_updated_at()` före UPDATE,
- `checkin_drafts.trg_drafts_updated_at` → `set_updated_at()` före UPDATE,
- `checkin_drafts.trg_set_updated_at` → `set_updated_at()` före UPDATE.

`checkin_drafts` har alltså **två BEFORE UPDATE-triggers som båda kör samma funktion**. Tabellen är tom idag, men dupliceringen bör verifieras innan drafts-funktionen används eller repareras.

**Klassning: VERIFIERA / sannolik REPARERA.**

## 11. Hur Status faktiskt bygger fordonsbilden

`lib/vehicle-status.ts` hämtar i samma flöde data från:

1. `nybil_inventering`,
2. `get_vehicle_by_trimmed_regnr`,
3. `damages`,
4. `get_damages_by_trimmed_regnr`,
5. `checkins`,
6. `arrivals`,
7. `vehicle_edits`,
8. därefter `damage_comments`,
9. och `checkin_damages` via det skyddade server-API:t.

Detta är funktionellt värdefullt, men visar att "fordonets sanning" inte kommer från en enda relation eller ett enda livscykelobjekt.

BUHS-RPC-resultaten saknar det UUID som används i `damages`. Status bygger därför en matchningsnyckel av `regnr + datum + damage_type_raw + note_customer + note_internal` för att hitta motsvarande `damages.id`.

Det är ett **REPARERA-fynd**, inte ett skäl att ta bort historiken.

## 12. Vehicle-info visar samma strukturella mönster

Server-routen för vehicle-info kombinerar bland annat:

- fordons-RPC,
- BUHS-skade-RPC,
- `damages`,
- `nybil_inventering`,
- `vehicles`,
- `vehicle_edits`,
- `arrivals`,
- senaste `checkins`,
- `checkin_damages`.

För BUHS-hantering söker implementationen efter en "winning checkin" först bland 10 och sedan 30 senaste incheckningar. Det är stark evidens för att relationen mellan **ursprunglig BUHS-skada → dokumenterad skadehändelse → incheckning** behöver göras mer explicit.

## 13. Nybil — verifierad semantisk dubblering

Nuvarande kod dual-skriver flera semantiskt överlappande fält:

- `modell` + `bilmodell`,
- `registreringsdatum` + `ankomstdatum`,
- `hjultyp` + `monterade_dack`,
- `hjul_ej_monterade` + `hjul_till_forvaring`,
- `hjul_forvaring_ort` + `hjul_forvaring_station`,
- `dackkompressor` + `kompressor`.

Live-schemat bekräftar att båda varianterna fortfarande finns.

**Klassning: REPARERA.**

Ingen alias-kolumn får tas bort innan datafyllnad, läsare, views/RPC och backfillbehov är verifierade.

## 14. Check — affärshändelsen är inte en atomisk persistence-transaktion

Nuvarande Check-persistens gör separata writes till bland annat:

- `checkins`,
- `vehicles`,
- `damages`,
- `checkin_damages`,
- `vehicle_receipts`,
- samt notifiering.

Flera databasfel loggas medan flödet kan fortsätta. Det skyddar operationen mot totalstopp men kan ge delvis persisterad affärshändelse.

**Klassning: REPARERA data-integritet**, men inte i 3.1.

## 15. Ankomst har motsvarande integritetsgräns

Ankomst skriver `arrivals`, kan uppdatera `vehicles.bransletyp` och skickar notifiering. DB-fel kan loggas som non-critical och mejl fortsätta.

**Klassning: REPARERA.**

## 16. Skade- och mediakällor är fragmenterade

Aktuell kod använder flera representationer:

- `damages.uploads`,
- `checkin_damages.photo_urls` / `video_urls`,
- Storage-mappar,
- `damage_media`,
- Nybil `photo_urls` / `media_folder`,
- `vehicle_receipts` för kvittofiler.

Live-rader visar att `damage_media` och `damage_positions` är tomma, medan `damages` och `checkin_damages` bär aktiv data. Rapportkoden försöker ändå läsa `damage_media`.

**Klassning: REPARERA/VERIFIERA**, inte radera ännu.

## 17. Stationer — source-of-truth-fråga kvarstår

`stations` finns live men har 0 rader. Samtidigt använder aktuell kod statiska stationslistor och datafiler. `checkins.station_id` har ändå en FK mot `stations.id`.

Detta är ett tydligt exempel på att ett schemaobjekt kan vara strukturellt närvarande men operationellt kringgånget.

**Klassning: REPARERA/VERIFIERA source of truth.**

## 18. Historik ska skyddas

`vehicle_edits` och `vehicle_status_log` finns live men har 0 rader i aktuell metadata. Koden använder `vehicle_edits` som kontrakt för overrides/historik; `vehicle_status_log` saknar aktuell reporeferens.

- `vehicle_edits`: **BEHÅLL KONTRAKT / VERIFIERA faktisk användning**.
- `vehicle_status_log`: **VERIFIERA**, inte borttagningskandidat ännu.

Tomhet idag är inte i sig tillräckligt borttagningsbevis.

## 19. Legacy-kolumnskuld i `checkins`

Nuvarande kod använder huvudsakligen bland annat:

- `hjultyp`,
- `fuel_level`,
- `charge_cables_count`.

Äldre överlappande representationer finns samtidigt kvar, exempelvis:

- `wheel_type`,
- `tires_type`,
- `charging_cables`,
- `chargers_count`,
- `fuel_level_percent`.

Dessa är **senare retirement-kandidater**, inte godkända att radera i 3.1.

## 20. Tomma/staging/backupobjekt — endast kandidater

Live-inventeringen visar många tabeller med 0 rader, bland annat äldre backup-, staging- och importobjekt. Exempel:

- `damages_backup_*`,
- `vehicles_backup_*`,
- `damages_dedup_backup_*`,
- `nybil_inventering_backup_20260425`,
- `vehicles_staging`,
- `skador_staging`,
- `duplicates_to_delete`,
- `mabi_damage_data*`,
- `damages_external`,
- `damages_current`,
- `active_damages`.

De är nu starkare kandidater för senare arkivering än tidigare, men **0 rader + ingen reporeferens är fortfarande inte samma sak som godkänt borttagande**. Views, RPC-definitioner, importprocesser, retention och rollbackbehov måste korsas innan drop.

## 21. Klassning enligt revisionsordningen

### BEHÅLL

Operativ kärna och evidens:

- `checkins`
- `checkin_damages`
- `damages`
- `vehicles`
- `nybil_inventering`
- `arrivals`
- `vehicle_receipts`
- skade-/statushistorikens kontrakt
- aktiva fordons-/BUHS-lookup-kontrakt tills säkert ersatta

### REPARERA — PRIORITET RÖD

1. **Direkt anonymous Supabase-access till `checkins` och `checkin_damages`.**
2. **Anon-exekverbara `SECURITY DEFINER`-RPC:er**, särskilt aktiva fordons-/BUHS-lookups och lockfunktioner.
3. Direkt `authenticated`-access måste harmoniseras med samma verkliga accessmodell som LoginGate/server-auth använder; UI-inloggning får inte vara enda behörighetskontrollen.

### REPARERA — DATAMODELL EFTER SÄKERHETSGRÄNSEN

- BUHS-ursprung ↔ `damages.id`,
- skadehändelse ↔ ursprungsskada,
- `damage_comments.damage_id` FK/kontrakt,
- `vehicle_receipts.checkin_id` FK/kontrakt,
- `damages.nybil_inventering_id` FK/kontrakt,
- Nybil-alias,
- canonical media source,
- station source of truth,
- explicit precedens mellan Nybil/vehicles/checkins/arrivals/vehicle_edits,
- atomitet/idempotens för Check och Ankomst.

### VERIFIERA

- tomma DB-side objekt utan nuvarande reporeferens,
- views/staging/importtabeller,
- `vehicle_status_log`,
- `checkin_drafts` och dess dubbla update-trigger,
- backup-/dedupobjekt,
- legacykolumner utan nuvarande runtime-referens.

### TA BORT — INGET BESLUT ÄN

Steg 3.1 godkänner **0** objekt för borttagning.

### ADDERA — INGET NYTT DOMÄNOBJEKT ÄN

Nya tabeller/engines ska inte skapas innan säkerhetsgräns, relationskarta och precedens är verifierade.

## 22. Beslutspunkt efter live-inventeringen

Den färska Production-metadata som tidigare saknades är nu hämtad. 3.1 har därmed kunnat verifiera schemaomfattning, centrala datatyper, PK/FK, views, funktioner, triggers, RLS-policies och aktuella row counts på metadata-nivå.

**3.1 ska ändå inte låsas som “klar och mergebar” innan det röda accessfyndet har ett separat reparationsbeslut.** Att fortsätta med cleanup medan anonym direktaccess är öppen skulle bryta revisionsordningen.

Nästa säkra arbetssteg är därför inte en drop, backfill eller redesign utan en fokuserad säkerhetsreparation av Supabase-gränsen med regression mot de klientflöden som fortfarande går direkt mot Supabase.

Ingen reparation genomförs av denna inventerings-PR.

## 23. Låst princip för Steg 3

> Historik, evidens och fungerande kärnflöden är tillgångar. Databasstädning får inte börja med namn, ålder eller upplevd redundans. Varje förändring ska först visa vilken aktuell konsument, relation, accessgräns, datahistorik och fallback den ersätter.

**Behålla → reparera → ta bort → addera.**
