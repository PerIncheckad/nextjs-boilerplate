# Steg 3 checkpoint — 2026-08-18

Status efter merge av PR #329.

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

`hjul_till_forvaring` behålls eftersom samma namn fortfarande ingår i ett separat notifierings-/kompatibilitetskontrakt och därför inte får behandlas som en vanlig DB-alias utan separat verifiering.

## Nybil retirement-status

De sex historiska alias-kolumnerna i `nybil_inventering` är nullable och saknar defaults. Efter 3.2D-4B har read-only dependency-preflight inte hittat kvarvarande funktion-/view-läsning av de rena legacy DB-kolumnerna.

Det betyder inte att kolumnerna får droppas ännu. Nästa fas är formell retirement-readiness med repo/API/export/notifieringsinventering och verifiering av nya riktiga Nybil-writes.

## Aktuella mergepunkter

- PR #327 — 3.2D-4A merged.
- PR #328 — 3.2D-4B merged, merge SHA `4249ae310e4bdcce60eb882b00377e3ba64e893f`.
- PR #329 — 3.2D-4C merged, merge SHA `83934f193b543a97068ddee4f5098f028320f2ea`.

## Nästa säkra ordning

1. Genomför 3.2D-4D som read-only retirement-readiness.
2. Verifiera nya riktiga Nybil-rader efter 4C: kanoniska fält ska fyllas och legacy DB-alias ska förbli tomma; ingen syntetisk write.
3. Behandla `hjul_till_forvaring` separat och bevara notifieringskontraktet tills dess konsumenter uttryckligen migrerats.
4. Låt 3.2B-stabilitetskontrollen avgöra GO/STOP för BUHS-snapshot 2026-08-19 16:33.
5. Verifiera `completed_by` read-only efter nästa riktiga check-in.
6. Först därefter kan fysisk retirement/DROP av enskilda legacy-kolumner övervägas, en kolumn i taget och med ny preflight.

## Kända kvarvarande tekniska observationer

Supabase security advisor rapporterar äldre `function_search_path_mutable`-varningar för flera funktioner, bland annat `car_lookup_any`. Dessa varningar fanns kvar efter 3.2D-4B och har inte blandats in i Nybil-scope eftersom de kräver en separat säkerhetsbedömning för att undvika kontraktsändring.
