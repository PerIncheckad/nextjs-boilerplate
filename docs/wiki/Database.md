# Databasmodell och index

## Tabeller (urval)
- `public.checkins`
  - `id`, `regnr`, `completed_at`, `current_city`, `current_station`, `current_location_note`
  - `odometer`, `wheel_type`, `fuel_type`, `checker_name`, `checker_email`
  - Diverse flaggor (rekond, varningslampa, etc.)

- `public.damages`
  - Gemensam tabell för både "nya" skador och dokumenterade BUHS‑skador
  - Fält (urval):
    - `regnr text`
    - `damage_date date` – för nya skador (incheckningsdatum)
    - `legacy_damage_source_text text` – NULL för nya, satt för dokumenterad BUHS
    - `original_damage_date date` – BUHS‑datum
    - `legacy_loose_key text` – `REGNR|original_damage_date`
    - `user_type text`, `user_positions jsonb`, `description text`
    - `created_at timestamptz`

- `public.checkin_damages`
  - En rad per position (för statistik/rapporter)
  - `checkin_id`, `regnr`, `user_type`, `carPart`, `position`

## Index och idempotens
```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_damages_regnr_legacy_text
  ON public.damages (regnr, legacy_damage_source_text)
  WHERE legacy_damage_source_text IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_damages_legacy_loose_key
  ON public.damages (legacy_loose_key)
  WHERE legacy_loose_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_damages_regnr_loose
  ON public.damages (regnr, original_damage_date, legacy_loose_key);
```

## Läslogik (union)
- BUHS‑skador + tidigare sparade "nya skador"
- Markera BUHS som dokumenterad om:
  - `legacy_damage_source_text` matchar exakt, eller
  - `legacy_loose_key` matchar (`REGNR|datum`)
