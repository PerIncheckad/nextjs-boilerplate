import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// =================================================================
// 1. INITIALIZATION
// =================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// Server-side Supabase client with service role - bypasses RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// =================================================================
// 2. TYPES (copied from lib/damages.ts)
// =================================================================

type LegacyDamage = {
  id: number;
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  saludatum: string | null;
  damage_date: string | null;
};

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

type InventoriedDamage = {
  legacy_damage_source_text: string;
  new_text: string;
};

export type ConsolidatedDamage = {
  id: number;
  text: string;
  damage_date: string | null;
  is_inventoried: boolean;
  folder?: string | null;
  handled_type?: 'existing' | 'not_found' | 'documented' | null;
  handled_damage_type?: string | null;
  handled_car_part?: string | null;
  handled_position?: string | null;
  handled_comment?: string | null;
  handled_by?: string | null;
  handled_photo_urls?: string[];
  handled_video_urls?: string[];
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
// 3. HELPER FUNCTIONS
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

function getLegacyDamageText(damage: LegacyDamage): string {
  const parts = [
    damage.damage_type_raw ? formatDamageType(damage.damage_type_raw) : null,
    damage.note_customer,
    damage.note_internal,
  ].filter(p => p && p.trim() !== '' && p.trim() !== '-');
  const uniqueParts = [...new Set(parts)];
  return uniqueParts.join(' - ');
}

// Simplified normalizeDamageType - just need the core functionality
function normalizeDamageType(damageType: string): { typeCode: string } {
  const normalized = damageType.toUpperCase().trim();
  return { typeCode: normalized };
}

// Helper function to format damage types from "FÄLGSKADA_VINTERHJUL" to "Fälgskada vinterhjul"
function formatDamageType(damageType: string | null | undefined): string {
  if (!damageType) return 'Okänd skada';
  return damageType
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

// =================================================================
// 4. MAIN FUNCTION (adapted from lib/damages.ts)
// =================================================================

async function getVehicleInfoServer(regnr: string): Promise<VehicleInfo> {
  const cleanedRegnr = regnr.toUpperCase().trim();

  // Step 1: Fetch vehicle data and legacy damages first to know L (number of BUHS damages)
  const [vehicleResponse, legacyDamagesResponse, inventoriedDamagesResponse, dbDamagesResponse, nybilResponse] = await Promise.all([
    supabaseAdmin
      .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabaseAdmin
      .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
    supabaseAdmin
      .from('damages')
      .select('legacy_damage_source_text, user_type, user_positions')
      .eq('regnr', cleanedRegnr)
      .not('legacy_damage_source_text', 'is', null),
    supabaseAdmin
      .from('damages')
      .select('id, regnr, source, user_type, damage_type_raw, user_positions, damage_date, created_at, legacy_damage_source_text, uploads')
      .eq('regnr', cleanedRegnr)
      .in('source', ['CHECK', 'NYBIL', 'BUHS'])
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('nybil_inventering')
      .select('regnr, bilmarke, modell, hjul_forvaring_ort, hjul_forvaring_spec, hjul_forvaring, saludatum')
      .eq('regnr', cleanedRegnr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  
  const vehicleData = vehicleResponse.data?.[0] || null;
  const nybilData = nybilResponse.data || null;
  const legacyDamages: LegacyDamage[] = legacyDamagesResponse.data || [];
  const dbDamages = dbDamagesResponse.data || [];
  const L = legacyDamages.length; // Number of BUHS damages
  
  // Step 2: Fetch last N completed checkins for historical matching
  // Try N=10 first, then N=30 if no winning checkin found
  let N = 10;
  let checkins: any[] = [];
  let allCheckinDamages: CheckinDamageData[] = [];
  let allCheckinDamagesError: any = null;
  let winningCheckinId: string | null = null;
  let winningCheckinData: any = null;
  let handledDamages: CheckinDamageData[] = [];
  
  for (const attemptN of [10, 30]) {
    N = attemptN;
    
    const checkinsResponse = await supabaseAdmin
      .from('checkins')
      .select('id, current_station, checker_name, completed_at')
      .eq('regnr', cleanedRegnr)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })
      .limit(N);
    
    checkins = checkinsResponse.data || [];
    const checkinIds = checkins.map(c => c.id);
    
    // Step 3: Fetch all checkin_damages for these checkin IDs
    // Order by created_at ASC (grouping by checkin_id happens in JS)
    const allCheckinDamagesResponse = checkinIds.length > 0
      ? await supabaseAdmin
          .from('checkin_damages')
          .select('type, damage_type, car_part, position, description, photo_urls, video_urls, created_at, checkin_id')
          .in('checkin_id', checkinIds)
          .in('type', ['not_found', 'existing', 'documented'])
          .order('created_at', { ascending: true }) // Sorted for stable index matching
      : { data: [], error: null };
    
    allCheckinDamages = (allCheckinDamagesResponse.data || []) as CheckinDamageData[];
    allCheckinDamagesError = allCheckinDamagesResponse.error;
    
    // Step 4: Find "winning checkin" - most recent checkin where handledCount >= L
    for (const checkin of checkins) {
      const checkinHandledDamages = allCheckinDamages.filter(d => d.checkin_id === checkin.id);
      const handledCount = checkinHandledDamages.length;
      
      if (handledCount >= L) {
        winningCheckinId = checkin.id;
        winningCheckinData = checkin;
        handledDamages = checkinHandledDamages;
        break; // Found the most recent checkin with sufficient handled damages
      }
    }
    
    // If we found a winning checkin, no need to try larger N
    if (winningCheckinId) {
      break;
    }
  }
  
  // Step 5: Fallback if no winning checkin found
  if (!winningCheckinId && checkins.length > 0) {
    // Use the most recent checkin even if handledCount < L
    const latestCheckin = checkins[0];
    winningCheckinId = latestCheckin.id;
    winningCheckinData = latestCheckin;
    handledDamages = allCheckinDamages.filter(d => d.checkin_id === latestCheckin.id);
    
    // Log warning for data integrity issue
    console.warn(`[getVehicleInfoServer] No winning checkin found for ${cleanedRegnr}`, {
      L,
      N,
      checkinsFound: checkins.length,
      perCheckinCounts: checkins.map(c => ({
        id: c.id,
        completed_at: c.completed_at,
        handledCount: allCheckinDamages.filter(d => d.checkin_id === c.id).length
      }))
    });
  }
  
  const lastCheckinData = winningCheckinData;
  const lastCheckinId = winningCheckinId;
  
  const lastCheckinDate = lastCheckinData?.completed_at ? new Date(lastCheckinData.completed_at) : null;
  
  // Build handled damages list
  type HandledDamageInfo = {
    type: 'existing' | 'not_found' | 'documented';
    damage_type: string;
    car_part: string | null;
    position: string | null;
    description: string;
    checker: string;
    photo_urls: string[];
    video_urls: string[];
  };
  const handledDamagesList: HandledDamageInfo[] = [];
  
  const checkerName = lastCheckinData?.checker_name || 'Okänd';
  
  for (const handled of handledDamages) {
    if (handled.type === 'existing' || handled.type === 'not_found' || handled.type === 'documented') {
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
  
  // Helper function to normalize keys for consistent matching (trim + collapse whitespace)
  function normalizeKey(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }
  
  // Create inventoried map with normalized keys
  const inventoriedMap = new Map<string, string>();
  if (inventoriedDamagesResponse.data) {
    for (const inv of inventoriedDamagesResponse.data) {
      if (inv.legacy_damage_source_text) {
        let newText: string;
        
        if (inv.user_type) {
          const formattedType = formatDamageType(inv.user_type);
          const positions = (inv.user_positions as any[] || [])
            .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
            .filter(Boolean)
            .join(', ');
          newText = positions ? `${formattedType}: ${positions}` : formattedType;
        } else {
          newText = (inv.legacy_damage_source_text || '').split(' (Går ej:')[0].trim();
          if (!newText) {
            newText = 'Dokumenterad skada';
          }
        }
        
        const normalizedKey = normalizeKey(inv.legacy_damage_source_text);
        inventoriedMap.set(normalizedKey, newText);
      }
    }
  }
  
  // Create folder lookup map from dbDamages with normalized keys
  // Maps legacy_damage_source_text -> uploads.folder
  const folderMap = new Map<string, string>();
  for (const dbDamage of dbDamages) {
    if (dbDamage.legacy_damage_source_text && (dbDamage.uploads as any)?.folder) {
      const normalizedKey = normalizeKey(dbDamage.legacy_damage_source_text);
      folderMap.set(normalizedKey, (dbDamage.uploads as any).folder);
    }
  }

  // Consolidate damages
  const consolidatedDamages: ConsolidatedDamage[] = [];
  const dbDamageKeys = new Set<string>();
  
  let handledDamageIndex = 0;
  
  for (let i = 0; i < legacyDamages.length; i++) {
    const leg = legacyDamages[i];
    const originalText = getLegacyDamageText(leg);
    const normalizedKey = normalizeKey(originalText);
    const isInventoried = inventoriedMap.has(normalizedKey);
    const displayText = isInventoried ? inventoriedMap.get(normalizedKey)! : originalText;
    if (displayText) {
      const damageType = leg.damage_type_raw || displayText.split(' - ')[0].trim();
      const normalized = normalizeDamageType(damageType);
      
      let handledInfo: HandledDamageInfo | null = null;
      
      if (handledDamageIndex < handledDamagesList.length) {
        handledInfo = handledDamagesList[handledDamageIndex];
        handledDamageIndex++;
      }
      
      const dedupeKey = `${cleanedRegnr}|${leg.damage_date}|${normalized.typeCode}`;
      dbDamageKeys.add(dedupeKey);
      
      consolidatedDamages.push({
        id: leg.id,
        text: displayText,
        damage_date: leg.damage_date,
        is_inventoried: isInventoried || (handledInfo !== null),
        folder: folderMap.get(normalizedKey) || null,
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
  
  // Add damages from damages table
  for (const dbDamage of dbDamages) {
    if (dbDamage.legacy_damage_source_text) {
      continue;
    }
    
    let displayText: string;
    const damageType = dbDamage.user_type || dbDamage.damage_type_raw;
    if (damageType) {
      const formattedType = formatDamageType(damageType);
      const positions = (dbDamage.user_positions as any[] || [])
        .map(p => `${p.carPart || ''} ${p.position || ''}`.trim())
        .filter(Boolean)
        .join(', ');
      displayText = positions ? `${formattedType}: ${positions}` : formattedType;
    } else {
      displayText = 'Skada';
    }
    
    const damageDate = dbDamage.damage_date || dbDamage.created_at;
    const normalized = normalizeDamageType(damageType);
    const dedupeKey = `${cleanedRegnr}|${damageDate}|${normalized.typeCode}`;
    
    if (dbDamageKeys.has(dedupeKey)) {
      continue;
    }
    dbDamageKeys.add(dedupeKey);
    
    consolidatedDamages.push({
      id: dbDamage.id,
      text: displayText,
      damage_date: damageDate,
      is_inventoried: true,
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

  const lastCheckin = lastCheckinData ? {
    station: lastCheckinData.current_station || 'Okänd station',
    checker_name: lastCheckinData.checker_name || 'Okänd',
    completed_at: lastCheckinData.completed_at || '',
  } : null;

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

// =================================================================
// 5. API ROUTE HANDLER
// =================================================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reg = searchParams.get('reg');

    if (!reg) {
      return NextResponse.json(
        { error: 'Missing registration number parameter' },
        { status: 400 }
      );
    }

    const vehicleInfo = await getVehicleInfoServer(reg);
    
    return NextResponse.json(vehicleInfo);
  } catch (error) {
    console.error('[vehicle-info API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vehicle information' },
      { status: 500 }
    );
  }
}
