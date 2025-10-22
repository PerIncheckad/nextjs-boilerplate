import { supabase } from './supabase';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

// Represents a damage entry from the new, "smart" database function.
export type ConsolidatedDamage = {
  id: number;                   // The database ID from either the legacy table or the new damages table
  text: string;                 // The final, user-friendly text to be displayed
  damage_date: string | null;   // The original damage date from the legacy data (YYYY-MM-DD)
  is_inventoried: boolean;      // True if this legacy damage has already been documented by a user
};

export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  saludatum: string;
  existing_damages: ConsolidatedDamage[]; // Use the new, smarter type
  status: 'FULL_MATCH' | 'PARTIAL_MATCH_DAMAGE_ONLY' | 'NO_MATCH';
};

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

function formatModel(brand: string | null, model: string | null): string {
    const cleanBrand = brand?.trim();
    const cleanModel = model?.trim();
    if (cleanBrand && cleanModel) return `${cleanBrand} ${cleanModel}`;
    if (cleanBrand) return `${cleanBrand} -`;
    if (cleanModel) return `- ${cleanModel}`;
    return "Modell saknas";
}

function formatSaludatum(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Ingen information';
    const cleaned = dateStr.replace(/-/g, '').trim();
    if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
        return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
    }
    return dateStr;
}

// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Perform both data fetches simultaneously for efficiency
  const [vehicleResponse, damagesResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_consolidated_damages', { p_regnr: cleanedRegnr }) // <<< NEW "SMART" FUNCTION
  ]);

  const vehicleData = vehicleResponse.data?.[0] || null; 
  const damagesData: ConsolidatedDamage[] = damagesResponse.data || [];

  // Extract the latest saludatum from the damages list if available
  const latestSaludatum = damagesData.length > 0 ? damagesData[0].damage_date : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  if (vehicleData) {
    // Full match: We found the vehicle in the master list.
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: damagesData, // Return the consolidated list directly
      status: 'FULL_MATCH',
    };
  }

  if (damagesData.length > 0) {
    // Partial match: Vehicle not in master list, but legacy damages were found.
    return {
      regnr: cleanedRegnr,
      model: 'Modell saknas',
      wheel_storage_location: 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: damagesData, // Return the consolidated list directly
      status: 'PARTIAL_MATCH_DAMAGE_ONLY',
    };
  }

  // No match: Nothing found anywhere for this registration number.
  return {
    regnr: cleanedRegnr,
    model: 'Modell saknas',
    wheel_storage_location: 'Ingen information',
    saludatum: 'Ingen information',
    existing_damages: [],
    status: 'NO_MATCH',
  };
}
