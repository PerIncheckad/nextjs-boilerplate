# RENTAL source contract v1

## Purpose

INCHECKAD shall ingest one rich row-level agreement/rental source and preserve the complete source row once. Layer 1, the future economic layer (Kistan), and later analysis may then read separate, explicit projections from the same source truth.

There shall not be one report for Layer 1 and another report for Kistan.

Source system -> complete common report -> RAW -> bounded projections.

## Source row grain

The machine report must contain one semantic agreement/rental row per source record. Human presentation rows such as totals, subtotals, headings and footers are not source records and must not be delivered as data rows.

F / AvtalsNr is the stable `source_record_id` for the agreement/rental row.

The complete delivered row, including operational and economic columns, is stored in `rental_source_rows_raw.raw_payload`. No column is discarded merely because Layer 1 does not currently use it.

## Layer 1 projection: A-I only

Layer 1 may interpret only these source fields:

| Column | Business field | Layer 1 meaning |
| --- | --- | --- |
| A | Avsl. Månad | Agreement close month fact |
| B | Stn | Station number |
| C | Ut Stn | Depot / out station |
| D | Avsl. År | Agreement close year fact |
| E | Avsl. Datum | Agreement is administratively/economically closed |
| F | AvtalsNr | Stable source record id |
| G | UtDt | RENTAL starts |
| H | InDt | Vehicle returned and RENTAL ends |
| I | RegNr | Vehicle identity in this source |

B and C are machine strings, not numbers, so source values with leading zeroes are preserved.

## RENTAL semantics

The source facts mean exactly:

- G exists, H empty, E empty -> the vehicle is out on an active RENTAL.
- G + H exist, E empty -> the vehicle has returned; the agreement is not yet closed.
- G + H + E exist -> the vehicle has returned and the agreement is closed.

**E never ends RENTAL. H ends RENTAL.**

After H, INCHECKAD must not infer `AVAILABLE`. If no other authoritative source establishes a new primary operational state, the operational read model must be `UNKNOWN`.

## Time precision

G and H must carry the source system's real time precision. If the source system knows date and time, the machine report must provide both. INCHECKAD must not invent `00:00` or any other time to turn a date-only source value into a timestamp.

If the source does not know a required time, INCHECKAD does not know it either and the row must be handled as incomplete rather than silently fabricated.

## RAW versus operational projection

`rental_source_rows_raw` stores the full source row as traceable evidence.

`rental_operational_facts` stores only the typed A-I projection used by Layer 1. Its `operational_hash` covers only the Layer 1 projection. A later change to revenue, damage cost, margin or another economic field in RAW must therefore not create an operational state change by itself.

Kistan is not implemented by this contract. When Kistan is built, it shall project its economic facts from the same RAW row instead of creating another rental source integration.

## Scope of foundation v1

This foundation creates source storage and the canonical A-I shape only. It deliberately does not:

- parse a particular Excel/CSV delivery format,
- create or close a `RENTAL` journey period,
- infer `AVAILABLE`,
- calculate economic effects,
- implement Kistan,
- overwrite vehicle journey history.

The next stage must add validated, idempotent ingestion before any RENTAL write-through is enabled.
