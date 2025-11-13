import { supabase } from './supabase';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

// Raw damage data from the legacy source (BUHS)
type LegacyDamage = {
  id: number;
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  saludatum: string | null;
  damage_date: string | null; // <<< CORRECTED: Ensure this field is fetched
};

// Represents an already inventoried damage from our main 'damages' table
type InventoriedDamage = {
  legacy_damage_source_text: string; // The original text, used as a key
  new_text: string; // The new, structured text (e.g., "Repa: Dörr (Höger fram)")
};

// The final, consolidated damage object sent to the form client
export type ConsolidatedDamage = {
  id: number;
  text: string;
  damage_date: string | null;
  is_inventoried: boolean;
};

export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  saludatum: string;
  existing_damages: ConsolidatedDamage[];
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

// Helper to combine the raw text fields from a legacy damage object
function getLegacyDamageText(damage: LegacyDamage): string {
    const parts = [
      damage.damage_type_raw,
      damage.note_customer,
      damage.note_internal,
    ].filter(p => p && p.trim() !== '' && p.trim() !== '-');
    const uniqueParts = [...new Set(parts)];
    return uniqueParts.join(' - ');
}


// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Step 1: Fetch all data concurrently
  const [vehicleResponse, legacyDamagesResponse, inventoriedDamagesResponse, newDamagesResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .from('damages')
      .select('legacy_damage_source_text, legacy_loose_key, user_type, user_positions, original_damage_date')
      .eq('regnr', cleanedRegnr)
      .not('legacy_damage_source_text', 'is', null),
    supabase
      .from('damages')
      .select('id, user_type, user_positions, description, damage_date')
      .eq('regnr', cleanedRegnr)
      .is('legacy_damage_source_text', null)
  ]);

  // Step 2: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  
  // Create lookup structures for inventoried damages
  // Map by legacy_damage_source_text for exact match
  const inventoriedByTextMap = new Map<string, string>();
  // Map by legacy_loose_key (REGNR|date) for loose match
  const inventoriedByLooseKeyMap = new Map<string, string>();
  
  if (inventoriedDamagesResponse.data) {
    for (const inv of inventoriedDamagesResponse.data) {
      const positions = (inv.user_positions as any[] || [])
        .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
        .filter(Boolean)
        .join(', ');
      const newText = `${inv.user_type || 'Skada'}: ${positions}`;
      
      if (inv.legacy_damage_source_text) {
        inventoriedByTextMap.set(inv.legacy_damage_source_text, newText);
      }
      
      if (inv.legacy_loose_key) {
        inventoriedByLooseKeyMap.set(inv.legacy_loose_key, newText);
      }
    }
  }

  // Step 3: Consolidate the damage lists
  // First, process legacy BUHS damages
  const consolidatedDamages: ConsolidatedDamage[] = legacyDamages.map(leg => {
    const originalText = getLegacyDamageText(leg);
    
    // Check if inventoried by exact text match
    let isInventoried = inventoriedByTextMap.has(originalText);
    let displayText = isInventoried ? inventoriedByTextMap.get(originalText)! : originalText;
    
    // If not found by text, check by loose key (REGNR|date)
    if (!isInventoried && leg.damage_date) {
      const looseKey = `${cleanedRegnr}|${leg.damage_date}`;
      if (inventoriedByLooseKeyMap.has(looseKey)) {
        isInventoried = true;
        displayText = inventoriedByLooseKeyMap.get(looseKey)!;
      }
    }

    return {
      id: leg.id,
      text: displayText,
      damage_date: leg.damage_date,
      is_inventoried: isInventoried,
    };
  }).filter(d => d.text); // Ensure we don't have empty damage entries

  // Step 4: Add new damages from public.damages (where legacy_damage_source_text IS NULL)
  if (newDamagesResponse.data) {
    for (const newDamage of newDamagesResponse.data) {
      const positions = (newDamage.user_positions as any[] || [])
        .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
        .filter(Boolean)
        .join(', ');
      
      let damageText = `${newDamage.user_type || 'Skada'}`;
      if (positions) {
        damageText += `: ${positions}`;
      }
      if (newDamage.description) {
        damageText += ` - ${newDamage.description}`;
      }

      consolidatedDamages.push({
        id: newDamage.id,
        text: damageText,
        damage_date: newDamage.damage_date,
        is_inventoried: true, // New damages are already inventoried (in our system)
      });
    }
  }

  const latestSaludatum = legacyDamages.length > 0 ? legacyDamages[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  // Step 5: Return the final vehicle info object
  if (vehicleData) {
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: consolidatedDamages,
      status: 'FULL_MATCH',
    };
  }

  if (consolidatedDamages.length > 0) {
    return {
      regnr: cleanedRegnr,
      model: 'Modell saknas',
      wheel_storage_location: 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: consolidatedDamages,
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
