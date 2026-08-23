# RENTAL source contract v1

## Purpose

INCHECKAD ingests one rich row-level agreement/rental source and preserves the complete source row once. Layer 1, the future economic layer (Kistan), and later analysis read separate, explicit projections from the same source truth.

There shall not be one report for Layer 1 and another report for Kistan.

Source system -> complete common report -> RAW -> bounded projections.

## Source row grain

The machine report must contain one semantic agreement/rental row per source record. Human presentation rows such as totals, subtotals, headings and footers are not source records and must not be delivered as data rows.

F / AvtalsNr is the stable `source_record_id` for the agreement/rental row.

The complete delivered row, including operational and economic columns, is stored in `rental_source_rows_raw.raw_payload`. No column is discarded merely because Layer 1 does not currently use it.

The source delivery must include all relevant agreement states in the same feed:

- active rentals: G exists, H empty, E empty,
- returned but not closed agreements: G + H exist, E empty,
- returned and closed agreements: G + H + E exist.

The feed must therefore never be filtered only on E / Avsl. Datum.

## Verified legacy reference workbook

The reference workbook `Avslutade avtal 2025 Stn 166 170 1(1).xlsx` has been inspected as source-shape evidence, not as the final machine delivery.

Verified observations:

- 33 columns,
- 8,958 semantic agreement rows,
- F / AvtalsNr is unique across all 8,958 semantic rows,
- 12 monthly `Total` rows are presentation rows and are not source records,
- B / Stn and C / Ut Stn are delivered as text,
- C contains values with leading zeroes and must never be coerced to a number,
- G / UtDt and H / InDt in this legacy workbook are date-only strings,
- E / Avsl. Datum contains a more precise close timestamp in the legacy workbook.

The legacy workbook therefore validates the row grain and the rich 33-field source shape, but its date-only G/H precision is not sufficient for the new operational time layer when the upstream system knows actual time.

## Complete 33-field baseline

The current verified source shape contains these fields. Layer 1 may interpret only A-I. J-AG are preserved in RAW for future bounded consumers, including Kistan; Layer 1 assigns no operational-state meaning to them.

| Column | Source header | Layer 1 treatment |
| --- | --- | --- |
| A | Avsl. Månad | Operational projection field |
| B | Stn | Operational projection field, text |
| C | Ut Stn | Operational projection field, text |
| D | Avsl. År | Operational projection field |
| E | Avsl. Datum | Close fact only; never RENTAL end |
| F | AvtalsNr | Stable source record id |
| G | UtDt | RENTAL start |
| H | InDt | RENTAL end / vehicle returned |
| I | RegNr | Vehicle identity |
| J | Fordonstyp | Preserve in RAW only for Layer 1 |
| K | Debiterad Klass | Preserve in RAW only for Layer 1 |
| L | Uthyrd Klass | Preserve in RAW only for Layer 1 |
| M | Avtalstyp | Preserve in RAW only for Layer 1 |
| N | Prislista | Preserve in RAW only for Layer 1 |
| O | Företagsnamn | Preserve in RAW only for Layer 1 |
| P | Hyror | Preserve in RAW only for Layer 1 |
| Q | S:a Intäkt | Preserve in RAW only for Layer 1 |
| R | S:a Hyra | Preserve in RAW only for Layer 1 |
| S | S:a Dagar | Preserve in RAW only for Layer 1 |
| T | Snitt Intäkt | Preserve in RAW only for Layer 1 |
| U | Snitt Hyra | Preserve in RAW only for Layer 1 |
| V | Driv medel | Preserve in RAW only for Layer 1 |
| W | S-Skydd Halv | Preserve in RAW only for Layer 1 |
| X | S-Skydd Hel | Preserve in RAW only for Layer 1 |
| Y | Skade kostnad | Preserve in RAW only for Layer 1 |
| Z | Tillval | Preserve in RAW only for Layer 1 |
| AA | Avgifter | Preserve in RAW only for Layer 1 |
| AB | Väg o Miljö | Preserve in RAW only for Layer 1 |
| AC | Tillbeh. | Preserve in RAW only for Layer 1 |
| AD | Bildeb | Preserve in RAW only for Layer 1 |
| AE | Bildeb/ Hyra | Preserve in RAW only for Layer 1 |
| AF | Marg. Hyra 3110 | Preserve in RAW only for Layer 1 |
| AG | Marg./ Dag 3110 | Preserve in RAW only for Layer 1 |

Additional fields may be added to the common machine source when they are useful to later bounded consumers. Adding a field to RAW does not authorize Layer 1 to interpret it.

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

G is the only source fact that may establish a RENTAL start. H is the only source fact that may end that source-owned RENTAL.

After H, INCHECKAD must not infer `AVAILABLE`. If no later authoritative source establishes a new primary operational state, the operational read model must be `UNKNOWN`.

If a later verified Status or Check-in fact actually occurred after H but its write-through was deferred while RENTAL was still open in Incheckad, it may be replayed at its own verified timestamp after H. Facts from before H are not moved forward. Exact timestamp ties across different sources do not invent a source precedence.

## Time precision

G and H must carry the source system's real time precision. If the source system knows date and time, the machine report must provide both. INCHECKAD must not invent `00:00` or any other time to turn a date-only source value into a timestamp.

If the source does not know a required time, INCHECKAD does not know it either and the row is incomplete for operational write-through rather than silently fabricated.

## RAW versus operational projection

`rental_source_rows_raw` stores the full source row as traceable evidence.

`rental_operational_facts` stores only the typed A-I projection used by Layer 1. Its `operational_hash` covers only the Layer 1 projection. A later change to revenue, damage cost, margin or another economic field in RAW must therefore not create an operational state change by itself.

Kistan is not implemented by this contract. When Kistan is built, it shall project its economic facts from the same RAW row instead of creating another rental source integration.

## Current implementation status

The source foundation, idempotent ingestion, source-owned G/H RENTAL write-through and post-return replay are implemented separately from this contract document.

The original foundation migration itself deliberately does not:

- parse a particular Excel/CSV delivery format,
- create or close a `RENTAL` journey period,
- infer `AVAILABLE`,
- calculate economic effects,
- implement Kistan,
- overwrite vehicle journey history.

Later migrations add the validated ingestion and G/H journey write-through while preserving those architectural boundaries.

## Machine-delivery delta from the legacy workbook

The final common source delivery must therefore change the legacy report shape in these ways:

1. include active, returned-unclosed and closed agreements in one feed,
2. remove `Total`/subtotal/presentation rows,
3. preserve one semantic row per F / AvtalsNr,
4. keep B and C as text,
5. provide source-known date and time for G / UtDt and H / InDt,
6. keep null as null when the source does not know a fact,
7. preserve the complete rich row so future economic consumers do not require a second report.
