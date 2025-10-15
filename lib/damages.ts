import { supabase } from './supabase';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

type ExternalDamage = {
  id: number; // === ÄNDRING: ID måste vara med ===
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  saludatum: string | null;
};

// === ÄNDRING: Ny typ för att skicka till formuläret ===
export type FormattedDamage = {
  id: number;
  text: string;
};

export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  saludatum: string;
  existing_damages: FormattedDamage[]; // === ÄNDRING: Använder den nya typen ===
  status: 'FULL_MATCH' | 'PARTIAL_MATCH_DAMAGE_ONLY' | 'NO_MATCH';
};

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

// === ÄNDRING: Returnerar nu ett objekt med både ID och text ===
function formatDamages(damages: ExternalDamage[]): FormattedDamage[] {
  if (!damages || damages.length === 0) {
    return [];
  }
  return damages.map((damage) => {
    const parts = [
      damage.damage_type_raw,
      damage.note_customer,
      damage.note_internal,
    ].filter(p => p && p.trim() !== '' && p.trim() !== '-');
    const uniqueParts = [...new Set(parts)];
    const damageString = uniqueParts.join(' - ');
    if (!damageString) return null;
    
    return {
      id: damage.id,
      text: damageString,
    };
  }).filter(Boolean) as FormattedDamage[];
}

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

  const [vehicleResponse, damagesResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr })
  ]);

  const vehicleData = vehicleResponse.data?.[0] || null; 
  const damagesData = damagesResponse.data || [];

  const formattedDamages = formatDamages(damagesData as ExternalDamage[]); // === ÄNDRING: Tydliggör typen ===
  const latestSaludatum = damagesData.length > 0 ? damagesData[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  if (vehicleData) {
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: formattedDamages,
      status: 'FULL_MATCH',
    };
  }

  if (damagesData.length > 0) {
    return {
      regnr: cleanedRegnr,
      model: 'Modell saknas',
      wheel_storage_location: 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: formattedDamages,
      status: 'PARTIAL_MATCH_DAMAGE_ONLY',
    };
  }

  return {
    regnr: cleanedRegnr,
    model: 'Modell saknas',
    wheel_storage_location: 'Ingen information',
    saludatum: 'Ingen information',
    existing_damages: [],
    status: 'NO_MATCH',
  };
}
