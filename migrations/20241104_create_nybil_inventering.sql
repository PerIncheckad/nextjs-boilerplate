-- Migration: Create nybil_inventering table
-- Date: 2024-11-04
-- Description: Table for storing new vehicle registration data from /nybil page

CREATE TABLE IF NOT EXISTS nybil_inventering (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Vehicle Info
    regnr TEXT NOT NULL,
    marke TEXT,
    modell TEXT,
    arsmodell TEXT,
    
    -- Equipment
    utrustning TEXT,
    
    -- KM Info
    matarstallning TEXT,
    
    -- Initial Check
    initial_check_notes TEXT,
    
    -- Sale Info
    kopinfo TEXT,
    
    -- Buyer Info
    kopare_namn TEXT,
    kopare_kontakt TEXT,
    
    -- User who created the entry
    created_by TEXT,
    
    -- Additional metadata
    data JSONB
);

-- Create index on registration number for faster lookups
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_regnr ON nybil_inventering(regnr);

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_nybil_inventering_created_at ON nybil_inventering(created_at DESC);
