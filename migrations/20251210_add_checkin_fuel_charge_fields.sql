-- Add additional fuel and charge fields to checkins table
-- These fields will store more detailed information about fuel and charging status

-- Add fuel_level field to store tankniva status
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS fuel_level TEXT;
COMMENT ON COLUMN checkins.fuel_level IS 'Fuel level status: återlämnades_fulltankad, tankad_nu, ej_upptankad';

-- Add charge_cables_count field to store number of charge cables
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS charge_cables_count INTEGER;
COMMENT ON COLUMN checkins.charge_cables_count IS 'Number of charging cables present (for electric vehicles)';
