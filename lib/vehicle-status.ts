import { supabase } from './supabase';

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
  source: 'legacy' | 'damages';
  // Source info for display
  sourceInfo?: string; // e.g., "Källa: BUHS" or "Incheckad av Per Andersson 2025-12-03 14:30"
};

export type HistoryRecord = {
  id: string;
  datum: string;
  rawTimestamp: string; // ISO string for sorting
  typ: 'incheckning' | 'nybil' | 'manual';
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
};

export type VehicleStatusResult = {
  found: boolean;
  source: 'nybil_inventering' | 'vehicles' | 'both' | 'checkins' | 'none';
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

// =================================================================
// 3. MAIN DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleStatus(regnr: string): Promise<VehicleStatusResult> {
  const cleanedRegnr = regnr.toUpperCase().trim().replace(/\s/g, '');
  
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

  // Fetch data from all sources concurrently
  const [nybilResponse, vehicleResponse, damagesResponse, legacyDamagesResponse, checkinsResponse] = await Promise.all([
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

  const nybilData = nybilResponse.data;
  const vehicleData = vehicleResponse.data?.[0] || null;
  const damages = damagesResponse.data || [];
  const legacyDamages = legacyDamagesResponse.data || [];
  const checkins = checkinsResponse.data || [];
  
  // Get saludatum from legacy damages if available
  const legacySaludatum = legacyDamages.length > 0 ? legacyDamages[0]?.saludatum : null;

  // Determine source
  let source: 'nybil_inventering' | 'vehicles' | 'both' | 'checkins' | 'none' = 'none';
  if (nybilData && vehicleData) source = 'both';
  else if (nybilData) source = 'nybil_inventering';
  else if (vehicleData) source = 'vehicles';
  else if (checkins.length > 0) source = 'checkins';

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

  // Get latest checkin for current location and odometer
  const latestCheckin = checkins[0] || null;

  // If source is 'checkins', build a minimal vehicle data from checkin records
  if (source === 'checkins') {
    // Build vehicle status data from checkin records
    const vehicle: VehicleStatusData = {
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
        const positions = damage.user_positions.map((pos: any) => {
          const parts: string[] = [];
          if (pos.carPart) parts.push(pos.carPart);
          if (pos.position) parts.push(pos.position);
          return parts.join(' - ');
        }).filter(Boolean);
        if (positions.length > 0) {
          skadetyp = `${skadetyp} - ${positions.join(', ')}`;
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
    
    // Fetch all damage counts for checkins in a single query (optimize N+1 pattern)
    const checkinIds = checkins.map(c => c.id).filter(Boolean);
    const damageCounts = new Map<string, number>();
    
    if (checkinIds.length > 0) {
      const { data: damageData } = await supabase
        .from('checkin_damages')
        .select('checkin_id')
        .in('checkin_id', checkinIds)
        .eq('type', 'new');
      
      if (damageData) {
        for (const damage of damageData) {
          const count = damageCounts.get(damage.checkin_id) || 0;
          damageCounts.set(damage.checkin_id, count + 1);
        }
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

  // Build vehicle status data using priority order
  const vehicle: VehicleStatusData = {
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

  // Determine if vehicle has ever been checked in
  const hasBeenCheckedIn = checkins.length > 0;
  
  // Build set of legacy damage keys (regnr + damage_date) from RPC
  // to filter out duplicates in damages table
  const legacyDamageKeys = new Set<string>();
  for (const d of legacyDamages) {
    const key = `${cleanedRegnr}-${formatDate(d.damage_date)}`;
    legacyDamageKeys.add(key);
  }
  
  // Build damage records from legacy damages (BUHS)
  const damageRecords: DamageRecord[] = [];
  
  for (const d of legacyDamages) {
    const legacyText = getLegacyDamageText(d);
    
    // Build sourceInfo based on whether vehicle has been checked in
    let sourceInfo = 'Källa: BUHS';
    if (!hasBeenCheckedIn) {
      sourceInfo += '\nReg. nr har aldrig checkats in med incheckad.se/check';
    }
    
    damageRecords.push({
      id: d.id,
      regnr: cleanedRegnr,
      skadetyp: legacyText || 'Okänd',
      datum: formatDate(d.damage_date),
      status: 'Befintlig',
      source: 'legacy' as const,
      sourceInfo,
      // No folder for legacy damages - they don't have media
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
      const positions = damage.user_positions.map((pos: any) => {
        const parts: string[] = [];
        if (pos.carPart) parts.push(pos.carPart);
        if (pos.position) parts.push(pos.position);
        return parts.join(' - ');
      }).filter(Boolean);
      
      if (positions.length > 0) {
        skadetyp = `${skadetyp} - ${positions.join(', ')}`;
      }
    }
    
    // This is a new damage registered during nybil delivery (not a legacy duplicate)
    const sourceInfo = damage.inchecker_name 
      ? `Registrerad vid nybilsleverans av ${damage.inchecker_name}`
      : 'Registrerad vid nybilsleverans';
    
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

  // Fetch all damage counts and details for checkins in a single query (optimize N+1 pattern)
  const checkinIds = checkins.map(c => c.id).filter(Boolean);
  const damageCounts = new Map<string, number>();
  const checkinDamagesMap = new Map<string, any[]>();
  
  if (checkinIds.length > 0) {
    const { data: damageData } = await supabase
      .from('checkin_damages')
      .select('*')
      .in('checkin_id', checkinIds)
      .eq('type', 'new');
    
    if (damageData) {
      for (const damage of damageData) {
        const count = damageCounts.get(damage.checkin_id) || 0;
        damageCounts.set(damage.checkin_id, count + 1);
        
        // Build damages list per checkin
        const damagesList = checkinDamagesMap.get(damage.checkin_id) || [];
        damagesList.push(damage);
        checkinDamagesMap.set(damage.checkin_id, damagesList);
      }
    }
  }

  // Add checkins to history (with avvikelser)
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
    
    // Build media folder for this checkin
    const checkinDate = formatDateForFolder(checkin.completed_at || checkin.created_at);
    const mediaFolder = checkinDate ? `${cleanedRegnr}/${cleanedRegnr}-${checkinDate}` : null;
    
    // Build media links
    const mediaLankar: any = {};
    if (mediaFolder) {
      if (checkin.rekond_behov && checklist.rekond_folder) {
        mediaLankar.rekond = `/media/${checklist.rekond_folder}`;
      }
      if (checklist.pet_sanitation_needed && checklist.pet_sanitation_folder) {
        mediaLankar.husdjur = `/media/${checklist.pet_sanitation_folder}`;
      }
      if (checklist.smoking_sanitation_needed && checklist.smoking_sanitation_folder) {
        mediaLankar.rokning = `/media/${checklist.smoking_sanitation_folder}`;
      }
    }
    
    // Build damages list for this checkin
    const checkinDamages = checkinDamagesMap.get(checkin.id) || [];
    const skador = checkinDamages.map(d => {
      let typ = d.damage_type_raw || 'Okänd';
      
      // Add positions if available
      if (d.user_positions && Array.isArray(d.user_positions) && d.user_positions.length > 0) {
        const positions = d.user_positions.map((pos: any) => {
          const parts: string[] = [];
          if (pos.carPart) parts.push(pos.carPart);
          if (pos.position) parts.push(pos.position);
          return parts.join(' - ');
        }).filter(Boolean);
        if (positions.length > 0) {
          typ = `${typ} - ${positions.join(', ')}`;
        }
      }
      
      return {
        typ,
        beskrivning: d.description || '',
        mediaUrl: d.uploads?.folder ? `/media/${d.uploads.folder}` : undefined,
      };
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
      },
      nybilAvvikelser: {
        harSkadorVidLeverans: nybilData.har_skador_vid_leverans === true,
        ejRedoAttHyrasUt: nybilData.klar_for_uthyrning === false,
      },
    });
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

  return {
    found: true,
    source,
    vehicle,
    damages: damageRecords,
    history: historyRecords,
    nybilPhotos,
    nybilFullData,
  };
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
