-- Migration: Create checkin_damages table
-- Description: Table for storing new damages detected during check-ins
-- Created: 2025-11-11

CREATE TABLE IF NOT EXISTS public.checkin_damages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key to checkins table
    checkin_id BIGINT NOT NULL,
    
    -- Vehicle information (denormalized for easier queries)
    regnr TEXT NOT NULL,
    
    -- Damage details
    damage_type TEXT NOT NULL,
    damage_text TEXT,
    
    -- Damage positions (stored as JSONB for flexibility)
    positions JSONB, -- Array of {carPart: string, position: string}
    
    -- Media storage paths
    folder TEXT,
    photo_urls TEXT[],
    video_urls TEXT[],
    
    -- Full damage data (for reference)
    damage_data JSONB,
    
    -- Metadata
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Foreign key constraint
    CONSTRAINT fk_checkin_damages_checkin
        FOREIGN KEY (checkin_id)
        REFERENCES public.checkins(id)
        ON DELETE CASCADE
);

-- Create index on checkin_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_checkin_damages_checkin_id ON public.checkin_damages(checkin_id);

-- Create index on registration number for faster lookups
CREATE INDEX IF NOT EXISTS idx_checkin_damages_regnr ON public.checkin_damages(regnr);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_checkin_damages_created_at ON public.checkin_damages(created_at);

-- Add updated_at trigger
CREATE TRIGGER update_checkin_damages_updated_at
    BEFORE UPDATE ON public.checkin_damages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments to table
COMMENT ON TABLE public.checkin_damages IS 'New damages detected during vehicle check-ins';
COMMENT ON COLUMN public.checkin_damages.checkin_id IS 'Reference to the check-in record';
COMMENT ON COLUMN public.checkin_damages.regnr IS 'Vehicle registration number (denormalized)';
COMMENT ON COLUMN public.checkin_damages.damage_type IS 'Type of damage (e.g., Repa, Bucka, etc.)';
COMMENT ON COLUMN public.checkin_damages.positions IS 'Array of damage positions with carPart and position';
COMMENT ON COLUMN public.checkin_damages.folder IS 'Storage folder path for media files';
COMMENT ON COLUMN public.checkin_damages.damage_data IS 'Complete damage object for reference';
