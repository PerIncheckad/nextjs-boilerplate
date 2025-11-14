# CSV Import Guide - BUHS Damage Data & Vehicle Management

This guide explains how to safely import and update BUHS damage data and vehicle information using staging tables and SQL queries.

## Table of Contents
1. [Pre-Import Backup](#pre-import-backup)
2. [Staging Tables](#staging-tables)
3. [Import Process](#import-process)
4. [N2-per-datum Concept](#n2-per-datum-concept)
5. [Verification Queries](#verification-queries)
6. [Pattern Detection](#pattern-detection)

---

## Pre-Import Backup

Always create a snapshot backup before performing any import operation. This allows you to restore data if needed.

### Backup damages table
```sql
-- Create timestamped backup of damages table
CREATE TABLE damages_backup_YYYYMMDD AS 
SELECT * FROM public.damages;

-- Verify backup row count
SELECT COUNT(*) as backup_count FROM damages_backup_YYYYMMDD;
SELECT COUNT(*) as original_count FROM public.damages;
```

### Backup vehicles table
```sql
-- Create timestamped backup of vehicles table
CREATE TABLE vehicles_backup_YYYYMMDD AS 
SELECT * FROM public.vehicles;

-- Verify backup row count
SELECT COUNT(*) as backup_count FROM vehicles_backup_YYYYMMDD;
SELECT COUNT(*) as original_count FROM public.vehicles;
```

---

## Staging Tables

Use staging tables to prepare and validate data before merging into production tables.

### Damage Data Staging (Skadefilen)

**Table:** `mabi_damage_data_raw_new`

This staging table holds new BUHS damage import data before it's merged into the main system.

```sql
-- Create staging table for BUHS damage data
CREATE TABLE IF NOT EXISTS public.mabi_damage_data_raw_new (
    id BIGSERIAL PRIMARY KEY,
    regnr TEXT NOT NULL,
    damage_type_raw TEXT,
    note_customer TEXT,
    note_internal TEXT,
    vehiclenote TEXT,
    damage_date DATE,
    saludatum DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mabi_damage_raw_new_regnr 
ON public.mabi_damage_data_raw_new(regnr);
```

### Vehicle Data Staging (Bilkontroll)

**Table:** `vehicles_staging`

This staging table holds vehicle information before it's merged into the vehicles table.

```sql
-- Create staging table for vehicle data
CREATE TABLE IF NOT EXISTS public.vehicles_staging (
    id BIGSERIAL PRIMARY KEY,
    regnr TEXT NOT NULL UNIQUE,
    brand TEXT,
    model TEXT,
    wheel_storage_location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_staging_regnr 
ON public.vehicles_staging(regnr);
```

---

## Import Process

### Step 1: Load CSV into Staging Table

```sql
-- Example: Load BUHS damage data from CSV
COPY mabi_damage_data_raw_new (
    regnr, 
    damage_type_raw, 
    note_customer, 
    note_internal, 
    vehiclenote,
    damage_date, 
    saludatum
)
FROM '/path/to/skadefil.csv'
DELIMITER ','
CSV HEADER;

-- Verify import
SELECT COUNT(*) FROM mabi_damage_data_raw_new;
SELECT * FROM mabi_damage_data_raw_new LIMIT 10;
```

### Step 2: Validate Staging Data

```sql
-- Check for missing regnr
SELECT COUNT(*) as missing_regnr 
FROM mabi_damage_data_raw_new 
WHERE regnr IS NULL OR TRIM(regnr) = '';

-- Check for invalid damage_date
SELECT COUNT(*) as invalid_dates
FROM mabi_damage_data_raw_new
WHERE damage_date IS NOT NULL AND damage_date > CURRENT_DATE;

-- Check for standardized app patterns (should be filtered)
SELECT COUNT(*) as standardized_patterns
FROM mabi_damage_data_raw_new
WHERE note_customer ~ '^[^-]+ - [^-]+ - [^-]+$'
   OR note_internal ~ '^[^-]+ - [^-]+ - [^-]+$'
   OR vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$';
```

### Step 3: Upsert from Staging to Production

**IMPORTANT:** The upsert process follows these rules:
- **INSERT** only completely new BUHS import rows (new regnr + damage_date combinations)
- **UPDATE** existing BUHS import rows only
- **NEVER** modify documented rows (rows with `legacy_damage_source_text` set)
- **NEVER** modify app-created rows (rows created by the check-in form)

```sql
-- Upsert BUHS damage data from staging
-- This will INSERT new rows and UPDATE existing import rows
-- It will NOT touch documented or app-created damages
INSERT INTO public.damages (
    regnr,
    damage_type_raw,
    note_customer,
    note_internal,
    vehiclenote,
    damage_date,
    saludatum,
    created_at
)
SELECT 
    UPPER(TRIM(staging.regnr)) as regnr,
    staging.damage_type_raw,
    staging.note_customer,
    staging.note_internal,
    staging.vehiclenote,
    staging.damage_date,
    staging.saludatum,
    NOW()
FROM mabi_damage_data_raw_new staging
WHERE staging.damage_type_raw IS NOT NULL -- Only import rows with damage_type_raw
  -- Filter out standardized app patterns
  AND NOT (
    staging.note_customer ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR staging.note_internal ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR staging.vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$'
  )
ON CONFLICT (regnr, damage_date) 
WHERE damage_type_raw IS NOT NULL -- Unique index constraint
DO UPDATE SET
    damage_type_raw = EXCLUDED.damage_type_raw,
    note_customer = EXCLUDED.note_customer,
    note_internal = EXCLUDED.note_internal,
    vehiclenote = EXCLUDED.vehiclenote,
    saludatum = EXCLUDED.saludatum,
    updated_at = NOW()
WHERE 
    -- Only update if this is an import row (not documented, not app-created)
    damages.legacy_damage_source_text IS NULL
    AND damages.user_type IS NULL;

-- Upsert vehicles from staging
INSERT INTO public.vehicles (
    regnr,
    brand,
    model,
    wheel_storage_location,
    updated_at
)
SELECT 
    UPPER(TRIM(regnr)),
    brand,
    model,
    wheel_storage_location,
    NOW()
FROM vehicles_staging
ON CONFLICT (regnr) DO UPDATE SET
    brand = EXCLUDED.brand,
    model = EXCLUDED.model,
    wheel_storage_location = EXCLUDED.wheel_storage_location,
    updated_at = NOW();
```

---

## N2-per-datum Concept

**N2-per-datum** means that if a BUHS import introduces a damage with a **new damage_date** for a regnr that already has documented damages, it is treated as **undokumenterad** and must be documented once.

### How it works:

1. **First Inventory (Day 1):**
   - BUHS import row: `ABC123 | 2025-01-15 | Repa på dörr`
   - Status: Undokumenterad
   - User documents it → Creates row with `legacy_loose_key = 'ABC123|2025-01-15'`

2. **Second Import (Day 30):**
   - BUHS import row: `ABC123 | 2025-01-15 | Repa på dörr` ← Same date
   - Status: Already documented (recognized by `legacy_loose_key`)
   - No action needed

3. **Third Import (Day 60):**
   - BUHS import row: `ABC123 | 2025-02-20 | Buckla på huv` ← **New date**
   - Status: Undokumenterad (new damage_date for same regnr)
   - User must document this new damage

### Database Implementation:

```sql
-- The legacy_loose_key is generated as: REGNR|YYYY-MM-DD
-- Example: 'ABC123|2025-01-15'

-- When documenting a BUHS damage, insert with:
INSERT INTO public.damages (
    regnr,
    legacy_damage_source_text,  -- Combined BUHS raw text
    original_damage_date,        -- damage_date from BUHS
    legacy_loose_key,            -- REGNR|damage_date
    user_type,
    user_positions,
    damage_date,                 -- Current date (when documented)
    created_at
) VALUES (
    'ABC123',
    'Repa - Synlig på lacken - Behöver åtgärdas',  -- Original BUHS combined text
    '2025-01-15',                                   -- Original damage_date
    'ABC123|2025-01-15',                            -- legacy_loose_key
    'Repa',                                         -- User-selected type
    '[{"carPart": "Dörr", "position": "Höger fram"}]',
    CURRENT_DATE,                                   -- Today's date
    NOW()
)
ON CONFLICT (legacy_loose_key) DO NOTHING;  -- Idempotent
```

---

## Verification Queries

### Stickprov (Random Sample Check)

```sql
-- Random sample of 10 import rows
SELECT 
    regnr,
    damage_type_raw,
    note_customer,
    damage_date,
    saludatum
FROM public.damages
WHERE damage_type_raw IS NOT NULL
ORDER BY RANDOM()
LIMIT 10;

-- Check specific regnr
SELECT 
    regnr,
    damage_date,
    damage_type_raw,
    note_customer,
    legacy_damage_source_text,
    legacy_loose_key,
    user_type,
    CASE 
        WHEN legacy_damage_source_text IS NOT NULL THEN 'Dokumenterad'
        WHEN legacy_loose_key IS NOT NULL THEN 'Dokumenterad (loose key)'
        WHEN damage_type_raw IS NOT NULL THEN 'Undokumenterad BUHS'
        WHEN user_type IS NOT NULL THEN 'Ny skada (app)'
        ELSE 'Okänd'
    END as status
FROM public.damages
WHERE UPPER(TRIM(regnr)) = 'ABC123'
ORDER BY damage_date DESC;
```

### Count Undokumenterade BUHS Damages

```sql
-- Count undokumenterade BUHS damages across all vehicles
SELECT COUNT(*) as undokumenterade_count
FROM public.damages d
WHERE d.damage_type_raw IS NOT NULL  -- BUHS import row
  AND d.legacy_damage_source_text IS NULL  -- Not documented by text
  AND NOT EXISTS (  -- Not documented by loose key
    SELECT 1 FROM public.damages d2
    WHERE d2.legacy_loose_key = CONCAT(d.regnr, '|', d.damage_date)
  )
  -- Filter out standardized app patterns
  AND NOT (
    d.note_customer ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR d.note_internal ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR d.vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$'
  );

-- List undokumenterade damages by regnr
SELECT 
    regnr,
    COUNT(*) as undokumenterade_count
FROM public.damages d
WHERE d.damage_type_raw IS NOT NULL
  AND d.legacy_damage_source_text IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.damages d2
    WHERE d2.legacy_loose_key = CONCAT(d.regnr, '|', d.damage_date)
  )
  AND NOT (
    d.note_customer ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR d.note_internal ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR d.vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$'
  )
GROUP BY regnr
HAVING COUNT(*) > 0
ORDER BY COUNT(*) DESC;
```

### Verify N2-per-datum

```sql
-- Check for multiple damage_date entries for same regnr
SELECT 
    regnr,
    COUNT(DISTINCT damage_date) as unique_dates,
    ARRAY_AGG(DISTINCT damage_date ORDER BY damage_date) as all_dates
FROM public.damages
WHERE damage_type_raw IS NOT NULL
GROUP BY regnr
HAVING COUNT(DISTINCT damage_date) > 1
ORDER BY COUNT(DISTINCT damage_date) DESC
LIMIT 20;

-- For a specific regnr, show all dates and their documentation status
SELECT 
    damage_date,
    damage_type_raw,
    CASE 
        WHEN legacy_damage_source_text IS NOT NULL THEN 'Dokumenterad'
        WHEN legacy_loose_key IS NOT NULL THEN 'Dokumenterad (loose key)'
        ELSE 'Undokumenterad'
    END as status,
    legacy_loose_key
FROM public.damages
WHERE UPPER(TRIM(regnr)) = 'ABC123'
  AND damage_type_raw IS NOT NULL
ORDER BY damage_date DESC;
```

---

## Pattern Detection

### Standardized App Text Pattern

The standardized app pattern is: **"Skadetyp - Placering - Position"**

Examples:
- ✅ `Repa - Dörr - Höger fram` (matches pattern)
- ✅ `Buckla - Huv - Framkant` (matches pattern)
- ❌ `Repa på dörr` (does not match pattern)
- ❌ `Synlig bucka - Behöver åtgärdas` (does not match pattern)

### Regex Pattern

```regex
^[^-]+ - [^-]+ - [^-]+$
```

This pattern matches:
- `^` - Start of string
- `[^-]+` - One or more non-dash characters
- ` - ` - Literal " - " (space-dash-space)
- `[^-]+` - One or more non-dash characters
- ` - ` - Literal " - " (space-dash-space)
- `[^-]+` - One or more non-dash characters
- `$` - End of string

### Query to Find Standardized Rows

```sql
-- Find all rows matching standardized app pattern
SELECT 
    regnr,
    note_customer,
    note_internal,
    vehiclenote,
    CASE 
        WHEN note_customer ~ '^[^-]+ - [^-]+ - [^-]+$' THEN 'note_customer'
        WHEN note_internal ~ '^[^-]+ - [^-]+ - [^-]+$' THEN 'note_internal'
        WHEN vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$' THEN 'vehiclenote'
    END as matched_field
FROM public.damages
WHERE damage_type_raw IS NOT NULL
  AND (
    note_customer ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR note_internal ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$'
  )
LIMIT 100;
```

### Query to Exclude Standardized Rows

```sql
-- Get undokumenterade BUHS damages, excluding standardized patterns
SELECT 
    regnr,
    damage_date,
    damage_type_raw,
    note_customer,
    note_internal,
    vehiclenote
FROM public.damages
WHERE damage_type_raw IS NOT NULL
  AND legacy_damage_source_text IS NULL
  -- Exclude standardized app patterns
  AND NOT (
    note_customer ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR note_internal ~ '^[^-]+ - [^-]+ - [^-]+$'
    OR vehiclenote ~ '^[^-]+ - [^-]+ - [^-]+$'
  )
ORDER BY regnr, damage_date;
```

---

## Safe Import Checklist

Before running any import:

1. ✅ Create timestamped backup of affected tables
2. ✅ Load CSV data into staging table
3. ✅ Validate staging data (check for nulls, invalid dates, etc.)
4. ✅ Run verification queries to preview changes
5. ✅ Execute upsert query with proper conflict handling
6. ✅ Verify row counts after import
7. ✅ Run stickprov queries to spot-check data
8. ✅ Test frontend to ensure undokumenterade damages show correctly
9. ✅ Monitor logs for any errors or warnings

---

## Troubleshooting

### Issue: Import created duplicate damages

**Solution:** Check your unique index constraints:
```sql
-- Verify unique index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'damages' 
  AND indexdef LIKE '%UNIQUE%';
```

### Issue: Documented damages were overwritten

**Solution:** Ensure your upsert query includes the WHERE clause:
```sql
WHERE 
    damages.legacy_damage_source_text IS NULL
    AND damages.user_type IS NULL;
```

### Issue: Standardized rows appearing as undokumenterad

**Solution:** Verify the regex pattern is applied in both import and frontend queries.

---

## Additional Resources

- [Database Schema Documentation](./Database.md)
- [Check-in Flow Documentation](./Check-in-flow.md)
- [PostgreSQL Pattern Matching](https://www.postgresql.org/docs/current/functions-matching.html)

---

**Last Updated:** 2025-11-14  
**Maintainer:** Development Team
