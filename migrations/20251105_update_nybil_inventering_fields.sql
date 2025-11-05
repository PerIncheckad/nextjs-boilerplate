-- Migration: Update nybil_inventering table with new fields
-- Description: Add split model fields, fuel type details, equipment counts, and current location
-- Created: 2025-11-05

-- Drop old columns that are being replaced
ALTER TABLE public.nybil_inventering
  DROP COLUMN IF EXISTS bilmodell,
  DROP COLUMN IF EXISTS drivmedelstyp,
  DROP COLUMN IF EXISTS tankniva_procent,
  DROP COLUMN IF EXISTS hjulforvaring,
  DROP COLUMN IF EXISTS insynsskydd_finns,
  DROP COLUMN IF EXISTS isskrapa_finns,
  DROP COLUMN IF EXISTS pskiva_finns,
  DROP COLUMN IF EXISTS dekal_djur_rokning_finns,
  DROP COLUMN IF EXISTS dekal_gps_finns,
  DROP COLUMN IF EXISTS mabi_skylt_finns;

-- Add new vehicle model fields (split from bilmodell)
ALTER TABLE public.nybil_inventering
  ADD COLUMN bilmarke TEXT,
  ADD COLUMN modell TEXT;

-- Update location fields to be more specific
ALTER TABLE public.nybil_inventering
  RENAME COLUMN ort TO plats_mottagning_ort;
ALTER TABLE public.nybil_inventering
  RENAME COLUMN station TO plats_mottagning_station;
ALTER TABLE public.nybil_inventering
  RENAME COLUMN matarstallning TO matarstallning_inkop;

-- Add new fuel/charging fields
ALTER TABLE public.nybil_inventering
  ADD COLUMN bransletyp TEXT CHECK (bransletyp IN ('Bensin', 'Diesel', 'Hybrid (bensin)', 'Hybrid (diesel)', 'El (full)')),
  ADD COLUMN tankstatus TEXT CHECK (tankstatus IN ('mottogs_fulltankad', 'tankad_nu', 'ej_upptankad')),
  ADD COLUMN upptankning_liter NUMERIC(10, 2),
  ADD COLUMN upptankning_literpris NUMERIC(10, 2);

-- Add new equipment count fields
ALTER TABLE public.nybil_inventering
  ADD COLUMN antal_insynsskydd INTEGER DEFAULT 0 CHECK (antal_insynsskydd >= 0 AND antal_insynsskydd <= 2),
  ADD COLUMN antal_bocker INTEGER DEFAULT 0 CHECK (antal_bocker >= 0 AND antal_bocker <= 3),
  ADD COLUMN antal_coc INTEGER DEFAULT 0 CHECK (antal_coc >= 0 AND antal_coc <= 1),
  ADD COLUMN nycklar_beskrivning TEXT,
  ADD COLUMN antal_lasbultar INTEGER DEFAULT 0 CHECK (antal_lasbultar >= 0 AND antal_lasbultar <= 4);

-- Update wheel fields
ALTER TABLE public.nybil_inventering
  ADD COLUMN hjul_forvaring TEXT,
  ADD COLUMN hjul_ej_monterade TEXT CHECK (hjul_ej_monterade IN ('Vinterdäck', 'Sommardäck'));

-- Add current location fields
ALTER TABLE public.nybil_inventering
  ADD COLUMN plats_aktuell_ort TEXT,
  ADD COLUMN plats_aktuell_station TEXT,
  ADD COLUMN matarstallning_aktuell INTEGER;

-- Update antal_nycklar constraint to match new requirements (0, 1, or 2)
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_inventering_antal_nycklar_check;
ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_inventering_antal_nycklar_check CHECK (antal_nycklar >= 0 AND antal_nycklar <= 2);

-- Update antal_laddkablar constraint (0, 1, or 2)
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_inventering_antal_laddkablar_check;
ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_inventering_antal_laddkablar_check CHECK (antal_laddkablar >= 0 AND antal_laddkablar <= 2);

-- Add comments
COMMENT ON COLUMN public.nybil_inventering.bilmarke IS 'Car brand/make (e.g., Mercedes-Benz, Volvo)';
COMMENT ON COLUMN public.nybil_inventering.modell IS 'Car model (e.g., C220, V90)';
COMMENT ON COLUMN public.nybil_inventering.bransletyp IS 'Fuel type: Bensin, Diesel, Hybrid (bensin), Hybrid (diesel), El (full)';
COMMENT ON COLUMN public.nybil_inventering.tankstatus IS 'Tank status for non-electric vehicles';
COMMENT ON COLUMN public.nybil_inventering.upptankning_liter IS 'Liters filled when tankstatus is tankad_nu';
COMMENT ON COLUMN public.nybil_inventering.upptankning_literpris IS 'Price per liter when tankstatus is tankad_nu';
COMMENT ON COLUMN public.nybil_inventering.plats_aktuell_ort IS 'Current location city';
COMMENT ON COLUMN public.nybil_inventering.plats_aktuell_station IS 'Current location station';
COMMENT ON COLUMN public.nybil_inventering.matarstallning_aktuell IS 'Current odometer reading if different from receiving location';
