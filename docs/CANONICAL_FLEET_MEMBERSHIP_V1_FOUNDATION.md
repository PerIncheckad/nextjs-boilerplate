# CANONICAL FLEET MEMBERSHIP V1 — FOUNDATION

Build Step 1 only.

## Scope

This foundation implements the locked platform contract for canonical `OWN_FLEET` membership:

- membership: `ACTIVE | INACTIVE | UNKNOWN`
- basis: `CURRENT_BASELINE | ENTRY | EXIT | CORRECTION`
- append-only provenance
- canonical vehicle identity with VIN and registration aliases
- deterministic causal predecessor chain
- unresolved `UNKNOWN` with explicit `resolution_reason`
- source-event idempotency boundary
- service-role controlled write/read boundary.

It does **not** implement:

- manual T0 bootstrap
- completeness attestation
- bootstrap data
- Nybil membership write-through
- AVVECKLA membership write-through
- Tower consumption
- Hjulskifte consumption
- changes to operational-state semantics.

## Physical schema

### `fleet_vehicle_identities`

Canonical identity anchor for `OWN_FLEET` vehicles.

### `fleet_vehicle_identity_aliases`

Append-only identity evidence:

- `VIN` is globally unique when verified.
- `REGNR` is not globally unique because registration numbers may change or later be reused.

### `fleet_membership_facts`

Append-only membership facts with:

- `membership_state`
- `basis`
- `effective_at`
- `verified_at`
- source identity
- actor/evidence
- optional `correction_of_fact_id`.

### `fleet_membership_fact_predecessors`

Explicit causal edges between canonical facts. A normal transition supersedes one canonical head. A `CORRECTION` may supersede all heads when resolving a real branch/conflict.

## Write boundary

`create_fleet_vehicle_identity(...)`

Creates/resolves an identity from verified VIN and/or registration evidence.

`append_fleet_membership_fact(...)`

Serializes on the identity row, validates the supplied predecessor against the current canonical head(s), enforces transition semantics and rejects older effective events that would overwrite a later canonical state.

Source-driven facts use `(source_system, source_entity, source_event_id)` as exactly-once idempotency anchor.

No `anon` or `authenticated` role can call these writers or directly insert canonical facts. `service_role` can execute the controlled functions but has no direct INSERT/UPDATE/DELETE grant on the canonical relations.

## Append-only enforcement

DB triggers reject direct `UPDATE` and `DELETE` on:

- identities
- aliases
- membership facts
- predecessor edges.

Canonical history can only advance by additional facts.

## Read contract

`get_fleet_membership(regnr, vin)` returns one canonical answer.

Resolved identity with one canonical head returns the fact-backed state and provenance.

Unresolved conditions return `UNKNOWN` without fabricating a fact:

- `NO_FACT`
- `IDENTITY_CONFLICT`
- `FACT_CONFLICT`.

For unresolved results, `membership_fact_id`, source and evidence may be null.

## Causal ordering

`verified_at` is audit metadata only and never defines precedence.

The current state is determined by the causal predecessor graph.

An older late-arriving event is rejected when its `effective_at` predates the current canonical head. Legitimate `ENTRY → EXIT → ENTRY` requires explicit predecessor chaining.

## PostgreSQL rollback acceptance

The migration contract was executed transactionally against the real Production PostgreSQL database with functional assertions and an explicit final `ROLLBACK`.

Verified in that rollback transaction:

- no fact → `UNKNOWN / NO_FACT`
- registration-only identity
- baseline `ACTIVE`
- `ACTIVE → EXIT → INACTIVE`
- late older `ENTRY` rejected
- `INACTIVE → explicit ENTRY → ACTIVE`
- duplicate source event returns the same fact
- no membership triggers on ordinary Check-in/Status/Rental sources
- direct UPDATE rejected
- direct DELETE rejected
- real branch → `UNKNOWN / FACT_CONFLICT`
- `CORRECTION` resolves the branch without mutating original facts
- VIN/registration conflict → `UNKNOWN / IDENTITY_CONFLICT`
- `anon`, `authenticated` and `service_role` have no direct INSERT grant on facts.

After rollback, all four foundation relations were verified absent from Production.

## Consumer boundary

This foundation is not a fleet denominator and must not be consumed fleet-wide yet.

Tower and Hjulskifte remain unchanged until later locked rollout steps.
