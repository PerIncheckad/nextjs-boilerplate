-- Migration: Add klar_for_uthyrning fields to nybil_inventering table
-- Description: Add rental readiness status and notes fields
-- Created: 2025-11-05

-- Add new columns for rental readiness
ALTER TABLE public.nybil_inventering
  ADD COLUMN IF NOT EXISTS klar_for_uthyrning BOOLEAN,
  ADD COLUMN IF NOT EXISTS klar_for_uthyrning_notering TEXT;

-- Update matarstallning_aktuell from TEXT to INTEGER
-- First check if column exists and is TEXT type
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'nybil_inventering' 
    AND column_name = 'matarstallning_aktuell'
    AND data_type = 'text'
  ) THEN
    -- Convert existing data to integer if possible, otherwise set to NULL
    ALTER TABLE public.nybil_inventering 
      ALTER COLUMN matarstallning_aktuell TYPE INTEGER 
      USING CASE 
        WHEN matarstallning_aktuell ~ '^\d+$' THEN matarstallning_aktuell::INTEGER 
        ELSE NULL 
      END;
  END IF;
END $$;

-- Add constraint: if klar_for_uthyrning is false, klar_for_uthyrning_notering must be provided
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_klar_note;

ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_klar_note 
  CHECK (
    klar_for_uthyrning IS NULL OR 
    klar_for_uthyrning = TRUE OR 
    (klar_for_uthyrning = FALSE AND klar_for_uthyrning_notering IS NOT NULL AND trim(klar_for_uthyrning_notering) != '')
  );

-- Add constraint: matarstallning_aktuell must be greater than matarstallning_inkop when provided
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_matar_progress;

ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_matar_progress 
  CHECK (
    matarstallning_aktuell IS NULL OR 
    matarstallning_inkop IS NULL OR
    matarstallning_aktuell::INTEGER > matarstallning_inkop::INTEGER
  );

-- Add constraint: for electric vehicles, laddniva_procent must be between 0 and 100
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_ladd_range;

ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_ladd_range 
  CHECK (
    laddniva_procent IS NULL OR 
    (laddniva_procent >= 0 AND laddniva_procent <= 100)
  );

-- Add constraint: if bransletyp is 'El (full)', require laddniva_procent and nullify fuel fields
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_el_logic;

ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_el_logic 
  CHECK (
    bransletyp != 'El (full)' OR 
    (
      laddniva_procent IS NOT NULL AND 
      tankstatus IS NULL AND 
      upptankning_liter IS NULL AND 
      upptankning_literpris IS NULL
    )
  );

-- Add constraint: if bransletyp is NOT 'El (full)', require tankstatus
ALTER TABLE public.nybil_inventering
  DROP CONSTRAINT IF EXISTS nybil_nonel_logic;

ALTER TABLE public.nybil_inventering
  ADD CONSTRAINT nybil_nonel_logic 
  CHECK (
    bransletyp = 'El (full)' OR 
    tankstatus IS NOT NULL
  );

-- Add comments for new columns
COMMENT ON COLUMN public.nybil_inventering.klar_for_uthyrning IS 'Whether the vehicle is ready for rental (true/false/null)';
COMMENT ON COLUMN public.nybil_inventering.klar_for_uthyrning_notering IS 'Required note explaining why vehicle is not ready for rental (when klar_for_uthyrning = false)';
COMMENT ON COLUMN public.nybil_inventering.matarstallning_aktuell IS 'Current odometer reading (integer, must be > matarstallning_inkop if provided)';
