# Layer 2.6 — SLA / timer v1

## Grundregel

Layer 2 får inte skapa en andra klocka bredvid en källägande scheduler. SALU:s befintliga scheduler fortsätter därför att äga T-30, T-10, T0 och 10-dagars beslutspåminnelser.

Layer 2 projicerar endast verifierade SALU-timerhändelser till en gemensam SLA-tidslinje.

## Låsta SALU-tider

- `SALU_T30_START` — T-30 från aktuellt SALU-datum, source event `SALU_FLAG_CREATED`.
- `SALU_T10_ESCALATION` — T-10 från aktuellt SALU-datum, source event `SALU_T10_ESCALATED`.
- `SALU_T0_ESCALATION` — T0, source event `SALU_T0_PASSED`.
- `SALU_DECISION_REMINDER` — återkommande 10-dagarscykel från flaggans `created_at`, source event `SALU_DECISION_REMINDER_DUE`.

## Persistence

- `routine_sla_definitions` — versionerade tidsregler.
- `routine_sla_events` — append-only projektion av verkligt inträffade timerhändelser.
- `materialize_salu_routine_sla_event()` — future-only adapter från `salu_events`.

Ingen historisk backfill körs och inga syntetiska T-30/T-10/T0-händelser skapas.

## Avgränsning

Denna version sätter ingen ny deadline för PLANERING- eller INKÖP-handslag. Ett sådant SLA kräver ett uttryckligt verksamhetsbeslut och får inte härledas från T-10 eller T0 på antagande.

Ingen Layer 1-write, ingen ny SALU-scheduler, ingen Kistan och ingen UI-logik införs.
