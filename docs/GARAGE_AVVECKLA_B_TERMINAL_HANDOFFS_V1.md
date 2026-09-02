# GARAGET / AVVECKLA / UT — STEG B

Datum: 2026-09-02
Status: TEKNISKT IMPLEMENTERAT I PR — EJ PRODUCTION-VERIFIERAT

## Syfte

Steg B implementerar de tre verksamhetsmässigt låsta terminala UT-handslagen ovanpå steg A:s AVVECKLA-arbetsprocess.

`garage_direction = UT` betyder fortsatt endast att AVVECKLA-arbete pågår.

Det är först en verifierad verklig terminalhändelse som avslutar den aktuella Garage-episoden och den aktuella Layer 1-fordonsperioden.

## Låst readiness-gate

Steg B får inte skapa en egen readiness-regel.

Den enda gaten mellan AVVECKLA-arbete och terminalt UT är:

`assert_garage_avveckla_ready_for_completion(garage_item_id)`

Gaten ägs av steg A och stoppar terminalt UT om någon AVVECKLA-punkt fortfarande är `OPEN`.

B anropar denna funktion inne i samma databastransaktion som terminalhändelsen och Layer 1-stängningen.

## Tre terminala vägar

### 1. EGEN_LEVERANS

Verifierande händelse:

`UT_OVERLAMNING_VERIFIERAD`

RPC:

`verify_garage_avveckla_egen_leverans(...)`

### 2. EXTERN_TRANSPORT

Verifierande händelse:

`UT_TRANSPORTOR_HAMTAT_VERIFIERAD`

RPC:

`verify_garage_avveckla_extern_transport(...)`

Transportbokning eller transportstatus är inte UT-bevis. Det är faktisk verifierad hämtning som är terminalen.

5-dygnsregeln hör till steg C och implementeras inte här.

### 3. AVSTALLNING

Verifierande händelse:

`UT_AVSTALLNING_VERIFIERAD`

RPC:

`verify_garage_avveckla_avstallning(...)`

Verifierad avställning avslutar aktuell fordonsresa. Senare fysisk hämtning är inte ett nytt AVVECKLA-handslag.

## Atomiskt terminalkontrakt

Varje terminalt RPC gör i en transaktion:

1. låser exakt `garage_item_id`,
2. verifierar att Garage-episoden är aktiv `UT`, inte makulerad, inte Nybil-överlämnad och inte redan completed,
3. anropar den låsta A-gaten `assert_garage_avveckla_ready_for_completion()`,
4. kräver verklig `occurred_at` och `evidence_reference`,
5. hämtar och låser exakt en aktuell öppen Layer 1-period för bilens normaliserade regnr,
6. stoppar om ingen eller fler än en öppen period finns,
7. skapar immutable terminalt `garage_avveckla_events`-bevis,
8. source-controlled stänger den aktuella Layer 1-perioden,
9. skapar `PERIOD_ENDED` med `source_system = GARAGE_AVVECKLA` och källreferens till terminaleventet,
10. markerar AVVECKLA-ärendet `COMPLETED`,
11. sätter `garage_items.completed_at/completed_by/completion_event_id`,
12. den avslutade Garage-episoden försvinner från aktiva Garage-/AVVECKLA-read models.

Ingen separat manuell "stäng Layer 1" finns.

## Source-aware Layer 1-stängning

Det befintliga legacy-RPC:t `close_vehicle_journey_period()` är Vagnkort-specifikt och märker `PERIOD_ENDED` med `VAGNKORT` som källa.

Steg B inför därför den server-only källmedvetna adaptern:

`close_vehicle_journey_period_from_source(...)`

Den behåller samma stängningssemantik, inklusive att öppna DOWNTIME-child activities stängs samtidigt, men bevarar den verkliga källan till periodslutet.

Legacy-Vagnkortets befintliga funktion ändras inte.

## Historik och återkomst

Terminalt UT öppnar aldrig en tidigare period igen.

Om samma `regnr` senare återkommer till verksamheten ska en ny Layer 1-period/fordonsresa skapas. Tidigare period och terminalbevis ligger kvar oförändrade.

## Aktiv arbetsyta

Aktiva Garage-read models exkluderar nu även `completed_at is not null`.

Det betyder:

- `voided_at` = makulerad episod,
- `handed_off_nybil_id` = överlämnad UTVECKLA/Nybil-episod,
- `completed_at` = lyckat verifierad UT/AVVECKLA-episod.

De tre terminalerna blandas inte ihop.

## Avgränsning

Steg B innehåller inte:

- `TRANSPORT_BOKAD` eller `booked_at`,
- 5-dygnsdeadline, avvikelse eller larm,
- `FAKTURERBAR_KÖRNING`,
- ET Prislista,
- faktureringslivscykel,
- historisk backfill eller syntetisk historik.

Dessa hör till senare steg C respektive D.
