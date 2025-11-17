-- docs/sql/damage_type_ref.sql
-- Reference table for damage types with hierarchical grouping
-- Run this in Supabase SQL Editor to create the reference table and seed initial data

-- =================================================================
-- CREATE TABLE: damage_type_ref
-- =================================================================
-- Idempotent DDL: Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.damage_type_ref (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    parent_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_parent_code FOREIGN KEY (parent_code) 
        REFERENCES public.damage_type_ref(code) 
        ON DELETE SET NULL
);

-- Add index for parent_code lookups
CREATE INDEX IF NOT EXISTS idx_damage_type_ref_parent 
    ON public.damage_type_ref(parent_code);

-- =================================================================
-- SEED DATA: Tire/Wheel Group
-- =================================================================
-- Insert parent category (idempotent using ON CONFLICT)
INSERT INTO public.damage_type_ref (code, label, parent_code)
VALUES ('TIRE_WHEEL', 'Däck/fälg', NULL)
ON CONFLICT (code) DO UPDATE 
SET label = EXCLUDED.label,
    updated_at = NOW();

-- Insert child categories under TIRE_WHEEL group
INSERT INTO public.damage_type_ref (code, label, parent_code)
VALUES 
    ('DACKSKADA', 'Däckskada', 'TIRE_WHEEL'),
    ('DACKSKADA_SOMMAR', 'Däckskada sommarhjul', 'TIRE_WHEEL'),
    ('DACKSKADA_VINTER', 'Däckskada vinterhjul', 'TIRE_WHEEL'),
    ('FALGSKADA_SOMMARHJUL', 'Fälgskada sommarhjul', 'TIRE_WHEEL'),
    ('FALGSKADA_VINTERHJUL', 'Fälgskada vinterhjul', 'TIRE_WHEEL'),
    ('SKRAPAD_FALG', 'Skrapad fälg', 'TIRE_WHEEL'),
    ('PUNKTERING', 'Punktering', 'TIRE_WHEEL')
ON CONFLICT (code) DO UPDATE 
SET label = EXCLUDED.label,
    parent_code = EXCLUDED.parent_code,
    updated_at = NOW();

-- =================================================================
-- VERIFICATION QUERY
-- =================================================================
-- Run this to verify the data was inserted correctly
SELECT 
    code,
    label,
    parent_code,
    CASE 
        WHEN parent_code IS NULL THEN 'Parent Category'
        ELSE 'Child Category'
    END as category_type
FROM public.damage_type_ref
ORDER BY parent_code NULLS FIRST, code;

-- Expected result: 1 parent (TIRE_WHEEL) + 7 children = 8 rows total
