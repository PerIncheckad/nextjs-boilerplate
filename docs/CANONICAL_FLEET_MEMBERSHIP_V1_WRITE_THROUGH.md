# CANONICAL FLEET MEMBERSHIP V1 — BUILD STEP 3

Modern ENTRY / EXIT Write-through + Cutover Integrity.

## Scope

Build Step 3 connects exactly two verified future source events to the canonical OWN_FLEET membership foundation:

1. verified `nybil_inventering` save after the exact Garage IN → Nybil handoff → `ENTRY / ACTIVE`
2. verified terminal `garage_avveckla_events` event → `EXIT / INACTIVE`

This step does not backfill historical Nybil rows or AVVECKLA events, perform the real T0 bootstrap, change Tower/Hjulskifte, or open consumers.

## Nybil ENTRY

The source event identity is the exact `nybil_inventering.id`.

The existing database handoff trigger remains the transaction boundary. A Nybil insert must pass the existing Garage source/version gate. The handoff function then:

- takes the fleet cutover lock
- locks the exact Garage item
- requires Garage direction `IN`
- requires a non-voided Garage item
- verifies REGNR and, when present on both sides, VIN
- persists `handed_off_nybil_id` / `handed_off_at`
- appends canonical `ENTRY / ACTIVE` from source `NYBIL / nybil_inventering`.

If membership append fails, the Nybil row, Garage handoff, membership writes and all other trigger side effects are in the same PostgreSQL statement transaction and roll back together.

No Check-in/activity/status inference is used.

## AVVECKLA EXIT

The only accepted source is an actual immutable `garage_avveckla_events` row whose event type is exactly one of:

- `UT_OVERLAMNING_VERIFIERAD`
- `UT_TRANSPORTOR_HAMTAT_VERIFIERAD`
- `UT_AVSTALLNING_VERIFIERAD`

The source event identity is exactly `garage_avveckla_events.event_id`.

The existing terminal AVVECKLA function remains the transaction boundary. It takes the cutover lock before the terminal work, inserts the verified terminal event, appends canonical `EXIT / INACTIVE`, closes the exact current Layer 1 period and completes the AVVECKLA case/Garage item. Any downstream failure rolls the whole transaction back.

## Pre-T0 initial EXIT

The final fleet-wide T0 does not exist when Step 3 first becomes live. Therefore one narrow cutover exception exists:

- current canonical identity is `NO_FACT`
- no denominator-eligible `COMPLETE_ACTIVE_POPULATION` T0 exists
- source is an existing canonical terminal AVVECKLA event row
- source event has one of the three locked terminal event types
- exact Garage/case/event provenance is internally validated.

Then the source adapter may append one initial `EXIT / INACTIVE` fact without a predecessor.

It does not create an ACTIVE fact, ENTRY fact or reconstructed ownership history.

The exception is internal-only. `service_role`, `authenticated` and `anon` cannot execute the source adapter directly.

## After T0

As soon as a verified `COMPLETE_ACTIVE_POPULATION` bootstrap is actually `bootstrap_denominator_eligible`, the pre-T0 exception closes automatically.

A later `NO_FACT → EXIT` attempt raises `POST_T0_NO_FACT_EXIT_REJECT`.

Normal state-machine semantics then require the canonical current head to be `ACTIVE` before AVVECKLA may append `EXIT / INACTIVE`.

Exact retries of already committed source events remain idempotent.

## Cutover serialization

A transaction-level advisory lock with one global key serializes:

- final T0 application
- Nybil membership ENTRY
- AVVECKLA membership EXIT.

This prevents a source event and the T0 application from passing each other during cutover.

Two real-session acceptance cases are required:

- source first: modern source commits before T0 continues; T0 confirms the existing canonical state instead of writing a stale baseline
- T0 first: T0 commits before the source continues; the source performs the ordinary canonical transition from the T0 state.

## Identity integrity

Verified source adapters reuse the existing canonical identity rules:

- VIN is the strongest stable identity
- REGNR is an operational alias
- a verified VIN may explicitly bind to a single conflict-free REGNR-only identity
- reused REGNR with another existing VIN creates a different VIN identity; identities are never silently merged
- REGNR-only ambiguity without VIN rejects.

## Security boundary

The following Step 3 helpers are internal only and receive no client/service-role EXECUTE grant:

- `lock_fleet_membership_cutover()`
- `resolve_fleet_identity_from_verified_source(...)`
- `append_fleet_membership_entry_from_nybil(uuid)`
- `append_fleet_membership_exit_from_avveckla(uuid)`

The pre-T0 initial EXIT exception is therefore not a generic caller capability. It is reachable only inside the controlled terminal AVVECKLA database flow.

## Acceptance

CI must execute PostgreSQL 17 acceptance proving:

- initial Nybil ENTRY
- normal ACTIVE → EXIT
- pre-T0 initial EXIT with no fabricated ACTIVE/ENTRY
- exact Nybil source retry
- exact AVVECKLA source retry
- false/nonterminal initial EXIT source rejection
- post-T0 `NO_FACT → EXIT` rejection
- Nybil source/handoff/membership rollback together on membership failure
- AVVECKLA terminal event/membership/Layer1/case/Garage rollback together on downstream failure
- source-first and T0-first ordering using real parallel PostgreSQL sessions
- internal source adapters remain unavailable to service-role clients.

Build Step 3 does not create a real Production T0 and does not change `consumer_cutover_ready`.
