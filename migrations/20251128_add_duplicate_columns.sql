-- Migration: Add duplicate handling columns to nybil_inventering table
-- Description: Add columns for tracking duplicate registrations
-- Created: 2025-11-28

-- Add duplicate tracking columns
ALTER TABLE public.nybil_inventering
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS duplicate_group_id UUID,
ADD COLUMN IF NOT EXISTS original_registration_id BIGINT REFERENCES public.nybil_inventering(id);

-- Index for fast searching by duplicate_group_id
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_duplicate_group 
ON public.nybil_inventering(duplicate_group_id) 
WHERE duplicate_group_id IS NOT NULL;

-- Add comments for new columns
COMMENT ON COLUMN public.nybil_inventering.is_duplicate IS 'Whether this registration is a duplicate of an existing vehicle';
COMMENT ON COLUMN public.nybil_inventering.duplicate_group_id IS 'UUID to group all registrations of the same vehicle together';
COMMENT ON COLUMN public.nybil_inventering.original_registration_id IS 'Reference to the original registration if this is a duplicate';
