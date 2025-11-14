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
  damage_date: string | null; // Original damage date (YYYY-MM-DD format)
};

// User damage from public.damages table
type UserDamage = {
  id: string;
  regnr: string;
  damage_date: string | null;
  original_damage_date: string | null;
  legacy_damage_source_text: string | null;
  user_type: string | null;
  user_positions: any;
  description: string | null;
  created_at: string;
};

// The final, consolidated damage object sent to the form client
export type ConsolidatedDamage = {
  id: number;
  source: 'BUHS' | 'USER';
  fullText: string;
  originalDamageDate: string | null;
  legacyKey: string | null; // regnr|original_damage_date|text for matching
  userType?: string;
  userPositions?: any;
  userDescription?: string;
  isInventoried: boolean;
  status: 'not_selected' | 'documented' | 'resolved';
};

export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  saludatum: string;
  existing_damages: ConsolidatedDamage[];
  hasUndocumentedBUHS: boolean; // NEW: Flag to indicate if there are undocumented BUHS damages
  needsDocumentationCount: number; // NEW: Count of BUHS damages needing documentation
  newDamagesCount: number; // NEW: Count of new user-originated damages
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

/**
 * Creates a unique key for matching BUHS damages with documented entries.
 * Key format: regnr|original_damage_date|legacy_text
 * 
 * Matching strategy:
 * - Primary: Exact match on (regnr, original_damage_date, legacy_damage_source_text)
 * - A BUHS damage is considered documented when a row exists in public.damages with:
 *   1. Same regnr
 *   2. Same original_damage_date (if available)
 *   3. Same legacy_damage_source_text
 * 
 * Edge cases:
 * - Missing originalDamageDate: Key uses text-only matching (first documented row wins)
 * - Text changes upstream: Existing documented rows keep old text; new text = new undocumented item
 * 
 * Related: See checklist destillat follow-up issue for future payload optimization
 */
function createDocumentedKey(regnr: string, originalDate: string | null, legacyText: string): string {
    return `${regnr}|${originalDate || 'no-date'}|${legacyText}`;
}


// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

/**
 * Fetches and consolidates vehicle information including unified damage model.
 * 
 * This function implements the unified damage model combining:
 * 1. BUHS (external/legacy) damages from RPC call
 * 2. User-documented damages (BUHS items that have been inventoried)
 * 3. New user-originated damages (created during check-ins)
 * 
 * Query strategy (minimal round trips):
 * - Query 1: Vehicle info + BUHS damages (via RPC)
 * - Query 2: User damages from public.damages (both documented BUHS and new damages)
 * 
 * Performance considerations:
 * - Leverages indexes: idx_damages_regnr, idx_damages_regnr_date
 * - Single regnr scope (upper trimmed)
 * - Avoids N+1 by fetching all damages in one query
 */
export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Step 1: Fetch all data concurrently (2 queries total)
  const [vehicleResponse, legacyDamagesResponse, userDamagesResponse] = await Promise.all([
    // Fetch vehicle info
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    
    // Fetch BUHS (external/legacy) damages
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    
    // Fetch ALL user damages for this regnr (both documented BUHS and new user damages)
    supabase
      .from('damages')
      .select('id, regnr, damage_date, original_damage_date, legacy_damage_source_text, user_type, user_positions, description, created_at')
      .eq('regnr', cleanedRegnr)
  ]);

  // Step 2: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  const userDamages: UserDamage[] = userDamagesResponse.data || [];

  // Step 3: Build maps for documented BUHS damages
  // documentedKey = regnr|original_damage_date|legacy_damage_source_text
  const documentedKeys = new Set<string>();
  const existingDocumentedDates = new Set<string>();
  const newUserDamages: UserDamage[] = [];

  for (const userDamage of userDamages) {
    if (userDamage.legacy_damage_source_text) {
      // This is a documented BUHS damage
      const key = createDocumentedKey(
        cleanedRegnr, 
        userDamage.original_damage_date, 
        userDamage.legacy_damage_source_text
      );
      documentedKeys.add(key);
      
      if (userDamage.original_damage_date) {
        existingDocumentedDates.add(userDamage.original_damage_date);
      }
    } else {
      // This is a new user-originated damage (not from BUHS)
      newUserDamages.push(userDamage);
    }
  }

  // Step 4: Build consolidated damage list
  const consolidatedDamages: ConsolidatedDamage[] = [];
  let needsDocumentationCount = 0;

  // Process BUHS damages
  for (const leg of legacyDamages) {
    const fullText = getLegacyDamageText(leg);
    if (!fullText) continue; // Skip empty entries

    const originalDamageDate = leg.damage_date;
    const legacyKey = createDocumentedKey(cleanedRegnr, originalDamageDate, fullText);
    const isInventoried = documentedKeys.has(legacyKey);

    // Only include undocumented BUHS damages in the existing_damages list
    // (Documented ones are already handled and don't need to show in "Befintliga skador att hantera")
    if (!isInventoried) {
      consolidatedDamages.push({
        id: leg.id,
        source: 'BUHS',
        fullText,
        originalDamageDate,
        legacyKey,
        isInventoried: false,
        status: 'not_selected',
      });
      needsDocumentationCount++;
    }
  }

  // Process new user damages (show these separately, they're already "inventoried")
  // Note: These will be handled differently in the UI - they don't need documentation
  // but should be visible in the form (e.g., in a "previously registered damages" section)
  for (const userDamage of newUserDamages) {
    consolidatedDamages.push({
      id: parseInt(userDamage.id) || 0,
      source: 'USER',
      fullText: userDamage.user_type || 'Skada',
      originalDamageDate: userDamage.damage_date,
      legacyKey: null,
      userType: userDamage.user_type || undefined,
      userPositions: userDamage.user_positions,
      userDescription: userDamage.description || undefined,
      isInventoried: true, // User damages are already "inventoried"
      status: 'documented',
    });
  }

  const latestSaludatum = legacyDamages.length > 0 ? legacyDamages[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  // Step 5: Calculate flags
  const hasUndocumentedBUHS = needsDocumentationCount > 0;
  const newDamagesCount = newUserDamages.length;

  // Step 6: Return the final vehicle info object
  if (vehicleData) {
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: consolidatedDamages,
      hasUndocumentedBUHS,
      needsDocumentationCount,
      newDamagesCount,
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
      hasUndocumentedBUHS,
      needsDocumentationCount,
      newDamagesCount,
      status: 'PARTIAL_MATCH_DAMAGE_ONLY',
    };
  }

  return {
    regnr: cleanedRegnr,
    model: 'Modell saknas',
    wheel_storage_location: 'Ingen information',
    saludatum: 'Ingen information',
    existing_damages: [],
    hasUndocumentedBUHS: false,
    needsDocumentationCount: 0,
    newDamagesCount: 0,
    status: 'NO_MATCH',
  };
}
