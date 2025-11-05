-- Migration: Update nybil_inventering table for new requirements
-- Description: Split bilmodell, add new fuel logic, equipment counts, and current location
-- Created: 2025-11-05

-- 1. Split car model into bilmarke and modell
ALTER TABLE public.nybil_inventering 
ADD COLUMN IF NOT EXISTS bilmarke TEXT,
ADD COLUMN IF NOT EXISTS modell TEXT;

-- Drop old bilmodell column (data migration should be done separately if needed)
-- ALTER TABLE public.nybil_inventering DROP COLUMN IF EXISTS bilmodell;

-- 2. Update location fields for receiving location
ALTER TABLE public.nybil_inventering
RENAME COLUMN ort TO plats_mottagning_ort;

ALTER TABLE public.nybil_inventering
RENAME COLUMN station TO plats_mottagning_station;

-- Rename matarstallning to matarstallning_inkop for clarity
ALTER TABLE public.nybil_inventering
RENAME COLUMN matarstallning TO matarstallning_inkop;

-- 3. Update fuel/charging fields
-- Replace drivmedelstyp with new constraint
ALTER TABLE public.nybil_inventering
DROP COLUMN IF EXISTS drivmedelstyp CASCADE;

ALTER TABLE public.nybil_inventering
ADD COLUMN bransletyp TEXT CHECK (bransletyp IN ('Bensin', 'Diesel', 'Hybrid (bensin)', 'Hybrid (diesel)', 'El (full)'));

-- Update laddniva_procent to SMALLINT with range constraint
ALTER TABLE public.nybil_inventering
ALTER COLUMN laddniva_procent TYPE SMALLINT;

ALTER TABLE public.nybil_inventering
ADD CONSTRAINT laddniva_procent_range CHECK (laddniva_procent >= 0 AND laddniva_procent <= 100);

-- Drop old tankniva_procent (replaced by tankstatus logic)
ALTER TABLE public.nybil_inventering
DROP COLUMN IF EXISTS tankniva_procent;

-- Add tankstatus and fueling fields
ALTER TABLE public.nybil_inventering
ADD COLUMN IF NOT EXISTS tankstatus TEXT CHECK (tankstatus IN ('mottogs_fulltankad', 'tankad_nu', 'ej_upptankad')),
ADD COLUMN IF NOT EXISTS upptankning_liter NUMERIC,
ADD COLUMN IF NOT EXISTS upptankning_literpris NUMERIC;

-- 4. Update equipment fields
-- Replace boolean flags with numeric counts
ALTER TABLE public.nybil_inventering
DROP COLUMN IF EXISTS insynsskydd_finns CASCADE,
DROP COLUMN IF EXISTS isskrapa_finns CASCADE,
DROP COLUMN IF EXISTS pskiva_finns CASCADE,
DROP COLUMN IF EXISTS dekal_djur_rokning_finns CASCADE,
DROP COLUMN IF EXISTS dekal_gps_finns CASCADE,
DROP COLUMN IF EXISTS mabi_skylt_finns CASCADE;

-- Add new equipment count fields
ALTER TABLE public.nybil_inventering
ADD COLUMN IF NOT EXISTS antal_insynsskydd SMALLINT DEFAULT 0 CHECK (antal_insynsskydd >= 0),
ADD COLUMN IF NOT EXISTS antal_bocker SMALLINT DEFAULT 0 CHECK (antal_bocker >= 0),
ADD COLUMN IF NOT EXISTS antal_coc SMALLINT DEFAULT 0 CHECK (antal_coc >= 0 AND antal_coc <= 1),
ADD COLUMN IF NOT EXISTS nycklar_beskrivning TEXT,
ADD COLUMN IF NOT EXISTS hjul_ej_monterade TEXT,
ADD COLUMN IF NOT EXISTS antal_lasbultar SMALLINT DEFAULT 0 CHECK (antal_lasbultar >= 0);

-- Update antal_nycklar and antal_laddkablar to SMALLINT with constraints
ALTER TABLE public.nybil_inventering
ALTER COLUMN antal_nycklar TYPE SMALLINT,
ALTER COLUMN antal_laddkablar TYPE SMALLINT;

ALTER TABLE public.nybil_inventering
ADD CONSTRAINT antal_nycklar_check CHECK (antal_nycklar >= 0),
ADD CONSTRAINT antal_laddkablar_check CHECK (antal_laddkablar >= 0);

-- 5. Add current location fields
ALTER TABLE public.nybil_inventering
ADD COLUMN IF NOT EXISTS plats_aktuell_ort TEXT,
ADD COLUMN IF NOT EXISTS plats_aktuell_station TEXT,
ADD COLUMN IF NOT EXISTS matarstallning_aktuell INTEGER;

-- Update comment
COMMENT ON TABLE public.nybil_inventering IS 'Inventory records for new cars entering the MABI Syd fleet - Updated with split model, fuel logic, equipment counts, and current location';
