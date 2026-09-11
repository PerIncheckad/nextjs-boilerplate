# OPS-HF-01A – Nybil → Vagnkort field matrix

Baseline reviewed: `c21192d8361fb5fd8f5f82f3fe315d345fe34824` (Production, 2026-09-10).

Classification is against the locked business question: **Vad registrerade vi om bilen när den kom in som Nybil?**

- `VISIBLE` = source field is read from the existing `nybil_inventering` row and deliberately displayed by Vagnkort after OPS-HF-01A.
- `MISSING (PROD)` = the business field exists in current Nybil write contract but was not exposed in Production Vagnkort at the reviewed baseline.
- `NOT APPLICABLE` = technical/provenance/status metadata, not a Nybil business attribute to display as source truth.

No new truth table is introduced. The API returns the existing latest Nybil source row as `baseline`.

## Business fields

| Nybil UI/source field | DB column | Production API read | Production Vagnkort display | OPS-HF-01A |
|---|---|---:|---:|---:|
| Registreringsnummer | `regnr` | yes | identity only | VISIBLE |
| Bilmärke | `bilmarke` | yes | identity only | VISIBLE |
| Specificerat bilmärke | `bilmarke_annat` | no | no | VISIBLE |
| Modell | `modell` | yes | identity only | VISIBLE |
| VIN, Garage upstream | `vin` | no | no | VISIBLE |
| Registrerad av | `registrerad_av` | no | no | VISIBLE |
| Fullständigt namn | `fullstandigt_namn` | no | no | VISIBLE |
| Registreringsdatum | `registreringsdatum` | yes | no | VISIBLE |
| Mottagningsort | `plats_mottagning_ort` | yes | no | VISIBLE |
| Mottagningsstation | `plats_mottagning_station` | yes | no | VISIBLE |
| Planerad station | `planerad_station` | no | no | VISIBLE |
| Mätarställning vid leverans | `matarstallning_inkop` | yes | no | VISIBLE |
| Registrerad aktuell ort | `plats_aktuell_ort` | yes | no | VISIBLE |
| Registrerad aktuell station | `plats_aktuell_station` | yes | no | VISIBLE |
| Registrerad aktuell mätarställning | `matarstallning_aktuell` | yes | no | VISIBLE |
| Monterade hjul | `hjultyp` | yes | equipment baseline | VISIBLE |
| Medföljande/lösa hjul | `hjul_ej_monterade` | yes | equipment baseline | VISIBLE |
| Hjulförvaring ort | `hjul_forvaring_ort` | yes | no | VISIBLE |
| Hjulförvaring specifik plats | `hjul_forvaring` | **no** (`hjul_forvaring_spec` read instead) | no | VISIBLE |
| Drivmedel | `bransletyp` | yes | no | VISIBLE |
| Växellåda | `vaxel` | no | no | VISIBLE |
| Tankstatus | `tankstatus` | yes | no | VISIBLE |
| Upptankning liter | `upptankning_liter` | no | no | VISIBLE |
| Upptankning literpris | `upptankning_literpris` | no | no | VISIBLE |
| Laddnivå | `laddniva_procent` | yes | no | VISIBLE |
| Serviceintervall | `serviceintervall` | no | no | VISIBLE |
| Max km/månad | `max_km_manad` | no | no | VISIBLE |
| Avgift över-km | `avgift_over_km` | no | no | VISIBLE |
| Antal nycklar | `antal_nycklar` | yes | equipment baseline | VISIBLE |
| Extranyckel förvaringsort | `extranyckel_forvaring_ort` | no | no | VISIBLE |
| Extranyckel specifik förvaring | `extranyckel_forvaring_spec` | no | no | VISIBLE |
| Antal laddkablar | `antal_laddkablar` | yes | equipment baseline | VISIBLE |
| Laddkablar förvaringsort | `laddkablar_forvaring_ort` | no | no | VISIBLE |
| Laddkablar specifik förvaring | `laddkablar_forvaring_spec` | no | no | VISIBLE |
| Antal insynsskydd | `antal_insynsskydd` | yes | equipment baseline | VISIBLE |
| Instruktionsbok | `instruktionsbok` | yes | equipment baseline | VISIBLE |
| Instruktionsbok förvaringsort | `instruktionsbok_forvaring_ort` | no | no | VISIBLE |
| Instruktionsbok specifik förvaring | `instruktionsbok_forvaring_spec` | no | no | VISIBLE |
| COC | `coc` | yes | equipment baseline | VISIBLE |
| COC förvaringsort | `coc_forvaring_ort` | no | no | VISIBLE |
| COC specifik förvaring | `coc_forvaring_spec` | no | no | VISIBLE |
| Låsbultar | `lasbultar_med` | yes | equipment baseline | VISIBLE |
| Dragkrok | `dragkrok` | yes | equipment baseline | VISIBLE |
| Gummimattor | `gummimattor` | yes | equipment baseline | VISIBLE |
| Däckkompressor | `dackkompressor` | yes | equipment baseline | VISIBLE |
| Stöld-GPS | `stold_gps` | no | no | VISIBLE |
| Stöld-GPS specifikation | `stold_gps_spec` | no | no | VISIBLE |
| MB.me aktiverad | `mbme_aktiverad` | no | no | VISIBLE |
| VW Connect aktiverad | `vw_connect_aktiverad` | no | no | VISIBLE |
| Saludatum registrerat i Nybil | `saludatum` | yes | SALU uses separate current model; original not shown | VISIBLE |
| Salu-station | `salu_station` | no | no | VISIBLE |
| Köpare företag | `kopare_foretag` | no | no | VISIBLE |
| Returort | `returort` | no | no | VISIBLE |
| Returadress | `returadress` | no | no | VISIBLE |
| Attention | `attention` | no | no | VISIBLE |
| Försäljningsnotering | `notering_forsaljning` | no | no | VISIBLE |
| Klar för uthyrning | `klar_for_uthyrning` | no | no | VISIBLE |
| Ej uthyrningsbar anledning/notering | `klar_for_uthyrning_notering` | no | no | VISIBLE |
| Skador vid leverans, flagga | `har_skador_vid_leverans` | yes | damage list separately, flag not shown | VISIBLE |
| Kommentarer/anteckningar | `anteckningar` | no | no | VISIBLE |
| Nybil referensbilder | `photo_urls` | yes | not as Nybil baseline | VISIBLE (count) |
| Nybil referensfilmer | `video_urls` | yes | not as Nybil baseline | VISIBLE (count) |
| Planeringsperiod, Garage upstream | `planning_period` | no | no | VISIBLE |
| Planeringsorsak, Garage upstream | `planning_reason` | no | no | VISIBLE |
| Leverantör, Garage upstream | `supplier` | no | no | VISIBLE |
| Orderreferens, Garage upstream | `order_reference` | no | no | VISIBLE |
| Källans reg.nr, Garage upstream | `source_regnr` | no | no | VISIBLE |
| Saluort, Garage upstream | `saluort` | no | no | VISIBLE |
| Dygnspris, Garage upstream | `daily_rate` | no | no | VISIBLE |
| Innehavsperiod månader, Garage upstream | `holding_period_months` | no | no | VISIBLE |
| Beställd, Garage upstream | `ordered_at` | no | no | VISIBLE |
| Avropad, Garage upstream | `calloff_at` | no | no | VISIBLE |
| Bekräftelsestatus, Garage upstream | `confirmation_status` | no | no | VISIBLE |
| Transportstatus, Garage upstream | `transport_status` | no | no | VISIBLE |
| Planerat leveransdatum, Garage upstream | `planned_delivery_date` | no | no | VISIBLE |
| Planeringsnotering, Garage upstream | `planning_note` | no | no | VISIBLE |

## Separate source-owned damage details

Nybil damage detail is not embedded into `nybil_inventering`. The form writes the Nybil flag `har_skador_vid_leverans` to the baseline row and writes each documented damage through `/api/nybil/damages` to `damages` with `source='NYBIL'` and `nybil_inventering_id`. Vagnkort already reads the damage rows separately. OPS-HF-01A therefore does not duplicate damage detail into the baseline row.

## Technical / provenance / status metadata

| Field | Classification | Treatment |
|---|---|---|
| `id` | NOT APPLICABLE | API identity/provenance only; not shown as business attribute |
| `planerad_station_id` | NOT APPLICABLE | technical station identifier; business station name is displayed |
| `media_folder` | NOT APPLICABLE | storage provenance; photo/video counts displayed instead |
| `is_duplicate` | NOT APPLICABLE | registration provenance, not vehicle equipment/business baseline |
| `duplicate_group_id` | NOT APPLICABLE | technical duplicate correlation ID |
| `source_garage_item_id` | NOT APPLICABLE | source provenance; retained in API row, not rendered as business fact |
| `source_garage_updated_at` | NOT APPLICABLE | source version stamp; retained in API row, not rendered as business fact |
| `created_at` / `updated_at` | NOT APPLICABLE | persistence timestamps |
| `is_sold` | NOT APPLICABLE to Nybil intake question | current form explicitly writes unknown/null for new car; later sale state is separately source-owned |
| `sold_date` | NOT APPLICABLE | not an intake field; later sale state must not rewrite Nybil original |

## Root cause reconciliation

1. Production data was present in `nybil_inventering`; no data loss was established.
2. Production `/api/vehicle-journey` returned `baseline: nybil` but selected only a subset of Nybil columns.
3. Production Vagnkort client did not type or render `baseline`; only the 11-field equipment comparison was shown.
4. Wheel storage had an additional contract mismatch: current Nybil writes the specific location to `hjul_forvaring`, while Production Vagnkort API selected `hjul_forvaring_spec`.
5. OPS-HF-01A changes only the read projection and presentation. No write, backfill, schema migration or source rewrite is added.
