-- Migration: Add wheels and charging cable storage columns
-- Description: Add columns for wheel storage location details and charging cable storage
-- Created: 2025-11-10

-- Add new columns for wheel storage location
ALTER TABLE public.nybil_inventering
  ADD COLUMN IF NOT EXISTS hjul_forvaring_ort TEXT,
  ADD COLUMN IF NOT EXISTS hjul_forvaring_station TEXT;

-- Add new columns for charging cable storage
ALTER TABLE public.nybil_inventering
  ADD COLUMN IF NOT EXISTS antal_laddkablar INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS antal_laddkablar_forvaring INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laddkablar_forvaring_plats TEXT;

-- Add comments for new columns
COMMENT ON COLUMN public.nybil_inventering.hjul_forvaring_ort IS 'City where unmounted wheels are stored';
COMMENT ON COLUMN public.nybil_inventering.hjul_forvaring_station IS 'Station where unmounted wheels are stored';
COMMENT ON COLUMN public.nybil_inventering.antal_laddkablar IS 'Number of charging cables (0-2)';
COMMENT ON COLUMN public.nybil_inventering.antal_laddkablar_forvaring IS 'Number of charging cables in storage (0-antal_laddkablar)';
COMMENT ON COLUMN public.nybil_inventering.laddkablar_forvaring_plats IS 'Storage location for charging cables';
