-- Migration: Add checkins persistence columns and indexes
-- Description: Adds necessary columns and indexes for check-in flow persistence
-- Note: This migration must be run manually on the database
-- It is NOT auto-executed by the API

-- Add boolean columns to checkins table
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS has_new_damages boolean;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS has_documented_buhs boolean;

-- Add indexes for improved query performance
CREATE INDEX IF NOT EXISTS idx_damages_regnr ON public.damages(regnr);
CREATE INDEX IF NOT EXISTS idx_damages_regnr_date ON public.damages(regnr, original_damage_date);
CREATE INDEX IF NOT EXISTS idx_checkins_regnr_created ON public.checkins(regnr, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_damages_checkin_created ON public.checkin_damages(checkin_id, created_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN public.checkins.has_new_damages IS 'True if nya_skador length > 0';
COMMENT ON COLUMN public.checkins.has_documented_buhs IS 'True if dokumenterade_skador length > 0';
