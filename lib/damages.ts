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
  folder?: string | null;  // Folder path for associated media files (photos/videos)
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
  const [vehicleResponse, legacyDamagesResponse, inventoriedDamagesResponse, dbDamagesResponse, nybilResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .from('damages')
      .select('legacy_damage_source_text, user_type, user_positions')
      .eq('regnr', cleanedRegnr)
      .not('legacy_damage_source_text', 'is', null),
    supabase
      .from('damages')
      .select('id, regnr, source, user_type, damage_type_raw, user_positions, damage_date, created_at, legacy_damage_source_text, uploads')
      .eq('regnr', cleanedRegnr)
      .in('source', ['CHECK', 'NYBIL'])
      .order('created_at', { ascending: false }),
    supabase
      .from('nybil_inventering')
      .select('regnr, bilmarke, modell, hjul_forvaring_ort, hjul_forvaring_spec, hjul_forvaring, saludatum')
      .eq('regnr', cleanedRegnr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  // Step 2: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const nybilData = nybilResponse.data || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  const dbDamages = dbDamagesResponse.data || [];
  
  // Create a lookup map of inventoried damages for efficient access
  const inventoriedMap = new Map<string, string>();
  if (inventoriedDamagesResponse.data) {
    for (const inv of inventoriedDamagesResponse.data) {
      if (inv.legacy_damage_source_text) {
        let newText: string;
        
        if (inv.user_type) {
          // We have structured data from the check-in
          const positions = (inv.user_positions as any[] || [])
            .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
            .filter(Boolean)
            .join(', ');
          newText = positions ? `${inv.user_type}: ${positions}` : inv.user_type;
        } else {
          // Fallback: use legacy_damage_source_text as display text
          // Remove any "(Går ej:...)" suffixes for cleaner display
          newText = (inv.legacy_damage_source_text || '').split(' (Går ej:')[0].trim();
          // If still empty, use a generic text
          if (!newText) {
            newText = 'Dokumenterad skada';
          }
        }
        
        inventoriedMap.set(inv.legacy_damage_source_text, newText);
      }
    }
  }

  // Step 3: Consolidate the damage lists
  const consolidatedDamages: ConsolidatedDamage[] = [];
  
  // Add BUHS damages (from legacy source)
  for (const leg of legacyDamages) {
    const originalText = getLegacyDamageText(leg);
    const isInventoried = inventoriedMap.has(originalText);
    const displayText = isInventoried ? inventoriedMap.get(originalText)! : originalText;

    if (displayText) {
      consolidatedDamages.push({
        id: leg.id,
        text: displayText,
        damage_date: leg.damage_date,
        is_inventoried: isInventoried,
      });
    }
  }
  
  // Add damages from damages table (CHECK and NYBIL sources)
  // These are damages registered via /check or /nybil that are NOT duplicates of BUHS damages
  for (const dbDamage of dbDamages) {
    // Skip if this damage is already in the legacy damages list (avoid duplicates)
    // A damage is a duplicate if it has legacy_damage_source_text that matches a BUHS damage
    if (dbDamage.legacy_damage_source_text) {
      // This is a documented BUHS damage, already included above
      continue;
    }
    
    // Build display text from user_type and user_positions
    let displayText: string;
    const damageType = dbDamage.user_type || dbDamage.damage_type_raw;
    if (damageType) {
      const positions = (dbDamage.user_positions as any[] || [])
        .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
        .filter(Boolean)
        .join(', ');
      displayText = positions ? `${damageType}: ${positions}` : damageType;
    } else {
      displayText = 'Skada';
    }
    
    consolidatedDamages.push({
      id: dbDamage.id,
      text: displayText,
      damage_date: dbDamage.damage_date || dbDamage.created_at,
      is_inventoried: true, // These are already inventoried (registered via CHECK/NYBIL)
      folder: (dbDamage.uploads as any)?.folder || null,
    });
  }

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

  // Check if vehicle exists in nybil_inventering (registered via /nybil)
  if (nybilData) {
    const wheelStorage = [nybilData.hjul_forvaring_ort, nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring]
      .filter(Boolean)
      .join(' - ') || 'Ingen information';
    
    const nybilSaludatum = nybilData.saludatum ? formatSaludatum(nybilData.saludatum) : finalSaludatum;
    
    return {
      regnr: cleanedRegnr,
      model: formatModel(nybilData.bilmarke, nybilData.modell),
      wheel_storage_location: wheelStorage,
      saludatum: nybilSaludatum,
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
