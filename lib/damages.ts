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
  legacy_loose_key: string | null; // REGNR|damage_date format
  new_text: string; // The new, structured text (e.g., "Repa: Dörr (Höger fram)")
  original_damage_date: string | null; // YYYY-MM-DD from BUHS
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

// NEW: Check if a damage text matches the standardized app pattern
// Pattern: "Skadetyp - Placering - Position" (e.g., "Repa - Dörr - Höger fram")
function isStandardizedAppText(text: string): boolean {
    if (!text) return false;
    // Regex: matches pattern with exactly 3 parts separated by " - "
    // where each part contains non-dash characters
    const pattern = /^[^-]+ - [^-]+ - [^-]+$/;
    return pattern.test(text.trim());
}

// NEW: Check if damage text fields indicate standardized app format
function hasStandardizedTextFields(damage: LegacyDamage): boolean {
    const texts = [
        damage.damage_type_raw,
        damage.note_customer,
        damage.note_internal
    ].filter(t => t && t.trim());
    
    // Check if any of the text fields match the standardized pattern
    return texts.some(t => isStandardizedAppText(t || ''));
}


// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Step 1: Fetch all data concurrently
  // NEW: Fetch documented damages including legacy_loose_key and original_damage_date
  const [vehicleResponse, legacyDamagesResponse, inventoriedDamagesResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .from('damages')
      .select('legacy_damage_source_text, legacy_loose_key, original_damage_date, user_type, user_positions')
      .eq('regnr', cleanedRegnr)
      .not('legacy_damage_source_text', 'is', null)
  ]);

  // Step 2: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  
  // NEW: Create lookup maps for documented damages
  // Map by legacy_damage_source_text
  const inventoriedMap = new Map<string, string>();
  // NEW: Map by legacy_loose_key (REGNR|damage_date) for N2-per-datum support
  const looseKeyMap = new Map<string, string>();
  
  if (inventoriedDamagesResponse.data) {
    for (const inv of inventoriedDamagesResponse.data) {
      const positions = (inv.user_positions as any[] || [])
        .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
        .filter(Boolean)
        .join(', ');
      const newText = `${inv.user_type || 'Skada'}: ${positions}`;
      
      // Store by legacy_damage_source_text
      if (inv.legacy_damage_source_text) {
        inventoriedMap.set(inv.legacy_damage_source_text, newText);
      }
      
      // NEW: Store by legacy_loose_key (REGNR|damage_date format)
      if (inv.legacy_loose_key) {
        looseKeyMap.set(inv.legacy_loose_key, newText);
      }
      
      // NEW: Also generate and store by computed loose key if original_damage_date exists
      if (inv.original_damage_date && !inv.legacy_loose_key) {
        const computedKey = `${cleanedRegnr}|${inv.original_damage_date}`;
        looseKeyMap.set(computedKey, newText);
      }
    }
  }

  // Step 3: Consolidate the damage lists
  const consolidatedDamages: ConsolidatedDamage[] = legacyDamages
    .filter(leg => {
      // NEW: Filter out BUHS rows that are from the import (have damage_type_raw)
      // but already match the standardized app pattern
      if (leg.damage_type_raw && hasStandardizedTextFields(leg)) {
        return false; // Skip standardized app rows
      }
      return true;
    })
    .map(leg => {
      const originalText = getLegacyDamageText(leg);
      
      // NEW: Check if documented by legacy_damage_source_text OR by legacy_loose_key
      let isInventoried = inventoriedMap.has(originalText);
      let displayText = isInventoried ? inventoriedMap.get(originalText)! : originalText;
      
      // NEW: Also check by loose key (REGNR|damage_date) for N2-per-datum support
      if (!isInventoried && leg.damage_date) {
        const looseKey = `${cleanedRegnr}|${leg.damage_date}`;
        if (looseKeyMap.has(looseKey)) {
          isInventoried = true;
          displayText = looseKeyMap.get(looseKey)!;
        }
      }

      return {
        id: leg.id,
        text: displayText,
        damage_date: leg.damage_date,
        is_inventoried: isInventoried,
      };
    })
    .filter(d => d.text); // Ensure we don't have empty damage entries

  const latestSaludatum = legacyDamages.length > 0 ? legacyDamages[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  // Step 4: Return the final vehicle info object
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
