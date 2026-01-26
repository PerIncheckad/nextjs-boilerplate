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

// Type for checkin_damages data (without nested join to avoid PostgREST issues)
type CheckinDamageData = {
  type: 'existing' | 'not_found' | 'documented';
  damage_type: string | null;
  car_part: string | null;
  position: string | null;
  description: string | null;
  photo_urls: unknown;
  video_urls: unknown;
  created_at: string;
  checkin_id: string;
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
  handled_type?: 'existing' | 'not_found' | 'documented' | null;  // How the damage was handled in a previous check-in
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

// Mapping for Swedish damage type names
const SWEDISH_DAMAGE_TYPE_MAP: Record<string, string> = {
  'FALGSKADA_SOMMARHJUL': 'Fälgskada sommarhjul',
  'FALGSKADA_VINTERHJUL': 'Fälgskada vinterhjul',
  'OVRIGT': 'Övrigt',
  'OVRIG_SKADA': 'Övrig skada',
  'DACKSKADA': 'Däckskada',
  'DACKSKADA_SOMMAR': 'Däckskada sommarhjul',
  'DACKSKADA_VINTER': 'Däckskada vinterhjul',
  'SKRAPAD_FALG': 'Skrapad fälg',
  'INVANDIG_SKADA': 'Invändig skada',
  'HOJDLEDSSKADA': 'Höjdledsskada',
  'SKRAPAD_OCH_BUCKLA': 'Skrapad och buckla',
  'JACK': 'Jack',
  'REPA': 'Repa',
  'REPOR': 'Repor',
  'BUCKLA': 'Buckla',
  'STENSKOTT': 'Stenskott',
  'SPRICKA': 'Spricka',
  'LACK': 'Lack',
  'SKRAPAD': 'Skrapad',
};

// Helper to format damage type with Swedish characters
function formatDamageTypeSwedish(damageType: string): string {
  if (!damageType) return 'Okänd';
  
  // First check if we have an exact mapping
  const upperType = damageType.toUpperCase();
  if (SWEDISH_DAMAGE_TYPE_MAP[upperType]) {
    return SWEDISH_DAMAGE_TYPE_MAP[upperType];
  }
  
  // Fallback: convert UPPERCASE_UNDERSCORE → Title Case
  return damageType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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

// Helper to normalize text for matching (case/whitespace insensitive, allow Repa/Repor mismatch)
function normalizeTextForMatching(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/_/g, ' ')        // FALGSKADA_SOMMARHJUL → falgskada sommarhjul
    .replace(/ä/g, 'a')        // fälgskada → falgskada
    .replace(/ö/g, 'o')        // övrig → ovrig
    .replace(/å/g, 'a')        // å → a
    .replace(/\s+/g, ' ')
    .replace(/repor/g, 'repa') // Normalize Repor → Repa
    .trim();
}

// Helper to check if two texts match (primary matching strategy)
function textsMatch(text1: string | null | undefined, text2: string | null | undefined): boolean {
  const norm1 = normalizeTextForMatching(text1);
  const norm2 = normalizeTextForMatching(text2);
  
  if (!norm1 || !norm2) return false;
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Fuzzy match: one contains the other (helps with variations)
  // But require significant overlap (at least 80% of shorter text)
  const shorter = norm1.length < norm2.length ? norm1 : norm2;
  const longer = norm1.length < norm2.length ? norm2 : norm1;
  
  if (longer.includes(shorter) && shorter.length >= 10) {
    return true;
  }
  
  return false;
}

// Helper to normalize damage type for loose key matching
function normalizeDamageTypeForKey(damageType: string | null | undefined): string {
  if (!damageType) return '';
  return damageType
    .toLowerCase()
    .replace(/_/g, '')         // underscore → removed
    .replace(/ä/g, 'a')        // ä → a
    .replace(/ö/g, 'o')        // ö → o
    .replace(/å/g, 'a')        // å → a
    .replace(/\s+/g, '')
    .replace(/repor/g, 'repa')
    .replace(/repa/g, 'rep') // Further normalize to just "rep"
    .replace(/skrapmärke/g, 'skrap')
    .replace(/stenskott/g, 'sten')
    .trim();
}


// =================================================================
// 3. CORE DATA FETCHING FUNCTION
// =================================================================

// Helper to create a loose BUHS matching key (matches all BUHS sources for same date)
function createLooseBuhsKey(regnr: string, date: string): string {
  return `${regnr}|${date}|BUHS_LOOSE`;
}

export async function getVehicleInfo(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Step 1: First fetch the latest completed check-in to get its checkin_id
  const lastCheckinResponse = await supabase
    .from('checkins')
    .select('id, current_station, checker_name, completed_at')
    .eq('regnr', cleanedRegnr)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const lastCheckinData = lastCheckinResponse.data || null;
  const lastCheckinId = lastCheckinData?.id || null;

  // Step 2: Fetch all other data in parallel
  const [vehicleResponse, legacyDamagesResponse, inventoriedDamagesResponse, dbDamagesResponse, nybilResponse] = await Promise.all([
    supabase
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabase
      .from('damages')
      .select('legacy_damage_source_text, user_type, user_positions, original_damage_date')
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
  
  // Debug logging for specific regnr
  const debugRegnrs = ['NGE97D', 'ZAG53Y', 'GEU29F'];
  const shouldDebug = debugRegnrs.includes(cleanedRegnr);
  
  // Step 2b: Fetch checkin_damages for the specific latest checkin
  // Note: This function is only called server-side, so direct fetch should work
  let handledDamages: CheckinDamageData[] = [];
  
  if (shouldDebug && lastCheckinId) {
    console.log(`[DEBUG ${cleanedRegnr} /damages.ts] lastCheckinId:`, lastCheckinId);
  }
  
  const handledDamagesResponse = lastCheckinId
    ? await supabase
        .from('checkin_damages')
        .select('*')
        .eq('checkin_id', lastCheckinId)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  
  if (shouldDebug) {
    console.log(`[DEBUG ${cleanedRegnr} /damages.ts] checkin_damages fetch:`, {
      lastCheckinId,
      error: handledDamagesResponse.error,
      dataLength: handledDamagesResponse.data?.length || 0,
    });
  }
  
  if (handledDamagesResponse.error) {
    console.error(`[ERROR ${cleanedRegnr} /damages.ts] Failed to fetch checkin_damages:`, handledDamagesResponse.error);
    handledDamages = [];
  } else {
    // Filter to only documented/not_found/existing types in code
    const rawData = (handledDamagesResponse.data || []) as CheckinDamageData[];
    handledDamages = rawData.filter(cd => 
      cd.type === 'documented' || cd.type === 'not_found' || cd.type === 'existing'
    );
    
    if (shouldDebug) {
      console.log(`[DEBUG ${cleanedRegnr} /damages.ts] Filtered checkin_damages:`, handledDamages.length);
    }
  }

  // Step 3: Process the fetched data
  const vehicleData = vehicleResponse.data?.[0] || null;
  const nybilData = nybilResponse.data || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  const dbDamages = dbDamagesResponse.data || [];
  // handledDamages is now defined earlier
  
  // Get the date of the last check-in for display purposes
  const lastCheckinDate = lastCheckinData?.completed_at ? new Date(lastCheckinData.completed_at) : null;
  
  // Build a list of handled damages for text-based matching
  // Note: We now match by text instead of index for more accurate matching
  type HandledDamageInfo = {
    id: number;
    type: 'existing' | 'not_found' | 'documented';
    damage_type: string;
    car_part: string | null;
    position: string | null;
    positions?: any[] | null;
    description: string;
    checker: string;
    photo_urls: string[];
    video_urls: string[];
  };
  const handledDamagesList: HandledDamageInfo[] = [];
  
  // Get checker name from the last checkin data (not from nested join)
  const checkerName = lastCheckinData?.checker_name || 'Okänd';
  
  for (const handled of handledDamages) {
    if (handled.type === 'existing' || handled.type === 'not_found' || handled.type === 'documented') {
      handledDamagesList.push({
        id: handled.id || 0,
        type: handled.type,
        // damage_type can be null/undefined in rare cases (data integrity issues)
        // Use fallback 'Okänd' to ensure display always has a value
        damage_type: handled.damage_type || 'Okänd',
        car_part: handled.car_part || null,
        position: handled.position || null,
        positions: (handled as any).positions || null,
        description: handled.description || '',
        checker: checkerName,
        photo_urls: (handled.photo_urls as string[]) || [],
        video_urls: (handled.video_urls as string[]) || [],
      });
    }
  }
  
  // Create a lookup map of inventoried damages for efficient access
  const inventoriedMap = new Map<string, string>();
  const looseBuhsSet = new Set<string>();  // NEW: Loose BUHS matching

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
        
        // EXACT KEY (for exact text matching)
        inventoriedMap.set(inv.legacy_damage_source_text, newText);
        
        // LOOSE BUHS KEY (matches all BUHS sources for same date) - NEW!
        if (inv.legacy_damage_source_text.startsWith('buhs_') && inv.original_damage_date) {
          looseBuhsSet.add(createLooseBuhsKey(cleanedRegnr, inv.original_damage_date));
        }
      }
    }
  }

  // Step 3: Consolidate the damage lists
  const consolidatedDamages: ConsolidatedDamage[] = [];
  
  // Track damages from damages table to avoid duplicates between BUHS and damages table
  const dbDamageKeys = new Set<string>();
  
  // Track which checkin_damages we've matched
  const matchedHandledIds = new Set<number>();
  
  // Add BUHS damages (from legacy source)
  // Match with checkin_damages by TEXT (primary) or by loose key (secondary)
  // This is more accurate than index-based matching
  
  for (let i = 0; i < legacyDamages.length; i++) {
    const leg = legacyDamages[i];
    const originalText = getLegacyDamageText(leg);
    const isInventoried = inventoriedMap.has(originalText);
    
    // NEW: Check BOTH exact text AND loose BUHS key
    const isLooseBuhsMatch = leg.damage_date 
      ? looseBuhsSet.has(createLooseBuhsKey(cleanedRegnr, leg.damage_date))
      : false;
    
    const finalIsInventoried = isInventoried || isLooseBuhsMatch;  // COMBINE!
    
    const displayText = isInventoried ? inventoriedMap.get(originalText)! : originalText;

    if (displayText) {
      // Extract damage type for deduplication tracking
      const damageType = leg.damage_type_raw || displayText.split(' - ')[0].trim();
      const normalized = normalizeDamageType(damageType);
      
      // Determine if this damage has been handled in the last check-in
      // NEW: Match by TEXT instead of index for better accuracy
      let handledInfo: HandledDamageInfo | null = null;
      
      // Try primary text matching first
      for (const handled of handledDamagesList) {
        if (!handled.id || matchedHandledIds.has(handled.id)) continue; // Skip if no ID or already matched
        
        // Check if handled description matches any of the BUHS text fields
        if (textsMatch(originalText, handled.description) ||
            textsMatch(leg.note_customer, handled.description) ||
            textsMatch(leg.note_internal, handled.description) ||
            textsMatch(leg.damage_type_raw, handled.description)) {
          handledInfo = handled;
          matchedHandledIds.add(handled.id);
          break;
        }
      }
      
      // If no text match, try loose key matching (damage_type only)
      if (!handledInfo) {
        const normalizedBuhsType = normalizeDamageTypeForKey(leg.damage_type_raw);
        
        const candidatesForLooseMatch = handledDamagesList.filter(handled => {
          if (!handled.id || matchedHandledIds.has(handled.id)) return false;
          
          const normalizedHandledType = normalizeDamageTypeForKey(handled.damage_type);
          return normalizedHandledType && normalizedBuhsType &&
                 normalizedHandledType === normalizedBuhsType;
        });
        
        // If there's exactly one candidate (unambiguous), use it
        if (candidatesForLooseMatch.length === 1) {
          handledInfo = candidatesForLooseMatch[0];
          matchedHandledIds.add(handledInfo.id);
        }
      }
      
      // Track this damage to avoid duplicates from damages table
      const dedupeKey = `${cleanedRegnr}|${leg.damage_date}|${normalized.typeCode}`;
      dbDamageKeys.add(dedupeKey);
      
      // Backup logic: If lastCheckinDate > damage_date, and there exists ANY checkin_damage
      // for this regnr with type in ('documented', 'not_found', 'existing'),
      // then the damage is considered handled regardless of text matching
      const hasAnyHandledDamages = handledDamagesList.length > 0;
      const damageDate = leg.damage_date ? new Date(leg.damage_date) : null;
      const isValidDamageDate = damageDate !== null && !isNaN(damageDate.getTime());
      const isHandledByDateLogic = hasAnyHandledDamages && 
                                    lastCheckinDate !== null && 
                                    isValidDamageDate && 
                                    lastCheckinDate > damageDate;
      
      consolidatedDamages.push({
        id: leg.id,
        text: displayText,
        damage_date: leg.damage_date,
        // Mark as inventoried if already documented OR if handled in last check-in
        // OR if handled by date-based backup logic
        // This prevents the damage from showing in "Befintliga skador att hantera"
        is_inventoried: finalIsInventoried || (handledInfo !== null) || isHandledByDateLogic,  // USE finalIsInventoried
        handled_type: handledInfo?.type || null,
        // Store BUHS damage_type_raw (Swedish chars) instead of checkin_damages damage_type
        handled_damage_type: handledInfo ? (leg.damage_type_raw || handledInfo?.damage_type) : null,
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
