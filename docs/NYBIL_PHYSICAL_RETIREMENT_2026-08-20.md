# Nybil physical retirement — 2026-08-20

## Status

GO — fysisk retirement är genomförd i Production och repo:t är synkat med motsvarande migrationsfiler.

## Bakgrund

Steg 3.2D flyttade Nybil till kanoniska DB-fält och stoppade samtliga writes till sex historiska alias. Efter riktig Production-data och ny read-only preflight uppfylldes kriterierna för fysisk retirement.

## Borttagna legacykolumner

Följande kolumner har tagits bort från `public.nybil_inventering`:

- `bilmodell` → canonical `modell`
- `ankomstdatum` → canonical `registreringsdatum`
- `monterade_dack` → canonical `hjultyp`
- `hjul_till_forvaring` → canonical `hjul_ej_monterade`
- `hjul_forvaring_station` → canonical `hjul_forvaring_ort`
- `kompressor` → canonical `dackkompressor`

Notifieringspayloadens fältnamn `hjul_till_forvaring` är ett separat API-/notifieringskontrakt och påverkas inte av att DB-kolumnen är borttagen.

## Production-evidens före DROP

- `public.nybil_inventering`: 198 rader.
- Samtliga sex legacykolumner var nullable och saknade defaults.
- 0 registrerade DB-dependencies på de sex kolumnerna.
- Inga index eller constraints refererade legacykolumnerna.
- Tre riktiga post-4E-rader (`AMJ52S`, `AMJ52B`, `AMJ52C`) använde canonical-fälten och hade samtliga sex legacyfält `NULL`.
- `withNybilLegacyAliases(...)` var ren passthrough och genererade inga DB-alias.

## Genomförande

Kolumnerna droppades separat i Production och verifierades efter varje steg. Supabase migrationshistorik:

- `20260820004314_retire_nybil_legacy_bilmodell`
- `20260820004327_retire_nybil_legacy_ankomstdatum`
- `20260820004336_retire_nybil_legacy_monterade_dack`
- `20260820004344_retire_nybil_legacy_hjul_till_forvaring`
- `20260820004352_retire_nybil_legacy_hjul_forvaring_station`
- `20260820004401_retire_nybil_legacy_kompressor`

## Verifiering efter DROP

- 0 av de sex legacykolumnerna finns kvar i `public.nybil_inventering`.
- Tabellen har fortsatt 198 rader.
- `v_nybil_baseline` fungerar och returnerade 198 rader i slutkontrollen.
- `v_wheel_storage_precedence` fungerar och returnerade 1288 rader i slutkontrollen.
- Ingen kvarvarande DB-definition matchade de fysiskt borttagna legacykolumnerna som dependency.

## Slutsats

Nybil-datamodellen använder nu endast de kanoniska DB-kolumnerna för dessa sex begrepp. Den tidigare dubbellagringen är fysiskt borttagen.
