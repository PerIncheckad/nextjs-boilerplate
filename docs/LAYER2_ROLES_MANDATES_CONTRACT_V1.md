# Layer 2.5 — Roller & mandat v1

## Grundregel

Autentisering bevisar **vem användaren är**. Mandat avgör **vad den identifierade medarbetaren får göra i verksamhetsprocessen**.

Ett giltigt login är därför aldrig i sig ett verksamhetsmandat.

## Modell

- `business_function_definitions` — verksamhetsfunktioner som redan förekommer i processkontrakten.
- `mandate_capability_definitions` — atomära rättigheter för verksamhetshandlingar.
- `employee_mandates` — explicit, tidsbegränsningsbar tilldelning mellan medarbetare, funktion, capability och scope.
- `mandate_events` — append-only revisionsspår för mandatförändringar.
- `actor_has_process_mandate(...)` — server-only kontroll.
- `assert_actor_process_mandate(...)` — strikt deny-by-default gate.
- `transition_handoff_authorized(...)` — handoff-transition som kräver explicit mandat innan befintlig handoffmotor får skriva.

## Handoff-capabilities

- `HANDED_OVER` → `HANDOFF_HAND_OVER` i avsändande funktion.
- `RECEIVED` → `HANDOFF_RECEIVE` i mottagande funktion.
- `ACCEPTED` → `HANDOFF_ACCEPT` i mottagande funktion.
- `COMPLETED` → `HANDOFF_COMPLETE` i mottagande funktion.
- `VERIFIED` → `HANDOFF_VERIFY` med uttryckligt tilldelat mandat.
- `CANCELLED` → `HANDOFF_CANCEL` med uttryckligt tilldelat mandat.

Detta separerar ansvar från teknisk API-access.

## SALU v1

Funktionerna `BILKONTROLL`, `PLANERING` och `INKÖP` seedas eftersom de redan är etablerade i det Production-verifierade SALU-/handoffkontraktet. Inga personer tilldelas mandat automatiskt.

Det följer SALU-regeln att ansvar inte ska hårdkodas till person och att en ansvarig måste vara identifierad innan ansvar kan accepteras.

## Identity boundary

`employees.id` är i nuvarande Production inte samma identitet som Supabase `auth.users.id`. Mandat lagras därför mot `employees.id`; server-auth måste resolve:a den aktiva employee-raden via verifierad identitet/email innan ett mandatkontrollerat API-anrop görs.

Whitelisted login är fortsatt autentisering/access boundary och ger inte automatiskt processmandat.

## Avgränsning

v1 seedar inga `employee_mandates`. Det vore ett organisationsbeslut, inte en teknisk default.

L2.5 ändrar inte Layer 1, SALU-state, passage, checkpoint eller action-state av sig självt. Den etablerar den gemensamma deny-by-default mandatgaten som dessa write paths kan använda.
