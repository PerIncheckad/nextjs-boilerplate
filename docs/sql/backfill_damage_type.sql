-- docs/sql/backfill_damage_type.sql
-- Backfill damage_type and damage_type_raw columns for existing data
-- Run this in Supabase SQL Editor after creating damage_type_ref table

-- =================================================================
-- PART 1: BACKFILL public.damages
-- =================================================================
-- This updates existing rows that have NULL damage_type

-- Function to normalize damage type (matches TypeScript normalizeDamageType)
CREATE OR REPLACE FUNCTION normalize_damage_type(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    trimmed TEXT;
    sanitized TEXT;
BEGIN
    IF input_text IS NULL OR input_text = '' THEN
        RETURN 'UNKNOWN';
    END IF;
    
    trimmed := TRIM(input_text);
    
    -- Check for exact matches with tire/wheel types
    CASE trimmed
        WHEN 'Däckskada' THEN RETURN 'DACKSKADA';
        WHEN 'Däckskada sommarhjul' THEN RETURN 'DACKSKADA_SOMMAR';
        WHEN 'Däckskada vinterhjul' THEN RETURN 'DACKSKADA_VINTER';
        WHEN 'Fälgskada sommarhjul' THEN RETURN 'FALGSKADA_SOMMARHJUL';
        WHEN 'Fälgskada vinterhjul' THEN RETURN 'FALGSKADA_VINTERHJUL';
        WHEN 'Skrapad fälg' THEN RETURN 'SKRAPAD_FALG';
        WHEN 'Punktering' THEN RETURN 'PUNKTERING';
        ELSE
            -- Sanitize other types: uppercase, replace spaces with underscores, handle ÅÄÖ
            sanitized := UPPER(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            REPLACE(
                                REPLACE(
                                    REPLACE(trimmed, 'Å', 'A'),
                                    'Ä', 'A'
                                ),
                                'Ö', 'O'
                            ),
                            'å', 'a'
                        ),
                        'ä', 'a'
                    ),
                    'ö', 'o'
                )
            );
            -- Replace spaces with underscores
            sanitized := REGEXP_REPLACE(sanitized, '\s+', '_', 'g');
            -- Replace special characters with underscores
            sanitized := REGEXP_REPLACE(sanitized, '[^A-Z0-9_]', '_', 'g');
            -- Collapse multiple underscores
            sanitized := REGEXP_REPLACE(sanitized, '_+', '_', 'g');
            -- Trim underscores from start and end
            sanitized := TRIM(BOTH '_' FROM sanitized);
            
            IF sanitized = '' THEN
                RETURN 'UNKNOWN';
            END IF;
            
            RETURN sanitized;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update public.damages table
-- Step 1: Set damage_type_raw from user_type if NULL
UPDATE public.damages
SET damage_type_raw = user_type,
    updated_at = NOW()
WHERE damage_type_raw IS NULL 
  AND user_type IS NOT NULL;

-- Step 2: Set damage_type using normalization function
UPDATE public.damages
SET damage_type = normalize_damage_type(damage_type_raw),
    updated_at = NOW()
WHERE damage_type IS NULL 
  AND damage_type_raw IS NOT NULL;

-- Step 3: Handle cases where user_type exists but damage_type_raw is still NULL
UPDATE public.damages
SET damage_type_raw = user_type,
    damage_type = normalize_damage_type(user_type),
    updated_at = NOW()
WHERE damage_type IS NULL 
  AND user_type IS NOT NULL;

-- =================================================================
-- PART 2: BACKFILL public.checkin_damages
-- =================================================================
-- This is more complex as we need to infer the damage type from nearby damages

-- First, let's create a temporary function to find the most likely damage type
-- for a checkin_damage based on timing and regnr
CREATE OR REPLACE FUNCTION infer_damage_type_for_checkin(
    p_checkin_id UUID,
    p_created_at TIMESTAMPTZ
)
RETURNS TEXT AS $$
DECLARE
    v_regnr TEXT;
    v_damage_type TEXT;
    v_time_window INTERVAL := INTERVAL '60 seconds';
BEGIN
    -- Get the regnr from the checkin
    SELECT c.regnr INTO v_regnr
    FROM public.checkins c
    WHERE c.id = p_checkin_id;
    
    IF v_regnr IS NULL THEN
        RETURN 'UNKNOWN';
    END IF;
    
    -- Find a damage with the same regnr within ±60 seconds
    SELECT d.damage_type INTO v_damage_type
    FROM public.damages d
    WHERE d.regnr = v_regnr
      AND d.damage_type IS NOT NULL
      AND d.created_at BETWEEN (p_created_at - v_time_window) 
                           AND (p_created_at + v_time_window)
    ORDER BY ABS(EXTRACT(EPOCH FROM (d.created_at - p_created_at)))
    LIMIT 1;
    
    -- If found, return it; otherwise return UNKNOWN
    RETURN COALESCE(v_damage_type, 'UNKNOWN');
END;
$$ LANGUAGE plpgsql;

-- Update checkin_damages with inferred damage types
UPDATE public.checkin_damages cd
SET damage_type = infer_damage_type_for_checkin(cd.checkin_id, cd.created_at)
WHERE cd.damage_type IS NULL;

-- =================================================================
-- CLEANUP
-- =================================================================
-- Drop temporary functions (optional - keep them if you want to reuse)
-- DROP FUNCTION IF EXISTS normalize_damage_type(TEXT);
-- DROP FUNCTION IF EXISTS infer_damage_type_for_checkin(UUID, TIMESTAMPTZ);

-- =================================================================
-- VERIFICATION QUERIES
-- =================================================================

-- Check damages table
SELECT 
    COUNT(*) as total_damages,
    COUNT(damage_type) as with_damage_type,
    COUNT(damage_type_raw) as with_damage_type_raw,
    COUNT(*) - COUNT(damage_type) as missing_damage_type
FROM public.damages;

-- Check checkin_damages table
SELECT 
    COUNT(*) as total_checkin_damages,
    COUNT(damage_type) as with_damage_type,
    COUNT(*) - COUNT(damage_type) as missing_damage_type
FROM public.checkin_damages;

-- Show distribution of damage types
SELECT 
    damage_type,
    COUNT(*) as count
FROM public.damages
WHERE damage_type IS NOT NULL
GROUP BY damage_type
ORDER BY count DESC
LIMIT 20;

-- Show tire/wheel damages grouped
SELECT 
    ref.parent_code,
    d.damage_type,
    ref.label,
    COUNT(*) as count
FROM public.damages d
LEFT JOIN public.damage_type_ref ref ON d.damage_type = ref.code
WHERE ref.parent_code = 'TIRE_WHEEL' OR d.damage_type IN (
    'DACKSKADA', 'DACKSKADA_SOMMAR', 'DACKSKADA_VINTER',
    'FALGSKADA_SOMMARHJUL', 'FALGSKADA_VINTERHJUL',
    'SKRAPAD_FALG', 'PUNKTERING'
)
GROUP BY ref.parent_code, d.damage_type, ref.label
ORDER BY count DESC;
