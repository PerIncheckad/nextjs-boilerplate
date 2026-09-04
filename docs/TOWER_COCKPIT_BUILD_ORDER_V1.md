# INCHECKAD Tower — Cockpit Build Order v1

**Status:** LOCKED BUSINESS/TECHNICAL BUILD ORDER  
**Date:** 2026-09-03  
**Scope:** Tower only. No Tower implementation in this change.  
**External dependencies:** Active-fleet bootstrap baseline; finalized AVVECKLA read contract.

## 1. Locked purpose

Tower is INCHECKAD's operational cockpit.

It shall provide a dynamic whole-business view of the vehicle operation and surface what requires human attention, decision or intervention, while allowing the user to drill from overview to vehicle/process/evidence and act through the owning domain.

Tower is a control point, not a process engine and not a source of truth.

Core question:

> How does the operation look right now — and where do I need to go in?

Flow:

> business overview -> deviation/process -> vehicle/object -> evidence -> intervention through owning module

## 2. Non-negotiable ownership rule

Tower may read broadly and initiate interventions broadly, but it must not own or duplicate underlying business truth.

- Planering owns planning mutations and finalization to Garage.
- Garaget owns Garage work and Garage-side processes.
- Nybil owns verified receipt/arrival save and inbound handoff completion.
- Status and source adapters own verified operational state corrections.
- Rental source owns RENTAL truth.
- SALU owns SALU process state, decisions and history.
- Hjulskifte remains owned by Garage/Hjulskifte contracts.
- AVVECKLA remains owned by the separate AVVECKLA domain and is consumed read-only by Tower when finalized.

Tower must never write directly to aggregate numbers or manufacture operational state.

## 3. Cockpit architecture

### 3.1 Layer A — Fleet master

Primary headline:

**AKTIVA** = the whole operational fleet that still belongs to the business.

Membership is independent of current operational state.

A vehicle remains AKTIV even if its current primary state is unknown.

Population logic after bootstrap:

> verified active-fleet baseline + verified inbound activation - verified terminal OUT = AKTIVA

The bootstrap baseline must come from a verified current fleet snapshot supplied by the business. Do not infer it from `vehicles`, Check-in recency, allowed plates, SALU, or open journey periods.

### 3.2 Layer B — Primary operational state within AKTIVA

The active fleet is partitioned by the current verified primary state:

- AVAILABLE -> LEDIGA
- RENTAL -> UTHYRDA
- DOWNTIME -> STILLESTAND
- PREPARATION -> FORBEREDELSE
- OTHER -> ANNAT
- no verified current primary state -> OKAND

These buckets must reconcile to AKTIVA once state coverage is complete.

`UNKNOWN` is a legitimate operational result and must never be replaced by guesswork.

Primary state is source-controlled. Tower must not create, transition or close primary states directly.

### 3.3 Layer C — Cross-cutting processes / overlays

These may overlap the active fleet and must not be added arithmetically to AKTIVA:

- SALU
- HJULSKIFTE
- AVVECKLA

A vehicle may be active and simultaneously be in SALU, DOWNTIME, WORKSHOP, HJULSKIFTE or AVVECKLA.

### 3.4 Layer D — Inbound pipeline

Separate from active fleet:

> PLANERADE INKOP -> GARAGET -> NYBIL -> AKTIVA

- Planerade inkop represents ordered units not yet materialized into Garage.
- Garaget represents Garage work units still owned by Garage, including units that do not yet have a registration number.
- Nybil is the verified inbound receipt/activation boundary.

## 4. Metric contracts

### 4.1 AKTIVA

Meaning: all vehicles currently belonging to the operational fleet.

Source: canonical fleet-membership read model built from:

1. one verified bootstrap snapshot at a known cutover timestamp;
2. later verified inbound activation events;
3. later verified terminal OUT events.

Current status: source contract defined; bootstrap data pending.

Forbidden fallbacks:

- `vehicles`
- `get_all_allowed_plates()`
- latest Check-in within X days
- `nybil_inventering` alone
- open `vehicle_journey_periods`

### 4.2 LEDIGA

Meaning: AKTIVA intersect current verified primary `AVAILABLE`.

Source: Layer 1 operational state.

Do not infer AVAILABLE from a normal Check-in, lack of RENTAL or lack of DOWNTIME.

### 4.3 UTHYRDA

Meaning: AKTIVA intersect current verified primary `RENTAL`.

Authoritative source: rental source contract -> `rental_operational_facts` -> Layer 1 RENTAL period.

Locked rental semantics:

- `UtDt` establishes RENTAL start.
- `InDt` ends RENTAL.
- close date does not end RENTAL.
- after `InDt`, do not infer AVAILABLE without a later verified source.

Current Production blocker: rental source tables exist but no live rental feed has been ingested yet.

### 4.4 STILLESTAND

Meaning: AKTIVA intersect current primary `DOWNTIME`.

Source: Layer 1 operational state.

### 4.5 VERKSTAD

Meaning: active `WORKSHOP` activity inside current DOWNTIME.

Source: `vehicle_journey_activity_periods` with `activity_type = 'WORKSHOP'` and open parent DOWNTIME.

VERKSTAD is a subset of STILLESTAND, never an additive primary state.

Other DOWNTIME activities may include SERVICE, WAITING_PARTS, TRANSPORT, ADMINISTRATION, MISSING_EQUIPMENT and OTHER.

### 4.6 SALU

Meaning: actual open SALU business process.

Source: `salu_flags WHERE status <> 'STANGD'` (actual stored value uses Swedish `STÄNGD`).

Do not use a future `current_saludatum` as proof that a vehicle is already in the SALU process.

Do not equate open SALU process with primary journey state SALU.

Tower drilldown shall expose SALU status, escalation, date, checkpoints, ownership, history and legitimate SALU decisions.

### 4.7 GARAGET

Meaning: Garage work units for which Garage still owns the work.

Population boundary:

- `voided_at IS NULL`
- `completed_at IS NULL`
- not already handed off to Nybil

Count Garage work units, not only distinct registration numbers. Pre-arrival units may have no regnr.

### 4.8 PLANERADE INKOP

Meaning: ordered planning units still upstream of Garage materialization.

Working calculation:

> persisted `ordered_count` - non-voided PLANERING-origin Garage materializations

This prevents the same unit from being counted as both planned purchase and Garage object.

### 4.9 HJULSKIFTE

Meaning: seasonal wheel-change overlay for AKTIVA vehicles.

Candidate population must be:

> AKTIVA intersect verified wheel-change candidate source

Do not use the full historical/latest-Check-in candidate population as active fleet.

Expose business buckets such as:

- RATT HJUL / ALREADY_CORRECT
- KRAVER SKIFTE / REQUIRES_CHANGE
- BOKAD
- PAGAENDE
- KLAR
- AVVIKELSE
- SALU-UNDANTAG
- OKAND HJULSTATUS

Operational writes remain in Garage/Hjulskifte contracts.

### 4.10 AVVECKLA

Out of scope for this build-order definition.

Tower consumes the finalized AVVECKLA read contract when the separate domain work is complete.

AVVECKLA is an overlay until terminal OUT; terminal OUT removes the vehicle from AKTIVA.

## 5. Period metrics

Snapshot counts and duration metrics must never be mixed arithmetically.

### SALU downtime days

For a selected calendar period, calculate the actual temporal intersection:

> SALU process interval intersect DOWNTIME interval intersect selected calendar period

Aggregate as vehicle-days, with drilldown to vehicle, time span, cause/activity and SALU process.

Use Europe/Stockholm period boundaries.

Do not use `salu_vehicle_state.stillestand_salu_days` as the source for month-specific statistics; it does not provide sufficient temporal resolution.

Historical warning: current Production history begins too late to reconstruct complete August 2026 business truth. Missing historical coverage must be surfaced, not interpreted as zero.

## 6. Attention layer

Attention is a layer above the whole-business cockpit, not the definition of Tower itself.

Compact attention indicators may include:

- overdue
- deviations
- blocked
- waiting verification
- unknown operational state
- SALU escalation
- overdue wheel-change booking

Each attention number must drill to the exact population that caused it.

The current Tower's attention-only population must not become the fleet population.

## 7. Drilldown contract

Every headline metric must support:

> metric -> exact matching population -> vehicle/object -> source/evidence -> owning process -> legitimate action

Examples:

- AKTIVA -> vehicle list -> current state and provenance -> Vagnkort/Status; no direct Tower mutation.
- LEDIGA -> AVAILABLE vehicles -> source/evidence -> correction via owning source/Status contract if needed.
- UTHYRDA -> rental evidence/agreement -> rental-owned source path; no Tower override.
- STILLESTAND -> DOWNTIME vehicles -> duration/cause/activity -> source-owned state path.
- VERKSTAD -> DOWNTIME + WORKSHOP -> activity details -> owning process.
- SALU -> open SALU flags -> SALU case -> SALU decisions.
- GARAGET -> Garage work units -> Garage process.
- PLANERADE INKOP -> planning period/station/model/outstanding units -> Planering.
- HJULSKIFTE -> eligible/status population -> Garage/Hjulskifte.
- period metrics -> vehicle/time/cause/evidence; no direct metric edit.

## 8. Intervention contract

Tower may initiate an intervention only through the owning module's existing server/domain contract.

Tower must never:

- write directly to aggregate metrics;
- write primary journey state directly;
- duplicate SALU logic;
- duplicate Garage logic;
- duplicate Hjulskifte logic;
- infer RENTAL;
- infer AVAILABLE from absence of negative evidence;
- bypass process gates or handoffs.

## 9. Target cockpit information architecture

### Top layer — business now

- AKTIVA as the main headline
- LEDIGA
- UTHYRDA
- STILLESTAND
- FORBEREDELSE
- OKAND

### Process layer

- SALU
- GARAGET
- HJULSKIFTE
- AVVECKLA
- PLANERADE INKOP

### Attention layer

- requires attention
- blocked
- overdue
- deviation
- waiting verification
- unknown state

### Period layer

Selectable period: today / week / month / custom.

Examples:

- downtime vehicle-days
- downtime vehicle-days during SALU
- workshop vehicle-days
- SALU lead time when sample is reliable
- wheel-change progress
- other time-based measures only when evidence supports them

## 10. Current Tower components — disposition

The current Tower is structured around the workflow:

> Uppmarksamhet -> Prioritering -> Verifiering -> Kontrollpunkter

This structure is not the target cockpit architecture.

Disposition:

- current `operator-cockpit` attention logic: retain as a source for the future attention layer, but not as Tower population master;
- current duplicate priority scoring in backend/UI: must be consolidated when implementation begins;
- current Hjulskifte Tower panel: retain semantics, but move into drilldown/process layer rather than a permanently expanded cockpit table;
- Drifthistorik: retain as read-only evidence/drilldown;
- Driftmatning: retain useful measurement logic, but integrate period measures into the cockpit instead of treating metrics as a separate Tower identity;
- fuel receipt evidence: only show when causally relevant to the selected vehicle/process; it is not a Tower domain of its own.

## 11. Data-quality rules

Tower must surface uncertainty explicitly.

- No verified active membership -> cannot claim AKTIVA business truth.
- No rental feed -> UTHYRDA must be unavailable/unknown, not guessed.
- Incomplete Layer 1 coverage -> state reconciliation must expose UNKNOWN.
- Incomplete historical coverage -> period metric must be marked incomplete.
- A stale Check-in station must not silently become current station truth.
- Receipt association by registration number alone must not be treated as causal proof without process context.

## 12. Build sequence

Implementation must follow this order:

### A. Canonical Tower read model

Create one server-side read model/API that composes the locked metric contracts without moving domain ownership into Tower.

It must expose provenance and coverage state for every metric.

### B. Production verification of numbers

Before UI replacement, compare each read-model population/count against direct Production queries and domain sources.

No metric may be marked reliable if its source coverage is incomplete.

### C. Cockpit UI

Replace the attention-workflow layout with the four cockpit layers described above.

No business logic may be duplicated in the UI.

### D. Drilldown

Implement metric -> population -> vehicle/object -> evidence/source.

### E. Interventions

Expose actions only by invoking the owning module's existing API/RPC/domain contract.

### F. Production acceptance

Verify end-to-end in Production:

- metric meaning
- metric source
- population boundaries
- no double counting
- drilldown exactness
- intervention ownership
- explicit UNKNOWN/incomplete states

## 13. External integration point A — active-fleet bootstrap

Required input:

- verified current active-fleet snapshot;
- one row per registration number;
- known snapshot/cutover date/time;
- registration number is sufficient for membership; optional brand/model/station may be used only for reconciliation unless separately authoritative.

Validation before acceptance:

- normalize regnr;
- reject/flag empty identities;
- flag duplicates;
- compare against existing Nybil, vehicles and Check-in data;
- report discrepancies without auto-deleting them;
- persist source provenance and cutover timestamp.

After bootstrap, membership is maintained by verified IN/OUT lifecycle events rather than repeated manual replacement of the baseline.

## 14. External integration point B — AVVECKLA read contract

Placeholder only.

When the AVVECKLA domain is finalized elsewhere, Tower shall consume:

- current AVVECKLA population;
- process stage/status;
- attention/blocker data;
- terminal OUT fact/time;
- owning action links/contracts.

Tower must not reimplement AVVECKLA readiness or terminal-OUT business logic.

## 15. Locked final principle

> Tower gives the business-wide operational view, lets the user drill from whole -> deviation/process -> vehicle/object -> evidence, and lets the user intervene through the correct owning process without Tower becoming the owner of that process.

No Tower UI or implementation work should reinterpret these contracts. If a required source is missing, Tower must say that the truth is unavailable rather than infer it.
