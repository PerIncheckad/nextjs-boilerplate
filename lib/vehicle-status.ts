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
};

export type VehicleStatusResult = {
  found: boolean;
  source: 'nybil_inventering' | 'vehicles' | 'both' | 'checkins' | 'none';
  vehicle: VehicleStatusData | null;
  damages: DamageRecord[];
  history: HistoryRecord[];
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
  fullstandigt_namn?: string;
  registrerad_av?: string;
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
    return `${datePart} ${hours}:${minutes}`;
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

// Raw damage data from the legacy source (BUHS)
type LegacyDamage = {
  id: number;
  damage_type_raw: string | null;
  note_customer: string | null;
  note_internal: string | null;
  saludatum: string | null;
  damage_date: string | null;
};

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
    
    // checkins
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
      
      // Senast incheckad vid: from latest checkin with datetime
      bilenStarNu: latestCheckin?.current_ort && latestCheckin?.current_station && latestCheckin?.created_at
        ? `${latestCheckin.current_ort} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.created_at)})`
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
    };

    // Build damage records from legacy damages (BUHS)
    const damageRecords: DamageRecord[] = legacyDamages.map((d: LegacyDamage) => ({
      id: d.id,
      regnr: cleanedRegnr,
      skadetyp: getLegacyDamageText(d) || 'Okänd',
      datum: formatDate(d.damage_date),
      status: 'Befintlig',
      source: 'legacy' as const,
      sourceInfo: 'Källa: BUHS (reg. nr har aldrig checkats in med incheckad.se/check)',
    }));

    // Build history records from checkins only
    const historyRecords: HistoryRecord[] = checkins.map(checkin => ({
      id: `checkin-${checkin.id}`,
      datum: formatDateTime(checkin.created_at),
      rawTimestamp: checkin.created_at || '',
      typ: 'incheckning' as const,
      sammanfattning: `Incheckad vid ${checkin.current_ort || '?'} / ${checkin.current_station || '?'}. Mätarställning: ${checkin.odometer_km || '?'} km`,
      utfordAv: getFullNameFromEmail(checkin.user_email || checkin.incheckare || ''),
    }));

    // Sort history by rawTimestamp (newest first)
    historyRecords.sort((a, b) => {
      const dateA = new Date(a.rawTimestamp);
      const dateB = new Date(b.rawTimestamp);
      return dateB.getTime() - dateA.getTime();
    });

    return {
      found: true,
      source,
      vehicle,
      damages: damageRecords,
      history: historyRecords,
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
    
    // Senast incheckad vid: checkins with datetime → nybil_inventering.plats_aktuell_station
    bilenStarNu: latestCheckin?.current_ort && latestCheckin?.current_station && latestCheckin?.created_at
      ? `${latestCheckin.current_ort} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.created_at)})`
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
    
    // Hjulförvaring: vehicles.wheel_storage_location
    hjulforvaring: vehicleData?.wheel_storage_location || '---',
    
    // Drivmedel: nybil_inventering.bransletyp
    drivmedel: nybilData?.bransletyp || '---',
    
    // Serviceintervall: nybil_inventering.serviceintervall
    serviceintervall: nybilData?.serviceintervall
      ? `${nybilData.serviceintervall} mil`
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
    
    // Antal registrerade skador: count legacy damages (BUHS) like /check does
    antalSkador: legacyDamages.length,
    
    // Stöld-GPS monterad: nybil_inventering.stold_gps
    stoldGps: nybilData?.stold_gps === true
      ? 'Ja'
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
  };

  // Build damage records from legacy damages (BUHS) - same source as /check
  const damageRecords: DamageRecord[] = legacyDamages.map((d: LegacyDamage) => ({
    id: d.id,
    regnr: cleanedRegnr,
    skadetyp: getLegacyDamageText(d) || 'Okänd',
    datum: formatDate(d.damage_date),
    status: 'Befintlig',
    source: 'legacy' as const,
    sourceInfo: 'Källa: BUHS (reg. nr har aldrig checkats in med incheckad.se/check)',
  }));

  // Build history records
  const historyRecords: HistoryRecord[] = [];

  // Add checkins to history
  for (const checkin of checkins) {
    historyRecords.push({
      id: `checkin-${checkin.id}`,
      datum: formatDateTime(checkin.created_at),
      rawTimestamp: checkin.created_at || '',
      typ: 'incheckning',
      sammanfattning: `Incheckad vid ${checkin.current_ort || '?'} / ${checkin.current_station || '?'}. Mätarställning: ${checkin.odometer_km || '?'} km`,
      utfordAv: getFullNameFromEmail(checkin.user_email || checkin.incheckare || ''),
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

  return {
    found: true,
    source,
    vehicle,
    damages: damageRecords,
    history: historyRecords,
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
