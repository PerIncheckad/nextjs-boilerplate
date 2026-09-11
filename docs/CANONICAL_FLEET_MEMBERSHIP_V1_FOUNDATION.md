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
- source-event exactly-once boundary
- service-role controlled write/read boundary.

It does **not** implement manual T0 bootstrap, completeness attestation, bootstrap data, Nybil/AVVECKLA membership write-through, Tower/Hjulskifte consumption or changes to operational-state semantics.

## Physical schema

### `fleet_vehicle_identities`
Canonical identity anchor for `OWN_FLEET` vehicles.

### `fleet_vehicle_identity_aliases`
Append-only identity evidence. `VIN` is globally unique when verified. `REGNR` is intentionally not globally unique because registration numbers may change or later be reused.

### `fleet_membership_facts`
Append-only membership facts with state, basis, effective/verified time, source identity, actor/evidence and optional correction target.

### `fleet_membership_fact_predecessors`
Explicit causal edges between canonical facts. Normal transitions supersede one canonical head; `CORRECTION` may supersede all heads when resolving a real branch/conflict.

## Integrity lock 1 — identity binding + conflict

`create_fleet_vehicle_identity(...)` is create/resolve only. It may reuse an already matching VIN-only or REGNR-only identity, and it may create a brand-new identity when the supplied verified keys are both new. It must never silently merge an existing REGNR identity with a later VIN or an existing VIN identity with a later REGNR.

If both supplied aliases already resolve and point to different identities, the operation rejects with `IDENTITY_CONFLICT`. If one supplied alias resolves and the other is new, ordinary create/resolve rejects with `IDENTITY_BINDING_REQUIRED`.

Explicit later binding is a separate operation:

`bind_fleet_vehicle_identity_alias(...)`

It requires source/evidence provenance and appends new alias evidence without rewriting prior REGNR-only provenance. A VIN already bound to another canonical identity rejects with `IDENTITY_CONFLICT`. REGNR remains reusable over time by design.

## Integrity lock 2 — source-event payload exactly-once

`(source_system, source_entity, source_event_id)` identifies one canonical event payload, not merely one database row.

`append_fleet_membership_fact(...)` serializes retries on the source-event key. An exact retry returns the existing `fact_id` only when the canonical payload still matches, including:

- `identity_id`
- `membership_state`
- `basis`
- `effective_at`
- `correction_of_fact_id`
- `source_record_id`
- predecessor set.

A reused source-event ID with a different canonical payload rejects with explicit `SOURCE_EVENT_CONFLICT`.

## Integrity lock 3 — identity creation serialization

Identity resolution/creation uses transaction-scoped PostgreSQL advisory locks derived from normalized keys:

- `REGNR:<normalized-regnr>`
- `VIN:<normalized-vin>`.

When both keys are present they are acquired in deterministic lexical order. This serializes the decision to reuse or create even when no identity row exists yet, preventing first-create forks and avoiding inconsistent VIN/REGNR cross-binding races.

VIN also retains its unique index as a final invariant.

## Append-only enforcement

DB triggers reject direct `UPDATE` and `DELETE` on identities, aliases, membership facts and predecessor edges. Canonical history can only advance by new append-only evidence/facts.

## Read contract

`get_fleet_membership(regnr, vin)` returns one canonical answer. Resolved identity with one canonical head returns the fact-backed state and provenance. Unresolved conditions return `UNKNOWN` without fabricating a fact:

- `NO_FACT`
- `IDENTITY_CONFLICT`
- `FACT_CONFLICT`.

For unresolved results, `membership_fact_id`, source and evidence may be null.

## Causal ordering

`verified_at` is audit metadata only and never defines precedence. Current state is determined by the causal predecessor graph. An older late-arriving event is rejected when its `effective_at` predates the current canonical head. Legitimate `ENTRY → EXIT → ENTRY` requires explicit predecessor chaining.

## Security boundary

No `anon` or `authenticated` role can call the canonical writers or directly insert canonical facts. `service_role` can execute the controlled create/bind/fact/read functions but has no direct INSERT/UPDATE/DELETE grant on canonical relations. The low-level advisory-lock helper is not executable by client roles or `service_role` directly.

## Acceptance requirement

Before merge the complete migration must be executed transactionally against real PostgreSQL with a final `ROLLBACK`. Acceptance must cover the full original foundation suite plus the three integrity hardening locks, including real concurrent first-create calls for REGNR and VIN and concurrent mixed VIN+REGNR resolution.

Production must remain unchanged after rollback.

## Consumer boundary

This foundation is not a fleet denominator and must not be consumed fleet-wide yet. Tower and Hjulskifte remain unchanged until later locked rollout steps.
