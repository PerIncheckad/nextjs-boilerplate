# Layer 2 Process/Routine Contract v1

Status: implementation contract for L2.1.

## Locked boundary

Layer 1 / Fordonsresan remains the factual timeline and source-owned operational state. Layer 2 may react to verified facts but must not infer or rewrite Layer 1 state.

Layer 2 is the process-control layer:

`event -> process -> routine -> checkpoint -> handshake/verification -> passage or deviation -> action -> re-verification -> outcome`

Kistan is outside this contract.

## Why definitions first

The existing checkpoint/action/timer engine already provides reusable primitives for verification, deviation handling, remediation and escalation. L2.1 therefore adds only the missing versioned definition layer for PROCESS and RUTIN.

L2.1 intentionally does **not** create generic mutable `process_instances` or `routine_instances`. Existing source domains remain owners of their current execution state until a later contract defines a safe generic projection without creating two truths.

## First vertical case: SALU

The first vertical case is SALU because its business rules are already documented and implemented in a source-owned domain.

Mapping v1:

- process definition: `SALU` v1
- routine definition: `SALU_CYCLE` v1
- owner function: `BILKONTROLL`
- source entity: `salu_flags`
- source record identity: `flag_id`
- subject: `regnr`
- process start fact: `SALU_FLAG_CREATED`
- current execution state remains source-owned by `salu_flags.status`

No SALU flags are created, changed or backfilled by this migration.

## Versioning

`process_definitions` and `routine_definitions` are versioned. Historical consumers must reference the exact version that applied to their source execution context. Only one active version per process/routine code is allowed.

## Security

Both definition tables are server-only:

- RLS enabled
- no browser policies
- privileges revoked from `public`, `anon` and `authenticated`
- service role is the intended application access path

## Explicitly not in L2.1

- no generic process instance state
- no generic routine instance state
- no handshake model
- no process passage engine
- no role/mandate model
- no Kistan/economic rule
- no Layer 1 writes
- no changes to SALU business state

Those capabilities are separate Layer 2 increments and must reuse this definition contract rather than duplicate it.
