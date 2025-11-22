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

## Unified Damage Model (lib/damages.ts)

### Overview
`getVehicleInfo()` fetches and consolidates damages from two sources:
1. **BUHS (external/legacy)**: Via RPC `get_damages_by_trimmed_regnr`
2. **User damages**: From `public.damages` table

### Matching Strategy
A BUHS damage is marked as "documented" when a matching row exists in `public.damages`:
- **Key format**: `regnr|original_damage_date|legacy_damage_source_text`
- **Primary match**: Exact match on all three components
- **Edge case (missing date)**: Uses text-only matching (first documented row wins)
- **Text changes**: If BUHS upstream text changes, old documented rows keep their text; new text appears as new undocumented item

### Return Values
- `existing_damages[]`: Only undocumented BUHS items (need user action)
- `hasUndocumentedBUHS`: Boolean flag for UI gating
- `needsDocumentationCount`: Count of BUHS items needing documentation
- `newDamagesCount`: Count of user-originated damages (legacy_damage_source_text IS NULL)

### Idempotence
When user documents a BUHS damage via `/check` form:
1. API inserts row into `public.damages` with `legacy_damage_source_text` = original BUHS text
2. Unique index `ux_damages_regnr_legacy_text` prevents duplicate inserts
3. Next call to `getVehicleInfo()` marks that BUHS as documented (excluded from `existing_damages`)
4. UI automatically hides "Befintliga skador att hantera" section when all BUHS are documented

### Performance
- **2 queries total**: Vehicle/BUHS via RPC + all user damages via direct query
- **Indexed fields**: `idx_damages_regnr`, `idx_damages_regnr_date`
- **No N+1**: All damages fetched in single query per source
