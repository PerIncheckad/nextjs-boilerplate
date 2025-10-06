import { supabase } from './supabase'; // <-- ÄNDRING 1: Importera den färdiga klienten

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

// Definierar datastrukturen för en extern skada från databasen
type ExternalDamage = {
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  // ÄNDRING: Lägg till saludatum i typen
  saludatum: string | null; 
};

// Definierar den kompletta informationsstrukturen för ett fordon
export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  // ÄNDRING: Lägg till saludatum i typen
  saludatum: string;
  existing_damages: string[];
  status: 'FULL_MATCH' | 'PARTIAL_MATCH_DAMAGE_ONLY' | 'NO_MATCH';
};

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

/**
 * Formaterar en lista av skadeobjekt till en läsbar, numrerad lista av strängar.
 * Tar bort dubbletter och tomma fält för varje skada.
 * @param damages - En array av skadeobjekt från databasen.
 * @returns En array av formaterade strängar, t.ex. ["1. Repa - Stötfångare fram - Polerbar"].
 */
function formatDamages(damages: ExternalDamage[]): string[] {
  if (!damages || damages.length === 0) {
    return [];
  }

  return damages.map((damage, index) => {
    const parts = [
      damage.damage_type_raw,
      damage.note_customer,
      damage.note_internal,
    ];

    // Filtrera bort null/tomma strängar och ta sedan bort dubbletter
    const uniqueParts = [...new Set(parts.filter(p => p && p.trim() !== '-'))];

    // Skapa den slutgiltiga strängen och lägg till numrering
    const damageString = uniqueParts.join(' - ');
    return `${index + 1}. ${damageString}`;
  });
}

/**
 * Formaterar bilmodell baserat på märke och modell.
 * @param brand - Märke från databasen.
 * @param model - Modell från databasen.
 * @returns En formaterad sträng, t.ex. "Ford Puma", "Ford -", eller "Modell saknas".
 */
function formatModel(brand: string | null, model: string | null): string {
    const cleanBrand = brand?.trim();
    const cleanModel = model?.trim();

    if (cleanBrand && cleanModel) {
        return `${cleanBrand} ${cleanModel}`;
    }
    if (cleanBrand) {
        return `${cleanBrand} -`;
    }
    if (cleanModel) {
        return `- ${cleanModel}`;
    }
    return "Modell saknas";
}


// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

/**
 * Hämtar all information för ett givet registreringsnummer.
 * Implementerar logiken för "Standardbil", "Egenägd bil" och "Spökbil".
 * @param regnr - Registreringsnumret att slå upp.
 * @returns Ett VehicleInfo-objekt.
 */
export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  // const supabase = createClient(); <-- ÄNDRING 2: Radera denna rad
  const cleanedRegnr = regnr.toUpperCase().trim();

  // --- Steg 1: Leta i huvudlistan (vehicles) ---
  const { data: vehicleData } = await supabase
    .from('vehicles')
    .select('brand, model, wheel_storage_location')
    .eq('regnr', cleanedRegnr)
    .single();

  // --- Steg 2: Hämta alltid skador, oavsett om bilen hittades i vehicles ---
  const { data: damagesData } = await supabase
    .from('damages_external')
    // ÄNDRING: Hämta även 'saludatum'
    .select('damage_type_raw, note_customer, note_internal, saludatum')
    .eq('regnr', cleanedRegnr);

  const formattedDamages = formatDamages(damagesData || []);
  // ÄNDRING: Hämta första bästa saludatum från skadehistoriken
  const saludatumFromDamages = damagesData?.find(d => d.saludatum)?.saludatum || 'Ingen information';

  // --- Steg 3: Bestäm scenario och returnera korrekt data ---

  // Scenario A: "Standardbilen" - Full träff i vagnparkslistan.
  if (vehicleData) {
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: saludatumFromDamages, // Lägg till saludatum här
      existing_damages: formattedDamages,
      status: 'FULL_MATCH',
    };
  }

  // Scenario B: "Den Egenägda Bilen" - Ingen träff i vagnpark, men har skadehistorik.
  if (damagesData && damagesData.length > 0) {
    return {
      regnr: cleanedRegnr,
      model: 'Modell saknas',
      wheel_storage_location: 'Ingen information',
      saludatum: saludatumFromDamages, // Lägg till saludatum här
      existing_damages: formattedDamages,
      status: 'PARTIAL_MATCH_DAMAGE_ONLY',
    };
  }

  // Scenario C: "Spökbilen" - Ingen träff någonstans.
  return {
    regnr: cleanedRegnr,
    model: 'Modell saknas',
    wheel_storage_location: 'Ingen information',
    saludatum: 'Ingen information', // Fallback-värde
    existing_damages: [],
    status: 'NO_MATCH',
  };
}
