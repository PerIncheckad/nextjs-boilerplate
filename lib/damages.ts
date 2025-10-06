import { supabase } from './supabase';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

type ExternalDamage = {
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  saludatum: string | null;
};

export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  saludatum: string;
  existing_damages: string[];
  status: 'FULL_MATCH' | 'PARTIAL_MATCH_DAMAGE_ONLY' | 'NO_MATCH';
};

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

function formatDamages(damages: ExternalDamage[]): string[] {
  if (!damages || damages.length === 0) {
    return [];
  }
  return damages.map((damage, index) => {
    const parts = [
      damage.damage_type_raw,
      damage.note_customer,
      damage.note_internal,
    ].filter(p => p && p.trim() !== '' && p.trim() !== '-');
    const uniqueParts = [...new Set(parts)];
    const damageString = uniqueParts.join(' - ');
    return `${index + 1}. ${damageString}`;
  });
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
    // Returnera det ursprungliga värdet om det inte matchar YYYYMMDD, ifall det redan är korrekt formaterat.
    return dateStr;
}

// =================================================================
// 3. CORE DATA FETCHING FUNCTION (FINAL VERSION)
// =================================================================

export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // --- Steg 1: Hämta fordonsdata och skadedata parallellt ---
  const [vehicleResponse, damagesResponse] = await Promise.all([
    // Anrop 1: Hämta från 'vehicles'-tabellen, trimma regnr i databasen.
    supabase
      .from('vehicles')
      .select('brand, model, wheel_storage_location')
      .filter('trim(regnr)', 'eq', cleanedRegnr)
      .single(),
      
    // Anrop 2: Använd vår nya, "toleranta" funktion för att hämta skador.
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr })
  ]);

  const vehicleData = vehicleResponse.data;
  const damagesData = damagesResponse.data || [];

  // --- Steg 2: Bearbeta den hämtade datan ---
  const formattedDamages = formatDamages(damagesData);
  const latestSaludatum = damagesData.length > 0 ? damagesData[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  // --- Steg 3: Bestäm scenario och returnera korrekt data ---

  // Scenario A: Full träff
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

  // Scenario B: Endast skadehistorik finns
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

  // Scenario C: Ingen träff alls
  return {
    regnr: cleanedRegnr,
    model: 'Modell saknas',
    wheel_storage_location: 'Ingen information',
    saludatum: 'Ingen information',
    existing_damages: [],
    status: 'NO_MATCH',
  };
}
