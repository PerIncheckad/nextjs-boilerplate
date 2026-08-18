# Steg 3 checkpoint — 2026-08-18

Status efter merge av PR #332.

## Låsta principer

- Ingen bred rewrite.
- Ingen syntetisk Production-write eller write-probe.
- Ingen historisk backfill utan separat beslut.
- Inga station-/identity-värden fylls genom antaganden.
- Ingen kolumndrop innan samtliga läsare, skrivare, vyer, funktioner, notifieringar och exporter är verifierat migrerade.
- BUHS-snapshot lämnas orörd tills planerad read-only stabilitetskontroll 2026-08-19 16:33 Europe/Stockholm.
- `completed_by` slutverifieras read-only först efter nästa riktiga check-in.

## Genomfört Steg 3

### 3.1 — datamodellinventering

- 44 public tables, 6 views, 50 relationsobjekt, 802 kolumner, 59 index, 14 funktioner, 9 FKs, 25 RLS-policies och 3 triggers inventerades.
- Klassificering: KEEP / REPAIR / VERIFY. Inget objekt godkändes för deletion.

### 3.1A — Supabase Data API

- Data API-gränsen låstes ned.
- Verifierade browser-kontrakt bevarades explicit.

### 3.2A — relationskontrakt

- Tre saknade FK-kontrakt lades till efter orphan-preflight.
- `ON DELETE RESTRICT`, ingen DML.

### 3.2B — BUHS source of truth

- BUHS-läsning flyttades till `damages`.
- `damages_external` behålls tills separat stabilitetskontroll.
- Senast verifierat: 727 rader / 292 fordon, RPC drift 0, snapshot drift 0.

### 3.2C — identitetskontrakt

- Stationskontrakt centraliserades utan att gissa `station_id`.
- `completed_by` ändrades så nya riktiga check-ins ska spara server-verifierad Supabase user UUID.
- Slutverifiering är fortfarande event-gated: ingen syntetisk write får göras.

### 3.2D — Nybil canonicalisering

#### 3.2D-1

Legacy-alias centraliserades till en helper.

#### 3.2D-2

Aktiv runtime-läsning av `bilmodell` i vehicle-status togs bort till förmån för `modell`.

#### 3.2D-4A

Skrivning stoppades för tre reader-fria legacy DB-alias:

- `ankomstdatum`
- `monterade_dack`
- `kompressor`

#### 3.2D-4B

DB-läsare flyttades till kanoniska fält:

- `car_lookup_any(text)` använder inte längre `bilmodell`.
- `v_nybil_baseline` läser `hjul_forvaring_ort`, men bevarar output-namnet `hjul_forvaring_station`.
- `v_wheel_storage_precedence` använder kanoniskt `hjul_forvaring_ort` internt och bevarar output-namnet `wheel_storage_station`.
- Båda vyerna behåller `security_invoker=true`.
- Migrationen hade drift-preflight och applicerades utan DML.

#### 3.2D-4C

De sista rena legacy DB-writesen stoppades:

- `bilmodell`
- `hjul_forvaring_station`

`hjul_till_forvaring` lämnades då kvar till separat kontraktsverifiering eftersom samma namn fortfarande används av notifierings-API:t.

#### 3.2D-4D

Read-only retirement-readiness dokumenterades och verifierade:

- samtliga sex historiska alias-kolumner är nullable och saknar defaults,
- 0 direkta view-/function-dependencies på legacy-kolumnerna,
- 195 befintliga Nybil-rader,
- 0 mismatch för samtliga sex canonical/legacy-par i befintlig data.

Ingen fysisk DROP godkändes. Slutbeviset för nya writes är fortsatt event-gated.

#### 3.2D-4E

Den sista legacy DB-writen `hjul_till_forvaring` stoppades.

- `withNybilLegacyAliases(...)` är nu en ren passthrough och genererar inga legacy DB-alias.
- Nybil-formens notifieringspayload fortsätter separat att skicka `hjul_till_forvaring: hjulTillForvaring` till `/api/notify-nybil`.
- Därmed är DB-kontraktet och notifieringskontraktet separerade utan att ändra notifierings-API:ts externa payload eller e-postrendering.
- Ingen DML, backfill, syntetisk write eller DROP gjordes.

## Nybil retirement-status

Efter 3.2D-4E genererar appens Nybil DB-write-path inte längre något av de sex legacy DB-aliasen:

- `bilmodell`
- `ankomstdatum`
- `monterade_dack`
- `hjul_till_forvaring`
- `hjul_forvaring_station`
- `kompressor`

Detta är kodmässigt klart men ännu inte slutbevisat mot en ny riktig Production-write efter 4E. Nästa riktiga Nybil-inventering ska verifieras read-only. Ingen syntetisk write får skapas för att forcera verifieringen.

### Event-gated verifiering

Två slutbevis väntar på riktig verksamhetsdata:

1. Nybil efter 4E: kanoniska fält ska fyllas medan samtliga sex legacy DB-alias förblir tomma.
2. Check-in efter `completed_by`-fixen: `completed_by` ska vara satt till server-verifierad Supabase user UUID.

En read-only condition watch är satt för dessa händelser. Den får inte skriva data, backfilla eller göra schemaändringar.

## Aktuella mergepunkter

- PR #327 — 3.2D-4A merged.
- PR #328 — 3.2D-4B merged, merge SHA `4249ae310e4bdcce60eb882b00377e3ba64e893f`.
- PR #329 — 3.2D-4C merged, merge SHA `83934f193b543a97068ddee4f5098f028320f2ea`.
- PR #330 — Steg 3 checkpoint merged, merge SHA `0f50288088a405cdfee5619c06dc7b889422190e`.
- PR #331 — 3.2D-4D retirement-readiness merged, merge SHA `0292addd7785b2ca8c9815d6e8214e00af974697`.
- PR #332 — 3.2D-4E stoppa `hjul_till_forvaring` DB-write merged, merge SHA `805bdaf87e6c3e9bf8e3f0737c6c71e30f7d57ec`.

## Nästa säkra ordning

1. Verifiera nästa riktiga Nybil-write read-only efter 4E.
2. Verifiera `completed_by` read-only efter nästa riktiga check-in.
3. Låt 3.2B-stabilitetskontrollen avgöra GO/STOP för BUHS-snapshot 2026-08-19 16:33.
4. Om Nybil-verifieringen är grön: gör ny preflight för fysisk retirement, en legacy-kolumn i taget.
5. Ingen DROP får ske bara för att repo- och dependency-inventeringen är grön; riktig write-evidens är fortfarande ett krav.

## Kända kvarvarande tekniska observationer

Supabase security advisor rapporterar äldre `function_search_path_mutable`-varningar för flera funktioner, bland annat `car_lookup_any`. Dessa varningar fanns kvar efter 3.2D-4B och har inte blandats in i Nybil-scope eftersom de kräver en separat säkerhetsbedömning för att undvika kontraktsändring.
