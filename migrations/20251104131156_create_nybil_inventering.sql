-- Migration: Create nybil_inventering table
-- Description: Table for storing inventory of new cars entering the fleet
-- Created: 2025-11-04

CREATE TABLE IF NOT EXISTS public.nybil_inventering (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Basic vehicle information
    regnr TEXT NOT NULL,
    bilmodell TEXT,
    
    -- Registration details
    registrerad_av TEXT NOT NULL,
    fullstandigt_namn TEXT,
    registreringsdatum DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Location information
    ort TEXT NOT NULL,
    station TEXT NOT NULL,
    
    -- Vehicle status
    matarstallning TEXT,
    hjultyp TEXT, -- 'Sommardäck' or 'Vinterdäck'
    hjulforvaring TEXT,
    
    -- Equipment inventory
    antal_nycklar INTEGER DEFAULT 0,
    antal_laddkablar INTEGER DEFAULT 0,
    insynsskydd_finns BOOLEAN DEFAULT false,
    isskrapa_finns BOOLEAN DEFAULT false,
    pskiva_finns BOOLEAN DEFAULT false,
    dekal_djur_rokning_finns BOOLEAN DEFAULT false,
    dekal_gps_finns BOOLEAN DEFAULT false,
    mabi_skylt_finns BOOLEAN DEFAULT false,
    
    -- Fuel/charging information
    drivmedelstyp TEXT, -- 'bensin_diesel' or 'elbil'
    tankniva_procent INTEGER,
    laddniva_procent INTEGER,
    
    -- Initial damages/notes
    initiala_skador JSONB, -- Array of damage objects
    anteckningar TEXT,
    
    -- Media storage paths
    media_folder TEXT,
    photo_urls TEXT[], -- Array of photo URLs
    video_urls TEXT[], -- Array of video URLs
    
    -- Metadata
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on registration number for faster lookups
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_regnr ON public.nybil_inventering(regnr);

-- Create index on registration date
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_registreringsdatum ON public.nybil_inventering(registreringsdatum);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_nybil_inventering_updated_at
    BEFORE UPDATE ON public.nybil_inventering
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE public.nybil_inventering IS 'Inventory records for new cars entering the MABI Syd fleet';
