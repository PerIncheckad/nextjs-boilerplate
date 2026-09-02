# GARAGET / AVVECKLA / UT — STEG D

Status: **TEKNISKT IMPLEMENTERAT I PR — EJ PRODUCTION-VERIFIERAT**

## Låst princip

En verifierad verksamhetshändelse skapar den ekonomiska händelse som den ger upphov till. Vagnkort/Garage är arbetsytan, inte ekonomins sanningskälla.

För AVVECKLA v1 gäller detta endast **Väg 1 / EGEN_LEVERANS**:

`över­lämning verifierad → om fakturerbar → FAKTURERBAR_KORNING`

Extern transport och avställning skapar ingen sådan körningspost i steg D.

## Atomiskt handslag

Servern kräver ett uttryckligt Ja/Nej på om egen leverans är fakturerbar.

Vid Ja sker i samma databastransaktion:

1. B:s terminala UT-kontrakt körs via `complete_garage_avveckla_ut_internal()`.
2. B:s låsta readiness-gate används oförändrat där inne.
3. Det immutable terminalevent som B skapar blir `source_event_id` för den ekonomiska posten.
4. Exakt en `FAKTURERBAR_KORNING` skapas med unik källreferens.
5. Pris, prislista och version fryses tillsammans med utförd händelse.

Misslyckas ekonomiposten rullas hela transaktionen tillbaka; terminalt UT kan då inte lämnas utan den ekonomiska konsekvens som användaren uttryckligen verifierat.

Vid Nej genomförs terminalt UT utan ekonomipost.

## Frysta affärsfakta

`billable_driving_events` sparar minst:

- REG
- unik `source_event_id`
- `event_type = FAKTURERBAR_KORNING`
- FRÅN
- TILL
- bilplats / prisklass när matrispris används
- grundpris
- faktiskt pris
- prisgrund (`ET_MATRIX` eller `OFFERT`)
- `price_list_id`
- `price_list_version`
- `performed_at`
- `performed_by`
- `billing_status`

Affärsfakta kan inte skrivas om efter skapande och posten kan inte raderas.

## Prisregel

Gemensam prisgrund är **ET Prislista 2026**, exporterad 2026-01-29.

Servern räknar pris; klienten är endast förhandsvisning.

- matrisens belopp är grundpris för 1,0 bilplats
- numerisk bilplats multiplicerar grundpriset
- stödda ET-klasser i v1: 1.0, 1.3, 1.7, 2.0, 2.6, 3.0
- fordon utanför prislistans mått använder `OFFERT` och ett verifierat positivt offertpris
- priser lagras exklusive moms

Pris och version snapshotas vid händelsen. Ingen retroaktiv omräkning.

## Separat ekonomisk livscykel

Fordonets livscykel och ekonomins livscykel är separata:

`PÅGÅENDE AVVECKLING → UT / AVSLUT`

`EJ_FAKTURERAD → FAKTURAUNDERLAG → FAKTURERAD`

Ekonomiposten lever vidare efter att Garage-episoden avslutats. Fakturering blockerar aldrig bilens senare tillstånd.

När status blir `FAKTURERAD` krävs fakturanummer och fakturadatum. Därefter är posten fryst.

## Read model / API

`GET /api/billing/driving` läser de ekonomiska posterna och kan filtrera på status.

`PATCH /api/billing/driving` använder endast den sekventiella databasövergången `transition_billable_driving_event()`.

Detta är inte en ny bred fakturamodul och bygger ingen Kistan-funktion i AVVECKLA.

## Avgränsning

- ingen historisk backfill
- inga syntetiska faktureringsposter från äldre SALU-data
- ingen fakturering för extern transport eller avställning
- ingen Production-ändring i detta PR-steg
- ingen alternativ AVVECKLA-readiness-logik
