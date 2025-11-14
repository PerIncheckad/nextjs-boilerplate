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
  legacy_damage_source_text: string | null; // The original text, used as a key (null for new damages)
  original_damage_date: string | null; // YYYY-MM-DD for legacy damages
  user_type: string | null;
  user_positions: any[] | null;
  created_at: string;
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

// Helper to build structured text from user_type and positions
function buildStructuredText(userType: string | null, userPositions: any[] | null): string {
  if (!userType) return '';
  const positions = (userPositions || [])
    .map(p => {
      const carPart = p.carPart || p.car_part || '';
      const position = p.position || '';
      if (carPart && position) return `${carPart} (${position})`;
      if (carPart) return carPart;
      return '';
    })
    .filter(Boolean)
    .join(', ');
  return positions ? `${userType}: ${positions}` : userType;
}

// Helper to get car part display name
function carPart(position: any): string {
  const carPart = position.carPart || position.car_part || '';
  const pos = position.position || '';
  if (carPart && pos) return `${carPart} (${pos})`;
  if (carPart) return carPart;
  return '';
}


// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Step 1: Fetch all data concurrently
  const [vehicleResponse, legacyDamagesResponse, allInventoriedDamagesResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .from('damages')
      .select('legacy_damage_source_text, original_damage_date, user_type, user_positions, created_at')
      .eq('regnr', cleanedRegnr)
  ]);

  // Step 2: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  const allInventoriedDamages: InventoriedDamage[] = allInventoriedDamagesResponse.data || [];
  
  // Build two maps: exactMap and looseMap
  const exactMap = new Map<string, string>();
  const looseMap = new Map<string, string>();
  
  for (const inv of allInventoriedDamages) {
    const structuredText = buildStructuredText(inv.user_type, inv.user_positions);
    
    // Exact match map (for documented BUHS damages)
    if (inv.legacy_damage_source_text) {
      exactMap.set(inv.legacy_damage_source_text, structuredText);
    }
    
    // Loose key map (for BUHS damage fallback matching)
    if (inv.original_damage_date) {
      const looseKey = `${cleanedRegnr}|${inv.original_damage_date}`;
      looseMap.set(looseKey, structuredText);
    }
  }

  // Step 3: Process BUHS damages
  const consolidatedDamages: ConsolidatedDamage[] = legacyDamages.map(leg => {
    const originalText = getLegacyDamageText(leg);
    const looseKey = leg.damage_date ? `${cleanedRegnr}|${leg.damage_date}` : null;
    
    // Check if inventoried via exact text OR loose key
    const isInventoried = exactMap.has(originalText) || (looseKey && looseMap.has(looseKey));
    
    // Get display text (prefer exact match, fallback to loose key match, then original)
    let displayText = originalText;
    if (exactMap.has(originalText)) {
      displayText = exactMap.get(originalText)!;
    } else if (looseKey && looseMap.has(looseKey)) {
      displayText = looseMap.get(looseKey)!;
    }

    return {
      id: leg.id,
      text: displayText,
      damage_date: leg.damage_date,
      is_inventoried: isInventoried,
    };
  }).filter(d => d.text);

  // Step 4: Append new damages (those with legacy_damage_source_text IS NULL)
  const newDamages = allInventoriedDamages
    .filter(inv => inv.legacy_damage_source_text === null)
    .map(inv => {
      const structuredText = buildStructuredText(inv.user_type, inv.user_positions);
      // Use created_at date as the damage_date for new damages
      const damageDate = inv.created_at ? inv.created_at.split('T')[0] : null;
      
      return {
        id: Math.random(), // Generate a temporary ID for new damages
        text: structuredText,
        damage_date: damageDate,
        is_inventoried: true, // New damages are always inventoried
      };
    })
    .filter(d => d.text);

  // Combine BUHS damages and new damages
  const allConsolidatedDamages = [...consolidatedDamages, ...newDamages];

  const latestSaludatum = legacyDamages.length > 0 ? legacyDamages[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  // Step 5: Return the final vehicle info object
  if (vehicleData) {
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: allConsolidatedDamages,
      status: 'FULL_MATCH',
    };
  }

  if (allConsolidatedDamages.length > 0) {
    return {
      regnr: cleanedRegnr,
      model: 'Modell saknas',
      wheel_storage_location: 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: allConsolidatedDamages,
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
