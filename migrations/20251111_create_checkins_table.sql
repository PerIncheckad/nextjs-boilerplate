-- Migration: Create checkins table
-- Description: Table for storing completed vehicle check-in records
-- Created: 2025-11-11

CREATE TABLE IF NOT EXISTS public.checkins (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Vehicle information
    regnr TEXT NOT NULL,
    carmodel TEXT,
    
    -- Check-in details
    inchecker_name TEXT NOT NULL,
    inchecker_fullname TEXT,
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checkin_time TIME NOT NULL DEFAULT CURRENT_TIME,
    
    -- Location information
    ort TEXT NOT NULL,
    station TEXT NOT NULL,
    
    -- Current location (if different)
    bilen_star_nu_ort TEXT,
    bilen_star_nu_station TEXT,
    bilen_star_nu_kommentar TEXT,
    
    -- Vehicle status
    matarstallning TEXT,
    hjultyp TEXT,
    drivmedelstyp TEXT, -- 'bensin_diesel' or 'elbil'
    
    -- Fuel/charging information
    tankniva TEXT,
    liters TEXT,
    bransletyp TEXT,
    literpris TEXT,
    laddniva TEXT,
    antal_laddkablar INTEGER,
    
    -- Status flags
    rekond_behovers BOOLEAN DEFAULT false,
    rekond_utvandig BOOLEAN DEFAULT false,
    rekond_invandig BOOLEAN DEFAULT false,
    rekond_text TEXT,
    rekond_folder TEXT,
    
    husdjur_sanerad BOOLEAN DEFAULT false,
    husdjur_text TEXT,
    husdjur_folder TEXT,
    
    rokning_sanerad BOOLEAN DEFAULT false,
    rokning_text TEXT,
    rokning_folder TEXT,
    
    varningslampa_lyser BOOLEAN DEFAULT false,
    varningslampa_beskrivning TEXT,
    
    rental_unavailable BOOLEAN DEFAULT false,
    rental_comment TEXT,
    
    insynsskydd_saknas BOOLEAN DEFAULT false,
    
    -- Checklist items
    washed BOOLEAN DEFAULT false,
    other_checklist_items_ok BOOLEAN DEFAULT false,
    
    -- Additional notes
    notering TEXT,
    
    -- Vehicle status from database lookup
    vehicle_status TEXT, -- 'FULL_MATCH', 'PARTIAL_MATCH_DAMAGE_ONLY', or 'NO_MATCH'
    
    -- Complete payload (for reference)
    payload JSONB,
    
    -- Metadata
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on registration number for faster lookups
CREATE INDEX IF NOT EXISTS idx_checkins_regnr ON public.checkins(regnr);

-- Create index on check-in date
CREATE INDEX IF NOT EXISTS idx_checkins_checkin_date ON public.checkins(checkin_date);

-- Create index on location
CREATE INDEX IF NOT EXISTS idx_checkins_ort_station ON public.checkins(ort, station);

-- Add updated_at trigger
CREATE TRIGGER update_checkins_updated_at
    BEFORE UPDATE ON public.checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE public.checkins IS 'Historical records of completed vehicle check-ins';
COMMENT ON COLUMN public.checkins.regnr IS 'Vehicle registration number';
COMMENT ON COLUMN public.checkins.carmodel IS 'Vehicle model (brand and model)';
COMMENT ON COLUMN public.checkins.inchecker_name IS 'First name of person performing check-in';
COMMENT ON COLUMN public.checkins.inchecker_fullname IS 'Full name of person performing check-in';
COMMENT ON COLUMN public.checkins.vehicle_status IS 'Vehicle database lookup status';
COMMENT ON COLUMN public.checkins.payload IS 'Complete check-in payload for reference';
