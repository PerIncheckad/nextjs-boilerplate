# Handover Notes – Damage Type Normalization

## Overview

This document describes the damage type normalization strategy implemented for the checkin system. The goal is to provide consistent, queryable damage type codes while maintaining the original Swedish labels.

## Normalization Strategy

### Grouped Categories: Tire/Wheel Damages Only

We consolidate only tire and wheel-related damages under a parent group `TIRE_WHEEL`. All other damage types remain granular without broader grouping.

**Parent Category:**
- `TIRE_WHEEL` (label: "Däck/fälg")

**Child Categories (7 types):**
| Swedish Label               | Code                     | Parent     |
|-----------------------------|--------------------------|------------|
| Däckskada                   | DACKSKADA                | TIRE_WHEEL |
| Däckskada sommarhjul        | DACKSKADA_SOMMAR         | TIRE_WHEEL |
| Däckskada vinterhjul        | DACKSKADA_VINTER         | TIRE_WHEEL |
| Fälgskada sommarhjul        | FALGSKADA_SOMMARHJUL     | TIRE_WHEEL |
| Fälgskada vinterhjul        | FALGSKADA_VINTERHJUL     | TIRE_WHEEL |
| Skrapad fälg                | SKRAPAD_FALG             | TIRE_WHEEL |
| Punktering                  | PUNKTERING               | TIRE_WHEEL |

### Other Damage Types

For all other damage types, we apply automatic sanitization:
- Convert to UPPERCASE
- Replace spaces with underscores (`_`)
- Normalize Swedish characters: Å→A, Ä→A, Ö→O
- Remove special characters

**Examples:**
- "Repa" → `REPA`
- "Buckla stor" → `BUCKLA_STOR`
- "Stenskott på ruta" → `STENSKOTT_PA_RUTA`
- "Läderreva på säte" → `LADERREVA_PA_SATE`

## Database Schema

### Reference Table: `public.damage_type_ref`

Stores the hierarchical damage type definitions.

```sql
CREATE TABLE public.damage_type_ref (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    parent_code TEXT REFERENCES damage_type_ref(code),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Main Tables

**`public.damages`** - Individual damage records
- `damage_type_raw` (TEXT) - Original user-provided Swedish label
- `damage_type` (TEXT) - Normalized code (e.g., `DACKSKADA`, `REPA`)
- `user_type` (TEXT) - Legacy field, now mirrors damage_type_raw
- `uploads` (JSONB) - Photo/video URLs and metadata

**`public.checkin_damages`** - Per-checkin damage records
- `damage_type` (TEXT) - Normalized code, same as in damages table
- `positions` (JSONB) - Array of car part and position data
- `checkin_id` (UUID) - Foreign key to checkins table

## Setup Instructions

### 1. Create Reference Table

Run the SQL script to create the reference table and seed initial data:

```bash
# In Supabase SQL Editor
psql -f docs/sql/damage_type_ref.sql
```

Or execute the contents of `docs/sql/damage_type_ref.sql` in the Supabase SQL Editor.

### 2. Backfill Existing Data

After creating the reference table, backfill existing damage records:

```bash
# In Supabase SQL Editor
psql -f docs/sql/backfill_damage_type.sql
```

This script:
- Sets `damage_type_raw` from `user_type` if NULL
- Normalizes and populates `damage_type` using the same logic as the TypeScript code
- Infers `damage_type` for `checkin_damages` by matching nearby `damages` records (±60 seconds, same regnr)

### 3. Verify the Data

After running the backfill, verify the results:

```sql
-- Check damages table coverage
SELECT 
    COUNT(*) as total_damages,
    COUNT(damage_type) as with_damage_type,
    COUNT(*) - COUNT(damage_type) as missing_damage_type
FROM public.damages;

-- Check checkin_damages table coverage
SELECT 
    COUNT(*) as total_checkin_damages,
    COUNT(damage_type) as with_damage_type,
    COUNT(*) - COUNT(damage_type) as missing_damage_type
FROM public.checkin_damages;
```

## Example Queries

### Count All Damages by Type

```sql
SELECT 
    damage_type,
    COUNT(*) as count
FROM public.damages
WHERE damage_type IS NOT NULL
GROUP BY damage_type
ORDER BY count DESC;
```

### Count Tire/Wheel Damages (Grouped)

```sql
SELECT 
    ref.parent_code,
    d.damage_type,
    ref.label,
    COUNT(*) as count
FROM public.damages d
INNER JOIN public.damage_type_ref ref ON d.damage_type = ref.code
WHERE ref.parent_code = 'TIRE_WHEEL'
GROUP BY ref.parent_code, d.damage_type, ref.label
ORDER BY count DESC;
```

### Total Count by Parent Group

```sql
SELECT 
    COALESCE(ref.parent_code, 'UNGROUPED') as group_name,
    COUNT(*) as total_damages
FROM public.damages d
LEFT JOIN public.damage_type_ref ref ON d.damage_type = ref.code
WHERE d.damage_type IS NOT NULL
GROUP BY ref.parent_code
ORDER BY total_damages DESC;
```

### Recent Checkins with Damage Types

```sql
SELECT 
    c.regnr,
    c.created_at,
    cd.damage_type,
    ref.label,
    ref.parent_code,
    cd.car_part,
    cd.position
FROM public.checkin_damages cd
JOIN public.checkins c ON c.id = cd.checkin_id
LEFT JOIN public.damage_type_ref ref ON cd.damage_type = ref.code
WHERE c.created_at > NOW() - INTERVAL '30 days'
ORDER BY c.created_at DESC
LIMIT 50;
```

### Damages by Regnr with Normalized Types

```sql
SELECT 
    regnr,
    damage_type_raw as "Original Label",
    damage_type as "Normalized Code",
    ref.label as "Reference Label",
    ref.parent_code as "Group",
    created_at
FROM public.damages d
LEFT JOIN public.damage_type_ref ref ON d.damage_type = ref.code
WHERE regnr = 'ABC123'
ORDER BY created_at DESC;
```

## Code Implementation

### Normalization Function

Located in: `app/api/notify/normalizeDamageType.ts`

```typescript
export function normalizeDamageType(damageType: string): NormalizedDamageType {
  // Returns: { typeCode: string, parentCode: string | null }
}
```

### Database Persistence

Located in: `app/api/notify/route.ts`

For each damage (new or documented), the code:
1. Calls `normalizeDamageType(rawType)` to get the normalized code
2. Inserts into `public.damages` with both `damage_type_raw` and `damage_type`
3. Inserts into `public.checkin_damages` with the normalized `damage_type`

### Dry Run Mode

To test without writing to the database, add `dryRun: true` to the payload:

```json
{
  "meta": {
    "regnr": "ABC123",
    "dryRun": true,
    ...
  }
}
```

## Maintenance

### Adding New Grouped Types

To add a new parent group (e.g., "Interior Damages"):

1. Insert parent row in `damage_type_ref`:
```sql
INSERT INTO public.damage_type_ref (code, label, parent_code)
VALUES ('INTERIOR', 'Inredningsskador', NULL);
```

2. Insert child rows:
```sql
INSERT INTO public.damage_type_ref (code, label, parent_code)
VALUES 
    ('SITS_SKADA', 'Sits skada', 'INTERIOR'),
    ('INSTRUMENTPANEL_REPA', 'Instrumentpanel repa', 'INTERIOR');
```

3. Update `app/api/notify/normalizeDamageType.ts` to add the new mappings to a new constant (e.g., `INTERIOR_MAPPING`).

### Monitoring

Check logs for database insert counts:

```bash
# Look for lines like:
Inserting 3 damage records and 5 checkin_damage records
Database persistence completed successfully
```

## Troubleshooting

**Issue:** Damage types are still NULL after checkin
- Check if `dryRun` mode is enabled
- Check logs for database errors
- Verify Supabase credentials are correct

**Issue:** Backfill script fails
- Ensure `damage_type_ref` table exists first
- Check for SQL syntax errors in the Supabase SQL Editor
- Verify you have write permissions on the tables

**Issue:** Swedish characters not normalized correctly
- Verify the normalization function handles Å, Ä, Ö correctly
- Check that the database column collation supports UTF-8

## Related Files

- `app/api/notify/normalizeDamageType.ts` - Normalization logic
- `app/api/notify/route.ts` - API endpoint with DB persistence
- `docs/sql/damage_type_ref.sql` - Reference table DDL and seed data
- `docs/sql/backfill_damage_type.sql` - Backfill script for existing data

## Questions?

For questions or issues, contact the development team or refer to the project's GitHub repository.
