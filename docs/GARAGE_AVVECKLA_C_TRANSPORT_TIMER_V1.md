# GARAGET / AVVECKLA / UT — STEG C

## Status

Implementationskontrakt för extern transport efter mergad Steg B (#533).

## Låst verksamhetsregel

För `EXTERN_TRANSPORT` gäller:

`TRANSPORT_BOKAD → 5-dygnsklockan startar vid verklig booked_at → faktisk hämtning verifieras → UT / AVSLUT`.

`booked_at` är en fryst faktisk händelse. Deadline är exakt `booked_at + 5 days`.

Om transportören inte har verifierats som hämtad när deadlinen passeras skapas AVVIKELSE + LARM. Bilen ligger fortsatt kvar i aktiv AVVECKLA. Timern får aldrig avsluta bilen eller Layer 1-perioden.

## Byggt

- `garage_avveckla_transport_bookings` — en fryst transportbokning per AVVECKLA-case/Garage-episod.
- `garage_avveckla_transport_events` — append-only `TRANSPORT_BOKAD` och `TRANSPORT_5_DYGN_OVERSKRIDET`.
- `book_garage_avveckla_transport()` — registrerar verklig bokningstid och fryser deadline.
- `run_garage_avveckla_transport_timers()` — idempotent/concurrency-safe timer runner med `FOR UPDATE ... SKIP LOCKED`.
- hourly pg_cron enligt befintlig timerarkitektur.
- extern transport-terminal från Steg B är nu spärrad tills en riktig transportbokning finns och faktisk hämtning kan inte ligga före `booked_at`.
- vid verifierad faktisk hämtning kopplas booking-raden till det immutable terminala UT-eventet från Steg B.
- autentiserat server-API för att läsa/skapa bokning.

## Viktiga gränser

Steg C skapar ingen alternativ readiness-gate. Terminal UT går fortsatt genom Steg B och därmed genom den låsta `assert_garage_avveckla_ready_for_completion()`.

5-dygnsöverträdelsen är inte UT. Den skapar endast AVVIKELSE + LARM och behåller AVVECKLA aktiv.

Ingen inferens från `updated_at`, `calloff_at`, planerat leveransdatum eller annan proxy används som bokningstid.

Ingen historisk backfill. Endast future-only transportbokningar i den nya tabellen omfattas.

## Inte byggt i C

- ingen `FAKTURERBAR_KÖRNING`
- ingen ET-prislista
- ingen ekonomisk faktureringslivscykel
- ingen Production-verifiering

Detta tillhör Steg D respektive senare Production acceptance.
