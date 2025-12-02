import { supabase } from './supabase';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

export type VehicleStatusData = {
  // Basic vehicle info
  regnr: string;
  bilmarkeModell: string;
  bilenStarNu: string; // ort + station
  matarstallning: string;
  hjultyp: string;
  drivmedel: string;
  serviceintervall: string;
  maxKmManad: string;
  avgiftOverKm: string;
  saludatum: string;
  antalSkador: number;
  stoldGps: string;
  klarForUthyrning: string;
};

export type DamageRecord = {
  id: number;
  regnr: string;
  skadetyp: string;
  datum: string;
  status: string;
  folder?: string;
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
  source: 'nybil_inventering' | 'vehicles' | 'both' | 'none';
  vehicle: VehicleStatusData | null;
  damages: DamageRecord[];
  history: HistoryRecord[];
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
  let source: 'nybil_inventering' | 'vehicles' | 'both' | 'none' = 'none';
  if (nybilData && vehicleData) source = 'both';
  else if (nybilData) source = 'nybil_inventering';
  else if (vehicleData) source = 'vehicles';

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

  // Build vehicle status data using priority order
  const vehicle: VehicleStatusData = {
    regnr: cleanedRegnr,
    
    // Bilmärke & Modell: nybil_inventering → vehicles
    bilmarkeModell: nybilData?.bilmarke && nybilData?.modell
      ? `${nybilData.bilmarke} ${nybilData.modell}`
      : nybilData?.bilmodell
        ? nybilData.bilmodell
        : vehicleData
          ? `${vehicleData.brand || ''} ${vehicleData.model || ''}`.trim() || '---'
          : '---',
    
    // Bilen står nu: checkins.current_station (senaste) → nybil_inventering.plats_aktuell_station
    bilenStarNu: latestCheckin?.current_ort && latestCheckin?.current_station
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
    
    // Antal registrerade skador
    antalSkador: damages.length,
    
    // Stöld-GPS monterad: nybil_inventering.stold_gps
    stoldGps: nybilData?.stold_gps === true
      ? 'Ja'
      : nybilData?.stold_gps === false
        ? 'Nej'
        : '---',
    
    // Klar för uthyrning: nybil_inventering.klar_for_uthyrning
    klarForUthyrning: nybilData?.klar_for_uthyrning === true
      ? 'Ja'
      : nybilData?.klar_for_uthyrning === false
        ? 'Nej'
        : '---',
  };

  // Build damage records
  const damageRecords: DamageRecord[] = damages.map((d: any) => ({
    id: d.id,
    regnr: d.regnr,
    skadetyp: d.user_type || d.damage_type || 'Okänd',
    datum: formatDate(d.damage_date || d.created_at),
    status: d.is_documented ? 'Dokumenterad' : 'Ej dokumenterad',
    folder: d.folder || undefined,
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
