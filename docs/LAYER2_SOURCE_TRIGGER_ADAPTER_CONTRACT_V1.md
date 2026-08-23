# L2.4 — Layer 1 source-trigger adapters v1

## Syfte

L2.4 kopplar verifierade Layer 1-händelser till Layer 2-processmotorn utan att flytta ägarskap från källan.

Grundregeln är fortsatt:

> källa vet → Incheckad skriver faktum. Källa vet inte → Incheckad vet inte.

Layer 2 får observera ett redan skrivet Layer 1-faktum och materialisera ett separat process-trigger-faktum. Layer 2 får inte skriva om, komplettera eller härleda Layer 1-fakta.

## Objekt

### `source_trigger_adapter_definitions`

Versionsstyrd konfiguration för en uttrycklig koppling:

`Layer 1 source event → Process vN [→ Routine vN]`

En adapter matchar exakt på:

- `source_system`
- `source_entity`
- `source_event_type`

Endast `active=true` får materialisera process-trigger-events.

### `process_trigger_events`

Append-only bevis att ett verifierat Layer 1-event matchade en aktiv adapter.

Varje rad innehåller bland annat:

- source journey event-id
- regnr
- source system/entity/record/event type/event key/time
- process code/version
- optional routine code/version
- kopia av source payload och actor metadata

Detta är ett Layer 2-faktum om processaktivering, inte ny fordonsstatus.

## Trigger

`vehicle_journey_events_layer2_process_trigger` kör efter INSERT i `vehicle_journey_events`.

Funktionen `materialize_layer2_process_trigger_from_layer1()`:

1. läser den redan etablerade Layer 1-händelsen,
2. hittar exakta aktiva adapterdefinitioner,
3. skriver idempotent `process_trigger_events`,
4. ändrar ingenting i Layer 1.

## Ingen verksamhetsregel uppfinns i v1

L2.4 v1 seedar medvetet **ingen aktiv adapter**.

Revisionsakten kräver att planerad/faktisk starthändelse för varje vertikal först låses som verksamhetsregel. Därför är själva adaptermotorn deploybar nu, medan aktivering av en konkret mapping görs först när den regeln är explicit beslutad.

Detta hindrar exempelvis att RENTAL, AVAILABLE, DOWNTIME eller SÅLD felaktigt börjar starta en Layer 2-process bara för att tekniken kan observera händelsen.

## Säkerhet

- nya tabeller har RLS
- `anon` och `authenticated` saknar privileges
- skrivning är service-role/server-only
- triggerfunktionen är SECURITY DEFINER med `search_path = pg_catalog`
- `process_trigger_events` är append-only

## Utanför scope

- ingen Layer 1-write
- ingen automatisk SALU-statusändring
- ingen ny business mapping utan beslutad regel
- ingen RBAC/mandatmodell
- ingen SLA/timer
- ingen UI/cockpit
- ingen Kistan
