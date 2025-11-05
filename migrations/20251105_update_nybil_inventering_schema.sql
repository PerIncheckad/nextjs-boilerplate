-- Migration: Update nybil_inventering table schema
-- Description: Update table structure for new requirements
-- Created: 2025-11-05

-- Step 1: Add new columns
ALTER TABLE public.nybil_inventering
  ADD COLUMN IF NOT EXISTS bilmarke TEXT,
  ADD COLUMN IF NOT EXISTS modell TEXT,
  ADD COLUMN IF NOT EXISTS plats_mottagning_ort TEXT,
  ADD COLUMN IF NOT EXISTS plats_mottagning_station TEXT,
  ADD COLUMN IF NOT EXISTS matarstallning_inkop TEXT,
  ADD COLUMN IF NOT EXISTS bransletyp TEXT CHECK (bransletyp IN ('Bensin', 'Diesel', 'Hybrid (bensin)', 'Hybrid (diesel)', 'El (full)')),
  ADD COLUMN IF NOT EXISTS laddniva_procent INTEGER,
  ADD COLUMN IF NOT EXISTS tankstatus TEXT CHECK (tankstatus IN ('mottogs_fulltankad', 'tankad_nu', 'ej_upptankad')),
  ADD COLUMN IF NOT EXISTS upptankning_liter NUMERIC,
  ADD COLUMN IF NOT EXISTS upptankning_literpris NUMERIC,
  ADD COLUMN IF NOT EXISTS antal_insynsskydd INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS antal_bocker INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS antal_coc INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS antal_nycklar INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nycklar_beskrivning TEXT,
  ADD COLUMN IF NOT EXISTS antal_lasbultar INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hjul_ej_monterade TEXT CHECK (hjul_ej_monterade IS NULL OR hjul_ej_monterade IN ('Vinterdäck', 'Sommardäck')),
  ADD COLUMN IF NOT EXISTS hjul_forvaring TEXT,
  ADD COLUMN IF NOT EXISTS plats_aktuell_ort TEXT,
  ADD COLUMN IF NOT EXISTS plats_aktuell_station TEXT,
  ADD COLUMN IF NOT EXISTS matarstallning_aktuell TEXT;

-- Step 2: Migrate data from old columns to new columns (if any data exists)
UPDATE public.nybil_inventering
SET 
  plats_mottagning_ort = COALESCE(plats_mottagning_ort, ort),
  plats_mottagning_station = COALESCE(plats_mottagning_station, station),
  matarstallning_inkop = COALESCE(matarstallning_inkop, matarstallning)
WHERE plats_mottagning_ort IS NULL OR plats_mottagning_station IS NULL OR matarstallning_inkop IS NULL;

-- Step 3: Drop old columns that are no longer needed
ALTER TABLE public.nybil_inventering
  DROP COLUMN IF EXISTS ort,
  DROP COLUMN IF EXISTS station,
  DROP COLUMN IF EXISTS matarstallning,
  DROP COLUMN IF EXISTS insynsskydd_finns,
  DROP COLUMN IF EXISTS isskrapa_finns,
  DROP COLUMN IF EXISTS pskiva_finns,
  DROP COLUMN IF EXISTS dekal_djur_rokning_finns,
  DROP COLUMN IF EXISTS dekal_gps_finns,
  DROP COLUMN IF EXISTS mabi_skylt_finns,
  DROP COLUMN IF EXISTS drivmedelstyp,
  DROP COLUMN IF EXISTS tankniva_procent,
  DROP COLUMN IF EXISTS hjulforvaring;

-- Step 4: Update constraints
-- Make required fields NOT NULL (only for new installs, existing data may have nulls)
-- For production, you might want to handle this differently

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_bilmarke ON public.nybil_inventering(bilmarke);
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_bransletyp ON public.nybil_inventering(bransletyp);
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_plats_mottagning_ort ON public.nybil_inventering(plats_mottagning_ort);

-- Add comments for new columns
COMMENT ON COLUMN public.nybil_inventering.bilmarke IS 'Car brand/make (e.g., Mercedes-Benz)';
COMMENT ON COLUMN public.nybil_inventering.modell IS 'Car model (e.g., C220)';
COMMENT ON COLUMN public.nybil_inventering.plats_mottagning_ort IS 'City where car was received';
COMMENT ON COLUMN public.nybil_inventering.plats_mottagning_station IS 'Station where car was received';
COMMENT ON COLUMN public.nybil_inventering.matarstallning_inkop IS 'Odometer reading at purchase/reception';
COMMENT ON COLUMN public.nybil_inventering.bransletyp IS 'Fuel type: Bensin, Diesel, Hybrid (bensin), Hybrid (diesel), El (full)';
COMMENT ON COLUMN public.nybil_inventering.laddniva_procent IS 'Battery charge level (0-100%) for electric vehicles';
COMMENT ON COLUMN public.nybil_inventering.tankstatus IS 'Fuel tank status: mottogs_fulltankad, tankad_nu, ej_upptankad';
COMMENT ON COLUMN public.nybil_inventering.upptankning_liter IS 'Liters added when refueled (if tankstatus = tankad_nu)';
COMMENT ON COLUMN public.nybil_inventering.upptankning_literpris IS 'Price per liter when refueled (if tankstatus = tankad_nu)';
COMMENT ON COLUMN public.nybil_inventering.antal_insynsskydd IS 'Number of privacy screens (0-2)';
COMMENT ON COLUMN public.nybil_inventering.antal_bocker IS 'Number of books/manuals (0-3)';
COMMENT ON COLUMN public.nybil_inventering.antal_coc IS 'Number of COC documents (0-1)';
COMMENT ON COLUMN public.nybil_inventering.antal_nycklar IS 'Number of keys (0-2)';
COMMENT ON COLUMN public.nybil_inventering.nycklar_beskrivning IS 'Optional description of keys';
COMMENT ON COLUMN public.nybil_inventering.antal_lasbultar IS 'Number of locking bolts (0-4)';
COMMENT ON COLUMN public.nybil_inventering.hjul_ej_monterade IS 'Type of unmounted wheels stored';
COMMENT ON COLUMN public.nybil_inventering.hjul_forvaring IS 'Storage location for unmounted wheels';
COMMENT ON COLUMN public.nybil_inventering.plats_aktuell_ort IS 'Current city where car is located';
COMMENT ON COLUMN public.nybil_inventering.plats_aktuell_station IS 'Current station where car is located';
COMMENT ON COLUMN public.nybil_inventering.matarstallning_aktuell IS 'Current odometer reading (if different location)';
