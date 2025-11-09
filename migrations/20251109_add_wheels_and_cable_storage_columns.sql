-- Migration: Add wheels and cable storage columns to nybil_inventering
-- Description: Add support for wheel storage location and charging cable storage
-- Created: 2025-11-09

-- Add new columns for wheel storage location
ALTER TABLE public.nybil_inventering
  ADD COLUMN IF NOT EXISTS hjul_forvaring_ort TEXT,
  ADD COLUMN IF NOT EXISTS hjul_forvaring_station TEXT;

-- Add new columns for charging cable storage
ALTER TABLE public.nybil_inventering
  ADD COLUMN IF NOT EXISTS antal_laddkablar_forvaring INTEGER,
  ADD COLUMN IF NOT EXISTS laddkablar_forvaring_plats TEXT;

-- Add comments for new columns
COMMENT ON COLUMN public.nybil_inventering.hjul_forvaring_ort IS 'City where unmounted wheels are stored (when medfoljande_hjul = JA)';
COMMENT ON COLUMN public.nybil_inventering.hjul_forvaring_station IS 'Station where unmounted wheels are stored (when medfoljande_hjul = JA)';
COMMENT ON COLUMN public.nybil_inventering.antal_laddkablar_forvaring IS 'Number of charging cables to be stored (0 to antal_laddkablar)';
COMMENT ON COLUMN public.nybil_inventering.laddkablar_forvaring_plats IS 'Storage location description for charging cables';
