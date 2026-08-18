# Steg 3.1 — Datamodell- och databasberoendeinventering

**Status:** Preliminär read-only baseline — inga schemaändringar  
**Datum:** 2026-08-18  
**Kodbaseline:** `d1bbf5f318405028113f12c5dd162662b7065464` (`main` efter Steg 2.6)  
**Arbetsprincip:** `behålla → reparera → ta bort → addera`

## 1. Syfte och avgränsning

Steg 3.1 ska fastställa vad datamodellen faktiskt bär, vad applikationen faktiskt använder och var relationer eller källor är otydliga innan någon databasmigrering, normalisering eller borttagning övervägs.

Detta dokument gör därför **inte** följande:

- kör SQL mot Production,
- ändrar tabeller, vyer, funktioner, constraints, index eller policies,
- skapar migrationer,
- raderar legacy-/backupobjekt,
- redesignar domänmodellen,
- ändrar app-, API- eller affärslogik.

Ingen tabell eller kolumn är godkänd för borttagning genom detta dokument.

## 2. Evidensnivåer och begränsning

Inventeringen bygger på två separata evidenslager som inte ska blandas ihop:

### A. Aktuell kodevidens — 2026-08-18

Exakt `main` på commit `d1bbf5f318405028113f12c5dd162662b7065464` har granskats för direkta Supabase-anrop, RPC-anrop, server-side service-role-vägar, klientskrivningar och datakällor i de centrala flödena.

Detta är stark evidens för **vilka objekt den nuvarande applikationen refererar till**.

### B. Produktionsschemaevidens — 2026-08-16

Tidigare faktisk Production-schemaexport och Supabase-skärmbilder visar en större modell än repoets migrationsmapp: ungefär **50 tabeller/vyer, 802 kolumndefinitioner, 139 constraints, 59 index, 35 RLS-policies, 14 databasfunktioner och 6 foreign keys**.

Detta är stark historisk evidens för Production-modellens omfattning, men är **inte en färsk live-introspektion den 18 augusti**. Säkerhetsläget i äldre material ska inte användas för att återöppna Steg 2; server-API-säkerheten reparerades och verifierades därefter.

### Begränsning

Ingen direkt Supabase-databaskoppling finns i denna granskning. Exakta aktuella row counts, null-profiler, view-definitioner, triggerberoenden, funktionsberoenden, FK-definitioner och objekt som enbart används DB-side måste därför revalideras innan destruktiva beslut kan tas.

## 3. Första huvudslutsatsen

Databasen ska **inte** behandlas som ett tomt eller misslyckat schema som bör ersättas. Den bär verklig operativ data, historik, skadebevis, nybilsinventering, incheckningar, ankomster, statusändringar och ekonomiskt relevanta kvitton.

Det huvudsakliga strukturfyndet är i stället:

> Applikationen rekonstruerar fordons- och skadebilden från flera källor med registreringsnummer, RPC-funktioner, fallbackkedjor, manuella overrides, text-/datum-matchning och applikationslogik. Datamodellen fungerar operativt, men en gemensam kanonisk relations- och precedensmodell är inte tydligt etablerad genom hela kedjan.

Det är därför fel angreppssätt att börja med att "städa bort" tabeller. Först måste relationer, ägarskap och precedens göras verifierbara.

## 4. Bekräftat aktiva kärnobjekt i nuvarande applikation

| Objekt | Aktuell användning | Primär koppling | Klassning |
|---|---|---|---|
| `checkins` | Check skriver; Status, Check/vehicle-info, damages och edits läser | `id`, `regnr` | **BEHÅLL** |
| `checkin_damages` | Check skriver skadehändelser; Status/vehicle-info läser | `checkin_id`, `regnr` | **BEHÅLL / REPARERA relation till ursprungsskada** |
| `damages` | Central skadehistorik från Check/Nybil/BUHS; läses av Status/Rapport/vehicle-info | `id`, `regnr`, legacy-fält | **BEHÅLL / REPARERA** |
| `damages_external` | Indirekt källa bakom BUHS-RPC enligt nuvarande dokumentation/importkedja | normaliserat `regnr` via RPC | **BEHÅLL / REPARERA källgräns** |
| `vehicles` | Bilkontroll/fordonsmaster; läses och uppdateras av flera flöden | `regnr` | **BEHÅLL** |
| `nybil_inventering` | Nybil skriver direkt; Status/Check/vehicle-info/edits läser | `id`, `regnr` | **BEHÅLL / REPARERA** |
| `arrivals` | Ankomst skriver; Status/vehicle-info läser | `regnr`, tid | **BEHÅLL** |
| `vehicle_edits` | Append-only manuell override/historik som påverkar nuläge och historik | `regnr`, `field_name`, `edited_at`, `batch_id` | **BEHÅLL / FORMALISERA PRECEDENS** |
| `employees` | Aktiv authz-källa tillsammans med central whitelist | `email`, `is_active` | **BEHÅLL** |
| `vehicle_receipts` | Check skriver tankningskvitton/evidens | `checkin_id`, `regnr` | **BEHÅLL** |
| `damage_comments` | Backend läser/skriver kommentarer kopplade till `damages.id` | `damage_id` | **BEHÅLL / REPARERA relation** |
| `damage_media` | Rapport läser media per `damage_id` | `damage_id` | **BEHÅLL TILLS VERIFIERAD / REPARERA källfragmentering** |
| `checkin_drafts` | Nuvarande repo innehåller en läsande drafts-sida; ingen writer hittad i aktuell kod | oklar | **VERIFIERA** |

### Aktiva RPC-kontrakt

- `get_vehicle_by_trimmed_regnr` används av dagens fordons-/statuslogik.
- `get_damages_by_trimmed_regnr` används av dagens BUHS-/skadelogik.

Dessa två funktioner är därför del av applikationens aktiva datakontrakt och får inte behandlas som "DB-internals" som kan ändras utan regressionstest.

## 5. Hur Status faktiskt bygger fordonsbilden

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

Detta är funktionellt värdefullt — Status kan rekonstruera mycket information — men visar också att "fordonets sanning" inte kommer från en enda relation eller ett enda livscykelobjekt.

Två konkreta svagheter är synliga i den aktuella koden:

- `damage_comments` kan inte joinas naturligt i den aktuella implementationen; koden hämtar damage-ID:n först och laddar kommentarer separat.
- BUHS-RPC-resultaten saknar det UUID som används i `damages`. Status bygger därför en matchningsnyckel av `regnr + datum + damage_type_raw + note_customer + note_internal` för att hitta motsvarande `damages.id`.

Det är ett **REPARERA-fynd**, inte ett skäl att ta bort historiken.

## 6. Vehicle-info visar samma strukturella mönster

Server-routen för vehicle-info använder service role bakom den verifierade API-authgränsen och kombinerar bland annat:

- fordons-RPC,
- BUHS-skade-RPC,
- `damages`,
- `nybil_inventering`,
- `vehicles`,
- `vehicle_edits`,
- `arrivals`,
- senaste `checkins`,
- `checkin_damages`.

För BUHS-hantering söker implementationen efter en "winning checkin": först bland de 10 senaste, sedan 30, baserat på om antalet hanterade skadeposter är tillräckligt stort i förhållande till antal BUHS-skador. Om ingen sådan hittas faller koden tillbaka till senaste incheckningen.

Detta är stark evidens för att relationen mellan **ursprunglig BUHS-skada → dokumenterad skadehändelse → incheckning** behöver göras mer explicit. Den fungerande fallbacken ska bevaras tills en säkrare relation är verifierad och migrerad.

## 7. Nybil — verifierad semantisk dubblering i samma tabell

Nuvarande Nybil-kod dual-skriver flera semantiskt överlappande fält i `nybil_inventering` för kompatibilitet:

- `modell` + `bilmodell`,
- `registreringsdatum` + `ankomstdatum`,
- `hjultyp` + `monterade_dack`,
- `hjul_ej_monterade` + `hjul_till_forvaring`,
- `hjul_forvaring_ort` + `hjul_forvaring_station`,
- `dackkompressor` + `kompressor`.

Detta är inte en hypotes — aliasen skrivs uttryckligen av nuvarande applikationskod.

**Klassning: REPARERA.**

Ingen alias-kolumn får tas bort innan följande är verifierat:

- vilken kolumn som faktiskt läses av alla nuvarande konsumenter,
- om äldre Production-data bara finns i den ena varianten,
- om views/RPC/importer refererar till någon aliasvariant,
- om backfill behövs,
- om klient- och serverkontrakt kan ändras atomärt.

## 8. Nybil-ID — migration och runtime beskriver olika verklighet

Repoets äldre migrationer definierar `nybil_inventering.id` som `BIGSERIAL` och `original_registration_id` som `BIGINT`-FK.

Den nuvarande applikationen behandlar däremot Nybil-ID som UUID/string i dubblettkontrollen och använder `duplicate_group_id` som aktiv dubblettmekanism. Koden kommenterar uttryckligen att `original_registration_id` inte sätts.

Detta betyder inte automatiskt att Production är fel. Det betyder att **migrationsmappen inte är ett tillräckligt facit för nuvarande Production-schema**.

**Klassning: VERIFIERA LIVE SCHEMA innan någon ID-/FK-migrering.**

## 9. Check — en affärshändelse är inte en atomisk persistence-transaktion

Nuvarande Check-persistens gör flera separata writes:

- skapar `checkins`,
- uppdaterar/infogar `vehicles.bransletyp`,
- skapar nya rader i `damages`,
- skapar rader i `checkin_damages`,
- kan skapa `vehicle_receipts`,
- skickar därefter e-post.

Felhanteringen är avsiktligt resilient: flera databasfel loggas men flödet kan fortsätta och mejl kan fortfarande skickas. Det skyddar användarflödet mot totalstopp, men innebär att en affärshändelse kan bli **delvis persisterad**.

Exempel: misslyckad `checkins`-insert gör att skadeinserts hoppas över, medan notifieringen fortfarande kan fortsätta.

**Klassning: REPARERA data-integritet**, men inte genom att ändra beteendet i Steg 3.1. En framtida lösning måste ta ställning till transaktion/idempotens/outbox eller motsvarande utan att förlora befintlig operativ robusthet.

## 10. Ankomst har motsvarande integritetsgräns

Ankomstflödet:

- skriver `arrivals`,
- uppdaterar `vehicles.bransletyp`,
- skickar notifiering.

DB-fel loggas som non-critical och mejl kan fortsätta skickas.

Det är samma grundmönster: **operationell leverans och databasatomitet är separerade**.

**Klassning: REPARERA**, inte ta bort.

## 11. Skade- och mediakällor är fragmenterade

Aktuell kod använder flera representationer:

- `damages.uploads` för media på skadepost,
- `checkin_damages.photo_urls` / `video_urls`,
- Storage-mappar,
- `damage_media`, som fortfarande läses av Rapport.

Nuvarande Nybil skriver skadebilder i `damages.uploads`. Rapportens mediavy hämtar däremot från `damage_media`.

Detta bevisar inte att `damage_media` är oanvänd — tvärtom läses den — men det visar att mediamodellen inte har en enda kanonisk källa.

**Klassning: BEHÅLL + REPARERA/VERIFIERA.**

## 12. Stationer — möjlig source-of-truth-dubblering

Production-evidens visar ett `stations`-objekt, men aktuell kod använder också statiska stationslistor i repo, bland annat `lib/stations.ts` och formulärspecifika listor. Ingen direkt `.from('stations')`-referens hittades i nuvarande repo vid denna inventering.

Detta räcker **inte** för att radera `stations`; tabellen kan användas av DB-logik, importer eller administration som inte syns i appkoden.

**Klassning: VERIFIERA source of truth.**

Målet bör vara att en station får ett tydligt kanoniskt ID/namn och att e-postrouting, formulär och rapportering inte driver egna divergerande listor.

## 13. Historik är en tillgång som ska skyddas

Produktionsschemaevidensen från 2026-08-16 visar bland annat:

- `vehicle_status_log(regnr, event_type, data, changed_by, created_at)`,
- `vehicle_edits(regnr, field_name, old_value, new_value, edited_by, edited_at, comment, batch_id)`.

`vehicle_edits` är bekräftat aktivt i aktuell kod och används både för nulägesoverride och historik. Det ska inte flattenas bort under en cleanup.

`vehicle_status_log` hade Production-evidens men gav ingen aktuell reporeferens i denna kodgranskning. Det kan vara trigger-/DB-side-drivet.

**Klassning:**

- `vehicle_edits`: **BEHÅLL / FORMALISERA PRECEDENS**.
- `vehicle_status_log`: **VERIFIERA**, inte borttagningskandidat ännu.

## 14. Bekräftad legacy-kolumnskuld i `checkins`

Databasdokumentationen innehåller flera överlappande representationer. Kodsökning i nuvarande `main` ger följande preliminära bild:

### Aktiv representation

- `hjultyp`
- `fuel_level`
- `charge_cables_count`

### Ingen nuvarande runtime-referens hittad i repo

- `wheel_type`
- `tires_type`
- `charging_cables`
- `chargers_count`
- `fuel_level_percent`

Dessa senare fält är **inte godkända att raderas**. De är endast **senare retirement-kandidater**, eftersom Production-data, views, RPC, importer och extern konsumtion först måste profileras.

## 15. Objekt som måste verifieras innan klassning

Följande objekt finns i Production-evidens eller repo-dokumentation, men saknade tydlig aktuell runtime-referens i den granskade appkoden eller har en oklar livscykel:

- `checkin_drafts` — läsare finns, writer hittades inte,
- `vehicle_status_log`,
- `tire_storage`,
- `tire_storage_summary`,
- `mabi_damage_data`,
- `mabi_damage_data_raw`,
- `mabi_damage_data_raw_new`,
- `mabi_damage_view`,
- `damages_current`,
- `simple_mabi_damage`,
- `skador_staging`,
- `v_nybil_baseline`,
- `v_wheel_storage_precedence`,
- `vehicle_damage_summary`,
- `duplicates_to_delete`,
- historiskt synliga funktioner som `get_documented_legacy_texts`, `upsert_vehicles_from_staging`, `set_updated_at`, `try_lock_checkin`.

**Status för samtliga: VERIFIERA.**

Frånvaro av reporeferens betyder endast "inte hittad som aktuell applikationskonsument". Det betyder inte att objektet är oanvänt i databasen.

## 16. Senare arkiv-/borttagningskandidater — inte godkända

Production-skärmbilden visar flera daterade backup-/dedupobjekt, exempelvis `damages_backup_*`, `damages_dedup_backup_*` och `nybil_inventering_backup_*`.

Det är rimliga **kandidater** för arkivering eller borttagning senare, men först efter:

1. verifierad row count och senast ändrad/använd,
2. dependency-sökning i views/functions/triggers,
3. bekräftelse att ingen rollback-/revisionskedja kräver dem,
4. export/backup enligt beslutad retention,
5. separat godkänt förändringsbeslut.

Ingen sådan borttagning ingår i Steg 3.1.

## 17. Klassning enligt revisionsordningen

### BEHÅLL

Operativ kärna och evidens:

- `checkins`
- `checkin_damages`
- `damages`
- `damages_external`
- `vehicles`
- `nybil_inventering`
- `arrivals`
- `vehicle_edits`
- `employees`
- `vehicle_receipts`
- `damage_comments`
- aktuella fordons-/BUHS-RPC-kontrakt

### REPARERA

- explicit relation mellan BUHS-ursprung och motsvarande `damages.id`,
- relation mellan skadehändelse och ursprungsskada,
- comment/damage-relation där FK saknas eller inte kan användas,
- Nybil-alias/duplicerade semantiska fält,
- Nybil-ID/migrationsdrift efter live-verifiering,
- canonical media source,
- station source of truth,
- explicit precedens mellan Nybil/vehicles/checkins/arrivals/vehicle_edits,
- atomitet/idempotens för Check och Ankomst.

### VERIFIERA

- DB-side objekt utan nuvarande reporeferens,
- views/staging/importtabeller,
- `vehicle_status_log`,
- `checkin_drafts`,
- backup-/dedupobjekt,
- historiska funktioner som inte syns i aktuell appkod,
- legacykolumner utan nuvarande runtime-referens.

### TA BORT — INGET BESLUT ÄN

Steg 3.1 godkänner **0** objekt för borttagning.

### ADDERA — INGET NYTT DOMÄNOBJEKT ÄN

Nya tabeller/engines ska inte skapas innan relations- och precedenskartan är verifierad.

## 18. Vad som behöver verifieras för att avsluta Steg 3.1

För att gå från preliminär inventering till låst databasbaseline behövs en färsk **read-only live schema snapshot** eller motsvarande metadataexport med minst:

- alla public tables/views/materialized views,
- kolumner + datatyper + nullability + defaults,
- PK/FK/unique/check constraints,
- index,
- functions/RPC + signaturer,
- triggers,
- view-definitioner och beroenden,
- RLS enabled-status/policies för datamodellens accesskarta,
- row counts eller säkra approximeringar,
- identifiering av tomma/backup/stagingobjekt,
- dependency-analys för kandidater,
- särskild verifiering av `nybil_inventering.id` och damage/comment-ID-kontrakt.

Denna metadata ska hämtas read-only. Ingen DDL eller DML behöver köras för inventeringen.

## 19. Föreslagen ordning efter komplett 3.1

När live-schemat är verifierat bör nästa del inte vara en generell "DB cleanup". Föreslagen ordning är:

1. **Kanonisk relations- och precedenskarta** för Vehicle/Nybil/Arrival/Checkin/Edit/Damage.
2. **Integritetsreparationer** som kan införas kompatibelt och observerbart.
3. **Alias-/legacykontrakt** med mätning, backfillplan och konsumentmigrering.
4. **Arkivering/borttagning** först när objektens användning är bevisat noll eller ersatt.
5. **Nya strukturer** först när nuvarande data inte kan bära det önskade kontraktet utan osäker workaround.

## 20. Låst princip för Steg 3

> Historik, evidens och fungerande kärnflöden är tillgångar. Databasstädning får inte börja med namn, ålder eller upplevd redundans. Varje förändring ska först visa vilken aktuell konsument, relation, datahistorik och fallback den ersätter.

**Behålla → reparera → ta bort → addera.**
