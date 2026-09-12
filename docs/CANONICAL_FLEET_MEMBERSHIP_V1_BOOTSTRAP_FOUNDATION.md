# CANONICAL FLEET MEMBERSHIP V1 — BUILD STEP 2

Manual Bootstrap Foundation only.

## Scope

Step 2 adds an auditable current-state T0 bootstrap mechanism above the Production-closed canonical membership foundation from Step 1.

It implements:

- immutable bootstrap batch revisions
- `T0`
- `OWN_FLEET`
- `PARTIAL | COMPLETE_ACTIVE_POPULATION`
- per-vehicle verified current state: `ACTIVE | INACTIVE | UNKNOWN`
- explicit unresolved identity rows
- Bilkontroll verifier/provenance
- deterministic manifest hash + revision hash
- exact completeness attestation
- controlled canonical application
- exactly-once batch application audit.

It does **not** perform a real fleet import, Production completeness attestation, Nybil ENTRY write-through, AVVECKLA EXIT write-through, Tower/Hjulskifte consumption or consumer cutover.

## Rollout rule

No real fleet-wide T0 is attested in Step 2. The real current-state T0 belongs after Step 3 is Production-live so the final baseline can be followed by uninterrupted canonical ENTRY/EXIT capture.

Step 2 therefore exposes mechanism only. `consumer_cutover_ready` is hard-coded `false`.

## Batch revision

A batch is identified by `batch_key + revision_no` and records:

- exact `t0`
- scope `OWN_FLEET`
- coverage mode
- source identity/provenance
- batch evidence.

The same batch/revision may be retried only with an identical canonical payload. A changed payload raises `BOOTSTRAP_REVISION_CONFLICT` and requires a new revision.

## Per-vehicle manifest

Each item records the current-state verification performed for one observed object at T0:

- item key
- canonical identity when resolved
- state `ACTIVE | INACTIVE | UNKNOWN`
- resolution reason
- REGNR/VIN snapshots
- source provenance
- Bilkontroll verifier
- verification time
- evidence.

Identity-backed rows must match canonical alias evidence. Unresolved objects remain explicit rows with `UNKNOWN` and either `NO_CANONICAL_IDENTITY` or `IDENTITY_CONFLICT`; they are never silently discarded.

Absence from the manifest never produces `INACTIVE`.

## Seal / immutability

Verification seals the batch. The seal freezes a deterministic manifest hash and a revision hash derived from the manifest plus verification metadata.

After sealing:

- no new item can be added
- existing batch/item/seal rows cannot be updated or deleted
- changed evidence requires a new revision and therefore a new hash.

## COMPLETE_ACTIVE_POPULATION

A `COMPLETE_ACTIVE_POPULATION` seal requires the exact Bilkontroll attestation:

> Denna population är komplett för OWN_FLEET ACTIVE vid T0.

`PARTIAL` can never be denominator-eligible.

Even an attested COMPLETE batch remains non-denominator-eligible while any `UNKNOWN` or unresolved item exists. It must also have been applied successfully.

This Step 2 status is a bootstrap-readiness property only; it does not open consumers.

## Canonical application

Resolved manifest states are applied through the Step 1 canonical membership foundation.

If an identity has no canonical membership fact, Step 2 appends exactly one `CURRENT_BASELINE` fact at T0 with complete bootstrap provenance.

If a matching canonical state already exists at or before T0 — for example a modern `ENTRY` fact after Step 3 — Step 2 confirms and audits that existing fact instead of overwriting it or creating a competing baseline.

If canonical state conflicts with the verified T0 state, if canonical facts are in conflict, or if a canonical fact is newer than the batch T0, application rejects explicitly.

Bootstrap never fabricates historical transitions and never infers prior ownership history.

## Security boundary

All Step 2 tables use RLS and are append-only.

`anon` and `authenticated` have no direct mutation grants and no bootstrap writer RPC execution.

`service_role` receives SELECT plus only the controlled create/add/seal/apply RPCs. Low-level lock/hash helpers are not exposed to `service_role`.

## Acceptance

CI executes the exact Step 1 + Step 2 migrations against PostgreSQL 17 and verifies, inside rollback acceptance plus real parallel sessions:

- PARTIAL is never a fleet denominator
- COMPLETE requires exact Bilkontroll attestation
- UNKNOWN/unresolved prevents denominator eligibility
- absence never creates INACTIVE
- ACTIVE/INACTIVE/UNKNOWN use canonical membership facts
- unresolved objects remain visible
- manifest/evidence changes change hash/revision
- sealed revisions cannot mutate
- same batch/revision retry is idempotent while changed payload conflicts
- existing modern canonical state is confirmed, not rewritten
- no historical backfill transitions are generated
- direct mutation/RPC privilege leakage is blocked
- concurrent application yields one bootstrap application and one canonical baseline fact.
