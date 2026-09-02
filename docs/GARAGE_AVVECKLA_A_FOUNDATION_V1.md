# GARAGET / AVVECKLA / UT — STEG A

Datum: 2026-09-02  
Status: BYGGKONTRAKT FÖR PR — EJ PRODUCTION

## Syfte

Steg A etablerar den manuellt startade AVVECKLA-arbetsprocessen i Garaget utan att ännu implementera de tre terminala UT-handslagen.

`garage_direction = UT` betyder fortsatt att AVVECKLA-arbete pågår. Riktningen i sig avslutar inte bilen ur verksamheten.

## Låst verksamhetsregel

AVVECKLA startas manuellt i Garaget för en exakt Garage-episod och kräver orsak.

Ett AVVECKLA-ärende kan bära flera samtidiga punkter:

`OPEN -> CLOSED`

UI visar detta som:

`ÖPPEN -> KLAR / AVSLUTAD`

Vid avslut krävs:

- strukturerat utfall (`outcome_code`)
- frivillig kompletterande text (`outcome_comment`)
- verifierad aktör och tidpunkt
- historiken bevaras genom append-only event

Egna punkter stöds genom `point_kind = OVRIGT`.

## Terminal gate

Ingen framtida terminal UT-händelse får genomföras så länge någon AVVECKLA-punkt är `OPEN`.

Databaskontraktet innehåller därför `assert_garage_avveckla_ready_for_completion(garage_item_id)`.

Funktionen låser exakt AVVECKLA-ärende och stoppar terminal fortsättning om minst en punkt fortfarande är öppen.

Steg B måste anropa denna gate i samma atomiska transaktion som den verifierade UT-händelsen.

## Ny persistence

### `garage_avveckla_cases`

En AVVECKLA-process per exakt `garage_item_id`.

Bär bland annat:

- `avveckla_case_id`
- `garage_item_id`
- `regnr`
- `reason`
- `status`
- `started_at/by`
- framtida `completed_at/by/completion_event_id`

### `garage_avveckla_points`

Flera samtidiga arbets-/kontrollpunkter per ärende.

Bär bland annat:

- `point_id`
- `point_kind = STANDARD | OVRIGT`
- `title`
- `status = OPEN | CLOSED`
- `outcome_code`
- `outcome_comment`
- skapad och avslutad aktör/tid

### `garage_avveckla_events`

Append-only verksamhetshistorik.

Steg A använder:

- `AVVECKLA_STARTED`
- `AVVECKLA_POINT_CREATED`
- `AVVECKLA_POINT_CLOSED`

Datakontraktet reserverar även de tre redan låsta terminala eventtyperna för steg B:

- `UT_OVERLAMNING_VERIFIERAD`
- `UT_TRANSPORTOR_HAMTAT_VERIFIERAD`
- `UT_AVSTALLNING_VERIFIERAD`

Inga terminala UT-RPC:er införs i steg A.

## Lyckad terminal är inte makulering

`garage_items` får separat terminalstruktur:

- `completed_at`
- `completed_by`
- `completion_event_id`

`voided_at` ändras inte och betyder fortsatt endast MAKULERING.

När `completed_at` senare sätts genom steg B blir Garage-episoden immutable genom `guard_completed_garage_item()`.

## API/UI

`/api/garage/avveckla` stöder i steg A:

- `START_CASE`
- `ADD_POINT`
- `CLOSE_POINT`

Garagets AVVECKLA-sektion visar den nya arbetsprocessen före den befintliga bekräftelse-/transportpanelen.

Ingen knapp för UT-verifiering finns i steg A.

## Avgränsning

Steg A bygger inte:

- de tre atomiska terminala UT-handslagen
- Layer 1 write-through / `PERIOD_ENDED`
- `TRANSPORT_BOKAD` som verifierad femdygnshändelse
- 5-dygnslarmet
- `FAKTURERBAR_KÖRNING`
- faktureringsarbetsvy
- historisk backfill
- syntetiska AVVECKLA- eller UT-händelser

Dessa hör till B, C respektive D enligt masterbeslutet.
