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
  source: 'legacy' | 'damages' | 'checkin';
  // Source info for display
  sourceInfo?: string; // e.g., "Källa: BUHS" or "Incheckad av Per Andersson 2025-12-03 14:30"
  // For BUHS damages (legacy)
  legacy_damage_source_text?: string | null;
  legacy_buhs_text?: string | null; // Original BUHS description (combined from damage_type_raw, notes, etc.)
  original_damage_date?: string | null;
  // For documented BUHS damages - track where they were documented
  checkinWhereDocumented?: number | null; // checkin_id where this damage was documented
  documentedBy?: string | null; // checker_name who documented it
  documentedDate?: string | null; // Date when damage was documented (checkin date)
  // Flags for handled/inventoried status
  is_handled?: boolean; // True if damage was handled (documented/not_found/existing)
  is_inventoried?: boolean; // True if damage was inventoried during checkin
  is_unmatched_buhs?: boolean; // True if this is an unmatched BUHS damage
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
      isNotFoundOlder?: boolean; // True if this is a not_found older BUHS damage (Kommentar 1)
      handledStatus?: string; // Full handled status text (e.g., "Gick ej att dokumentera ...")
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
    damageDate?: string; // BUHS damage date for formatting history
    damageStatus?: string; // Full status string (e.g., "Dokumenterad (urspr. BUHS ...)")
    checkinWhereDocumented?: number | null; // checkin_id where this BUHS damage was documented
    documentedBy?: string | null; // checker_name who documented it
    mediaFolder?: string | null; // media folder for linking to damage photos (Kommentar 2)
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

// Type for checkin_damages data
type CheckinDamageData = {
  id?: number;
  checkin_id: string;
  type: 'new' | 'documented' | 'not_found' | 'existing';
  damage_type: string | null;
  car_part: string | null;
  position: string | null;
  description: string | null;
  photo_urls: string[] | null;
  video_urls: string[] | null;
  positions?: any[] | null;
  regnr?: string | null;
  created_at: string;
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

// Helper to extract date-only part from a date string (strips time)
// Ensures consistent keys regardless of whether timestamp is included
function toDateOnly(d: any): string {
  if (!d) return "";
  const s = String(d).trim();
  const t = s.indexOf("T");
  return t === -1 ? s : s.slice(0, t);
}

// Helper to create stable key for deterministic damage deduplication
// Used to merge BUHS and CHECK sources by legacy_damage_source_text + date
// Uses normalized text + date-only (no time component)
// Updated normalization: gemener, trim, compress whitespace, repor→repa
function createStableKey(legacyDamageSourceText: string | null | undefined, date: string | null | undefined): string {
  const normalizedText = normalizeTextForMatching(legacyDamageSourceText);
  const dateOnly = toDateOnly(date);
  return `${normalizedText}_${dateOnly}`;
}

// Dedup helper: determines priority for same-key damages
// Priority: handled (documented/existing/not_found) > BUHS-unmatched
function getDamageEntryPriority(entry: { matchedCheckinDamage?: any | null }): number {
  if (entry.matchedCheckinDamage) return 1; // handled = highest priority
  return 2; // BUHS-unmatched = lower priority
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

// Helper to normalize text for matching (case/whitespace insensitive, allow Repa/Repor mismatch)
function normalizeTextForMatching(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/_/g, ' ')        // FALGSKADA_SOMMARHJUL → falgskada sommarhjul
    .replace(/\s+/g, ' ')
    .replace(/repor/g, 'repa') // Normalize Repor → Repa
    .replace(/ä/g, 'a')        // fälgskada → falgskada
    .replace(/ö/g, 'o')        // övrig → ovrig
    .replace(/å/g, 'a')        // å → a
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
    .replace(/\s+/g, '')
    .replace(/repor/g, 'repa')
    .replace(/repa/g, 'rep') // Further normalize to just "rep"
    .replace(/skrapmärke/g, 'skrap')
    .replace(/stenskott/g, 'sten')
    .replace(/ä/g, 'a')        // ä → a
    .replace(/ö/g, 'o')        // ö → o
    .replace(/å/g, 'a')        // å → a
    .trim();
}

// Helper to format BUHS damage text with (BUHS) suffix
function formatBuhsDamageText(text: string | null | undefined): string {
  return text ? `${text} (BUHS)` : 'Okänd (BUHS)';
}

// Helper to format not_found status message
function formatNotFoundStatus(comment: string, checkerName: string, checkinDateTime: string): string {
  return comment 
    ? `Gick ej att dokumentera. "${comment}" (${checkerName}, ${checkinDateTime})` 
    : `Gick ej att dokumentera. (${checkerName}, ${checkinDateTime})`;
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

/**
 * Add new damages from checkin_damages (type='new') to damageRecords
 * These are ALWAYS unique - never deduplicate
 */
function addNewDamagesToRecords(
  damageRecords: DamageRecord[],
  allCheckinDamages: CheckinDamageData[],
  checkins: any[],
  cleanedRegnr: string,
  isGEU29F: boolean
): void {
  for (const cd of allCheckinDamages.filter(cd => cd.type === 'new')) {
    // Find the checkin for this damage
    const checkin = checkins.find(c => c.id === cd.checkin_id);
    
    // Build damage type with positions
    let skadetyp: string;
    const damageType = cd.damage_type || 'Okänd';
    
    if (cd.positions && Array.isArray(cd.positions) && cd.positions.length > 0) {
      const positionsStr = formatDamagePositions(cd.positions);
      skadetyp = positionsStr ? `${damageType} - ${positionsStr}` : damageType;
    } else if (cd.car_part || cd.position) {
      const parts = [cd.car_part, cd.position].filter(Boolean);
      skadetyp = `${damageType} - ${parts.join(' - ')}`;
    } else {
      skadetyp = damageType;
    }
    
    // Extract folder from photo_urls if available
    let folder: string | undefined;
    if (cd.photo_urls && cd.photo_urls.length > 0) {
      const firstUrl = cd.photo_urls[0];
      const match = firstUrl.match(/damage-photos\/[^\/]+\/[^\/]+\/([^\/]+)\//);
      folder = match ? match[1] : undefined;
    }
    
    // GEU29F: Override folder to undefined due to data integrity issues
    if (isGEU29F) {
      folder = undefined;
    }
    
    const checkerName = checkin?.checker_name || 'Okänd';
    const damageDate = formatDate(cd.created_at);
    
    // New damages are added directly to damageRecords (no deduplication)
    damageRecords.push({
      id: `checkin_new_${cd.id}`,
      regnr: cleanedRegnr,
      skadetyp,
      datum: damageDate,
      status: '', // New damages don't have a status
      folder,
      source: 'checkin' as const,
      sourceInfo: `Registrerad ${damageDate} av ${checkerName}`,
      legacy_damage_source_text: null,
      legacy_buhs_text: null,
      original_damage_date: null,
      checkinWhereDocumented: checkin?.id || null,
      documentedBy: checkerName,
      documentedDate: damageDate,
      is_handled: false, // New damages are not "handled" (they're not from BUHS)
      is_inventoried: true, // New damages are inventoried during checkin
      is_unmatched_buhs: false,
    });
  }
}

// =================================================================
// 3. MAIN DATA FETCHING FUNCTION
// =================================================================

export async function getVehicleStatus(regnr: string): Promise<VehicleStatusResult> {
  const cleanedRegnr = regnr.toUpperCase().trim().replace(/\s/g, '');
  
  // Feature flag for GEU29F: Treat as undocumented due to data integrity issues (Kommentar C)
  const isGEU29F = cleanedRegnr === 'GEU29F';
  
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
    
    // damages (from our damages table) - filter by imported_at IS NOT NULL for BUHS-imported
    // Note: We'll use this to identify BUHS-imported damages that were documented
    supabase
      .from('damages')
      .select('*')
      .eq('regnr', cleanedRegnr)
      .order('created_at', { ascending: false }),
    
    // legacy damages (from BUHS via RPC) - includes saludatum
    // Note: This returns damages from the source BUHS system
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
  
  // DEBUG: Log raw data for LRA75R
  if (cleanedRegnr === 'LRA75R') {
    console.log('[DEBUG LRA75R] Raw damages from Supabase:', damages.map(d => ({
      id: d.id,
      legacy_damage_source_text: d.legacy_damage_source_text,
      original_damage_date: d.original_damage_date,
      damage_date: d.damage_date,
      created_at: d.created_at,
      source: d.source,
      folder: (d.uploads as any)?.folder || d.folder,
      photo_urls: d.photo_urls,
    })));
    console.log('[DEBUG LRA75R] Legacy damages from RPC:', legacyDamages.map(d => ({
      id: d.id,
      damage_type_raw: d.damage_type_raw,
      note_customer: d.note_customer,
      note_internal: d.note_internal,
      damage_date: d.damage_date,
    })));
  }
  
  // Fetch all checkin_damages for this regnr via server-side API
  // This uses service role on the server to bypass RLS issues
  const checkinIds = checkins.map(c => c.id).filter(Boolean);
  
  let allCheckinDamages: CheckinDamageData[] = [];
  
  // Fetch checkin_damages via API route (server-side with service role)
  if (checkinIds.length > 0) {
    try {
      const apiResponse = await fetch(`/api/checkin-damages?regnr=${encodeURIComponent(cleanedRegnr)}`);
      
      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        console.error(`[ERROR ${cleanedRegnr}] API /checkin-damages failed:`, errorData);
      } else {
        const apiData = await apiResponse.json();
        
        // Include all damage types: new, documented, not_found, and existing
        const rawData = (apiData.data || []) as CheckinDamageData[];
        allCheckinDamages = rawData.filter(cd => 
          cd.type === 'documented' || cd.type === 'not_found' || cd.type === 'existing' || cd.type === 'new'
        );
        
        // DEBUG: Log checkin_damages for LRA75R
        if (cleanedRegnr === 'LRA75R') {
          console.log('[DEBUG LRA75R] All checkin_damages:', allCheckinDamages.map(cd => ({
            id: cd.id,
            checkin_id: cd.checkin_id,
            type: cd.type,
            damage_type: cd.damage_type,
            car_part: cd.car_part,
            position: cd.position,
            description: cd.description,
            photo_urls: cd.photo_urls,
            video_urls: cd.video_urls,
          })));
        }
      }
    } catch (err) {
      console.error(`[ERROR ${cleanedRegnr}] Failed to call /api/checkin-damages:`, err);
      // Continue with empty array
      allCheckinDamages = [];
    }
  }
  
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
      // Show datetime even if city/station is missing
      bilenStarNu: latestCheckin?.completed_at || latestCheckin?.created_at
        ? latestCheckin?.current_city && latestCheckin?.current_station
          ? `${latestCheckin.current_city} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || 'Okänd'})`
          : `${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || 'Okänd'}`
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

    // ====================================================================================
    // DETERMINISTIC DAMAGE DEDUP: Map-based merge of BUHS + CHECK (checkins source)
    // ====================================================================================
    
    // Unified stable key structure for BUHS + CHECK merge
    type DamageEntry = {
      id: number | string;
      stableKey: string;
      legacyDamageSourceText: string | null;
      date: string | null;
      source: 'BUHS' | 'CHECK';
      buhsText?: string;
      buhsId?: number;
      damageTypeRaw?: string | null;
      userPositions?: any[] | null;
      folder?: string | null;
      photoUrls?: string[] | null;
      matchedCheckinDamage?: CheckinDamageData | null;
      checkin?: any | null;
    };
    
    const damageMap = new Map<string, DamageEntry>();
    const matchedCheckinDamageIds = new Set<number>();
    
    // Build BUHS text→date map for robust CHECK date fallback
    const buhsDateByText = new Map<string, string>();
    
    // PASS 1: Add all BUHS damages to map
    for (let i = 0; i < legacyDamages.length; i++) {
      const d = legacyDamages[i];
      const legacyText = getLegacyDamageText(d);
      
      // BUHS: date = damage_date (raw, no formatting)
      const date = d.damage_date;
      
      // Store in BUHS text→date map for CHECK fallback
      const normalizedText = normalizeTextForMatching(legacyText);
      buhsDateByText.set(normalizedText, toDateOnly(date));
      
      const stableKey = createStableKey(legacyText, date);
      
      let matchedCheckinDamage: CheckinDamageData | null = null;
      
      if (!isGEU29F) {
        for (const cd of allCheckinDamages) {
          if (!cd.id || matchedCheckinDamageIds.has(cd.id)) continue;
          
          const cdDescription = cd.description || '';
          if (textsMatch(legacyText, cdDescription) ||
              textsMatch(d.note_customer, cdDescription) ||
              textsMatch(d.note_internal, cdDescription) ||
              textsMatch(d.damage_type_raw, cdDescription)) {
            matchedCheckinDamage = cd;
            matchedCheckinDamageIds.add(cd.id);
            break;
          }
        }
        
        if (!matchedCheckinDamage) {
          const normalizedBuhsType = normalizeDamageTypeForKey(d.damage_type_raw);
          const candidatesForLooseMatch = allCheckinDamages.filter(cd => {
            if (!cd.id || matchedCheckinDamageIds.has(cd.id)) return false;
            const normalizedCdType = normalizeDamageTypeForKey(cd.damage_type);
            return normalizedCdType && normalizedBuhsType && normalizedCdType === normalizedBuhsType;
          });
          
          if (candidatesForLooseMatch.length > 0) {
            matchedCheckinDamage = candidatesForLooseMatch[0];
            if (matchedCheckinDamage.id) {
              matchedCheckinDamageIds.add(matchedCheckinDamage.id);
            }
          }
        }
        
        if (!matchedCheckinDamage) {
          const unmatchedExisting = allCheckinDamages.find(cd => 
            cd.id && !matchedCheckinDamageIds.has(cd.id) && cd.type === 'existing'
          );
          if (unmatchedExisting && unmatchedExisting.id) {
            matchedCheckinDamage = unmatchedExisting;
            matchedCheckinDamageIds.add(unmatchedExisting.id);
          }
        }
      }
      
      const checkin = matchedCheckinDamage 
        ? checkins.find(c => c.id === matchedCheckinDamage.checkin_id)
        : null;
      
      const newEntry: DamageEntry = {
        id: d.id,
        stableKey,
        legacyDamageSourceText: legacyText,
        date: formatDate(date),
        source: 'BUHS',
        buhsText: legacyText,
        buhsId: d.id,
        matchedCheckinDamage,
        checkin,
      };
      
      // Priority-based dedup: keep handled over BUHS-unmatched
      if (damageMap.has(stableKey)) {
        const existingEntry = damageMap.get(stableKey)!;
        const existingPriority = getDamageEntryPriority(existingEntry);
        const newPriority = getDamageEntryPriority(newEntry);
        
        // Only replace if new entry has higher priority (lower number = higher priority)
        if (newPriority < existingPriority) {
          damageMap.set(stableKey, newEntry);
        }
        // If same priority, keep the first one (skip this duplicate)
      } else {
        damageMap.set(stableKey, newEntry);
      }
    }
    
    // PASS 2: Process CHECK damages (damages table with legacy_damage_source_text)
    for (const damage of damages) {
      if (!damage.legacy_damage_source_text || damage.source !== 'CHECK') {
        continue;
      }
      
      // CHECK: Use BUHS date fallback if original_damage_date is missing
      const legacyText = damage.legacy_damage_source_text;
      const normalizedText = normalizeTextForMatching(legacyText);
      const buhsDate = buhsDateByText.get(normalizedText);
      const rawDate = damage.original_damage_date || buhsDate || damage.damage_date || damage.created_at;
      const stableKey = createStableKey(legacyText, rawDate); // createStableKey uses toDateOnly internally
      
      const damageTypeRaw = damage.damage_type_raw || null;
      const userPositions = (damage.user_positions && Array.isArray(damage.user_positions)) 
        ? damage.user_positions 
        : null;
      const folder = (damage.uploads as any)?.folder || damage.folder || null;
      const photoUrls = damage.photo_urls || null;
      
      // Extract CHECK documentation metadata
      const checkDocumentedDate = toDateOnly(damage.damage_date || damage.created_at);
      const checkDocumentedBy = (damage as any).handled_by_name || (damage as any).author || null;
      
      // Match CHECK damage to checkin_damages to determine if it's handled
      let matchedCheckinDamage: CheckinDamageData | null = null;
      
      if (!isGEU29F) {
        // Try to match by damage ID first (most reliable)
        const damageId = damage.id;
        matchedCheckinDamage = allCheckinDamages.find(cd => 
          cd.id && !matchedCheckinDamageIds.has(cd.id) && cd.damage_id === damageId
        ) || null;
        
        // If no match by ID, try text matching
        if (!matchedCheckinDamage) {
          for (const cd of allCheckinDamages) {
            if (!cd.id || matchedCheckinDamageIds.has(cd.id)) continue;
            
            const cdDescription = cd.description || '';
            if (textsMatch(legacyText, cdDescription) ||
                textsMatch(damageTypeRaw, cdDescription)) {
              matchedCheckinDamage = cd;
              matchedCheckinDamageIds.add(cd.id);
              break;
            }
          }
        } else if (matchedCheckinDamage.id) {
          matchedCheckinDamageIds.add(matchedCheckinDamage.id);
        }
      }
      
      // Find matching checkin for this checkin_damage
      const checkin = matchedCheckinDamage 
        ? checkins.find(c => c.id === matchedCheckinDamage.checkin_id)
        : null;
      
      // Create new entry for priority comparison
      const newEntry: DamageEntry = {
        id: damage.id,
        stableKey,
        legacyDamageSourceText: damage.legacy_damage_source_text,
        date: formatDate(rawDate),
        source: 'CHECK',
        damageTypeRaw,
        userPositions,
        folder,
        photoUrls,
        matchedCheckinDamage, // Now properly matched!
        checkin,
        documentedDate: checkDocumentedDate,
        documentedBy: checkDocumentedBy,
      };
      
      if (damageMap.has(stableKey)) {
        // Priority-based replacement: compare priorities
        const existingEntry = damageMap.get(stableKey)!;
        const existingPriority = getDamageEntryPriority(existingEntry);
        const newPriority = getDamageEntryPriority(newEntry);
        
        if (newPriority < existingPriority) {
          // New entry has higher priority, replace
          damageMap.set(stableKey, newEntry);
        } else {
          // Existing entry has equal or higher priority, but merge CHECK metadata into it
          existingEntry.damageTypeRaw = damageTypeRaw;
          existingEntry.userPositions = userPositions;
          existingEntry.folder = folder;
          existingEntry.photoUrls = photoUrls;
          existingEntry.documentedDate = checkDocumentedDate;
          existingEntry.documentedBy = checkDocumentedBy;
        }
      } else {
        damageMap.set(stableKey, newEntry);
      }
    }
    
    // PASS 3: Convert map to damageRecords array
    const damageRecords: DamageRecord[] = [];
    
    for (const entry of damageMap.values()) {
      const matchedCheckinDamage = entry.matchedCheckinDamage;
      const checkin = entry.checkin;
      const legacyText = entry.legacyDamageSourceText || '';
      const damageDate = entry.date || '';
      
      let skadetyp: string;
      let status: string;
      let folder: string | undefined;
      let sourceInfo: string;
      
      if (matchedCheckinDamage) {
        const cdType = matchedCheckinDamage.type;
        
        if (cdType === 'documented' || cdType === 'existing') {
          const damageType = entry.damageTypeRaw || matchedCheckinDamage.damage_type || 'Okänd';
          
          if (entry.userPositions && entry.userPositions.length > 0) {
            const positionsStr = formatDamagePositions(entry.userPositions);
            skadetyp = positionsStr ? `${damageType} - ${positionsStr}` : damageType;
          } else if (matchedCheckinDamage.positions && Array.isArray(matchedCheckinDamage.positions) && 
                     matchedCheckinDamage.positions.length > 0) {
            const pos = matchedCheckinDamage.positions[0];
            const parts: string[] = [];
            if (pos.carPart) parts.push(pos.carPart);
            if (pos.position) parts.push(pos.position);
            const posStr = parts.join(' - ');
            skadetyp = posStr ? `${damageType} - ${posStr}` : damageType;
          } else if (matchedCheckinDamage.car_part || matchedCheckinDamage.position) {
            const parts = [matchedCheckinDamage.car_part, matchedCheckinDamage.position].filter(Boolean);
            skadetyp = `${damageType} - ${parts.join(' - ')}`;
          } else {
            skadetyp = legacyText || damageType;
          }
          
          folder = entry.folder;
          if (!folder && checkin && matchedCheckinDamage.photo_urls && matchedCheckinDamage.photo_urls.length > 0) {
            const firstUrl = matchedCheckinDamage.photo_urls[0];
            const match = firstUrl.match(/damage-photos\/[^\/]+\/[^\/]+\/([^\/]+)\//);
            folder = match ? match[1] : undefined;
          }
          
          if (isGEU29F) {
            folder = undefined;
          }
          
          const checkerName = checkin?.checker_name || 'Okänd';
          const checkinDate = checkin ? formatDate(checkin.completed_at || checkin.created_at) : damageDate;
          status = `Dokumenterad ${checkinDate} av ${checkerName}`;
          sourceInfo = 'Källa: BUHS';
          
        } else if (cdType === 'not_found') {
          // Fix 3: not_found damages don't need (BUHS) suffix since status text clarifies
          skadetyp = legacyText || 'Okänd skada';
          
          const checkerName = checkin?.checker_name || 'Okänd';
          const checkinDateTime = checkin ? formatDateTime(checkin.completed_at || checkin.created_at) : damageDate;
          const comment = matchedCheckinDamage.description || '';
          
          status = formatNotFoundStatus(comment, checkerName, checkinDateTime);
          folder = undefined;
          sourceInfo = 'Källa: BUHS';
          
        } else {
          skadetyp = formatBuhsDamageText(legacyText);
          status = '';
          folder = undefined;
          sourceInfo = 'Källa: BUHS';
        }
        
      } else {
        if (entry.damageTypeRaw && entry.userPositions && entry.userPositions.length > 0) {
          const positionsStr = formatDamagePositions(entry.userPositions);
          skadetyp = positionsStr ? `${entry.damageTypeRaw} – ${positionsStr} (BUHS)` : `${entry.damageTypeRaw} (BUHS)`;
        } else if (entry.damageTypeRaw) {
          skadetyp = `${entry.damageTypeRaw} (BUHS)`;
        } else {
          skadetyp = formatBuhsDamageText(legacyText);
        }
        
        folder = entry.folder;
        if (isGEU29F) {
          folder = undefined;
        }
        
        status = '';
        sourceInfo = 'Källa: BUHS';
      }
      
      damageRecords.push({
        id: entry.id,
        regnr: cleanedRegnr,
        skadetyp: skadetyp,
        datum: damageDate,
        status: status,
        folder: folder,
        source: 'legacy' as const,
        sourceInfo,
        legacy_damage_source_text: legacyText,
        legacy_buhs_text: legacyText,
        original_damage_date: damageDate,
        checkinWhereDocumented: checkin?.id || null,
        documentedBy: entry.documentedBy || checkin?.checker_name || null,
        documentedDate: entry.documentedDate || (checkin ? formatDate(checkin.completed_at || checkin.created_at) : null),
        is_handled: matchedCheckinDamage !== null,
        is_inventoried: matchedCheckinDamage !== null,
        is_unmatched_buhs: matchedCheckinDamage === null,
        _stableKey: entry.stableKey, // Store actual stableKey for debugging
      });
    }

    // ====================================================================================
    // Add new damages from checkin_damages (type='new')
    // These are ALWAYS unique - never deduplicate
    // ====================================================================================
    addNewDamagesToRecords(damageRecords, allCheckinDamages, checkins, cleanedRegnr, isGEU29F);

    // Build history records from checkins only (with avvikelser)
    const historyRecords: HistoryRecord[] = [];
    const damagesShownInCheckins = new Set<number>(); // Track damage IDs shown in checkins
    
    // Fetch damage counts for checkins (for avvikelser count)
    // Note: checkinIds is already declared above
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
      
      // Match damages from damageRecords to this checkin
      // For BUHS damages: filter allCheckinDamages by checkin_id and match to damageRecords
      // For new damages: match by date
      const checkinDateStr = checkin.completed_at || checkin.created_at;
      
      // Get checkin_damages for this specific checkin
      const checkinDamagesForThisCheckin = allCheckinDamages.filter(cd => cd.checkin_id === checkin.id);
      
      // Match BUHS damages that were handled in this checkin
      const matchedBuhsDamages = checkinDamagesForThisCheckin.map(cd => {
        // Find the corresponding BUHS damage in damageRecords by matching damage_type
        // The BUHS damage should already be in damageRecords with the right skadetyp and status
        return damageRecords.find(damage => 
          damage.source === 'legacy' && 
          damage.checkinWhereDocumented === checkin.id &&
          (damage.skadetyp.includes(cd.damage_type || '') || 
           damage.legacy_damage_source_text?.includes(cd.damage_type || ''))
        );
      }).filter((d): d is typeof damageRecords[0] => d !== undefined);
      
      // Also match damages documented via CHECK merge on this checkin's date
      // This handles cases where checkin_damages is empty but CHECK data exists with documentation date
      const checkinDate = checkinDateStr ? new Date(checkinDateStr) : null;
      const checkinYMD = checkinDate && !isNaN(checkinDate.getTime()) 
        ? checkinDate.toISOString().split('T')[0] 
        : null;
      
      const matchedCheckDamages = checkinYMD ? damageRecords.filter(d => {
        if (d.source === 'legacy' && d.folder) {
          if (d.checkinWhereDocumented === checkin.id) return true; // Allow
          if (d.documentedDate === checkinYMD) return true; // Date match
        }
        return false;
      }) : [];
      
      // Also match damages by date (for new damages created during this checkin)
      const matchedDateDamages = checkinYMD ? damageRecords.filter(damage => {
        // Skip damages already matched in matchedCheckDamages
        if (damage.source === 'legacy' && damage.folder) {
          if (damage.checkinWhereDocumented === checkin.id) return false;
          if (damage.documentedDate === checkinYMD) return false;
        }
        
        // Match by date: damage.datum should match checkin date (YYYY-MM-DD)
        if (damage.datum === checkinYMD) {
          return true;
        }
        
        return false;
      }) : [];
      
      // Combine all types of matches
      const matchedDamages = [...matchedBuhsDamages, ...matchedCheckDamages, ...matchedDateDamages];
      
      // Dedup by damage.id (Fix 2.1)
      const seenDamageIds = new Set<number | string>();
      const dedupedMatchedDamages = matchedDamages.filter(damage => {
        if (seenDamageIds.has(damage.id)) {
          return false; // Skip duplicate
        }
        seenDamageIds.add(damage.id);
        return true;
      });
      
      // Track which damages are shown in this checkin
      dedupedMatchedDamages.forEach(damage => damagesShownInCheckins.add(damage.id));
      
      // Build skador array from matched damageRecords
      const skador = dedupedMatchedDamages.map(damage => {
        // Determine if this is a not_found damage
        const isNotFound = damage.status?.startsWith('Gick ej att dokumentera');
        
        // For not_found: NO media link (Fix 2.2)
        // For documented/existing: media link only if folder exists (Fix 2.4)
        const shouldShowMedia = !isNotFound && damage.folder;
        
        // Add damage media to mediaLankar if should show media and not already there
        if (shouldShowMedia) {
          const damageMediaKey = `skada-${damage.id}`;
          if (!mediaLankar[damageMediaKey]) {
            mediaLankar[damageMediaKey] = `/media/${damage.folder}`;
          }
        }
        
        return {
          // Fix 2.2 & 2.3: For not_found, show full status text; for documented/existing, show only skadetyp
          typ: isNotFound ? damage.status : damage.skadetyp,
          beskrivning: '', // Kept for compatibility with display logic
          // Fix 2.2: For not_found, NO media link
          mediaUrl: shouldShowMedia ? `/media/${damage.folder}` : undefined,
          isDocumentedOlder: damage.source === 'legacy' && damage.legacy_damage_source_text != null && damage.status?.startsWith('Dokumenterad'),
          originalDamageDate: damage.source === 'legacy' ? damage.datum : undefined,
          isNotFoundOlder: isNotFound, // Kommentar 1
          // Fix 2.3: For documented/existing, don't show "Dokumenterad..." status row
          handledStatus: undefined, // Don't show status for checkin events (already in typ or apparent from context)
        };
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
    // For handled damages (documented/not_found/existing), always create SKADA event
    // For unmatched BUHS (status="Källa BUHS"), only create if not shown in checkin
    
    for (const damage of damageRecords) {
      if (damage.source === 'legacy') {
        
        // Determine if this damage should get a SKADA event
        const isHandled = damage.status?.startsWith('Dokumenterad') || damage.status?.startsWith('Gick ej att dokumentera');
        const isUnmatchedBuhs = damage.is_unmatched_buhs === true;
        // For GEU29F, ALWAYS create SKADA events for ALL legacy damages (bypass all dedupe logic)
        // For other vehicles, create events for: handled damages OR unmatched BUHS not shown in checkin
        const shouldCreateEvent = isGEU29F || isHandled || !damagesShownInCheckins.has(damage.id);
        
        if (shouldCreateEvent) {
          // Use the damage's actual status instead of hardcoded "Ej dokumenterad"
          // The status reflects whether it was matched to checkin_damages (documented/not_found/existing)
          
          // For documented/existing damages, format as: "Dokumenterad [DATE] av [NAME]"
          // For not_found damages, use the full status which includes comment
          // For unmatched BUHS, don't show status (damage description already has (BUHS) suffix)
          let sammanfattning: string;
          if (damage.status?.startsWith('Dokumenterad')) {
            // Documented or existing damage - show status and append original BUHS text
            sammanfattning = damage.status;
            if (damage.legacy_buhs_text) {
              sammanfattning += `\nUrsprunglig beskrivning i BUHS: "${damage.legacy_buhs_text}"`;
            }
          } else if (damage.is_unmatched_buhs) {
            // Unmatched BUHS - don't show status since damage description already has (BUHS) suffix
            sammanfattning = '';
          } else {
            // not_found or other status - use status as is
            sammanfattning = damage.status || 'Ej dokumenterad i Incheckad';
          }
          
          historyRecords.push({
            id: `buhs-${damage.id}`,
            datum: damage.datum,
            rawTimestamp: damage.datum || '',
            typ: 'buhs_skada',
            sammanfattning,
            utfordAv: 'System (BUHS)',
            buhsSkadaDetaljer: {
              skadetyp: damage.skadetyp,
              legacy_damage_source_text: damage.legacy_damage_source_text,
              damageDate: damage.original_damage_date || damage.datum,
              damageStatus: damage.status,
              checkinWhereDocumented: damage.checkinWhereDocumented || null,
              documentedBy: damage.documentedBy || null,
              mediaFolder: damage.folder || null, // Kommentar 2 - include media folder for history
            },
          });
        }
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
    // Show datetime even if city/station is missing
    bilenStarNu: latestCheckin?.completed_at || latestCheckin?.created_at
      ? latestCheckin?.current_ort && latestCheckin?.current_station
        ? `${latestCheckin.current_ort} / ${latestCheckin.current_station} (${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || getFullNameFromEmail(latestCheckin.user_email || latestCheckin.incheckare || 'Okänd')})`
        : `${formatDateTime(latestCheckin.completed_at || latestCheckin.created_at)} av ${latestCheckin.checker_name || getFullNameFromEmail(latestCheckin.user_email || latestCheckin.incheckare || 'Okänd')}`
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
  for (let i = 0; i < legacyDamages.length; i++) {
    const d = legacyDamages[i];
    const key = `${cleanedRegnr}-${formatDate(d.damage_date)}`;
    legacyDamageKeys.add(key);
  }
  
  // ==================================================================
  // DETERMINISTIC DAMAGE DEDUP: Map-based merge of BUHS + CHECK
  // ==================================================================
  
  // Unified stable key structure for BUHS + CHECK merge
  type DamageEntry = {
    id: number | string;
    stableKey: string;
    legacyDamageSourceText: string | null;
    date: string | null; // original_damage_date || damage_date
    source: 'BUHS' | 'CHECK';
    // Fields from BUHS (filled for source='BUHS')
    buhsText?: string;
    buhsId?: number;
    // Fields from CHECK (filled for source='CHECK' or merged)
    damageTypeRaw?: string | null;
    userPositions?: any[] | null;
    folder?: string | null;
    photoUrls?: string[] | null;
    // Checkin matching data (if applicable)
    matchedCheckinDamage?: CheckinDamageData | null;
    checkin?: any | null;
  };
  
  // Map for deterministic merge: stableKey -> DamageEntry
  const damageMap = new Map<string, DamageEntry>();
  const matchedCheckinDamageIds = new Set<number>(); // Track which checkin_damages we've matched
  
  // Build BUHS text→date map for robust CHECK date fallback
  const buhsDateByText = new Map<string, string>();
  
  // ====================================================================================
  // PASS 1: Add all BUHS damages to map using stable key (legacy_damage_source_text, damage_date)
  // ====================================================================================
  for (let i = 0; i < legacyDamages.length; i++) {
    const d = legacyDamages[i];
    const legacyText = getLegacyDamageText(d);
    
    // BUHS: date = damage_date (raw, no formatting)
    const date = d.damage_date;
    
    // Store in BUHS text→date map for CHECK fallback
    const normalizedText = normalizeTextForMatching(legacyText);
    buhsDateByText.set(normalizedText, toDateOnly(date));
    
    const stableKey = createStableKey(legacyText, date);
    
    // Try to find matching checkin_damage entry for this BUHS damage
    let matchedCheckinDamage: CheckinDamageData | null = null;
    
    // Try primary text matching first
    // Skip for GEU29F due to data integrity issues
    if (!isGEU29F) {
      for (const cd of allCheckinDamages) {
        if (!cd.id || matchedCheckinDamageIds.has(cd.id)) continue;
        
        const cdDescription = cd.description || '';
        if (textsMatch(legacyText, cdDescription) ||
            textsMatch(d.note_customer, cdDescription) ||
            textsMatch(d.note_internal, cdDescription) ||
            textsMatch(d.damage_type_raw, cdDescription)) {
          matchedCheckinDamage = cd;
          matchedCheckinDamageIds.add(cd.id);
          break;
        }
      }
      
      // If no text match, try loose key matching (damage_type only)
      if (!matchedCheckinDamage) {
        const normalizedBuhsType = normalizeDamageTypeForKey(d.damage_type_raw);
        const candidatesForLooseMatch = allCheckinDamages.filter(cd => {
          if (!cd.id || matchedCheckinDamageIds.has(cd.id)) return false;
          const normalizedCdType = normalizeDamageTypeForKey(cd.damage_type);
          return normalizedCdType && normalizedBuhsType && normalizedCdType === normalizedBuhsType;
        });
        
        if (candidatesForLooseMatch.length > 0) {
          matchedCheckinDamage = candidatesForLooseMatch[0];
          if (matchedCheckinDamage.id) {
            matchedCheckinDamageIds.add(matchedCheckinDamage.id);
          }
        }
      }
      
      // Final fallback: try first unmatched existing type
      if (!matchedCheckinDamage) {
        const unmatchedExisting = allCheckinDamages.find(cd => 
          cd.id && !matchedCheckinDamageIds.has(cd.id) && cd.type === 'existing'
        );
        if (unmatchedExisting && unmatchedExisting.id) {
          matchedCheckinDamage = unmatchedExisting;
          matchedCheckinDamageIds.add(unmatchedExisting.id);
        }
      }
    }
    
    // Find matching checkin for this checkin_damage
    const checkin = matchedCheckinDamage 
      ? checkins.find(c => c.id === matchedCheckinDamage.checkin_id)
      : null;
    
    const newEntry: DamageEntry = {
      id: d.id,
      stableKey,
      legacyDamageSourceText: legacyText,
      date: formatDate(date),
      source: 'BUHS',
      buhsText: legacyText,
      buhsId: d.id,
      matchedCheckinDamage,
      checkin,
    };
    
    // Priority-based dedup: keep handled over BUHS-unmatched
    if (damageMap.has(stableKey)) {
      const existingEntry = damageMap.get(stableKey)!;
      const existingPriority = getDamageEntryPriority(existingEntry);
      const newPriority = getDamageEntryPriority(newEntry);
      
      // DEBUG: Log for LRA75R
      if (cleanedRegnr === 'LRA75R') {
        console.log(`[DEBUG LRA75R] BUHS PASS1 Duplicate key "${stableKey}": existing priority=${existingPriority}, new priority=${newPriority}, winner=${newPriority < existingPriority ? 'NEW' : 'EXISTING'}`);
      }
      
      // Only replace if new entry has higher priority (lower number = higher priority)
      if (newPriority < existingPriority) {
        damageMap.set(stableKey, newEntry);
      }
      // If same priority, keep the first one (skip this duplicate)
    } else {
      damageMap.set(stableKey, newEntry);
      
      // DEBUG: Log for LRA75R
      if (cleanedRegnr === 'LRA75R') {
        console.log(`[DEBUG LRA75R] BUHS PASS1 New key "${stableKey}": handled=${!!newEntry.matchedCheckinDamage}, type=${newEntry.matchedCheckinDamage?.type || 'unmatched'}`);
      }
    }
  }
  
  // DEBUG: Log damageMap after PASS 1 for LRA75R
  if (cleanedRegnr === 'LRA75R') {
    console.log('[DEBUG LRA75R] damageMap after PASS 1:', Array.from(damageMap.entries()).map(([key, entry]) => ({
      stableKey: key,
      source: entry.source,
      handled: !!entry.matchedCheckinDamage,
      type: entry.matchedCheckinDamage?.type || 'unmatched',
      legacyText: entry.legacyDamageSourceText,
      date: entry.date,
    })));
  }
  
  // ====================================================================================
  // PASS 2: Process CHECK damages (damages table with legacy_damage_source_text)
  // If stableKey exists: MERGE (CHECK wins for title/positions/media)
  // If stableKey doesn't exist: ADD to map
  // Ignore nybil/newDamage entries without legacy_damage_source_text
  // ====================================================================================
  for (const damage of damages) {
    // REQUIREMENT: Only process CHECK source damages with legacy_damage_source_text
    // Ignore nybil/newDamage entries without legacy text
    if (!damage.legacy_damage_source_text || damage.source !== 'CHECK') {
      continue; // Skip non-CHECK or entries without legacy text
    }
    
    // CHECK: Use BUHS date fallback if original_damage_date is missing
    const legacyText = damage.legacy_damage_source_text;
    const normalizedText = normalizeTextForMatching(legacyText);
    const buhsDate = buhsDateByText.get(normalizedText);
    const rawDate = damage.original_damage_date || buhsDate || damage.damage_date || damage.created_at;
    const stableKey = createStableKey(legacyText, rawDate); // createStableKey uses toDateOnly internally
    
    // Extract CHECK data for merge/add
    const damageTypeRaw = damage.damage_type_raw || null;
    const userPositions = (damage.user_positions && Array.isArray(damage.user_positions)) 
      ? damage.user_positions 
      : null;
    const folder = (damage.uploads as any)?.folder || damage.folder || null;
    const photoUrls = damage.photo_urls || null;
    
    // Extract CHECK documentation metadata
    const checkDocumentedDate = toDateOnly(damage.damage_date || damage.created_at);
    const checkDocumentedBy = (damage as any).handled_by_name || (damage as any).author || null;
    
    // Match CHECK damage to checkin_damages to determine if it's handled
    let matchedCheckinDamage: CheckinDamageData | null = null;
    
    if (!isGEU29F) {
      // Try to match by damage ID first (most reliable)
      const damageId = damage.id;
      matchedCheckinDamage = allCheckinDamages.find(cd => 
        cd.id && !matchedCheckinDamageIds.has(cd.id) && cd.damage_id === damageId
      ) || null;
      
      // If no match by ID, try text matching
      if (!matchedCheckinDamage) {
        for (const cd of allCheckinDamages) {
          if (!cd.id || matchedCheckinDamageIds.has(cd.id)) continue;
          
          const cdDescription = cd.description || '';
          if (textsMatch(legacyText, cdDescription) ||
              textsMatch(damageTypeRaw, cdDescription)) {
            matchedCheckinDamage = cd;
            matchedCheckinDamageIds.add(cd.id);
            break;
          }
        }
      } else if (matchedCheckinDamage.id) {
        matchedCheckinDamageIds.add(matchedCheckinDamage.id);
      }
    }
    
    // Find matching checkin for this checkin_damage
    const checkin = matchedCheckinDamage 
      ? checkins.find(c => c.id === matchedCheckinDamage.checkin_id)
      : null;
    
    // Create new entry for priority comparison
    const newEntry: DamageEntry = {
      id: damage.id,
      stableKey,
      legacyDamageSourceText: damage.legacy_damage_source_text,
      date: formatDate(rawDate),
      source: 'CHECK',
      damageTypeRaw,
      userPositions,
      folder,
      photoUrls,
      matchedCheckinDamage, // Now properly matched!
      checkin,
      documentedDate: checkDocumentedDate,
      documentedBy: checkDocumentedBy,
    };
    
    if (damageMap.has(stableKey)) {
      // Priority-based replacement: compare priorities
      const existingEntry = damageMap.get(stableKey)!;
      const existingPriority = getDamageEntryPriority(existingEntry);
      const newPriority = getDamageEntryPriority(newEntry);
      
      // DEBUG: Log for LRA75R
      if (cleanedRegnr === 'LRA75R') {
        console.log(`[DEBUG LRA75R] CHECK PASS2 Duplicate key "${stableKey}": existing priority=${existingPriority}, new priority=${newPriority}, winner=${newPriority < existingPriority ? 'NEW' : 'EXISTING'}`);
      }
      
      if (newPriority < existingPriority) {
        // New entry has higher priority, replace
        damageMap.set(stableKey, newEntry);
      } else {
        // Existing entry has equal or higher priority, but merge CHECK metadata into it
        // (CHECK wins for title/positions/media even if priority is same/lower)
        existingEntry.damageTypeRaw = damageTypeRaw;
        existingEntry.userPositions = userPositions;
        existingEntry.folder = folder;
        existingEntry.photoUrls = photoUrls;
        existingEntry.documentedDate = checkDocumentedDate;
        existingEntry.documentedBy = checkDocumentedBy;
      }
    } else {
      // ADD: No entry with this stableKey exists yet
      
      // DEBUG: Log for LRA75R
      if (cleanedRegnr === 'LRA75R') {
        console.log(`[DEBUG LRA75R] CHECK PASS2 Adding new key "${stableKey}": folder=${folder}`);
      }
      
      damageMap.set(stableKey, newEntry);
    }
  }
  
  // DEBUG: Log damageMap after PASS 2 for LRA75R
  if (cleanedRegnr === 'LRA75R') {
    console.log('[DEBUG LRA75R] damageMap after PASS 2 (size=' + damageMap.size + '):', Array.from(damageMap.entries()).map(([key, entry]) => ({
      stableKey: key,
      source: entry.source,
      handled: !!entry.matchedCheckinDamage,
      type: entry.matchedCheckinDamage?.type || 'unmatched',
      folder: entry.folder,
      legacyText: entry.legacyDamageSourceText,
      date: entry.date,
    })));
  }
  
  // ====================================================================================
  // PASS 3: Convert map to damageRecords array
  // ====================================================================================
  const damageRecords: DamageRecord[] = [];
  
  for (const entry of damageMap.values()) {
    const matchedCheckinDamage = entry.matchedCheckinDamage;
    const checkin = entry.checkin;
    const legacyText = entry.legacyDamageSourceText || '';
    const damageDate = entry.date || '';
    
    // Build skadetyp, status, folder, sourceInfo based on entry data
    let skadetyp: string;
    let status: string;
    let folder: string | undefined;
    let sourceInfo: string;
    
    if (matchedCheckinDamage) {
      // Damage was matched to a checkin_damage (documented/not_found/existing)
      const cdType = matchedCheckinDamage.type;
      
      if (cdType === 'documented' || cdType === 'existing') {
        // Build structured title: prefer CHECK data if available (merged), else use checkin_damage data
        const damageType = entry.damageTypeRaw || matchedCheckinDamage.damage_type || 'Okänd';
        
        // Priority: userPositions from CHECK > positions from checkin_damage > car_part/position from checkin_damage
        if (entry.userPositions && entry.userPositions.length > 0) {
          const positionsStr = formatDamagePositions(entry.userPositions);
          skadetyp = positionsStr ? `${damageType} - ${positionsStr}` : damageType;
        } else if (matchedCheckinDamage.positions && Array.isArray(matchedCheckinDamage.positions) && 
                   matchedCheckinDamage.positions.length > 0) {
          const pos = matchedCheckinDamage.positions[0];
          const parts: string[] = [];
          if (pos.carPart) parts.push(pos.carPart);
          if (pos.position) parts.push(pos.position);
          const posStr = parts.join(' - ');
          skadetyp = posStr ? `${damageType} - ${posStr}` : damageType;
        } else if (matchedCheckinDamage.car_part || matchedCheckinDamage.position) {
          const parts = [matchedCheckinDamage.car_part, matchedCheckinDamage.position].filter(Boolean);
          skadetyp = `${damageType} - ${parts.join(' - ')}`;
        } else {
          skadetyp = legacyText || damageType;
        }
        
        // Media: prefer CHECK folder/photo_urls (from merge), else extract from checkin_damage photo_urls
        folder = entry.folder; // Already set from CHECK merge if available
        if (!folder && checkin && matchedCheckinDamage.photo_urls && matchedCheckinDamage.photo_urls.length > 0) {
          const firstUrl = matchedCheckinDamage.photo_urls[0];
          const match = firstUrl.match(/damage-photos\/[^\/]+\/[^\/]+\/([^\/]+)\//);
          folder = match ? match[1] : undefined;
        }
        
        // GEU29F: Override folder to undefined due to data integrity issues
        if (isGEU29F) {
          folder = undefined;
        }
        
        const checkerName = checkin?.checker_name || 'Okänd';
        const checkinDate = checkin ? formatDate(checkin.completed_at || checkin.created_at) : damageDate;
        status = `Dokumenterad ${checkinDate} av ${checkerName}`;
        sourceInfo = 'Källa: BUHS';
        
      } else if (cdType === 'not_found') {
        // Fix 3: not_found damages don't need (BUHS) suffix since status text clarifies
        skadetyp = legacyText || 'Okänd skada';
        
        const checkerName = checkin?.checker_name || 'Okänd';
        const checkinDateTime = checkin ? formatDateTime(checkin.completed_at || checkin.created_at) : damageDate;
        const comment = matchedCheckinDamage.description || '';
        
        status = formatNotFoundStatus(comment, checkerName, checkinDateTime);
        folder = undefined; // no media for not_found damages
        sourceInfo = 'Källa: BUHS';
        
      } else {
        // Unknown type - shouldn't happen but handle gracefully
        skadetyp = formatBuhsDamageText(legacyText);
        status = '';
        folder = undefined;
        sourceInfo = 'Källa: BUHS';
      }
      
    } else {
      // Unmatched damage (no checkin_damage match)
      // Build structured text from CHECK data if available (merged), else use BUHS text
      if (entry.damageTypeRaw && entry.userPositions && entry.userPositions.length > 0) {
        const positionsStr = formatDamagePositions(entry.userPositions);
        skadetyp = positionsStr ? `${entry.damageTypeRaw} – ${positionsStr} (BUHS)` : `${entry.damageTypeRaw} (BUHS)`;
      } else if (entry.damageTypeRaw) {
        skadetyp = `${entry.damageTypeRaw} (BUHS)`;
      } else {
        skadetyp = formatBuhsDamageText(legacyText);
      }
      
      folder = entry.folder; // Use CHECK folder if merged
      // GEU29F: Override folder to undefined due to data integrity issues
      if (isGEU29F) {
        folder = undefined;
      }
      
      status = ''; // Don't show status for unmatched BUHS - only sourceInfo
      sourceInfo = 'Källa: BUHS';
    }
    
    damageRecords.push({
      id: entry.id,
      regnr: cleanedRegnr,
      skadetyp: skadetyp,
      datum: damageDate,
      status: status,
      folder: folder,
      source: 'legacy' as const,
      sourceInfo,
      legacy_damage_source_text: legacyText,
      legacy_buhs_text: legacyText,
      original_damage_date: damageDate,
      checkinWhereDocumented: checkin?.id || null,
      documentedBy: entry.documentedBy || checkin?.checker_name || null,
      documentedDate: entry.documentedDate || (checkin ? formatDate(checkin.completed_at || checkin.created_at) : null),
      is_handled: matchedCheckinDamage !== null,
      is_inventoried: matchedCheckinDamage !== null,
      is_unmatched_buhs: matchedCheckinDamage === null,
      _stableKey: entry.stableKey, // Store actual stableKey for debugging
    });
  }

  // ====================================================================================
  // Add new damages from checkin_damages (type='new')
  // These are ALWAYS unique - never deduplicate
  // ====================================================================================
  addNewDamagesToRecords(damageRecords, allCheckinDamages, checkins, cleanedRegnr, isGEU29F);

  // DEBUG: Log final damageRecords for LRA75R
  if (cleanedRegnr === 'LRA75R') {
    console.log('[DEBUG LRA75R] Final damageRecords count:', damageRecords.length);
    console.log('[DEBUG LRA75R] Final damageRecords:', damageRecords.map(d => ({
      id: d.id,
      stableKey: (d as any)._stableKey, // Use actual stored stableKey
      skadetyp: d.skadetyp,
      status: d.status,
      folder: d.folder,
      source: d.source,
      is_handled: d.is_handled,
      is_unmatched_buhs: d.is_unmatched_buhs,
    })));
    
    // Check for duplicates by stableKey
    const stableKeyCounts = new Map<string, number>();
    damageRecords.forEach(d => {
      const key = (d as any)._stableKey;
      if (key) {
        stableKeyCounts.set(key, (stableKeyCounts.get(key) || 0) + 1);
      }
    });
    const duplicates = Array.from(stableKeyCounts.entries()).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.error('[DEBUG LRA75R] DUPLICATE stableKeys found:', duplicates);
    }
  }

  // Build history records
  const historyRecords: HistoryRecord[] = [];
  const damagesShownInCheckins = new Set<number>(); // Track damage IDs shown in checkins

  // Fetch damage counts for checkins (for avvikelser count)
  // Note: checkinIds is already declared above (reuse it)
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
    
    // Match damages from damageRecords to this checkin
    // For BUHS damages: filter allCheckinDamages by checkin_id and match to damageRecords
    // For new damages: match by date
    const checkinDateStr = checkin.completed_at || checkin.created_at;
    
    // Get checkin_damages for this specific checkin
    const checkinDamagesForThisCheckin = allCheckinDamages.filter(cd => cd.checkin_id === checkin.id);
    
    // Match BUHS damages that were handled in this checkin
    const matchedBuhsDamages = checkinDamagesForThisCheckin.map(cd => {
      // Find the corresponding BUHS damage in damageRecords by matching damage_type
      // The BUHS damage should already be in damageRecords with the right skadetyp and status
      return damageRecords.find(damage => 
        damage.source === 'legacy' && 
        damage.checkinWhereDocumented === checkin.id &&
        (damage.skadetyp.includes(cd.damage_type || '') || 
         damage.legacy_damage_source_text?.includes(cd.damage_type || ''))
      );
    }).filter((d): d is typeof damageRecords[0] => d !== undefined);
    
    // Also match damages documented via CHECK merge on this checkin's date
    // This handles cases where checkin_damages is empty but CHECK data exists with documentation date
    const checkinDate = checkinDateStr ? new Date(checkinDateStr) : null;
    const checkinYMD = checkinDate && !isNaN(checkinDate.getTime()) 
      ? checkinDate.toISOString().split('T')[0] 
      : null;
    
    const matchedCheckDamages = checkinYMD ? damageRecords.filter(d => {
      if (d.source === 'legacy' && d.folder) {
        if (d.checkinWhereDocumented === checkin.id) return true; // Allow
        if (d.documentedDate === checkinYMD) return true; // Date match
      }
      return false;
    }) : [];
    
    // Also match damages by date (for new damages created during this checkin)
    const matchedDateDamages = checkinYMD ? damageRecords.filter(damage => {
      // Skip damages already matched in matchedCheckDamages
      if (damage.source === 'legacy' && damage.folder) {
        if (damage.checkinWhereDocumented === checkin.id) return false;
        if (damage.documentedDate === checkinYMD) return false;
      }
      
      // Match by date: damage.datum should match checkin date (YYYY-MM-DD)
      if (damage.datum === checkinYMD) {
        return true;
      }
      
      return false;
    }) : [];
    
    // Combine all types of matches
    const matchedDamages = [...matchedBuhsDamages, ...matchedCheckDamages, ...matchedDateDamages];
    
    // DEBUG: Log matched damages for LRA75R
    if (cleanedRegnr === 'LRA75R') {
      console.log(`[DEBUG LRA75R] Checkin ${checkin.id} matched damages BEFORE dedup:`, matchedDamages.map(d => ({
        id: d.id,
        status: d.status,
        folder: d.folder,
        skadetyp: d.skadetyp,
      })));
    }
    
    // Dedup by damage.id (Fix 2.1)
    const seenDamageIds = new Set<number | string>();
    const dedupedMatchedDamages = matchedDamages.filter(damage => {
      if (seenDamageIds.has(damage.id)) {
        return false; // Skip duplicate
      }
      seenDamageIds.add(damage.id);
      return true;
    });
    
    // DEBUG: Log matched damages for LRA75R after dedup
    if (cleanedRegnr === 'LRA75R') {
      console.log(`[DEBUG LRA75R] Checkin ${checkin.id} matched damages AFTER dedup:`, dedupedMatchedDamages.map(d => ({
        id: d.id,
        status: d.status,
        folder: d.folder,
        skadetyp: d.skadetyp,
      })));
    }
    
    // Track which damages are shown in this checkin
    dedupedMatchedDamages.forEach(damage => damagesShownInCheckins.add(damage.id));
    
    // Build skador array from matched damageRecords
    const skador = dedupedMatchedDamages.map(damage => {
      // Determine if this is a not_found damage
      const isNotFound = damage.status?.startsWith('Gick ej att dokumentera');
      
      // For not_found: NO media link (Fix 2.2)
      // For documented/existing: media link only if folder exists (Fix 2.4)
      const shouldShowMedia = !isNotFound && damage.folder;
      
      // Add damage media to mediaLankar if should show media and not already there
      if (shouldShowMedia) {
        // Use damage folder for media link
        const damageMediaKey = `skada-${damage.id}`;
        if (!mediaLankar[damageMediaKey]) {
          mediaLankar[damageMediaKey] = `/media/${damage.folder}`;
        }
      }
      
      return {
        // Fix 2.2 & 2.3: For not_found, show full status text; for documented/existing, show only skadetyp
        typ: isNotFound ? damage.status : damage.skadetyp,
        beskrivning: '', // Kept for compatibility with display logic
        // Fix 2.2: For not_found, NO media link
        mediaUrl: shouldShowMedia ? `/media/${damage.folder}` : undefined,
        isDocumentedOlder: damage.source === 'legacy' && damage.legacy_damage_source_text != null && damage.status?.startsWith('Dokumenterad'),
        originalDamageDate: damage.source === 'legacy' ? damage.datum : undefined,
        isNotFoundOlder: isNotFound, // Kommentar 1
        // Fix 2.3: For documented/existing, don't show "Dokumenterad..." status row
        handledStatus: undefined, // Don't show status for checkin events (already in typ or apparent from context)
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
  // For handled damages (documented/not_found/existing), always create SKADA event
  // For unmatched BUHS (status="Källa BUHS"), only create if not shown in checkin
  
  for (const damage of damageRecords) {
    if (damage.source === 'legacy') {
      
      // Determine if this damage should get a SKADA event
      const isHandled = damage.status?.startsWith('Dokumenterad') || damage.status?.startsWith('Gick ej att dokumentera');
      const isUnmatchedBuhs = damage.is_unmatched_buhs === true;
      // For GEU29F, ALWAYS create SKADA events for ALL legacy damages (bypass all dedupe logic)
      // For other vehicles, create events for: handled damages OR unmatched BUHS not shown in checkin
      const shouldCreateEvent = isGEU29F || isHandled || !damagesShownInCheckins.has(damage.id);
      
      if (shouldCreateEvent) {
        // Use the damage's actual status instead of hardcoded "Ej dokumenterad"
        // The status reflects whether it was matched to checkin_damages (documented/not_found/existing)
        
        // For documented/existing damages, format as: "Dokumenterad [DATE] av [NAME]"
        // For not_found damages, use the full status which includes comment
        // For unmatched BUHS, don't show status (damage description already has (BUHS) suffix)
        let sammanfattning: string;
        if (damage.status?.startsWith('Dokumenterad')) {
          // Documented or existing damage - show status and append original BUHS text
          sammanfattning = damage.status;
          if (damage.legacy_buhs_text) {
            sammanfattning += `\nUrsprunglig beskrivning i BUHS: "${damage.legacy_buhs_text}"`;
          }
        } else if (damage.is_unmatched_buhs) {
          // Unmatched BUHS - don't show status since damage description already has (BUHS) suffix
          sammanfattning = '';
        } else {
          // not_found or other status - use status as is
          sammanfattning = damage.status || 'Ej dokumenterad i Incheckad';
        }
        
        historyRecords.push({
          id: `buhs-${damage.id}`,
          datum: damage.datum,
          rawTimestamp: damage.datum || '',
          typ: 'buhs_skada',
          sammanfattning,
          utfordAv: 'System (BUHS)',
          buhsSkadaDetaljer: {
            skadetyp: damage.skadetyp,
          legacy_damage_source_text: damage.legacy_damage_source_text,
          damageDate: damage.original_damage_date || damage.datum,
          damageStatus: damage.status,
          checkinWhereDocumented: damage.checkinWhereDocumented || null,
          documentedBy: damage.documentedBy || null,
          mediaFolder: damage.folder || null, // Kommentar 2 - include media folder for history
        },
      });
      }
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
