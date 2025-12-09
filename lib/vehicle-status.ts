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
  // Additional checkin details (only for incheckning type)
  ort?: string;
  station?: string;
  matarstallning?: string;
  hjultyp?: string;
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
    
    // checkins - order by completed_at first, then created_at as fallback
    supabase
      .from('checkins')
      .select('*')
      .eq('regnr', cleanedRegnr)
      .order('completed_at', { ascending: false, nullsLast: true })
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
      bilenStarNu: latestCheckin?.current_ort && latestCheckin?.current_station && (latestCheckin?.completed_at || latestCheckin?.created_at)
        ? `${latestCheckin.current_ort} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || getFullNameFromEmail(latestCheckin.user_email || latestCheckin.incheckare || 'Okänd')})`
        : latestCheckin?.current_ort && latestCheckin?.current_station
          ? `${latestCheckin.current_ort} / ${latestCheckin.current_station}`
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
      
      // Antal registrerade skador: count legacy damages (BUHS)
      antalSkador: legacyDamages.length,
      
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

    // Build history records from checkins only
    const historyRecords: HistoryRecord[] = checkins.map(checkin => ({
      id: `checkin-${checkin.id}`,
      datum: formatDateTime(checkin.completed_at || checkin.created_at),
      rawTimestamp: checkin.completed_at || checkin.created_at || '',
      typ: 'incheckning' as const,
      sammanfattning: `Incheckad vid ${checkin.current_city || checkin.current_ort || '?'} / ${checkin.current_station || '?'}`,
      utfordAv: checkin.checker_name || getFullNameFromEmail(checkin.checker_email || checkin.user_email || checkin.incheckare || ''),
      // Additional checkin details
      ort: checkin.current_city || checkin.current_ort,
      station: checkin.current_station,
      matarstallning: checkin.odometer_km ? `${checkin.odometer_km} km` : undefined,
      hjultyp: checkin.hjultyp,
    }));

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

  // Add checkins to history
  for (const checkin of checkins) {
    historyRecords.push({
      id: `checkin-${checkin.id}`,
      datum: formatDateTime(checkin.completed_at || checkin.created_at),
      rawTimestamp: checkin.completed_at || checkin.created_at || '',
      typ: 'incheckning',
      sammanfattning: `Incheckad vid ${checkin.current_city || checkin.current_ort || '?'} / ${checkin.current_station || '?'}`,
      utfordAv: checkin.checker_name || getFullNameFromEmail(checkin.checker_email || checkin.user_email || checkin.incheckare || ''),
      // Additional checkin details
      ort: checkin.current_city || checkin.current_ort,
      station: checkin.current_station,
      matarstallning: checkin.odometer_km ? `${checkin.odometer_km} km` : undefined,
      hjultyp: checkin.hjultyp,
    });
  }

  // Add nybil registration to history
  if (nybilData) {
    historyRecords.push({
      id: `nybil-${nybilData.id}`,
      datum: formatDateTime(nybilData.created_at),
      rawTimestamp: nybilData.created_at || '',
      typ: 'nybil',
      sammanfattning: `Nybilsregistrering: ${nybilData.bilmarke || ''} ${nybilData.modell || ''}. Mottagen vid ${nybilData.plats_mottagning_ort || '?'} / ${nybilData.plats_mottagning_station || '?'}`,
      utfordAv: nybilData.fullstandigt_namn || getFullNameFromEmail(nybilData.registrerad_av || ''),
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

  return {
    found: true,
    source,
    vehicle,
    damages: damageRecords,
    history: historyRecords,
    nybilPhotos,
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
