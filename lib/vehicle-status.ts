import { supabase } from './supabase';
import { normalizeDamageType } from '@/lib/normalizeDamageType';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

export type VehicleStatusData = {
  // Basic vehicle info
  regnr: string;
  bilmarkeModell: string;
  bilenStarNu: string; // ort + station (with datetime if from checkin)
  matarstallning: string;
  hjultyp: string;
  hjulforvaring: string;
  drivmedel: string;
  vaxel: string; // växellåda (automat/manuell)
  serviceintervall: string;
  maxKmManad: string;
  avgiftOverKm: string;
  saludatum: string;
  antalSkador: number;
  stoldGps: string;
  klarForUthyrning: string;
  // Additional detailed fields from nybil_inventering
  planeradStation: string;
  utrustning: string;
  saluinfo: string;
  // Detailed storage info (individual fields)
  hjulForvaringInfo: string;
  reservnyckelInfo: string;
  laddkablarForvaringInfo: string;
  instruktionsbokForvaringInfo: string;
  cocForvaringInfo: string;
  // Equipment details (individual fields)
  antalNycklar: string;
  antalLaddkablar: string;
  antalInsynsskydd: string;
  harInstruktionsbok: string;
  harCoc: string;
  harLasbultar: string;
  harDragkrok: string;
  harGummimattor: string;
  harDackkompressor: string;
  // Detailed sale info fields
  saluStation: string;
  saluKopare: string;
  saluRetur: string;
  saluReturadress: string;
  saluAttention: string;
  saluNotering: string;
  // Fuel filling info
  tankningInfo: string;
  tankstatusVidLeverans: string;
  // General comment
  anteckningar: string;
  // Damages at delivery
  harSkadorVidLeverans: boolean | null;
  // Sale status
  isSold: boolean | null;
};

export type DamageRecord = {
  id: number;
  regnr: string;
  skadetyp: string;
  datum: string;
  status: string;
  folder?: string;
  source: 'legacy' | 'damages' | 'checkin';
  // Source info for display
  sourceInfo?: string; // e.g., "Källa: BUHS" or "Incheckad av Per Andersson 2025-12-03 14:30"
  // For BUHS damages (legacy)
  legacy_damage_source_text?: string | null;
  original_damage_date?: string | null;
};

export type HistoryRecord = {
  id: string;
  datum: string;
  rawTimestamp: string; // ISO string for sorting
  typ: 'incheckning' | 'nybil' | 'manual' | 'buhs_skada';
  sammanfattning: string;
  utfordAv: string;
  plats?: string; // t.ex. "Halmstad / FORD Halmstad"
  
  // Detaljerad info för incheckning
  checkinDetaljer?: {
    platsForIncheckning?: string;  // "Falkenberg / Falkenberg"
    bilenStarNu?: string;          // "Halmstad / FORD Halmstad"
    parkeringsinfo?: string;
    matarstallning?: string;
    hjultyp?: string;
    tankningInfo?: string;         // "Tankad nu av MABI (11L Bensin @ 19 kr/L)" eller "Fulltankad"
    laddningInfo?: string;         // "85% (2 laddkablar)"
    
    // Media links
    mediaLankar?: {
      rekond?: string;
      husdjur?: string;
      rokning?: string;
    };
    
    // Damages registered at this checkin
    skador?: Array<{
      typ: string;
      beskrivning: string;
      mediaUrl?: string;
      isDocumentedOlder?: boolean; // True if this is a documented older BUHS damage
      originalDamageDate?: string; // Original damage date for documented older damages
    }>;
  };
  
  // Detaljerad info för nybil
  nybilDetaljer?: {
    bilmarkeModell?: string;
    mottagenVid?: string;
    matarstallningVidLeverans?: string;
    hjultyp?: string;
    drivmedel?: string;
    planeradStation?: string;
    // Media links for nybil attachments
    mediaLankar?: {
      rekond?: string;
      husdjur?: string;
      rokning?: string;
    };
    // Damages from nybil delivery
    skador?: Array<{
      typ: string;
      beskrivning: string;
      mediaUrl?: string;
    }>;
  };
  
  // Avvikelser för incheckning (från checkins.checklist jsonb)
  avvikelser?: {
    nyaSkador?: number;
    garInteAttHyraUt?: string | null;
    varningslampaPa?: string | null;
    rekondBehov?: {
      invandig: boolean;
      utvandig: boolean;
      kommentar?: string | null;
    } | null;
    husdjurSanering?: string | null;
    rokningSanering?: string | null;
    insynsskyddSaknas?: boolean;
  };
  
  // Avvikelser för nybil (från nybil_inventering)
  nybilAvvikelser?: {
    harSkadorVidLeverans?: boolean;
    ejRedoAttHyrasUt?: boolean;
  };
  
  // BUHS skada detaljer (för typ='buhs_skada')
  buhsSkadaDetaljer?: {
    skadetyp: string;
    legacy_damage_source_text?: string;
  };
};

export type VehicleStatusResult = {
  found: boolean;
  source: 'nybil_inventering' | 'vehicles' | 'both' | 'checkins' | 'buhs' | 'none';
  vehicle: VehicleStatusData | null;
  damages: DamageRecord[];
  history: HistoryRecord[];
  // Nybil reference photos
  nybilPhotos: {
    photoUrls: string[];
    mediaFolder: string | null;
    registreringsdatum: string;
    registreradAv: string;
  } | null;
  // Complete nybil data for modal display
  nybilFullData?: {
    registreringsdatum: string;
    registreradAv: string;
    // Fordon
    regnr: string;
    bilmarkeModell: string;
    mottagenVid: string;
    planeradStation: string;
    // Fordonsstatus
    matarstallningVidLeverans: string;
    hjultypMonterat: string;
    hjulTillForvaring: string;
    drivmedel: string;
    vaxellada: string;
    tankstatusVidLeverans: string;
    // Avtalsvillkor
    serviceintervall: string;
    maxKmManad: string;
    avgiftOverKm: string;
    saludatum: string;
    // Utrustning
    antalNycklar: string;
    antalLaddkablar: string;
    antalInsynsskydd: string;
    harInstruktionsbok: string;
    harCoc: string;
    harLasbultar: string;
    harDragkrok: string;
    harGummimattor: string;
    harDackkompressor: string;
    // Förvaring
    hjulforvaring: string;
    reservnyckelForvaring: string;
    laddkablarForvaring: string;
    // Leveransstatus
    skadorVidLeverans: string;
    klarForUthyrning: string;
    anteckningar: string;
  };
};

// Partial type for nybil_inventering fields we use
type NybilInventeringData = {
  id?: number;
  created_at?: string;
  bilmarke?: string;
  modell?: string;
  bilmodell?: string;
  plats_aktuell_ort?: string;
  plats_aktuell_station?: string;
  plats_mottagning_ort?: string;
  plats_mottagning_station?: string;
  matarstallning_aktuell?: string;
  matarstallning_inkop?: string;
  hjultyp?: string;
  bransletyp?: string;
  vaxel?: string;
  serviceintervall?: string;
  max_km_manad?: string;
  avgift_over_km?: string;
  saludatum?: string;
  stold_gps?: boolean;
  klar_for_uthyrning?: boolean;
  planerad_station?: string;
  antal_nycklar?: number;
  antal_laddkablar?: number;
  antal_insynsskydd?: number;
  instruktionsbok?: boolean;
  coc?: boolean;
  lasbultar_med?: boolean;
  dragkrok?: boolean;
  gummimattor?: boolean;
  dackkompressor?: boolean;
  salu_station?: string;
  kopare_foretag?: string;
  returort?: string;
  returadress?: string;
  attention?: string | null;
  notering_forsaljning?: string | null;
  fullstandigt_namn?: string;
  registrerad_av?: string;
  registreringsdatum?: string;
  photo_urls?: string[];
  media_folder?: string | null;
  // Storage fields
  hjul_forvaring_ort?: string | null;
  hjul_forvaring_spec?: string | null;
  hjul_forvaring?: string | null; // Legacy column name for spec
  extranyckel_forvaring_ort?: string | null;
  extranyckel_forvaring_spec?: string | null;
  laddkablar_forvaring_ort?: string | null;
  laddkablar_forvaring_spec?: string | null;
  instruktionsbok_forvaring_ort?: string | null;
  instruktionsbok_forvaring_spec?: string | null;
  coc_forvaring_ort?: string | null;
  coc_forvaring_spec?: string | null;
  stold_gps_spec?: string | null;
  // Fuel filling info
  upptankning_liter?: number | null;
  upptankning_literpris?: number | null;
  tankstatus?: string | null;
  // General comment
  anteckningar?: string | null;
  // Damages at delivery
  har_skador_vid_leverans?: boolean;
  // Sale status
  is_sold?: boolean | null;
};

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '---';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '---';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const datePart = date.toISOString().split('T')[0];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${datePart} kl ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

function formatDateForFolder(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0].replace(/-/g, '');
  } catch {
    return '';
  }
}

// Helper to build media URL for a damage based on its folder
function buildDamageMediaUrl(folder: string | undefined): string | undefined {
  if (!folder) return undefined;
  return `/media/${folder}`;
}

// Helper to create a damage key for matching BUHS damages
function createBuhsDamageKey(regnr: string, legacySourceText: string | null | undefined): string {
  return `${regnr}-${legacySourceText || ''}`;
}

// Helper to format damage positions from user_positions array
function formatDamagePositions(userPositions: any[]): string {
  const positions = userPositions.map((pos: any) => {
    const parts: string[] = [];
    if (pos.carPart) parts.push(pos.carPart);
    if (pos.position) parts.push(pos.position);
    return parts.join(' - ');
  }).filter(Boolean);
  return positions.join(', ');
}

function getFirstNameFromEmail(email: string): string {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const firstName = namePart.split('.')[0];
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

function getFullNameFromEmail(email: string): string {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  if (parts.length >= 2) {
    const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const lastName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    return `${firstName} ${lastName}`;
  }
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

/**
 * Build equipment summary from nybil_inventering data
 */
function buildEquipmentSummary(nybilData: NybilInventeringData | null): string {
  if (!nybilData) return '---';
  
  const items: string[] = [];
  
  if (nybilData.antal_nycklar && nybilData.antal_nycklar > 0) items.push(`${nybilData.antal_nycklar} nycklar`);
  if (nybilData.antal_laddkablar && nybilData.antal_laddkablar > 0) items.push(`${nybilData.antal_laddkablar} laddkablar`);
  if (nybilData.antal_insynsskydd && nybilData.antal_insynsskydd > 0) items.push(`${nybilData.antal_insynsskydd} insynsskydd`);
  if (nybilData.instruktionsbok === true) items.push('Instruktionsbok');
  if (nybilData.coc === true) items.push('COC');
  if (nybilData.lasbultar_med === true) items.push('Låsbultar');
  if (nybilData.dragkrok === true) items.push('Dragkrok');
  if (nybilData.gummimattor === true) items.push('Gummimattor');
  if (nybilData.dackkompressor === true) items.push('Däckkompressor');
  
  return items.length > 0 ? items.join(', ') : '---';
}

/**
 * Build equipment storage info from nybil_inventering data
 */
function buildEquipmentStorage(nybilData: NybilInventeringData | null): string {
  if (!nybilData) return '---';
  
  const items: string[] = [];
  
  // Wheel storage
  if (nybilData.hjul_forvaring_ort || nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring) {
    const hjulInfo = [nybilData.hjul_forvaring_ort, nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring].filter(Boolean).join(' - ');
    items.push(`Hjulförvaring: ${hjulInfo}`);
  }
  
  // Extra key storage
  if (nybilData.extranyckel_forvaring_ort || nybilData.extranyckel_forvaring_spec) {
    const nyckelInfo = [nybilData.extranyckel_forvaring_ort, nybilData.extranyckel_forvaring_spec].filter(Boolean).join(' - ');
    items.push(`Reservnyckel: ${nyckelInfo}`);
  }
  
  // Charging cable storage
  if (nybilData.laddkablar_forvaring_ort || nybilData.laddkablar_forvaring_spec) {
    const laddkabelInfo = [nybilData.laddkablar_forvaring_ort, nybilData.laddkablar_forvaring_spec].filter(Boolean).join(' - ');
    items.push(`Laddkablar: ${laddkabelInfo}`);
  }
  
  // Manual storage
  if (nybilData.instruktionsbok_forvaring_ort || nybilData.instruktionsbok_forvaring_spec) {
    const bokInfo = [nybilData.instruktionsbok_forvaring_ort, nybilData.instruktionsbok_forvaring_spec].filter(Boolean).join(' - ');
    items.push(`Instruktionsbok: ${bokInfo}`);
  }
  
  // COC storage
  if (nybilData.coc_forvaring_ort || nybilData.coc_forvaring_spec) {
    const cocInfo = [nybilData.coc_forvaring_ort, nybilData.coc_forvaring_spec].filter(Boolean).join(' - ');
    items.push(`COC-dokument: ${cocInfo}`);
  }
  
  return items.length > 0 ? items.join(' | ') : '---';
}

/**
 * Build sale info summary from nybil_inventering data
 */
function buildSaleInfo(nybilData: NybilInventeringData | null): string {
  if (!nybilData) return '---';
  
  const items: string[] = [];
  
  if (nybilData.saludatum) {
    items.push(`Saludatum: ${formatDate(nybilData.saludatum)}`);
  }
  if (nybilData.salu_station) {
    items.push(`Station: ${nybilData.salu_station}`);
  }
  if (nybilData.kopare_foretag) {
    items.push(`Köpare: ${nybilData.kopare_foretag}`);
  }
  if (nybilData.returort || nybilData.returadress) {
    const returInfo = [nybilData.returort, nybilData.returadress].filter(Boolean).join(', ');
    items.push(`Retur: ${returInfo}`);
  }
  
  return items.length > 0 ? items.join(' | ') : '---';
}

/**
 * Build fuel filling info from nybil_inventering data
 */
function buildFuelFillingInfo(nybilData: NybilInventeringData | null): string {
  if (!nybilData) return '---';
  
  const items: string[] = [];
  
  if (nybilData.upptankning_liter && nybilData.upptankning_literpris) {
    items.push(`${nybilData.upptankning_liter} liter à ${nybilData.upptankning_literpris} kr/liter`);
  } else if (nybilData.upptankning_liter) {
    items.push(`${nybilData.upptankning_liter} liter`);
  }
  
  return items.length > 0 ? items.join(' | ') : '---';
}

/**
 * Build tankstatus display from nybil_inventering data
 */
function buildTankstatusDisplay(nybilData: NybilInventeringData | null): string {
  if (!nybilData || !nybilData.tankstatus) return '---';
  
  switch (nybilData.tankstatus) {
    case 'mottogs_fulltankad':
      return 'Mottogs fulltankad';
    case 'tankad_nu':
      if (nybilData.upptankning_liter && nybilData.upptankning_literpris) {
        return `MABI tankade upp ${nybilData.upptankning_liter} liter (${nybilData.upptankning_literpris} kr/l)`;
      }
      return 'MABI tankade upp';
    case 'ej_upptankad':
      return 'Levererades ej fulltankad';
    default:
      return '---';
  }
}

// Raw damage data from the legacy source (BUHS)
type LegacyDamage = {
  id: number;
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  saludatum: string | null;
  damage_date: string | null;
};

// Type for checkin_damages data
type CheckinDamageData = {
  id: number;
  checkin_id: string;
  type: 'existing' | 'not_found' | 'documented' | 'new';
  damage_type: string | null;
  car_part: string | null;
  position: string | null; // Position on car part, e.g., "Fram", "Bak", "Höger"
  description: string | null; // Optional comment from checker about the damage
  photo_urls: string[] | null; // Array of photo URLs, or null if no photos
  video_urls: string[] | null; // Array of video URLs, or null if no videos
  positions: any[] | null; // Array of position objects with carPart and position fields
  created_at: string;
  regnr: string | null; // Can be NULL for not_found damages (e.g., when damage couldn't be located on vehicle)
};

// Helper to format damage type from UPPERCASE_WITH_UNDERSCORES to Title Case
function formatDamageType(damageType: string): string {
  return damageType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper to combine the raw text fields from a legacy damage object (same as /check)
function getLegacyDamageText(damage: LegacyDamage): string {
  const parts = [
    damage.damage_type_raw,
    damage.note_customer,
    damage.note_internal,
  ].filter((p): p is string => typeof p === 'string' && p.trim() !== '' && p.trim() !== '-');
  const uniqueParts = [...new Set(parts)];
  return uniqueParts.join(' - ');
}

// Format model as "Brand Model" or "Brand -" if model is missing (same as /check)
function formatModel(brand: string | null, model: string | null): string {
  const cleanBrand = brand?.trim();
  const cleanModel = model?.trim();
  if (cleanBrand && cleanModel) return `${cleanBrand} ${cleanModel}`;
  if (cleanBrand) return `${cleanBrand} -`;
  if (cleanModel) return `- ${cleanModel}`;
  return '---';
}

// Detect if rekond is invandig/utvandig from folder name
function detectRekondTypes(folder: string | null): { invandig: boolean; utvandig: boolean } {
  if (!folder) return { invandig: false, utvandig: false };
  const folderUpper = folder.toUpperCase();
  return {
    invandig: folderUpper.includes('INVANDIG') || folderUpper.includes('INVÄNDIG'),
    utvandig: folderUpper.includes('UTVANDIG') || folderUpper.includes('UTVÄNDIG'),
  };
}

/**
 * Build tankning info string from checkin data
 * Format: "Tankad nu av MABI (11L Bensin @ 19 kr/L)" eller "Fulltankad"
 */
function buildTankningInfo(checkin: any): string | undefined {
  if (!checkin.fuel_type && !checkin.fuel_level) return undefined;
  
  // Check fuel_level first
  if (checkin.fuel_level === 'återlämnades_fulltankad') {
    return 'Fulltankad';
  }
  
  if (checkin.fuel_level === 'ej_upptankad') {
    return 'Ej upptankad';
  }
  
  // If tankad_nu or we have liters and price, build full string
  if (checkin.fuel_liters && checkin.fuel_price_per_liter && checkin.fuel_type) {
    return `Tankad nu av MABI (${checkin.fuel_liters}L ${checkin.fuel_type} @ ${checkin.fuel_price_per_liter} kr/L)`;
  }
  
  // If we have liters but no price
  if (checkin.fuel_liters && checkin.fuel_type) {
    return `Tankad nu av MABI (${checkin.fuel_liters}L ${checkin.fuel_type})`;
  }
  
  // Otherwise just indicate fuel type if available
  if (checkin.fuel_type) {
    return `${checkin.fuel_type}`;
  }
  
  return undefined;
}

/**
 * Build laddning info string from checkin data
 * Format: "85% (2 laddkablar)"
 */
function buildLaddningInfo(checkin: any): string | undefined {
  if (checkin.charge_level_percent == null) return undefined;
  
  const parts: string[] = [`${checkin.charge_level_percent}%`];
  
  // Only include cable count if it's a positive number
  if (checkin.charge_cables_count && checkin.charge_cables_count > 0) {
    parts.push(`(${checkin.charge_cables_count} laddkablar)`);
  }
  
  return parts.join(' ');
}

/**
 * Helper function to build vehicle data from checkin records.
 * Extracted to avoid TDZ (Temporal Dead Zone) issues in minified code.
 */
function buildVehicleFromCheckins(
  cleanedRegnr: string,
  latestCheckin: any | null,
  legacySaludatum: string | null
): VehicleStatusData {
  return {
    regnr: cleanedRegnr,
    
    // Bilmärke & Modell: from checkins.car_model if available
    bilmarkeModell: latestCheckin?.car_model || '---',
    
    // Senast incheckad vid: from latest checkin with datetime and checker
    bilenStarNu: latestCheckin?.current_city && latestCheckin?.current_station && (latestCheckin?.completed_at || latestCheckin?.created_at)
      ? `${latestCheckin.current_city} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || 'Okänd'})`
      : latestCheckin?.current_city && latestCheckin?.current_station
        ? `${latestCheckin.current_city} / ${latestCheckin.current_station}`
        : '---',
    
    // Mätarställning: from latest checkin
    matarstallning: latestCheckin?.odometer_km
      ? `${latestCheckin.odometer_km} km`
      : '---',
    
    // Däck som sitter på: from latest checkin
    hjultyp: latestCheckin?.hjultyp || '---',
    
    // Hjulförvaring: not available from checkins
    hjulforvaring: '---',
    
    // Drivmedel: not available from checkins
    drivmedel: '---',
    
    // Växellåda: not available from checkins
    vaxel: '---',
    
    // Serviceintervall: not available from checkins
    serviceintervall: '---',
    
    // Max km/månad: not available from checkins
    maxKmManad: '---',
    
    // Avgift över-km: not available from checkins
    avgiftOverKm: '---',
    
    // Saludatum: from legacy damages if available
    saludatum: legacySaludatum
      ? formatDate(legacySaludatum)
      : '---',
    
    // Antal registrerade skador: will be updated after building damageRecords
    antalSkador: 0,
    
    // Stöld-GPS monterad: not available from checkins
    stoldGps: '---',
    
    // Klar för uthyrning: not available from checkins
    klarForUthyrning: '---',
    
    // Additional detailed fields: not available from checkins
    planeradStation: '---',
    utrustning: '---',
    saluinfo: '---',
    hjulForvaringInfo: '---',
    reservnyckelInfo: '---',
    laddkablarForvaringInfo: '---',
    instruktionsbokForvaringInfo: '---',
    cocForvaringInfo: '---',
    antalNycklar: '---',
    antalLaddkablar: '---',
    antalInsynsskydd: '---',
    harInstruktionsbok: '---',
    harCoc: '---',
    harLasbultar: '---',
    harDragkrok: '---',
    harGummimattor: '---',
    harDackkompressor: '---',
    saluStation: '---',
    saluKopare: '---',
    saluRetur: '---',
    saluReturadress: '---',
    saluAttention: '---',
    saluNotering: '---',
    tankningInfo: '---',
    tankstatusVidLeverans: '---',
    anteckningar: '---',
    harSkadorVidLeverans: null,
    isSold: null,
  };
}

// =================================================================
// 3. MAIN DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleStatus(regnr: string): Promise<VehicleStatusResult> {
  const cleanedRegnr = regnr.toUpperCase().trim().replace(/\s/g, '');
  
  // Stage tracking for debugging
  let stage = 'init';
  
  // Store fetched data for graceful degradation in catch block
  let legacyDamagesResponse: any = null;
  let checkinsResponse: any = null;
  
  // Wrap entire function in try-catch to prevent any crashes
  try {
    stage = 'validate_input';
    if (!cleanedRegnr || cleanedRegnr.length < 5) {
      return {
        found: false,
        source: 'none',
        vehicle: null,
        damages: [],
        history: [],
        nybilPhotos: null,
      };
    }

    stage = 'fetch_data';
    // Fetch data from all sources concurrently
    const [nybilResponse, vehicleResponse, damagesResponse, legacyDamagesResponseTemp, checkinsResponseTemp] = await Promise.all([
      // nybil_inventering - newest first
      supabase
        .from('nybil_inventering')
        .select('*')
        .ilike('regnr', cleanedRegnr)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // vehicles (Bilkontroll-filen) - use RPC for trimmed search
      supabase
        .rpc('get_vehicle_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
      
      // damages (from our damages table)
      supabase
        .from('damages')
        .select('*')
        .eq('regnr', cleanedRegnr)
        .order('created_at', { ascending: false }),
      
      // legacy damages (from BUHS via RPC) - includes saludatum
      supabase
        .rpc('get_damages_by_trimmed_regnr', { p_regnr: cleanedRegnr }),
      
      // checkins - order by created_at
      supabase
        .from('checkins')
        .select('*')
        .eq('regnr', cleanedRegnr)
        .order('created_at', { ascending: false }),
    ]);

    // Store for graceful degradation
    legacyDamagesResponse = legacyDamagesResponseTemp;
    checkinsResponse = checkinsResponseTemp;
    
    stage = 'extract_data:start';
    const nybilData = nybilResponse.data;
    
    stage = 'extract_data:vehicle';
    const vehicleData = vehicleResponse.data?.[0] || null;
    
    stage = 'extract_data:damages';
    const damages = damagesResponse.data || [];
    
    stage = 'extract_data:legacy_damages';
    const legacyDamages = legacyDamagesResponse.data || [];
    
    stage = 'extract_data:checkins';
    const checkins = checkinsResponse.data || [];
    
    stage = 'extract_data:debug_log';
    // Debug logging to help diagnose preview issues
    console.log('getVehicleStatus debug', {
      regnr: cleanedRegnr,
      stage,
      legacyDamagesCount: legacyDamagesResponse.data?.length ?? null,
      legacyDamagesError: legacyDamagesResponse.error ?? null,
      checkinsCount: checkinsResponse.data?.length ?? null,
      vehicleCount: vehicleResponse.data?.length ?? null,
    });
    
    stage = 'fetch_checkin_damages:start';
    // Fetch checkin_damages for all checkins
    // Note: We must fetch via checkin_id because checkin_damages.regnr can be NULL
    // (e.g., for type='not_found' damages like NGE97D where regnr is NULL)
    stage = 'fetch_checkin_damages:extract_ids';
    const checkinIds = checkins.map(c => c.id).filter(Boolean);
    
    stage = 'fetch_checkin_damages:query';
    const checkinDamagesResponse = checkinIds.length > 0
      ? await supabase
          .from('checkin_damages')
          .select('*')
          .in('checkin_id', checkinIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null };
    
    stage = 'fetch_checkin_damages:extract';
    const checkinDamages = checkinDamagesResponse.data || [];
  
    stage = 'determine_source:start';
    // Get saludatum from legacy damages if available
    const legacySaludatum = legacyDamages.length > 0 ? legacyDamages[0]?.saludatum : null;

    stage = 'determine_source:logic';
    // Determine source
    let source: 'nybil_inventering' | 'vehicles' | 'both' | 'checkins' | 'buhs' | 'none' = 'none';
    if (nybilData && vehicleData) source = 'both';
    else if (nybilData) source = 'nybil_inventering';
    else if (vehicleData) source = 'vehicles';
    else if (checkins.length > 0) source = 'checkins';
    else if (legacyDamages.length > 0) source = 'buhs'; // BUHS damages exist

    stage = 'determine_source:check_none';
    if (source === 'none') {
      return {
        found: false,
        source: 'none',
        vehicle: null,
        damages: [],
        history: [],
        nybilPhotos: null,
      };
    }

    stage = 'get_latest_checkin';
    // Get latest checkin for current location and odometer
    const latestCheckin = checkins[0] || null;

    stage = 'build_vehicle_data:check_source';
    // If source is 'checkins', build a minimal vehicle data from checkin records
    let vehicle: VehicleStatusData | null = null;
    if (source === 'checkins') {
      stage = 'build_vehicle_data:checkins_source';
      // Build vehicle status data from checkin records using helper function
      // Wrapped in try-catch to prevent TDZ issues in minified code
      try {
        vehicle = buildVehicleFromCheckins(cleanedRegnr, latestCheckin, legacySaludatum);
      } catch (err) {
        console.error('buildVehicleFromCheckins failed', { regnr: cleanedRegnr, err });
        // Fall back - let source handling continue below
        stage = 'build_vehicle_data:checkins_source:fallback';
      }
    }
    
    // Only continue with checkins-specific damage/history building if vehicle was successfully built
    if (source === 'checkins' && vehicle !== null) {

    // Build damage records from legacy damages (BUHS)
    // Note: Since source is 'checkins', the vehicle has never been checked in
    const damageRecords: DamageRecord[] = legacyDamages.map((d: LegacyDamage) => ({
      id: d.id,
      regnr: cleanedRegnr,
      skadetyp: getLegacyDamageText(d) || 'Okänd',
      datum: formatDate(d.damage_date),
      status: 'Befintlig',
      source: 'legacy' as const,
      sourceInfo: 'Källa: BUHS\nReg. nr har aldrig checkats in med incheckad.se/check',
    }));

    // Add damages from damages table (new damages from checkins)
    for (const damage of damages) {
      let skadetyp: string;
      if (damage.damage_type_raw) {
        skadetyp = damage.damage_type_raw;
      } else if (damage.damage_type) {
        skadetyp = formatDamageType(damage.damage_type);
      } else {
        skadetyp = 'Okänd';
      }
      
      // Add position info if user_positions exists
      if (damage.user_positions && Array.isArray(damage.user_positions) && damage.user_positions.length > 0) {
        const positionsStr = formatDamagePositions(damage.user_positions);
        if (positionsStr) {
          skadetyp = `${skadetyp} - ${positionsStr}`;
        }
      }
      
      // Add description if available
      if (damage.description) {
        skadetyp = `${skadetyp}: ${damage.description}`;
      }
      
      const sourceInfo = damage.inchecker_name 
        ? `Registrerad vid incheckning av ${damage.inchecker_name}`
        : 'Registrerad vid incheckning';
      
      damageRecords.push({
        id: damage.id,
        regnr: cleanedRegnr,
        skadetyp: skadetyp,
        datum: formatDate(damage.damage_date || damage.created_at),
        status: damage.status || 'Ny',
        folder: damage.uploads?.folder || undefined,
        source: 'damages' as const,
        sourceInfo: sourceInfo,
      });
    }

    // Build history records from checkins only (with avvikelser)
    const historyRecords: HistoryRecord[] = [];
    const damagesShownInCheckins = new Set<number>(); // Track damage IDs shown in checkins
    
    // Build damage counts for checkins from already-fetched checkin_damages
    const damageCounts = new Map<string, number>();
    for (const cd of checkinDamages) {
      if (cd.type === 'new') {
        const count = damageCounts.get(cd.checkin_id) || 0;
        damageCounts.set(cd.checkin_id, count + 1);
      }
    }
    
    for (const checkin of checkins) {
      const checklist = checkin.checklist || {};
      const rekondTypes = detectRekondTypes(checklist.rekond_folder);
      
      // Get damage count from pre-fetched map
      const damageCount = checkin.has_new_damages ? (damageCounts.get(checkin.id) || 0) : 0;
      
      // Build plats string
      const plats = checkin.current_city && checkin.current_station
        ? `${checkin.current_city} / ${checkin.current_station}`
        : undefined;
      
      // Build plats för incheckning
      const platsForIncheckning = checkin.city && checkin.station
        ? `${checkin.city} / ${checkin.station}`
        : undefined;
      
      // Build bilen står nu
      const bilenStarNu = checkin.current_city && checkin.current_station
        ? `${checkin.current_city} / ${checkin.current_station}`
        : undefined;
      
      // Build media links based on checklist folders
      const mediaLankar: any = {};
      if (checklist.rekond_folder) {
        mediaLankar.rekond = `/media/${checklist.rekond_folder}`;
      }
      if (checklist.pet_sanitation_folder) {
        mediaLankar.husdjur = `/media/${checklist.pet_sanitation_folder}`;
      }
      if (checklist.smoking_sanitation_folder) {
        mediaLankar.rokning = `/media/${checklist.smoking_sanitation_folder}`;
      }
      
      // Get checkin_damages for this specific checkin
      const thisCheckinDamages = checkinDamagesMap.get(checkin.id) || [];
      
      // Build skador array from checkin_damages (not from damageRecords!)
      // This ensures we show ALL damages handled in this checkin, including not_found ones
      const skador: Array<{
        typ: string;
        beskrivning: string;
        mediaUrl?: string;
        isDocumentedOlder?: boolean;
        originalDamageDate?: string;
      }> = [];
      
      for (const cd of thisCheckinDamages) {
        // Skip 'new' damages - those are already tracked in avvikelser.nyaSkador
        if (cd.type === 'new') continue;
        
        let typ = '';
        let beskrivning = '';
        let mediaUrl: string | undefined = undefined;
        
        if (cd.type === 'documented' || cd.type === 'existing') {
          // Build structured text using positions array if available
          const parts: string[] = [];
          
          if (cd.positions && Array.isArray(cd.positions) && cd.positions.length > 0) {
            // Format positions from array
            const positionsStr = cd.positions.map((pos: any) => {
              const posParts: string[] = [];
              if (pos.carPart) posParts.push(pos.carPart);
              if (pos.position) posParts.push(pos.position);
              return posParts.join(' - ');
            }).filter(Boolean).join(', ');
            
            if (cd.damage_type) parts.push(cd.damage_type);
            if (positionsStr) parts.push(positionsStr);
          } else {
            // Fall back to car_part/position
            if (cd.damage_type) parts.push(cd.damage_type);
            if (cd.car_part) parts.push(cd.car_part);
            if (cd.position) parts.push(cd.position);
          }
          
          typ = parts.length > 0 ? parts.join(' - ') : 'Dokumenterad skada';
          beskrivning = cd.description || '';
          
          // Extract media URL from Supabase Storage format
          if (cd.photo_urls && cd.photo_urls.length > 0) {
            const firstPhotoUrl = cd.photo_urls[0];
            // Remove query string if present
            const urlWithoutQuery = firstPhotoUrl.split('?')[0];
            
            // Try to extract from damage-photos path
            const damagePhotosIndex = urlWithoutQuery.indexOf('/damage-photos/');
            if (damagePhotosIndex !== -1) {
              // Get everything after /damage-photos/
              const afterDamagePhotos = urlWithoutQuery.substring(damagePhotosIndex + '/damage-photos/'.length);
              // Remove the filename (everything after the last /)
              const lastSlashIndex = afterDamagePhotos.lastIndexOf('/');
              if (lastSlashIndex !== -1) {
                const folder = afterDamagePhotos.substring(0, lastSlashIndex);
                mediaUrl = `/media/${folder}`;
                // Also add to mediaLankar
                const damageMediaKey = `skada-cd-${cd.id}`;
                if (!mediaLankar[damageMediaKey]) {
                  mediaLankar[damageMediaKey] = mediaUrl;
                }
              }
            } else {
              // Fallback: try old /media/ pattern
              const mediaMatch = urlWithoutQuery.match(/\/media\/([^\/]+)\//);
              if (mediaMatch) {
                mediaUrl = `/media/${mediaMatch[1]}`;
                const damageMediaKey = `skada-cd-${cd.id}`;
                if (!mediaLankar[damageMediaKey]) {
                  mediaLankar[damageMediaKey] = mediaUrl;
                }
              }
            }
          }
          
          skador.push({
            typ,
            beskrivning,
            mediaUrl,
            isDocumentedOlder: cd.type === 'documented' || cd.type === 'existing',
            originalDamageDate: undefined, // Will be set below if we find the BUHS damage
          });
          
        } else if (cd.type === 'not_found') {
          // Build "not found" text
          typ = cd.damage_type || 'Skada';
          beskrivning = `Gick ej att dokumentera${cd.description ? `: "${cd.description}"` : ''}`;
          
          skador.push({
            typ,
            beskrivning,
            mediaUrl: undefined,
            isDocumentedOlder: false,
          });
        }
      }
      
      // Track which damage IDs are shown in this checkin (for later filtering)
      thisCheckinDamages.forEach(cd => {
        // Find corresponding damage in damageRecords and mark it as shown
        const correspondingDamage = damageRecords.find(dr => {
          if (dr.source !== 'legacy') return false;
          // Try to match by type
          const drNormalized = normalizeDamageType(dr.legacy_damage_source_text || dr.skadetyp);
          const cdNormalized = normalizeDamageType(cd.damage_type);
          return drNormalized.typeCode === cdNormalized.typeCode;
        });
        if (correspondingDamage) {
          damagesShownInCheckins.add(correspondingDamage.id);
        }
      });
      
      historyRecords.push({
        id: `checkin-${checkin.id}`,
        datum: formatDateTime(checkin.completed_at || checkin.created_at),
        rawTimestamp: checkin.completed_at || checkin.created_at || '',
        typ: 'incheckning' as const,
        sammanfattning: `Incheckad vid ${checkin.current_city || '?'} / ${checkin.current_station || '?'}. Mätarställning: ${checkin.odometer_km || '?'} km`,
        utfordAv: checkin.checker_name || getFullNameFromEmail(checkin.checker_email || ''),
        plats,
        checkinDetaljer: {
          platsForIncheckning,
          bilenStarNu,
          parkeringsinfo: checkin.current_location_note || undefined,
          matarstallning: checkin.odometer_km ? `${checkin.odometer_km} km` : undefined,
          hjultyp: checkin.hjultyp || undefined,
          tankningInfo: buildTankningInfo(checkin),
          laddningInfo: buildLaddningInfo(checkin),
          mediaLankar: Object.keys(mediaLankar).length > 0 ? mediaLankar : undefined,
          skador: skador.length > 0 ? skador : undefined,
        },
        avvikelser: {
          nyaSkador: damageCount,
          garInteAttHyraUt: checklist.rental_unavailable ? (checklist.rental_unavailable_comment || 'Ja') : null,
          varningslampaPa: checklist.warning_light_on ? (checklist.warning_light_comment || 'Ja') : null,
          rekondBehov: checkin.rekond_behov ? {
            invandig: rekondTypes.invandig,
            utvandig: rekondTypes.utvandig,
            kommentar: checklist.rekond_comment || null,
          } : null,
          husdjurSanering: checklist.pet_sanitation_needed ? (checklist.pet_sanitation_comment || 'Ja') : null,
          rokningSanering: checklist.smoking_sanitation_needed ? (checklist.smoking_sanitation_comment || 'Ja') : null,
          insynsskyddSaknas: checklist.privacy_cover_missing || false,
        },
      });
    }

    // Add BUHS damage history events
    // Create a separate history event for each BUHS damage (source='legacy')
    // that wasn't shown in any checkin (already tracked in damagesShownInCheckins set)
    for (const damage of damageRecords) {
      if (damage.source === 'legacy' && !damagesShownInCheckins.has(damage.id)) {
        historyRecords.push({
          id: `buhs-${damage.id}`,
          datum: damage.datum,
          rawTimestamp: damage.datum || '',
          typ: 'buhs_skada',
          sammanfattning: 'Ej dokumenterad i Incheckad',
          utfordAv: 'System (BUHS)',
          buhsSkadaDetaljer: {
            skadetyp: damage.skadetyp,
            legacy_damage_source_text: damage.legacy_damage_source_text,
          },
        });
      }
    }
    
    // Sort history by rawTimestamp (newest first)
    historyRecords.sort((a, b) => {
      const dateA = new Date(a.rawTimestamp);
      const dateB = new Date(b.rawTimestamp);
      return dateB.getTime() - dateA.getTime();
    });

    // Update the vehicle's damage count to reflect the actual list
    vehicle.antalSkador = damageRecords.length;

    return {
      found: true,
      source,
      vehicle,
      damages: damageRecords,
      history: historyRecords,
      nybilPhotos: null, // No nybil photos when source is 'checkins' only
    };
  }

    stage = 'build_vehicle_data:buhs_check';
    // If source is 'buhs' and vehicle not already built, build minimal vehicle data from BUHS damages only
    if (source === 'buhs' && vehicle === null) {
      stage = 'build_vehicle_data:buhs_source';
      // Build minimal vehicle status data - only BUHS damages available
      vehicle = {
      regnr: cleanedRegnr,
      bilmarkeModell: '---',
      bilenStarNu: '---',
      matarstallning: '---',
      hjultyp: '---',
      hjulforvaring: '---',
      drivmedel: '---',
      vaxel: '---',
      serviceintervall: '---',
      maxKmManad: '---',
      avgiftOverKm: '---',
      saludatum: legacySaludatum ? formatDate(legacySaludatum) : '---',
      antalSkador: 0, // Will be updated after building damageRecords
      stoldGps: '---',
      klarForUthyrning: '---',
      planeradStation: '---',
      utrustning: '---',
      saluinfo: '---',
      hjulForvaringInfo: '---',
      reservnyckelInfo: '---',
      laddkablarForvaringInfo: '---',
      instruktionsbokForvaringInfo: '---',
      cocForvaringInfo: '---',
      antalNycklar: '---',
      antalLaddkablar: '---',
      antalInsynsskydd: '---',
      harInstruktionsbok: '---',
      harCoc: '---',
      harLasbultar: '---',
      harDragkrok: '---',
      harGummimattor: '---',
      harDackkompressor: '---',
      saluStation: '---',
      saluKopare: '---',
      saluRetur: '---',
      saluReturadress: '---',
      saluAttention: '---',
      saluNotering: '---',
      tankningInfo: '---',
      tankstatusVidLeverans: '---',
      anteckningar: '---',
      harSkadorVidLeverans: null,
      isSold: null,
    };

    // Build damage records from BUHS only (no checkin matching needed since there are no checkins)
    const damageRecords: DamageRecord[] = legacyDamages.map((d: LegacyDamage) => ({
      id: d.id,
      regnr: cleanedRegnr,
      skadetyp: getLegacyDamageText(d) || 'Okänd',
      datum: formatDate(d.damage_date),
      status: 'Befintlig',
      source: 'legacy' as const,
      sourceInfo: 'Källa: BUHS\nReg. nr har aldrig checkats in med incheckad.se/check',
    }));

    // Build history with BUHS events only
    const historyRecords: HistoryRecord[] = damageRecords.map(damage => ({
      id: `buhs-${damage.id}`,
      datum: damage.datum,
      rawTimestamp: damage.datum || '',
      typ: 'buhs_skada' as const,
      sammanfattning: 'Ej dokumenterad i Incheckad',
      utfordAv: 'System (BUHS)',
      buhsSkadaDetaljer: {
        skadetyp: damage.skadetyp,
        legacy_damage_source_text: damage.skadetyp,
      },
    }));

    // Sort history by rawTimestamp (newest first)
    historyRecords.sort((a, b) => {
      const dateA = new Date(a.rawTimestamp);
      const dateB = new Date(b.rawTimestamp);
      return dateB.getTime() - dateA.getTime();
    });

    // Update the vehicle's damage count
    vehicle.antalSkador = damageRecords.length;

    return {
      found: true,
      source,
      vehicle,
      damages: damageRecords,
      history: historyRecords,
      nybilPhotos: null,
    };
  }

    stage = 'build_vehicle_data:standard';
    // Build vehicle status data using priority order (if not already built)
    if (vehicle === null) {
      vehicle = {
    regnr: cleanedRegnr,
    
    // Bilmärke & Modell: nybil_inventering → vehicles (using formatModel for consistent display)
    bilmarkeModell: nybilData?.bilmarke || nybilData?.modell
      ? formatModel(nybilData?.bilmarke ?? null, nybilData?.modell ?? null)
      : nybilData?.bilmodell
        ? nybilData.bilmodell
        : vehicleData
          ? formatModel(vehicleData.brand, vehicleData.model)
          : '---',
    
    // Senast incheckad: checkins with datetime and user → nybil_inventering.plats_aktuell_station
    bilenStarNu: latestCheckin?.current_ort && latestCheckin?.current_station && (latestCheckin?.completed_at || latestCheckin?.created_at)
      ? `${latestCheckin.current_ort} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || getFullNameFromEmail(latestCheckin.user_email || latestCheckin.incheckare || 'Okänd')})`
      : latestCheckin?.current_ort && latestCheckin?.current_station
        ? `${latestCheckin.current_ort} / ${latestCheckin.current_station}`
        : nybilData?.plats_aktuell_ort && nybilData?.plats_aktuell_station
          ? `${nybilData.plats_aktuell_ort} / ${nybilData.plats_aktuell_station}`
          : '---',
    
    // Mätarställning: checkins.odometer_km (senaste) → nybil_inventering.matarstallning_aktuell
    matarstallning: latestCheckin?.odometer_km
      ? `${latestCheckin.odometer_km} km`
      : nybilData?.matarstallning_aktuell
        ? `${nybilData.matarstallning_aktuell} km`
        : nybilData?.matarstallning_inkop
          ? `${nybilData.matarstallning_inkop} km`
          : '---',
    
    // Däck som sitter på: checkins.hjultyp (senaste) → nybil_inventering.hjultyp
    hjultyp: latestCheckin?.hjultyp || nybilData?.hjultyp || '---',
    
    // Hjulförvaring: nybil_inventering.hjul_forvaring_ort/spec → vehicles.wheel_storage_location
    hjulforvaring: (nybilData?.hjul_forvaring_ort || nybilData?.hjul_forvaring_spec || nybilData?.hjul_forvaring)
      ? [nybilData.hjul_forvaring_ort, nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring].filter(Boolean).join(' - ')
      : vehicleData?.wheel_storage_location || '---',
    
    // Drivmedel: nybil_inventering.bransletyp
    drivmedel: nybilData?.bransletyp || '---',
    
    // Växellåda: nybil_inventering.vaxel
    vaxel: nybilData?.vaxel || '---',
    
    // Serviceintervall: nybil_inventering.serviceintervall
    serviceintervall: nybilData?.serviceintervall
      ? `${nybilData.serviceintervall} km`
      : '---',
    
    // Max km/månad: nybil_inventering.max_km_manad
    maxKmManad: nybilData?.max_km_manad
      ? `${nybilData.max_km_manad} km`
      : '---',
    
    // Avgift över-km: nybil_inventering.avgift_over_km
    avgiftOverKm: nybilData?.avgift_over_km
      ? `${nybilData.avgift_over_km} kr`
      : '---',
    
    // Saludatum: nybil_inventering.saludatum → legacy damages.saludatum (senaste)
    saludatum: nybilData?.saludatum
      ? formatDate(nybilData.saludatum)
      : legacySaludatum
        ? formatDate(legacySaludatum)
        : '---',
    
    // Antal registrerade skador: count legacy damages (BUHS) + nybil delivery damages
    antalSkador: legacyDamages.length + damages.length,
    
    // Stöld-GPS monterad: nybil_inventering.stold_gps with spec
    stoldGps: nybilData?.stold_gps === true
      ? (nybilData.stold_gps_spec ? `Ja (${nybilData.stold_gps_spec})` : 'Ja')
      : nybilData?.stold_gps === false
        ? 'Nej'
        : '---',
    
    // Klar för uthyrning: Check both nybil and if explicitly marked as false
    klarForUthyrning: nybilData?.klar_for_uthyrning === false
      ? 'Nej'
      : nybilData?.klar_for_uthyrning === true
        ? 'Ja'
        : '---',
    
    // Planerad station: from nybil_inventering
    planeradStation: nybilData?.planerad_station || '---',
    
    // Utrustning: summarized from nybil_inventering equipment fields
    utrustning: buildEquipmentSummary(nybilData),
    
    // Saluinfo: summarized from nybil_inventering sale fields
    saluinfo: buildSaleInfo(nybilData),
    
    // Equipment storage info (individual fields for separate rows)
    hjulForvaringInfo: (nybilData?.hjul_forvaring_ort || nybilData?.hjul_forvaring_spec || nybilData?.hjul_forvaring)
      ? [nybilData.hjul_forvaring_ort, nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring].filter(Boolean).join(' - ')
      : '---',
    reservnyckelInfo: (nybilData?.extranyckel_forvaring_ort || nybilData?.extranyckel_forvaring_spec)
      ? [nybilData.extranyckel_forvaring_ort, nybilData.extranyckel_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    laddkablarForvaringInfo: (nybilData?.laddkablar_forvaring_ort || nybilData?.laddkablar_forvaring_spec)
      ? [nybilData.laddkablar_forvaring_ort, nybilData.laddkablar_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    instruktionsbokForvaringInfo: (nybilData?.instruktionsbok_forvaring_ort || nybilData?.instruktionsbok_forvaring_spec)
      ? [nybilData.instruktionsbok_forvaring_ort, nybilData.instruktionsbok_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    cocForvaringInfo: (nybilData?.coc_forvaring_ort || nybilData?.coc_forvaring_spec)
      ? [nybilData.coc_forvaring_ort, nybilData.coc_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    
    // Equipment details (individual fields for separate section)
    antalNycklar: nybilData?.antal_nycklar != null ? `${nybilData.antal_nycklar} st` : '---',
    antalLaddkablar: nybilData?.antal_laddkablar != null ? `${nybilData.antal_laddkablar} st` : '---',
    antalInsynsskydd: nybilData?.antal_insynsskydd != null ? `${nybilData.antal_insynsskydd} st` : '---',
    harInstruktionsbok: nybilData?.instruktionsbok === true ? 'Ja' : nybilData?.instruktionsbok === false ? 'Nej' : '---',
    harCoc: nybilData?.coc === true ? 'Ja' : nybilData?.coc === false ? 'Nej' : '---',
    harLasbultar: nybilData?.lasbultar_med === true ? 'Ja' : nybilData?.lasbultar_med === false ? 'Nej' : '---',
    harDragkrok: nybilData?.dragkrok === true ? 'Ja' : nybilData?.dragkrok === false ? 'Nej' : '---',
    harGummimattor: nybilData?.gummimattor === true ? 'Ja' : nybilData?.gummimattor === false ? 'Nej' : '---',
    harDackkompressor: nybilData?.dackkompressor === true ? 'Ja' : nybilData?.dackkompressor === false ? 'Nej' : '---',
    
    // Detailed sale info fields
    saluStation: nybilData?.salu_station || '---',
    saluKopare: nybilData?.kopare_foretag || '---',
    saluRetur: nybilData?.returort || '---',
    saluReturadress: nybilData?.returadress || '---',
    saluAttention: nybilData?.attention || '---',
    saluNotering: nybilData?.notering_forsaljning || '---',
    
    // Fuel filling info
    tankningInfo: buildFuelFillingInfo(nybilData),
    tankstatusVidLeverans: buildTankstatusDisplay(nybilData),
    
    // General comment
    anteckningar: nybilData?.anteckningar || '---',
    
    // Damages at delivery
    harSkadorVidLeverans: typeof nybilData?.har_skador_vid_leverans === 'boolean'
      ? nybilData.har_skador_vid_leverans
      : null,
    
    // Sale status: nybil_inventering.is_sold → vehicles.is_sold
    // Only use actual boolean values (true/false), not null/undefined
    isSold: typeof nybilData?.is_sold === 'boolean'
      ? nybilData.is_sold 
      : typeof vehicleData?.is_sold === 'boolean'
        ? vehicleData.is_sold 
        : null,
  };
}

  // Safety check: if vehicle is still null after all attempts, create minimal fallback
  if (vehicle === null) {
    console.error('Failed to build vehicle from any source', { regnr: cleanedRegnr, source });
    vehicle = {
      regnr: cleanedRegnr,
      bilmarkeModell: '---',
      bilenStarNu: '---',
      matarstallning: '---',
      hjultyp: '---',
      hjulforvaring: '---',
      drivmedel: '---',
      vaxel: '---',
      serviceintervall: '---',
      maxKmManad: '---',
      avgiftOverKm: '---',
      saludatum: legacySaludatum ? formatDate(legacySaludatum) : '---',
      antalSkador: 0,
      stoldGps: '---',
      klarForUthyrning: '---',
      planeradStation: '---',
      utrustning: '---',
      saluinfo: '---',
      hjulForvaringInfo: '---',
      reservnyckelInfo: '---',
      laddkablarForvaringInfo: '---',
      instruktionsbokForvaringInfo: '---',
      cocForvaringInfo: '---',
      antalNycklar: '---',
      antalLaddkablar: '---',
      antalInsynsskydd: '---',
      harInstruktionsbok: '---',
      harCoc: '---',
      harLasbultar: '---',
      harDragkrok: '---',
      harGummimattor: '---',
      harDackkompressor: '---',
      saluStation: '---',
      saluKopare: '---',
      saluRetur: '---',
      saluReturadress: '---',
      saluAttention: '---',
      saluNotering: '---',
      tankningInfo: '---',
      tankstatusVidLeverans: '---',
      anteckningar: '---',
      harSkadorVidLeverans: null,
      isSold: null,
    };
  }

  // Determine if vehicle has ever been checked in
  const hasBeenCheckedIn = checkins.length > 0;
  
  // Build set of legacy damage keys (regnr + damage_date) from RPC
  // to filter out duplicates in damages table
  const legacyDamageKeys = new Set<string>();
  for (const d of legacyDamages) {
    const key = `${cleanedRegnr}-${formatDate(d.damage_date)}`;
    legacyDamageKeys.add(key);
  }
  
    stage = 'build_checkin_damages_map';
    // Build a map of checkin_damages by checkin_id for easy lookup
    // Group by checkin_id and type to make matching easier
    const checkinDamagesMap = new Map<string, CheckinDamageData[]>();
    for (const cd of checkinDamages) {
      const key = cd.checkin_id;
      if (!checkinDamagesMap.has(key)) {
        checkinDamagesMap.set(key, []);
      }
      checkinDamagesMap.get(key)!.push(cd);
    }
    
    stage = 'buhs_matching_init';
    /**
     * Build a mapping of BUHS damages to their matched checkin_damages.
     * This is done once to avoid N×M performance issues.
     * 
     * Matching strategy:
     * 1. Text-based match: Match BUHS note_customer/note_internal with checkin_damages.description
     *    - Normalize whitespace and compare case-insensitively
     *    - If BUHS text is a substring of checkin description, it's a match
     *    - Only match with type='documented' or type='not_found' checkin_damages
     * 
     * 2. Fallback match: single-damage-of-type strategy
     *    - If no text match found, but there's only ONE BUHS damage of this normalized type on the vehicle,
     *      AND only ONE checkin_damage of this type exists across all checkins,
     *      then match them (this handles cases where descriptions don't align)
     */
    
    // Helper to normalize text for comparison
    function normalizeTextForMatching(text: string | null | undefined): string {
      if (!text) return '';
      return text.toLowerCase().replace(/\s+/g, ' ').trim();
    }
    
    // Initialize maps with empty defaults (will be populated in try-catch)
    let buhsToCheckinMap = new Map<number, CheckinDamageData>();
    let usedCheckinDamageIds = new Set<number>();
    
    stage = 'buhs_matching_execute';
    // Wrap matching logic in try-catch to prevent runtime crashes
    try {
      // Pre-compute normalized types and texts for performance
      const buhsNormalizedData = new Map<number, { typeCode: string; text: string }>();
      for (const buhs of legacyDamages) {
      const normalized = normalizeDamageType(buhs.damage_type_raw);
      // Combine note_customer and note_internal for text matching
      const combinedText = [buhs.note_customer, buhs.note_internal]
        .filter(t => t && t.trim() && t.trim() !== '-')
        .join(' ');
      buhsNormalizedData.set(buhs.id, {
        typeCode: normalized.typeCode,
        text: normalizeTextForMatching(combinedText),
      });
    }
    
    const checkinNormalizedData = new Map<number, { typeCode: string; text: string }>();
    for (const cd of checkinDamages) {
      if (cd.damage_type) {
        const normalized = normalizeDamageType(cd.damage_type);
        checkinNormalizedData.set(cd.id, {
          typeCode: normalized.typeCode,
          text: normalizeTextForMatching(cd.description),
        });
      }
    }
    
    // Build the matching map
    const tempBuhsToCheckinMap = new Map<number, CheckinDamageData>();
    const tempUsedCheckinDamageIds = new Set<number>(); // Track used checkin_damages to prevent double-matching
    
    for (const buhs of legacyDamages) {
      const buhsInfo = buhsNormalizedData.get(buhs.id);
      if (!buhsInfo) continue;
      
      // Primary match: text-based matching with checkin_damages that are documented or not_found
      const relevantCheckinDamages = checkinDamages.filter(cd => 
        (cd.type === 'documented' || cd.type === 'not_found') && !tempUsedCheckinDamageIds.has(cd.id)
      );
      
      // Only match if both texts are non-empty and have minimum length (prevent empty/short string matching)
      if (buhsInfo.text && buhsInfo.text.length >= 6) {
        // Try to find a checkin_damage where BUHS text is substring of description
        const textMatch = relevantCheckinDamages.find(cd => {
          const cdInfo = checkinNormalizedData.get(cd.id);
          if (!cdInfo || !cdInfo.text || cdInfo.text.length < 6) return false; // Skip if checkin text is empty or too short
          // Check if BUHS text is substring of checkin description OR vice versa
          return cdInfo.text.includes(buhsInfo.text) || buhsInfo.text.includes(cdInfo.text);
        });
        
        if (textMatch) {
          tempBuhsToCheckinMap.set(buhs.id, textMatch);
          tempUsedCheckinDamageIds.add(textMatch.id); // Mark this checkin_damage as used
          continue;
        }
      }
      
      // Fallback: single-damage-of-type strategy
      // Count how many BUHS damages have this type
      const buhsWithSameType = legacyDamages.filter(d => {
        const info = buhsNormalizedData.get(d.id);
        return info && info.typeCode === buhsInfo.typeCode;
      });
      
      // Count how many relevant checkin_damages have this type (excluding already used ones)
      const checkinWithSameType = relevantCheckinDamages.filter(cd => {
        const info = checkinNormalizedData.get(cd.id);
        return info && info.typeCode === buhsInfo.typeCode && !tempUsedCheckinDamageIds.has(cd.id);
      });
      
      // Only match if both counts are exactly 1 (unambiguous case)
      if (buhsWithSameType.length === 1 && checkinWithSameType.length === 1) {
        tempBuhsToCheckinMap.set(buhs.id, checkinWithSameType[0]);
        tempUsedCheckinDamageIds.add(checkinWithSameType[0].id); // Mark as used
      }
    }
    
    // If we got here without error, use the computed maps
    buhsToCheckinMap = tempBuhsToCheckinMap;
    usedCheckinDamageIds = tempUsedCheckinDamageIds;
    
  } catch (err) {
    // Log error but don't crash - fall back to empty maps
    console.error('BUHS matching failed', { regnr: cleanedRegnr, err });
    buhsToCheckinMap = new Map();
    usedCheckinDamageIds = new Set();
  }
  
    stage = 'build_damage_records';
    // Build damage records from legacy damages (BUHS)
    const damageRecords: DamageRecord[] = [];
    
    for (const d of legacyDamages) {
    const legacyText = getLegacyDamageText(d);
    
    // Get matched checkin_damage from pre-built map
    const matchedCheckinDamage = buhsToCheckinMap.get(d.id) || null;
    
    // Build sourceInfo and display text based on matching status
    let sourceInfo = 'Källa: BUHS';
    let displayText = legacyText || 'Okänd';
    let status = 'Befintlig';
    let folder: string | undefined = undefined;
    
    if (matchedCheckinDamage) {
      // This BUHS damage has been handled in a checkin
      const checkin = checkins.find(c => c.id === matchedCheckinDamage.checkin_id);
      const checkinDate = checkin ? formatDate(checkin.completed_at || checkin.created_at) : '';
      
      if (matchedCheckinDamage.type === 'documented') {
        // Damage was documented with structured data
        const parts: string[] = [];
        
        // Use positions array if available, otherwise fall back to car_part/position
        if (matchedCheckinDamage.positions && Array.isArray(matchedCheckinDamage.positions) && matchedCheckinDamage.positions.length > 0) {
          // Format positions from array
          const positionsStr = matchedCheckinDamage.positions.map((pos: any) => {
            const posParts: string[] = [];
            if (pos.carPart) posParts.push(pos.carPart);
            if (pos.position) posParts.push(pos.position);
            return posParts.join(' - ');
          }).filter(Boolean).join(', ');
          
          if (matchedCheckinDamage.damage_type) {
            parts.push(matchedCheckinDamage.damage_type);
          }
          if (positionsStr) {
            parts.push(positionsStr);
          }
        } else {
          // Fall back to car_part/position
          if (matchedCheckinDamage.damage_type) {
            parts.push(matchedCheckinDamage.damage_type);
          }
          if (matchedCheckinDamage.car_part) parts.push(matchedCheckinDamage.car_part);
          if (matchedCheckinDamage.position) parts.push(matchedCheckinDamage.position);
        }
        
        displayText = parts.length > 0 ? parts.join(' - ') : displayText;
        
        if (matchedCheckinDamage.description) {
          displayText += `: ${matchedCheckinDamage.description}`;
        }
        
        status = 'Dokumenterad';
        
        // Extract folder from Supabase Storage URLs
        // Format: .../storage/v1/object/public/damage-photos/<folder>/<file>
        // Need to extract everything after /damage-photos/ up to the last /
        if (matchedCheckinDamage.photo_urls && matchedCheckinDamage.photo_urls.length > 0) {
          const firstPhotoUrl = matchedCheckinDamage.photo_urls[0];
          // Remove query string if present
          const urlWithoutQuery = firstPhotoUrl.split('?')[0];
          
          // Try to extract from damage-photos path
          const damagePhotosIndex = urlWithoutQuery.indexOf('/damage-photos/');
          if (damagePhotosIndex !== -1) {
            // Get everything after /damage-photos/
            const afterDamagePhotos = urlWithoutQuery.substring(damagePhotosIndex + '/damage-photos/'.length);
            // Remove the filename (everything after the last /)
            const lastSlashIndex = afterDamagePhotos.lastIndexOf('/');
            if (lastSlashIndex !== -1) {
              folder = afterDamagePhotos.substring(0, lastSlashIndex);
            } else {
              // No slash means the folder is the whole string (unlikely but handle it)
              folder = afterDamagePhotos;
            }
          } else {
            // Fallback: try old /media/ pattern
            const mediaMatch = urlWithoutQuery.match(/\/media\/([^\/]+)\//);
            if (mediaMatch) {
              folder = mediaMatch[1];
            }
          }
        }
        
        const checkerName = checkin?.checker_name || getFullNameFromEmail(checkin?.checker_email || '');
        sourceInfo = `Rapporterad i BUHS (Dokumenterad ${checkinDate})`;
        
      } else if (matchedCheckinDamage.type === 'not_found') {
        // Damage could not be documented
        status = 'Ej dokumenterad';
        
        const checkerName = getFirstNameFromEmail(checkin?.checker_email || '');
        
        // Build description from checkin_damage description
        let notFoundText = displayText;
        if (matchedCheckinDamage.description) {
          notFoundText += `. Gick ej att dokumentera: "${matchedCheckinDamage.description}"`;
        } else {
          notFoundText += '. Gick ej att dokumentera';
        }
        notFoundText += ` (${checkerName})`;
        
        displayText = notFoundText;
        sourceInfo = `Rapporterad i BUHS (Gick ej att dokumentera ${checkinDate})`;
      }
    } else if (!hasBeenCheckedIn) {
      sourceInfo += '\nReg. nr har aldrig checkats in med incheckad.se/check';
    }
    
    damageRecords.push({
      id: d.id,
      regnr: cleanedRegnr,
      skadetyp: displayText,
      datum: formatDate(d.damage_date),
      status,
      source: 'legacy' as const,
      sourceInfo,
      folder,
      legacy_damage_source_text: legacyText,
      original_damage_date: formatDate(d.damage_date),
    });
  }
  
  // Add damages from damages table (nybil delivery damages only)
  // Skip damages that match legacy damages by regnr + damage_date
  for (const damage of damages) {
    // Check if this damage matches a legacy damage (same regnr + damage_date)
    const damageKey = `${cleanedRegnr}-${formatDate(damage.damage_date || damage.created_at || damage.datum)}`;
    if (legacyDamageKeys.has(damageKey)) {
      // This damage already exists in legacy damages, skip it
      continue;
    }
    // Build damage description from type and positions
    // Use damage_type_raw if available, otherwise format damage_type
    let skadetyp: string;
    if (damage.damage_type_raw) {
      skadetyp = damage.damage_type_raw;
    } else if (damage.damage_type) {
      skadetyp = formatDamageType(damage.damage_type);
    } else {
      skadetyp = damage.skadetyp || 'Okänd';
    }
    
    // If user_positions exists, format it as "Skadetyp - Placering - Position"
    if (damage.user_positions && Array.isArray(damage.user_positions) && damage.user_positions.length > 0) {
      const positionsStr = formatDamagePositions(damage.user_positions);
      if (positionsStr) {
        skadetyp = `${skadetyp} - ${positionsStr}`;
      }
    }
    
    // Build sourceInfo based on damage.source
    let sourceInfo: string;
    if (damage.source === 'CHECK') {
      sourceInfo = damage.inchecker_name 
        ? `Registrerad vid incheckning av ${damage.inchecker_name}`
        : 'Registrerad vid incheckning';
    } else {
      sourceInfo = damage.inchecker_name 
        ? `Registrerad vid nybilsleverans av ${damage.inchecker_name}`
        : 'Registrerad vid nybilsleverans';
    }
    
    damageRecords.push({
      id: damage.id,
      regnr: cleanedRegnr,
      skadetyp: skadetyp,
      datum: formatDate(damage.created_at || damage.damage_date || damage.datum),
      status: damage.status || 'Befintlig',
      folder: damage.uploads?.folder || damage.folder,
      source: 'damages' as const,
      sourceInfo,
    });
  }

  // Build history records
  const historyRecords: HistoryRecord[] = [];
  const damagesShownInCheckins = new Set<number>(); // Track damage IDs shown in checkins

  // Build damage counts for checkins from already-fetched checkin_damages
  const damageCounts = new Map<string, number>();
  for (const cd of checkinDamages) {
    if (cd.type === 'new') {
      const count = damageCounts.get(cd.checkin_id) || 0;
      damageCounts.set(cd.checkin_id, count + 1);
    }
  }

  // Add checkins to history (with avvikelser and damages from damageRecords)
  for (const checkin of checkins) {
    const checklist = checkin.checklist || {};
    const rekondTypes = detectRekondTypes(checklist.rekond_folder);
    
    // Get damage count from pre-fetched map
    const damageCount = checkin.has_new_damages ? (damageCounts.get(checkin.id) || 0) : 0;
    
    // Build plats string
    const plats = (checkin.current_city || checkin.current_ort) && checkin.current_station
      ? `${checkin.current_city || checkin.current_ort} / ${checkin.current_station}`
      : undefined;
    
    // Build plats för incheckning
    const platsForIncheckning = checkin.city && checkin.station
      ? `${checkin.city} / ${checkin.station}`
      : undefined;
    
    // Build bilen står nu
    const bilenStarNu = (checkin.current_city || checkin.current_ort) && checkin.current_station
      ? `${checkin.current_city || checkin.current_ort} / ${checkin.current_station}`
      : undefined;
    
    // Build media links based on checklist folders
    const mediaLankar: any = {};
    if (checklist.rekond_folder) {
      mediaLankar.rekond = `/media/${checklist.rekond_folder}`;
    }
    if (checklist.pet_sanitation_folder) {
      mediaLankar.husdjur = `/media/${checklist.pet_sanitation_folder}`;
    }
    if (checklist.smoking_sanitation_folder) {
      mediaLankar.rokning = `/media/${checklist.smoking_sanitation_folder}`;
    }
    
    // Get checkin_damages for this specific checkin
    const thisCheckinDamages = checkinDamagesMap.get(checkin.id) || [];
    
    // Build skador array from checkin_damages (not from damageRecords!)
    // This ensures we show ALL damages handled in this checkin, including not_found ones
    const skador: Array<{
      typ: string;
      beskrivning: string;
      mediaUrl?: string;
      isDocumentedOlder?: boolean;
      originalDamageDate?: string;
    }> = [];
    
    for (const cd of thisCheckinDamages) {
      // Skip 'new' damages - those are already tracked in avvikelser.nyaSkador
      if (cd.type === 'new') continue;
      
      let typ = '';
      let beskrivning = '';
      let mediaUrl: string | undefined = undefined;
      
      if (cd.type === 'documented' || cd.type === 'existing') {
        // Build structured text using positions array if available
        const parts: string[] = [];
        
        if (cd.positions && Array.isArray(cd.positions) && cd.positions.length > 0) {
          // Format positions from array
          const positionsStr = cd.positions.map((pos: any) => {
            const posParts: string[] = [];
            if (pos.carPart) posParts.push(pos.carPart);
            if (pos.position) posParts.push(pos.position);
            return posParts.join(' - ');
          }).filter(Boolean).join(', ');
          
          if (cd.damage_type) parts.push(cd.damage_type);
          if (positionsStr) parts.push(positionsStr);
        } else {
          // Fall back to car_part/position
          if (cd.damage_type) parts.push(cd.damage_type);
          if (cd.car_part) parts.push(cd.car_part);
          if (cd.position) parts.push(cd.position);
        }
        
        typ = parts.length > 0 ? parts.join(' - ') : 'Dokumenterad skada';
        beskrivning = cd.description || '';
        
        // Extract media URL from Supabase Storage format
        if (cd.photo_urls && cd.photo_urls.length > 0) {
          const firstPhotoUrl = cd.photo_urls[0];
          // Remove query string if present
          const urlWithoutQuery = firstPhotoUrl.split('?')[0];
          
          // Try to extract from damage-photos path
          const damagePhotosIndex = urlWithoutQuery.indexOf('/damage-photos/');
          if (damagePhotosIndex !== -1) {
            // Get everything after /damage-photos/
            const afterDamagePhotos = urlWithoutQuery.substring(damagePhotosIndex + '/damage-photos/'.length);
            // Remove the filename (everything after the last /)
            const lastSlashIndex = afterDamagePhotos.lastIndexOf('/');
            if (lastSlashIndex !== -1) {
              const folder = afterDamagePhotos.substring(0, lastSlashIndex);
              mediaUrl = `/media/${folder}`;
              // Also add to mediaLankar
              const damageMediaKey = `skada-cd-${cd.id}`;
              if (!mediaLankar[damageMediaKey]) {
                mediaLankar[damageMediaKey] = mediaUrl;
              }
            }
          } else {
            // Fallback: try old /media/ pattern
            const mediaMatch = urlWithoutQuery.match(/\/media\/([^\/]+)\//);
            if (mediaMatch) {
              mediaUrl = `/media/${mediaMatch[1]}`;
              const damageMediaKey = `skada-cd-${cd.id}`;
              if (!mediaLankar[damageMediaKey]) {
                mediaLankar[damageMediaKey] = mediaUrl;
              }
            }
          }
        }
        
        // Find the original BUHS damage to get its date (using the pre-built map)
        let originalBuhsDamage = null;
        for (const [buhsId, matchedCd] of buhsToCheckinMap.entries()) {
          if (matchedCd.id === cd.id) {
            originalBuhsDamage = legacyDamages.find(ld => ld.id === buhsId);
            break;
          }
        }
        
        skador.push({
          typ,
          beskrivning,
          mediaUrl,
          isDocumentedOlder: cd.type === 'documented' || cd.type === 'existing',
          originalDamageDate: originalBuhsDamage ? formatDate(originalBuhsDamage.damage_date) : undefined,
        });
        
      } else if (cd.type === 'not_found') {
        // Build "not found" text
        typ = cd.damage_type || 'Skada';
        beskrivning = `Gick ej att dokumentera${cd.description ? `: "${cd.description}"` : ''}`;
        
        skador.push({
          typ,
          beskrivning,
          mediaUrl: undefined,
          isDocumentedOlder: false,
        });
      }
    }
    
    // Track which damage IDs are shown in this checkin (for later filtering)
    thisCheckinDamages.forEach(cd => {
      // Find corresponding damage in damageRecords and mark it as shown
      const correspondingDamage = damageRecords.find(dr => {
        if (dr.source !== 'legacy') return false;
        // Try to match by type and date
        const drNormalized = normalizeDamageType(dr.legacy_damage_source_text || dr.skadetyp);
        const cdNormalized = normalizeDamageType(cd.damage_type);
        return drNormalized.typeCode === cdNormalized.typeCode;
      });
      if (correspondingDamage) {
        damagesShownInCheckins.add(correspondingDamage.id);
      }
    });
    
    historyRecords.push({
      id: `checkin-${checkin.id}`,
      datum: formatDateTime(checkin.completed_at || checkin.created_at),
      rawTimestamp: checkin.completed_at || checkin.created_at || '',
      typ: 'incheckning',
      sammanfattning: `Incheckad vid ${checkin.current_city || checkin.current_ort || '?'} / ${checkin.current_station || '?'}. Mätarställning: ${checkin.odometer_km || '?'} km`,
      utfordAv: checkin.checker_name || getFullNameFromEmail(checkin.checker_email || checkin.user_email || checkin.incheckare || ''),
      plats,
      checkinDetaljer: {
        platsForIncheckning,
        bilenStarNu,
        parkeringsinfo: checkin.current_location_note || undefined,
        matarstallning: checkin.odometer_km ? `${checkin.odometer_km} km` : undefined,
        hjultyp: checkin.hjultyp || undefined,
        tankningInfo: buildTankningInfo(checkin),
        laddningInfo: buildLaddningInfo(checkin),
        mediaLankar: Object.keys(mediaLankar).length > 0 ? mediaLankar : undefined,
        skador: skador.length > 0 ? skador : undefined,
      },
      avvikelser: {
        nyaSkador: damageCount,
        garInteAttHyraUt: checklist.rental_unavailable ? (checklist.rental_unavailable_comment || 'Ja') : null,
        varningslampaPa: checklist.warning_light_on ? (checklist.warning_light_comment || 'Ja') : null,
        rekondBehov: checkin.rekond_behov ? {
          invandig: rekondTypes.invandig,
          utvandig: rekondTypes.utvandig,
          kommentar: checklist.rekond_comment || null,
        } : null,
        husdjurSanering: checklist.pet_sanitation_needed ? (checklist.pet_sanitation_comment || 'Ja') : null,
        rokningSanering: checklist.smoking_sanitation_needed ? (checklist.smoking_sanitation_comment || 'Ja') : null,
        insynsskyddSaknas: checklist.privacy_cover_missing || false,
      },
    });
  }

  // Add nybil registration to history (with nybilAvvikelser)
  if (nybilData) {
    const mottagenVid = nybilData.plats_mottagning_ort && nybilData.plats_mottagning_station
      ? `${nybilData.plats_mottagning_ort} / ${nybilData.plats_mottagning_station}`
      : undefined;
    
    // Find nybil damages (non-BUHS damages registered around nybil creation time)
    // These are damages from the damages table without legacy_damage_source_text
    // and with created_at/damage_date close to nybil created_at
    const nybilCreatedDate = nybilData.created_at ? new Date(nybilData.created_at) : null;
    const nybilDamages = damages.filter(d => {
      // Skip BUHS damages
      if (d.legacy_damage_source_text != null) return false;
      
      // Check if damage date is close to nybil creation date (same day or within 7 days)
      const damageDate = d.damage_date || d.created_at;
      if (!damageDate || !nybilCreatedDate) return false;
      
      const damageDateObj = new Date(damageDate);
      const diffMs = Math.abs(damageDateObj.getTime() - nybilCreatedDate.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      return diffDays <= 7;
    });
    
    // Build skador array for nybil
    const nybilSkador = nybilDamages.map(d => {
      let typ = d.damage_type_raw || d.damage_type ? formatDamageType(d.damage_type) : 'Okänd';
      
      // Add positions if available
      if (d.user_positions && Array.isArray(d.user_positions) && d.user_positions.length > 0) {
        const positionsStr = formatDamagePositions(d.user_positions);
        if (positionsStr) {
          typ = `${typ} - ${positionsStr}`;
        }
      }
      
      return {
        typ,
        beskrivning: d.description || '',
        mediaUrl: buildDamageMediaUrl(d.uploads?.folder || d.folder),
      };
    });
    
    historyRecords.push({
      id: `nybil-${nybilData.id}`,
      datum: formatDateTime(nybilData.created_at),
      rawTimestamp: nybilData.created_at || '',
      typ: 'nybil',
      sammanfattning: `Nybilsregistrering: ${nybilData.bilmarke || ''} ${nybilData.modell || ''}. Mottagen vid ${nybilData.plats_mottagning_ort || '?'} / ${nybilData.plats_mottagning_station || '?'}`,
      utfordAv: nybilData.fullstandigt_namn || getFullNameFromEmail(nybilData.registrerad_av || ''),
      plats: mottagenVid, // Add plats field for display in history
      nybilDetaljer: {
        bilmarkeModell: formatModel(nybilData.bilmarke ?? null, nybilData.modell ?? null),
        mottagenVid,
        matarstallningVidLeverans: nybilData.matarstallning_inkop ? `${nybilData.matarstallning_inkop} km` : undefined,
        hjultyp: nybilData.hjultyp || undefined,
        drivmedel: nybilData.bransletyp || undefined,
        planeradStation: nybilData.planerad_station || undefined,
        skador: nybilSkador.length > 0 ? nybilSkador : undefined,
      },
      nybilAvvikelser: {
        harSkadorVidLeverans: nybilData.har_skador_vid_leverans === true,
        ejRedoAttHyrasUt: nybilData.klar_for_uthyrning === false,
      },
    });
  }

  // Add BUHS damage history events
  // Create a separate history event for each BUHS damage (source='legacy')
  // that wasn't shown in any checkin (already tracked in damagesShownInCheckins set)
  for (const damage of damageRecords) {
    if (damage.source === 'legacy' && !damagesShownInCheckins.has(damage.id)) {
      historyRecords.push({
        id: `buhs-${damage.id}`,
        datum: damage.datum,
        rawTimestamp: damage.datum || '',
        typ: 'buhs_skada',
        sammanfattning: 'Ej dokumenterad i Incheckad',
        utfordAv: 'System (BUHS)',
        buhsSkadaDetaljer: {
          skadetyp: damage.skadetyp,
          legacy_damage_source_text: damage.legacy_damage_source_text,
        },
      });
    }
  }

  // Sort history by rawTimestamp (newest first)
  historyRecords.sort((a, b) => {
    const dateA = new Date(a.rawTimestamp);
    const dateB = new Date(b.rawTimestamp);
    return dateB.getTime() - dateA.getTime();
  });

  // Update the vehicle's damage count to reflect the filtered list
  vehicle.antalSkador = damageRecords.length;

  // Extract nybil reference photos if available
  const nybilPhotos = nybilData && Array.isArray(nybilData.photo_urls) && nybilData.photo_urls.length > 0
    ? {
        photoUrls: nybilData.photo_urls,
        mediaFolder: nybilData.media_folder || null,
        registreringsdatum: formatDate(nybilData.created_at || nybilData.registreringsdatum),
        registreradAv: nybilData.fullstandigt_namn || getFullNameFromEmail(nybilData.registrerad_av || ''),
      }
    : null;

  // Build complete nybil data for modal display
  const nybilFullData = nybilData ? {
    registreringsdatum: formatDateTime(nybilData.created_at || nybilData.registreringsdatum),
    registreradAv: nybilData.fullstandigt_namn || getFullNameFromEmail(nybilData.registrerad_av || ''),
    // Fordon
    regnr: cleanedRegnr,
    bilmarkeModell: formatModel(nybilData.bilmarke ?? null, nybilData.modell ?? null),
    mottagenVid: (nybilData.plats_mottagning_ort && nybilData.plats_mottagning_station)
      ? `${nybilData.plats_mottagning_ort} / ${nybilData.plats_mottagning_station}`
      : '---',
    planeradStation: nybilData.planerad_station || '---',
    // Fordonsstatus
    matarstallningVidLeverans: nybilData.matarstallning_inkop ? `${nybilData.matarstallning_inkop} km` : '---',
    hjultypMonterat: nybilData.hjultyp || '---',
    hjulTillForvaring: (nybilData.hjul_forvaring_ort || nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring)
      ? [nybilData.hjul_forvaring_ort, nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring].filter(Boolean).join(' - ')
      : '---',
    drivmedel: nybilData.bransletyp || '---',
    vaxellada: nybilData.vaxel || '---',
    tankstatusVidLeverans: buildTankstatusDisplay(nybilData),
    // Avtalsvillkor
    serviceintervall: nybilData.serviceintervall ? `${nybilData.serviceintervall} km` : '---',
    maxKmManad: nybilData.max_km_manad ? `${nybilData.max_km_manad} km` : '---',
    avgiftOverKm: nybilData.avgift_over_km ? `${nybilData.avgift_over_km} kr` : '---',
    saludatum: formatDate(nybilData.saludatum),
    // Utrustning
    antalNycklar: nybilData.antal_nycklar != null ? `${nybilData.antal_nycklar} st` : '---',
    antalLaddkablar: nybilData.antal_laddkablar != null ? `${nybilData.antal_laddkablar} st` : '---',
    antalInsynsskydd: nybilData.antal_insynsskydd != null ? `${nybilData.antal_insynsskydd} st` : '---',
    harInstruktionsbok: nybilData.instruktionsbok === true ? 'Ja' : nybilData.instruktionsbok === false ? 'Nej' : '---',
    harCoc: nybilData.coc === true ? 'Ja' : nybilData.coc === false ? 'Nej' : '---',
    harLasbultar: nybilData.lasbultar_med === true ? 'Ja' : nybilData.lasbultar_med === false ? 'Nej' : '---',
    harDragkrok: nybilData.dragkrok === true ? 'Ja' : nybilData.dragkrok === false ? 'Nej' : '---',
    harGummimattor: nybilData.gummimattor === true ? 'Ja' : nybilData.gummimattor === false ? 'Nej' : '---',
    harDackkompressor: nybilData.dackkompressor === true ? 'Ja' : nybilData.dackkompressor === false ? 'Nej' : '---',
    // Förvaring
    hjulforvaring: (nybilData.hjul_forvaring_ort || nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring)
      ? [nybilData.hjul_forvaring_ort, nybilData.hjul_forvaring_spec || nybilData.hjul_forvaring].filter(Boolean).join(' - ')
      : '---',
    reservnyckelForvaring: (nybilData.extranyckel_forvaring_ort || nybilData.extranyckel_forvaring_spec)
      ? [nybilData.extranyckel_forvaring_ort, nybilData.extranyckel_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    laddkablarForvaring: (nybilData.laddkablar_forvaring_ort || nybilData.laddkablar_forvaring_spec)
      ? [nybilData.laddkablar_forvaring_ort, nybilData.laddkablar_forvaring_spec].filter(Boolean).join(' - ')
      : '---',
    // Leveransstatus
    skadorVidLeverans: nybilData.har_skador_vid_leverans === true ? 'Ja' : nybilData.har_skador_vid_leverans === false ? 'Inga' : '---',
    klarForUthyrning: nybilData.klar_for_uthyrning === true ? 'Ja' : nybilData.klar_for_uthyrning === false ? 'Nej' : '---',
    anteckningar: nybilData.anteckningar || '---',
  } : undefined;

    stage = 'return_success';
    return {
      found: true,
      source,
      vehicle,
      damages: damageRecords,
      history: historyRecords,
      nybilPhotos,
      nybilFullData,
    };
  
  } catch (err) {
    // Log error with stage tracking and stack trace
    const errorObj = err as Error;
    console.error('getVehicleStatus crashed', { 
      regnr: cleanedRegnr, 
      stage, 
      error: errorObj.message,
      stack: errorObj.stack 
    });
    
    // Graceful degradation: if we have BUHS data, show it even if processing failed
    if (legacyDamagesResponse?.data && legacyDamagesResponse.data.length > 0) {
      const legacyDamages = legacyDamagesResponse.data || [];
      const legacySaludatum = legacyDamages.length > 0 ? legacyDamages[0]?.saludatum : null;
      
      // Build minimal vehicle status data - only BUHS damages available
      const vehicle: VehicleStatusData = {
        regnr: cleanedRegnr,
        bilmarkeModell: '---',
        bilenStarNu: '---',
        matarstallning: '---',
        hjultyp: '---',
        hjulforvaring: '---',
        drivmedel: '---',
        vaxel: '---',
        serviceintervall: '---',
        maxKmManad: '---',
        avgiftOverKm: '---',
        saludatum: legacySaludatum ? formatDate(legacySaludatum) : '---',
        antalSkador: legacyDamages.length,
        stoldGps: '---',
        klarForUthyrning: '---',
        planeradStation: '---',
        utrustning: '---',
        saluinfo: '---',
        hjulForvaringInfo: '---',
        reservnyckelInfo: '---',
        laddkablarForvaringInfo: '---',
        instruktionsbokForvaringInfo: '---',
        cocForvaringInfo: '---',
        antalNycklar: '---',
        antalLaddkablar: '---',
        antalInsynsskydd: '---',
        harInstruktionsbok: '---',
        harCoc: '---',
        harLasbultar: '---',
        harDragkrok: '---',
        harGummimattor: '---',
        harDackkompressor: '---',
        saluStation: '---',
        saluKopare: '---',
        saluRetur: '---',
        saluReturadress: '---',
        saluAttention: '---',
        saluNotering: '---',
        tankningInfo: '---',
        tankstatusVidLeverans: '---',
        anteckningar: '---',
        harSkadorVidLeverans: null,
        isSold: null,
      };

      // Build damage records from BUHS only (no checkin matching)
      const damageRecords: DamageRecord[] = legacyDamages.map((d: LegacyDamage) => {
        const legacyText = getLegacyDamageText(d);
        return {
          id: d.id,
          regnr: cleanedRegnr,
          skadetyp: legacyText || 'Okänd',
          datum: formatDate(d.damage_date),
          status: 'Befintlig',
          source: 'legacy' as const,
          sourceInfo: 'Källa: BUHS\n(Matchning misslyckades - data kan vara ofullständig)',
        };
      });

      // Build history with BUHS events only
      const historyRecords: HistoryRecord[] = damageRecords.map(damage => ({
        id: `buhs-${damage.id}`,
        datum: damage.datum,
        rawTimestamp: damage.datum || '',
        typ: 'buhs_skada' as const,
        sammanfattning: 'Ej dokumenterad i Incheckad',
        utfordAv: 'System (BUHS)',
        buhsSkadaDetaljer: {
          skadetyp: damage.skadetyp,
          legacy_damage_source_text: damage.skadetyp,
        },
      }));

      console.log('getVehicleStatus graceful degradation: returning BUHS-only data', {
        regnr: cleanedRegnr,
        damageCount: damageRecords.length,
      });

      return {
        found: true,
        source: 'buhs',
        vehicle,
        damages: damageRecords,
        history: historyRecords,
        nybilPhotos: null,
      };
    }
    
    // No BUHS data available - return not found
    return {
      found: false,
      source: 'none',
      vehicle: null,
      damages: [],
      history: [],
      nybilPhotos: null,
    };
  }
}

// =================================================================
// 4. SEARCH/AUTOCOMPLETE FUNCTION
// =================================================================

export async function searchVehicles(query: string): Promise<string[]> {
  if (!query || query.length < 2) return [];
  
  const upperQuery = query.toUpperCase().replace(/\s/g, '');
  
  // Use the existing RPC to get all plates
  const { data, error } = await supabase.rpc('get_all_allowed_plates');
  
  if (error) {
    console.error('Error fetching plates:', error);
    return [];
  }
  
  if (!data) return [];
  
  // Filter plates that start with the query
  return data
    .map((item: any) => item.regnr as string)
    .filter((regnr: string) => regnr && regnr.toUpperCase().startsWith(upperQuery));
}
