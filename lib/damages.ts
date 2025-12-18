import { supabase } from './supabase';
import { normalizeDamageType } from '@/app/api/notify/normalizeDamageType';

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
  handled_type?: 'existing' | 'not_found' | null;  // How the damage was handled in a previous check-in
  handled_damage_type?: string | null;  // Structured damage type from checkin_damages
  handled_car_part?: string | null;  // Car part from checkin_damages
  handled_position?: string | null;  // Position from checkin_damages
  handled_comment?: string | null;  // Comment from when it was handled
  handled_by?: string | null;  // Who handled the damage
  handled_photo_urls?: string[];  // Photo URLs from checkin_damages
  handled_video_urls?: string[];  // Video URLs from checkin_damages
};

export type VehicleInfo = {
  regnr: string;
  model: string;
  wheel_storage_location: string;
  saludatum: string;
  existing_damages: ConsolidatedDamage[];
  status: 'FULL_MATCH' | 'PARTIAL_MATCH_DAMAGE_ONLY' | 'NO_MATCH';
  last_checkin?: {
    station: string;
    checker_name: string;
    completed_at: string;
  } | null;
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

  // Step 1: Fetch all data concurrently, including handled damages from checkin_damages and last check-in
  const [vehicleResponse, legacyDamagesResponse, inventoriedDamagesResponse, dbDamagesResponse, nybilResponse, handledDamagesResponse, lastCheckinResponse] = await Promise.all([
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
      .maybeSingle(),
    supabase
      .from('checkin_damages')
      .select('type, damage_type, car_part, position, description, photo_urls, video_urls, created_at, checkin_id, checkins!inner(regnr, checker_name)')
      .eq('checkins.regnr', cleanedRegnr)
      .in('type', ['not_found', 'existing', 'documented'])
      .order('created_at', { ascending: false }),
    supabase
      .from('checkins')
      .select('current_station, checker_name, completed_at')
      .eq('regnr', cleanedRegnr)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  // Step 2: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const nybilData = nybilResponse.data || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  const dbDamages = dbDamagesResponse.data || [];
  const handledDamages = handledDamagesResponse.data || [];
  const lastCheckinData = lastCheckinResponse.data || null;
  
  // Get the date of the last check-in to filter damages older than that
  // If last check-in exists and is newer than a damage's date, that damage is considered handled
  const lastCheckinDate = lastCheckinData?.completed_at ? new Date(lastCheckinData.completed_at) : null;
  
  // Build a list of handled damages in chronological order for order-based matching
  // We can't match by damage_type because BUHS "Skrapad och buckla" != checkin_damages "Krockskada"
  // Instead, we match by order: 1st BUHS damage → 1st checkin_damage, 2nd → 2nd, etc.
  type HandledDamageInfo = {
    type: 'existing' | 'not_found';
    damage_type: string;
    car_part: string | null;
    position: string | null;
    description: string;
    checker: string;
    photo_urls: string[];
    video_urls: string[];
  };
  const handledDamagesList: HandledDamageInfo[] = [];
  
  for (const handled of handledDamages) {
    if (handled.type === 'existing' || handled.type === 'not_found') {
      // Get the checker name from the checkin (using type assertion for nested join data)
      const checkerName = (handled.checkins as any)?.checker_name || 'Okänd';
      handledDamagesList.push({
        type: handled.type,
        damage_type: handled.damage_type || 'Okänd',
        car_part: handled.car_part || null,
        position: handled.position || null,
        description: handled.description || '',
        checker: checkerName,
        photo_urls: (handled.photo_urls as string[]) || [],
        video_urls: (handled.video_urls as string[]) || [],
      });
    }
  }
  
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
  
  // Track damages from damages table to avoid duplicates between BUHS and damages table
  const dbDamageKeys = new Set<string>();
  
  // Add BUHS damages (from legacy source)
  // Each BUHS damage is unique - do NOT deduplicate within BUHS
  // Match with checkin_damages by INDEX, not by damage_type
  let handledDamageIndex = 0;
  
  for (const leg of legacyDamages) {
    const originalText = getLegacyDamageText(leg);
    const isInventoried = inventoriedMap.has(originalText);
    const displayText = isInventoried ? inventoriedMap.get(originalText)! : originalText;

    if (displayText) {
      // Extract damage type for deduplication tracking
      const damageType = leg.damage_type_raw || displayText.split(' - ')[0].trim();
      const normalized = normalizeDamageType(damageType);
      
      // Determine if this damage should be filtered from "Befintliga skador att hantera"
      // A damage is handled if the last check-in is newer than the damage date
      let isHandled = false;
      let handledInfo: HandledDamageInfo | null = null;
      
      if (lastCheckinDate && leg.damage_date) {
        const damageDate = new Date(leg.damage_date);
        if (lastCheckinDate > damageDate) {
          isHandled = true;
          // Match by index: use the corresponding checkin_damage entry
          if (handledDamageIndex < handledDamagesList.length) {
            handledInfo = handledDamagesList[handledDamageIndex];
            handledDamageIndex++;
          }
        }
      }
      
      // Track this damage to avoid duplicates from damages table
      const dedupeKey = `${cleanedRegnr}|${leg.damage_date}|${normalized.typeCode}`;
      dbDamageKeys.add(dedupeKey);
      
      consolidatedDamages.push({
        id: leg.id,
        text: displayText,
        damage_date: leg.damage_date,
        // Mark as inventoried if already documented OR if handled in previous check-in
        // This prevents the damage from showing in "Befintliga skador att hantera"
        is_inventoried: isInventoried || isHandled,
        handled_type: handledInfo?.type || null,
        handled_damage_type: handledInfo?.damage_type || null,
        handled_car_part: handledInfo?.car_part || null,
        handled_position: handledInfo?.position || null,
        handled_comment: handledInfo?.description || null,
        handled_by: handledInfo?.checker || null,
        handled_photo_urls: handledInfo?.photo_urls || [],
        handled_video_urls: handledInfo?.video_urls || [],
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
    
    // Create a unique key for deduplication between BUHS and damages table
    const damageDate = dbDamage.damage_date || dbDamage.created_at;
    const normalized = normalizeDamageType(damageType);
    const dedupeKey = `${cleanedRegnr}|${damageDate}|${normalized.typeCode}`;
    
    // Skip if this damage was already added from BUHS
    if (dbDamageKeys.has(dedupeKey)) {
      continue;
    }
    dbDamageKeys.add(dedupeKey);
    
    consolidatedDamages.push({
      id: dbDamage.id,
      text: displayText,
      damage_date: damageDate,
      is_inventoried: true, // These are already inventoried (registered via CHECK/NYBIL)
      folder: (dbDamage.uploads as any)?.folder || null,
      handled_type: null,
      handled_damage_type: null,
      handled_car_part: null,
      handled_position: null,
      handled_comment: null,
      handled_by: null,
      handled_photo_urls: [],
      handled_video_urls: [],
    });
  }

  const latestSaludatum = legacyDamages.length > 0 ? legacyDamages[0].saludatum : null;
  const finalSaludatum = formatSaludatum(latestSaludatum);

  // Process last check-in information
  const lastCheckin = lastCheckinData ? {
    station: lastCheckinData.current_station || 'Okänd station',
    checker_name: lastCheckinData.checker_name || 'Okänd',
    completed_at: lastCheckinData.completed_at || '',
  } : null;

  // Step 4: Return the final vehicle info object
  if (vehicleData) {
    return {
      regnr: cleanedRegnr,
      model: formatModel(vehicleData.brand, vehicleData.model),
      wheel_storage_location: vehicleData.wheel_storage_location || 'Ingen information',
      saludatum: finalSaludatum,
      existing_damages: consolidatedDamages,
      status: 'FULL_MATCH',
      last_checkin: lastCheckin,
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
      last_checkin: lastCheckin,
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
      last_checkin: lastCheckin,
    };
  }

  return {
    regnr: cleanedRegnr,
    model: 'Modell saknas',
    wheel_storage_location: 'Ingen information',
    saludatum: 'Ingen information',
    existing_damages: [],
    status: 'NO_MATCH',
    last_checkin: lastCheckin,
  };
}
