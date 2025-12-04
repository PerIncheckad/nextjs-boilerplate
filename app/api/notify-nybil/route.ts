import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

// --- E-postmottagare ---
// Under utveckling: skicka alltid till per@incheckad.se
const DEV_EMAIL = 'per@incheckad.se';
const BILKONTROLL_EMAIL = 'latif@incheckad.se';

// Station email mapping for production
// TODO: Activate this mapping when switching from development mode to production
// Currently all emails are sent to DEV_EMAIL (per@incheckad.se) during development
const stationEmailMapping: Record<string, string> = {
  'Malmö': 'malmo@mabi.se',
  'Helsingborg': 'helsingborg@mabi.se',
  'Ängelholm': 'angelholm@mabi.se',
  'Halmstad': 'halmstad@mabi.se',
  'Falkenberg': 'falkenberg@mabi.se',
  'Trelleborg': 'trelleborg@mabi.se',
  'Varberg': 'varberg@mabi.se',
  'Lund': 'lund@mabi.se',
};

const LOGO_URL =
  'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

// Banner colors
const BANNER_COLOR_RED = '#B30E0E';
const BANNER_COLOR_BLUE = '#15418C';
const BANNER_COLOR_GREEN = '#15803D';

const getSiteUrl = (request: Request): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  return host ? `${protocol}://${host}` : 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';
};

const createStorageLink = (folderPath: string | undefined, siteUrl: string): string | null => {
  if (!folderPath) return null;
  return `${siteUrl}/public-media/${folderPath}`;
};

/**
 * Get the appropriate folder link for a damage item.
 * Uses individual damage folder if available, otherwise falls back to general media folder.
 */
const getDamageFolderLink = (
  skadaFolder: string | null | undefined,
  mediaFolder: string | undefined,
  siteUrl: string
): string | null => {
  if (skadaFolder) {
    return createStorageLink(skadaFolder, siteUrl);
  }
  if (mediaFolder) {
    return createStorageLink(mediaFolder, siteUrl);
  }
  return null;
};

/**
 * Get the SKADOR folder path for a vehicle.
 * Returns REGNR/SKADOR/ path.
 */
const getSkadorFolderPath = (regnr: string): string => {
  return `${regnr}/SKADOR`;
};

// =================================================================
// 2. HELPERS
// =================================================================

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
const escapeHtml = (text: string | null | undefined): string => {
  if (!text) return '';
  const htmlEscapeMap: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
};

const createAlertBanner = (
  condition: boolean,
  text: string,
  details?: string,
  folderPath?: string,
  siteUrl?: string
): string => {
  if (!condition) return '';
  const storageLink = siteUrl ? createStorageLink(folderPath, siteUrl) : null;
  let fullText = `⚠️ ${text}`;
  if (details) fullText += `<br>${escapeHtml(details)}`;
  const bannerContent = `<div style="background-color:${BANNER_COLOR_RED}!important;border:1px solid ${BANNER_COLOR_RED};padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">${fullText}</div>`;
  return `<tr><td style="padding:6px 0;">${
    storageLink
      ? `<a href="${storageLink}" target="_blank" style="text-decoration:none;color:#FFFFFF!important;">${bannerContent}</a>`
      : bannerContent
  }</td></tr>`;
};

const createAdminBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  const bannerContent = `<div style="background-color:${BANNER_COLOR_BLUE}!important;border:1px solid ${BANNER_COLOR_BLUE};padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">${text}</div>`;
  return `<tr><td style="padding:6px 0;">${bannerContent}</td></tr>`;
};

// Create admin banner for charge level (same format as /check)
const createChargeLevelBanner = (condition: boolean, laddnivaProcent: number | null | undefined): string => {
  if (!condition) return '';
  // Only show banner if we have a valid percentage value
  if (laddnivaProcent === null || laddnivaProcent === undefined) return '';
  const text = `Kolla bilens laddnivå! (${laddnivaProcent}%)`;
  const bannerContent = `<div style="background-color:${BANNER_COLOR_BLUE}!important;border:1px solid ${BANNER_COLOR_BLUE};padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">${text}</div>`;
  return `<tr><td style="padding:6px 0;">${bannerContent}</td></tr>`;
};

// Create green success banner for "Klar för uthyrning"
const createSuccessBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  const bannerContent = `<div style="background-color:${BANNER_COLOR_GREEN}!important;border:1px solid ${BANNER_COLOR_GREEN};padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">✅ ${text}</div>`;
  return `<tr><td style="padding:6px 0;">${bannerContent}</td></tr>`;
};

const createBaseLayout = (regnr: string, content: string): string => `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<style>
:root { color-scheme: light only; }
body { font-family: ui-sans-serif, system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  background:#f9fafb!important;color:#000;margin:0;padding:20px; }
.container { max-width:600px;margin:0 auto;background:#fff!important;border-radius:8px;
  padding:30px;border:1px solid #e5e7eb; }
a { color:#2563eb!important; }
</style>
</head>
<body>
  <div class="container">
    <div style="text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:20px;margin-bottom:20px;">
      <img src="${LOGO_URL}" alt="MABI Logo" width="150" style="margin-left:6px;">
    </div>
    <table width="100%"><tbody>${content}</tbody></table>
    <div style="margin-top:20px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
      &copy; ${new Date().getFullYear()} Albarone AB &mdash; Alla rättigheter förbehållna
    </div>
  </div>
</body>
</html>`;

// =================================================================
// 3. HTML BUILDERS
// =================================================================

interface DamageInfo {
  damageType: string;
  positions: Array<{ carPart: string; position: string }>;
  comment?: string;
  photoUrls?: string[];
  folder?: string | null;
}

interface NybilPayload {
  regnr: string;
  bilmarke: string;
  modell: string;
  matarstallning: string;
  matarstallning_aktuell?: string | null;
  hjultyp: string;
  hjul_till_forvaring?: string | null;
  hjul_forvaring_ort?: string | null;
  hjul_forvaring_spec?: string | null;
  bransletyp: string;
  vaxel: string;
  plats_mottagning_ort: string;
  plats_mottagning_station: string;
  planerad_station: string;
  plats_aktuell_ort: string;
  plats_aktuell_station: string;
  // Contract terms
  serviceintervall?: string;
  max_km_manad?: string;
  avgift_over_km?: string;
  // Fuel/charging status
  tankstatus?: 'mottogs_fulltankad' | 'tankad_nu' | 'ej_upptankad' | null;
  laddniva_procent?: number | null;
  upptankning_liter?: number | null;
  upptankning_literpris?: number | null;
  // MB/VW Connect
  mbme_aktiverad?: boolean | null;
  vw_connect_aktiverad?: boolean | null;
  // Equipment
  antal_nycklar?: number;
  extranyckel_forvaring_ort?: string | null;
  extranyckel_forvaring_spec?: string | null;
  antal_laddkablar?: number;
  laddkablar_forvaring_ort?: string | null;
  laddkablar_forvaring_spec?: string | null;
  dragkrok?: boolean;
  gummimattor?: boolean;
  dackkompressor?: boolean;
  stold_gps?: boolean;
  stold_gps_spec?: string;
  antal_insynsskydd?: number;
  lasbultar_med?: boolean;
  instruktionsbok?: boolean;
  instruktionsbok_forvaring_ort?: string | null;
  instruktionsbok_forvaring_spec?: string | null;
  coc?: boolean;
  coc_forvaring_ort?: string | null;
  coc_forvaring_spec?: string | null;
  // Saluinfo
  saludatum?: string | null;
  salu_station?: string | null;
  kopare_foretag?: string | null;
  attention?: string | null;
  returort?: string | null;
  returadress?: string | null;
  notering_forsaljning?: string | null;
  // Damages
  har_skador_vid_leverans?: boolean;
  skador?: DamageInfo[];
  // Rental status
  klar_for_uthyrning?: boolean;
  ej_uthyrningsbar_anledning?: string;
  // Notes
  anteckningar?: string;
  // Metadata
  registrerad_av: string;
  photo_urls?: string[];
  media_folder?: string;
  // Duplicate handling
  is_duplicate?: boolean;
  previous_registration?: {
    regnr: string;
    registreringsdatum: string;
    bilmarke: string;
    modell: string;
  } | null;
  exists_in_bilkontroll?: boolean;
}

/**
 * Helper function to build hjulförvaring section for email
 */
const buildHjulForvaringSection = (payload: NybilPayload): string => {
  if (!payload.hjul_till_forvaring) return '';
  
  let content = `<tr><td style="padding:4px 0;"><strong>Hjul till förvaring:</strong> ${escapeHtml(payload.hjul_till_forvaring)}</td></tr>`;
  
  if (payload.hjul_forvaring_ort) {
    content += `<tr><td style="padding:4px 0;"><strong>Förvaringsort:</strong> ${escapeHtml(payload.hjul_forvaring_ort)}</td></tr>`;
  }
  if (payload.hjul_forvaring_spec) {
    content += `<tr><td style="padding:4px 0;"><strong>Förvaringsspecifikation:</strong> ${escapeHtml(payload.hjul_forvaring_spec)}</td></tr>`;
  }
  
  return `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Hjulförvaring</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>${content}</tbody>
      </table>
    </td></tr>
  `;
};

/**
 * Helper function to build MB/VW Connect status section for email
 */
const buildConnectStatusSection = (payload: NybilPayload): string => {
  const hasMbme = payload.mbme_aktiverad !== null && payload.mbme_aktiverad !== undefined;
  const hasVwConnect = payload.vw_connect_aktiverad !== null && payload.vw_connect_aktiverad !== undefined;
  const hasLaddniva = payload.laddniva_procent !== null && payload.laddniva_procent !== undefined;
  
  if (!hasMbme && !hasVwConnect && !hasLaddniva) return '';
  
  let content = '';
  if (hasMbme) {
    content += `<tr><td style="padding:4px 0;"><strong>MBme aktiverad:</strong> ${payload.mbme_aktiverad ? 'Ja' : 'Nej'}</td></tr>`;
  }
  if (hasVwConnect) {
    content += `<tr><td style="padding:4px 0;"><strong>VW Connect aktiverad:</strong> ${payload.vw_connect_aktiverad ? 'Ja' : 'Nej'}</td></tr>`;
  }
  if (hasLaddniva) {
    content += `<tr><td style="padding:4px 0;"><strong>Laddnivå vid ankomst:</strong> ${payload.laddniva_procent}%</td></tr>`;
  }
  
  return `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Bilstatus</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>${content}</tbody>
      </table>
    </td></tr>
  `;
};

/**
 * Helper function to build fuel filling info section for email
 */
const buildFuelFillingSection = (payload: NybilPayload): string => {
  if (!payload.tankstatus) return '';
  
  let content = '';
  
  // Display tankstatus with inline details for tankad_nu
  let tankstatusText = '';
  switch (payload.tankstatus) {
    case 'mottogs_fulltankad':
      tankstatusText = 'Mottogs fulltankad';
      break;
    case 'tankad_nu':
      if (payload.upptankning_liter && payload.upptankning_literpris) {
        tankstatusText = `MABI tankade upp ${payload.upptankning_liter} liter (${payload.upptankning_literpris} kr/l)`;
      } else if (payload.upptankning_liter) {
        tankstatusText = `MABI tankade upp ${payload.upptankning_liter} liter`;
      } else {
        tankstatusText = 'MABI tankade upp';
      }
      break;
    case 'ej_upptankad':
      tankstatusText = 'Levererades ej fulltankad';
      break;
  }
  
  if (tankstatusText) {
    content += `<tr><td style="padding:4px 0;"><strong>Tankstatus:</strong> ${tankstatusText}</td></tr>`;
  }
  
  return `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Tankning</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>${content}</tbody>
      </table>
    </td></tr>
  `;
};

/**
 * Helper function to build saluinfo section for email
 */
const buildSaluinfoSection = (payload: NybilPayload): string => {
  if (!payload.saludatum && !payload.salu_station && !payload.kopare_foretag) return '';
  
  let content = '';
  if (payload.saludatum) {
    content += `<tr><td style="padding:4px 0;"><strong>Saludatum:</strong> ${escapeHtml(payload.saludatum)}</td></tr>`;
  }
  if (payload.salu_station) {
    content += `<tr><td style="padding:4px 0;"><strong>Station:</strong> ${escapeHtml(payload.salu_station)}</td></tr>`;
  }
  if (payload.kopare_foretag) {
    content += `<tr><td style="padding:4px 0;"><strong>Köpare:</strong> ${escapeHtml(payload.kopare_foretag)}</td></tr>`;
  }
  if (payload.attention) {
    content += `<tr><td style="padding:4px 0;"><strong>Attention:</strong> ${escapeHtml(payload.attention)}</td></tr>`;
  }
  const returInfo = [payload.returadress, payload.returort].filter(Boolean).join(', ');
  if (returInfo) {
    content += `<tr><td style="padding:4px 0;"><strong>Retur:</strong> ${escapeHtml(returInfo)}</td></tr>`;
  }
  if (payload.notering_forsaljning) {
    content += `<tr><td style="padding:4px 0;"><strong>Notering försäljning:</strong> ${escapeHtml(payload.notering_forsaljning)}</td></tr>`;
  }
  
  return `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Salu</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>${content}</tbody>
      </table>
    </td></tr>
  `;
};

/**
 * Helper function to build förvaring details section for email
 */
const buildForvaringDetailsSection = (payload: NybilPayload): string => {
  const hasHjulForvaring = payload.hjul_forvaring_ort || payload.hjul_forvaring_spec;
  const hasExtranyckelForvaring = payload.extranyckel_forvaring_ort || payload.extranyckel_forvaring_spec;
  const hasLaddkablarForvaring = payload.laddkablar_forvaring_ort || payload.laddkablar_forvaring_spec;
  const hasInstruktionsbokForvaring = payload.instruktionsbok_forvaring_ort || payload.instruktionsbok_forvaring_spec;
  const hasCocForvaring = payload.coc_forvaring_ort || payload.coc_forvaring_spec;
  
  if (!hasHjulForvaring && !hasExtranyckelForvaring && !hasLaddkablarForvaring && !hasInstruktionsbokForvaring && !hasCocForvaring) return '';
  
  let content = '';
  if (hasHjulForvaring) {
    content += `<tr><td style="padding:4px 0;"><strong>Hjulförvaring:</strong> ${escapeHtml(payload.hjul_forvaring_ort || '')}${payload.hjul_forvaring_spec ? ` - ${escapeHtml(payload.hjul_forvaring_spec)}` : ''}</td></tr>`;
  }
  if (hasExtranyckelForvaring) {
    content += `<tr><td style="padding:4px 0;"><strong>Reservnyckel förvaring:</strong> ${escapeHtml(payload.extranyckel_forvaring_ort || '')}${payload.extranyckel_forvaring_spec ? ` - ${escapeHtml(payload.extranyckel_forvaring_spec)}` : ''}</td></tr>`;
  }
  if (hasLaddkablarForvaring) {
    content += `<tr><td style="padding:4px 0;"><strong>Laddkablar förvaring:</strong> ${escapeHtml(payload.laddkablar_forvaring_ort || '')}${payload.laddkablar_forvaring_spec ? ` - ${escapeHtml(payload.laddkablar_forvaring_spec)}` : ''}</td></tr>`;
  }
  if (hasInstruktionsbokForvaring) {
    content += `<tr><td style="padding:4px 0;"><strong>Instruktionsbok förvaring:</strong> ${escapeHtml(payload.instruktionsbok_forvaring_ort || '')}${payload.instruktionsbok_forvaring_spec ? ` - ${escapeHtml(payload.instruktionsbok_forvaring_spec)}` : ''}</td></tr>`;
  }
  if (hasCocForvaring) {
    content += `<tr><td style="padding:4px 0;"><strong>COC-dokument förvaring:</strong> ${escapeHtml(payload.coc_forvaring_ort || '')}${payload.coc_forvaring_spec ? ` - ${escapeHtml(payload.coc_forvaring_spec)}` : ''}</td></tr>`;
  }
  
  return `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Utrustningsförvaring</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>${content}</tbody>
      </table>
    </td></tr>
  `;
};

/**
 * Build the email for Nybil registration - HUVUDSTATION version
 * Contains ONLY:
 * - Fordon (reg. nr, bilmärke, modell)
 * - Plats för mottagning
 * - Var är bilen (plats_aktuell_ort, plats_aktuell_station)
 * - Aktuell mätarställning
 * - Klar för uthyrning
 * - Övriga anteckningar
 * - Registrerad av...
 * - Photos
 * - Damage details (if any)
 * Includes blue banners for "Måste tankas!" and "Kolla bilens laddnivå"
 */
const buildNybilHuvudstationEmail = (payload: NybilPayload, date: string, time: string, siteUrl: string): string => {
  const regNr = payload.regnr || '';
  const registreradAv = payload.registrerad_av || '---';
  
  // Build basic fact box content
  const bilmarke = payload.bilmarke || '---';
  const modell = payload.modell || '---';
  const platsMottagningOrt = payload.plats_mottagning_ort || '---';
  const bilenStarNuOrt = payload.plats_aktuell_ort || '---';
  const bilenStarNuStation = payload.plats_aktuell_station || '---';
  // Show ONLY aktuell mätarställning (current) for huvudstation, use matarstallning_aktuell if available, else matarstallning
  const matarstallningAktuell = payload.matarstallning_aktuell 
    ? `${payload.matarstallning_aktuell} km`
    : (payload.matarstallning ? `${payload.matarstallning} km` : '---');
  
  // Determine if there are dangerous conditions (red banners)
  const hasSkador = payload.har_skador_vid_leverans === true && (payload.skador?.length ?? 0) > 0;
  const skadorCount = payload.skador?.length ?? 0;
  const ejKlarForUthyrning = payload.klar_for_uthyrning === false;
  const klarForUthyrning = payload.klar_for_uthyrning === true;
  
  // Blue banner conditions (HUVUDSTATION only)
  const isElectric = payload.bransletyp === '100% el';
  const needsCharging = isElectric && typeof payload.laddniva_procent === 'number' && payload.laddniva_procent < 95;
  const needsFueling = !isElectric && payload.tankstatus === 'ej_upptankad';
  
  // SKADOR folder path for banner link
  const skadorFolderPath = getSkadorFolderPath(regNr);
  
  // Warning banners - Green "KLAR FÖR UTHYRNING!" banner at top (HUVUDSTATION only)
  const banners = `
    ${createSuccessBanner(klarForUthyrning, 'KLAR FÖR UTHYRNING!')}
    ${createAlertBanner(hasSkador, `SKADOR VID LEVERANS (${skadorCount})`, undefined, skadorFolderPath, siteUrl)}
    ${createAlertBanner(ejKlarForUthyrning, 'GÅR INTE ATT HYRA UT', payload.ej_uthyrningsbar_anledning)}
    ${createAdminBanner(needsFueling, 'MÅSTE TANKAS!')}
    ${createChargeLevelBanner(needsCharging, payload.laddniva_procent)}
  `;
  
  // Damages section with full details (skadetyp, placering, position, kommentar)
  let damagesSection = '';
  if (hasSkador && payload.skador && payload.skador.length > 0) {
    const damageItems = payload.skador.map((skada) => {
      const positions = (skada.positions || [])
        .map(p => {
          if (p.carPart && p.position) return `${escapeHtml(p.carPart)} (${escapeHtml(p.position)})`;
          if (p.carPart) return escapeHtml(p.carPart);
          return '';
        })
        .filter(Boolean)
        .join(', ');
      
      let damageText = `<strong>Skadetyp:</strong> ${escapeHtml(skada.damageType)}`;
      if (positions) damageText += `<br><strong>Placering:</strong> ${positions}`;
      if (skada.comment) damageText += `<br><strong>Kommentar:</strong> ${escapeHtml(skada.comment)}`;
      
      const hasPhotos = skada.photoUrls && skada.photoUrls.length > 0;
      const damageFolderLink = getDamageFolderLink(skada.folder, payload.media_folder, siteUrl);
      
      return `<li style="margin-bottom:12px;">${damageText}${
        hasPhotos && damageFolderLink
          ? `<br><a href="${damageFolderLink}" target="_blank" style="text-decoration:none;color:#2563eb!important;font-weight:bold;">(Visa media 🔗)</a>`
          : ''
      }</li>`;
    }).join('');
    
    damagesSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;color:#dc2626;">Skador vid leverans</h3>
        <ul style="padding-left:20px;margin-top:0;font-size:14px;">${damageItems}</ul>
      </td></tr>
    `;
  }
  
  // Photo link section
  let photoSection = '';
  if (payload.photo_urls && payload.photo_urls.length > 0 && payload.media_folder) {
    const mediaFolderLink = createStorageLink(payload.media_folder, siteUrl);
    photoSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Nybilsfoton</h3>
        <p style="font-size:14px;"><a href="${mediaFolderLink}" target="_blank" style="color:#2563eb!important;font-weight:bold;">Visa foton (${payload.photo_urls.length} st) 🔗</a></p>
      </td></tr>
    `;
  }
  
  // Klar för uthyrning section
  const klarForUthyrningText = payload.klar_for_uthyrning === true ? 'Ja' : (payload.klar_for_uthyrning === false ? 'Nej' : '---');
  const klarForUthyrningSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Klar för uthyrning</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Klar för uthyrning:</strong> ${klarForUthyrningText}</td></tr>
          ${payload.klar_for_uthyrning === false && payload.ej_uthyrningsbar_anledning ? `<tr><td style="padding:4px 0;"><strong>Anledning:</strong> ${escapeHtml(payload.ej_uthyrningsbar_anledning)}</td></tr>` : ''}
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Övrigt section (only if anteckningar exists)
  const ovrigtSection = payload.anteckningar ? `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Övriga anteckningar</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;">${escapeHtml(payload.anteckningar)}</td></tr>
        </tbody>
      </table>
    </td></tr>
  ` : '';
  
  // HUVUDSTATION email - only basic info as specified
  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 10px;">${escapeHtml(regNr)} registrerad</h1>
    </td></tr>
    ${banners}
    <tr><td style="padding-top:20px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Bilmärke:</strong> ${escapeHtml(bilmarke)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Modell:</strong> ${escapeHtml(modell)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Plats för mottagning:</strong> ${escapeHtml(platsMottagningOrt)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Bilen står nu:</strong> ${escapeHtml(bilenStarNuOrt)} / ${escapeHtml(bilenStarNuStation)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Aktuell mätarställning:</strong> ${escapeHtml(matarstallningAktuell)}</td></tr>
          </tbody>
        </table>
      </div>
    </td></tr>
    ${klarForUthyrningSection}
    ${ovrigtSection}
    ${photoSection}
    ${damagesSection}
    <tr><td>
      <p style="margin-top:20px;font-size:14px;">
        Registrerad av ${escapeHtml(registreradAv)} kl ${time}, ${date}
      </p>
    </td></tr>
  `;
  
  return createBaseLayout(regNr, content);
};

/**
 * Build the email for Nybil registration - BILKONTROLL version
 * Does NOT include blue banners for fuel/charging status
 */
const buildNybilBilkontrollEmail = (payload: NybilPayload, date: string, time: string, siteUrl: string): string => {
  const regNr = payload.regnr || '';
  const registreradAv = payload.registrerad_av || '---';
  
  // Build fact box content
  const bilmarke = payload.bilmarke || '---';
  const modell = payload.modell || '---';
  // Show BOTH mätarställning vid leverans AND aktuell mätarställning in Bilkontroll
  const matarstallningInkop = payload.matarstallning ? `${payload.matarstallning} km` : '---';
  const matarstallningAktuell = payload.matarstallning_aktuell ? `${payload.matarstallning_aktuell} km` : null;
  const hjultyp = payload.hjultyp || '---';
  const drivmedel = payload.bransletyp || '---';
  const vaxel = payload.vaxel || '---';
  const platsMottagningOrt = payload.plats_mottagning_ort || '---';
  const planeradStation = payload.planerad_station || '---';
  const bilenStarNuOrt = payload.plats_aktuell_ort || '---';
  const bilenStarNuStation = payload.plats_aktuell_station || '---';
  
  // Determine if there are dangerous conditions (red banners)
  const hasSkador = payload.har_skador_vid_leverans === true && (payload.skador?.length ?? 0) > 0;
  const skadorCount = payload.skador?.length ?? 0;
  const ejKlarForUthyrning = payload.klar_for_uthyrning === false;
  
  // SKADOR folder path for banner link
  const skadorFolderPath = getSkadorFolderPath(regNr);
  
  // Warning banners (NO blue banners for BILKONTROLL, NO green banner for BILKONTROLL)
  const banners = `
    ${createAlertBanner(hasSkador, `SKADOR VID LEVERANS (${skadorCount})`, undefined, skadorFolderPath, siteUrl)}
    ${createAlertBanner(ejKlarForUthyrning, 'GÅR INTE ATT HYRA UT', payload.ej_uthyrningsbar_anledning)}
  `;
  
  // Contract terms section
  const serviceintervall = payload.serviceintervall || '---';
  const maxKmManad = payload.max_km_manad || '---';
  const avgiftOverKm = payload.avgift_over_km ? `${payload.avgift_over_km} kr` : '---';
  
  const contractSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Avtalsvillkor</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Serviceintervall:</strong> ${escapeHtml(serviceintervall)}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Max km/månad:</strong> ${escapeHtml(maxKmManad)}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Avgift över-km:</strong> ${escapeHtml(avgiftOverKm)}</td></tr>
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Equipment section
  const antalNycklar = payload.antal_nycklar ?? '---';
  const antalLaddkablar = payload.antal_laddkablar ?? 0;
  const dragkrok = payload.dragkrok ? 'Ja' : 'Nej';
  const gummimattor = payload.gummimattor ? 'Ja' : 'Nej';
  const dackkompressor = payload.dackkompressor ? 'Ja' : 'Nej';
  const stoldGps = payload.stold_gps ? 'Ja' : 'Nej';
  const antalInsynsskydd = payload.antal_insynsskydd ?? 0;
  const lasbultarMed = payload.lasbultar_med ? 'Ja' : 'Nej';
  const instruktionsbok = payload.instruktionsbok ? 'Ja' : 'Nej';
  const coc = payload.coc ? 'Ja' : 'Nej';
  
  const equipmentSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Utrustning</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Antal nycklar:</strong> ${antalNycklar}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Antal laddkablar:</strong> ${antalLaddkablar}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Dragkrok:</strong> ${dragkrok}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Gummimattor:</strong> ${gummimattor}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Däckkompressor:</strong> ${dackkompressor}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Stöld-GPS:</strong> ${stoldGps}${payload.stold_gps && payload.stold_gps_spec ? ` (${escapeHtml(payload.stold_gps_spec)})` : ''}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Antal insynsskydd:</strong> ${antalInsynsskydd}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Låsbultar med:</strong> ${lasbultarMed}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Instruktionsbok:</strong> ${instruktionsbok}</td></tr>
          <tr><td style="padding:4px 0;"><strong>COC-dokument:</strong> ${coc}</td></tr>
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Status link placeholder
  const statusLinkSection = `
    <tr><td style="padding-top:20px;text-align:center;">
      <a href="https://incheckad.se/status/${regNr}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff!important;text-decoration:none;border-radius:6px;font-weight:bold;">Visa i Status →</a>
      <p style="font-size:12px;color:#6b7280;margin-top:8px;">(Funktionen kommer snart)</p>
    </td></tr>
  `;
  
  // Damages section with full details (skadetyp, placering, position, kommentar)
  let damagesSection = '';
  if (hasSkador && payload.skador && payload.skador.length > 0) {
    const damageItems = payload.skador.map((skada) => {
      const positions = (skada.positions || [])
        .map(p => {
          if (p.carPart && p.position) return `${escapeHtml(p.carPart)} (${escapeHtml(p.position)})`;
          if (p.carPart) return escapeHtml(p.carPart);
          return '';
        })
        .filter(Boolean)
        .join(', ');
      
      let damageText = `<strong>Skadetyp:</strong> ${escapeHtml(skada.damageType)}`;
      if (positions) damageText += `<br><strong>Placering:</strong> ${positions}`;
      if (skada.comment) damageText += `<br><strong>Kommentar:</strong> ${escapeHtml(skada.comment)}`;
      
      const hasPhotos = skada.photoUrls && skada.photoUrls.length > 0;
      const damageFolderLink = getDamageFolderLink(skada.folder, payload.media_folder, siteUrl);
      
      return `<li style="margin-bottom:12px;">${damageText}${
        hasPhotos && damageFolderLink
          ? `<br><a href="${damageFolderLink}" target="_blank" style="text-decoration:none;color:#2563eb!important;font-weight:bold;">(Visa media 🔗)</a>`
          : ''
      }</li>`;
    }).join('');
    
    damagesSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;color:#dc2626;">Skador vid leverans</h3>
        <ul style="padding-left:20px;margin-top:0;font-size:14px;">${damageItems}</ul>
      </td></tr>
    `;
  }
  
  // Klar för uthyrning section
  const klarForUthyrningText = payload.klar_for_uthyrning === true ? 'Ja' : (payload.klar_for_uthyrning === false ? 'Nej' : '---');
  const klarForUthyrningSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Klar för uthyrning</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Klar för uthyrning:</strong> ${klarForUthyrningText}</td></tr>
          ${payload.klar_for_uthyrning === false && payload.ej_uthyrningsbar_anledning ? `<tr><td style="padding:4px 0;"><strong>Anledning:</strong> ${escapeHtml(payload.ej_uthyrningsbar_anledning)}</td></tr>` : ''}
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Övrigt section (only if anteckningar exists)
  const ovrigtSection = payload.anteckningar ? `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Övrigt</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;">${escapeHtml(payload.anteckningar)}</td></tr>
        </tbody>
      </table>
    </td></tr>
  ` : '';
  
  // Photo link section
  let photoSection = '';
  if (payload.photo_urls && payload.photo_urls.length > 0 && payload.media_folder) {
    const mediaFolderLink = createStorageLink(payload.media_folder, siteUrl);
    photoSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Nybilsfoton</h3>
        <p style="font-size:14px;"><a href="${mediaFolderLink}" target="_blank" style="color:#2563eb!important;font-weight:bold;">Visa foton (${payload.photo_urls.length} st) 🔗</a></p>
      </td></tr>
    `;
  }
  
  // Additional sections using helper functions
  const hjulForvaringSection = buildHjulForvaringSection(payload);
  const connectStatusSection = buildConnectStatusSection(payload);
  const fuelFillingSection = buildFuelFillingSection(payload);
  const saluinfoSection = buildSaluinfoSection(payload);
  const forvaringDetailsSection = buildForvaringDetailsSection(payload);
  
  // Build content - Klar för uthyrning comes BEFORE Övrigt
  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 10px;">${escapeHtml(regNr)} registrerad</h1>
    </td></tr>
    ${banners}
    <tr><td style="padding-top:20px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Bilmärke:</strong> ${escapeHtml(bilmarke)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Modell:</strong> ${escapeHtml(modell)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Mätarställning vid leverans:</strong> ${escapeHtml(matarstallningInkop)}</td></tr>
            ${matarstallningAktuell ? `<tr><td style="padding:4px 0;"><strong>Aktuell mätarställning:</strong> ${escapeHtml(matarstallningAktuell)}</td></tr>` : ''}
            <tr><td style="padding:4px 0;"><strong>Hjultyp:</strong> ${escapeHtml(hjultyp)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Drivmedel:</strong> ${escapeHtml(drivmedel)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Växel:</strong> ${escapeHtml(vaxel)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Plats för mottagning:</strong> ${escapeHtml(platsMottagningOrt)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Planerad station:</strong> ${escapeHtml(planeradStation)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Bilen står nu:</strong> ${escapeHtml(bilenStarNuOrt)} / ${escapeHtml(bilenStarNuStation)}</td></tr>
          </tbody>
        </table>
      </div>
    </td></tr>
    ${hjulForvaringSection}
    ${connectStatusSection}
    ${contractSection}
    ${equipmentSection}
    ${forvaringDetailsSection}
    ${fuelFillingSection}
    ${saluinfoSection}
    ${klarForUthyrningSection}
    ${ovrigtSection}
    ${photoSection}
    ${statusLinkSection}
    ${damagesSection}
    <tr><td>
      <p style="margin-top:20px;font-size:14px;">
        Registrerad av ${escapeHtml(registreradAv)} kl ${time}, ${date}
      </p>
    </td></tr>
  `;
  
  return createBaseLayout(regNr, content);
};

/**
 * Build the email for duplicate Nybil registration - BILKONTROLL version
 * Has blue banner for duplicate, plus all the same content as regular Bilkontroll email
 */
const buildNybilDuplicateEmail = (payload: NybilPayload, date: string, time: string, siteUrl: string): string => {
  const regNr = payload.regnr || '';
  const registreradAv = payload.registrerad_av || '---';
  
  // Build fact box content (same as Bilkontroll email)
  const bilmarke = payload.bilmarke || '---';
  const modell = payload.modell || '---';
  // Show BOTH mätarställning vid leverans AND aktuell mätarställning
  const matarstallningInkop = payload.matarstallning ? `${payload.matarstallning} km` : '---';
  const matarstallningAktuell = payload.matarstallning_aktuell ? `${payload.matarstallning_aktuell} km` : null;
  const hjultyp = payload.hjultyp || '---';
  const drivmedel = payload.bransletyp || '---';
  const vaxel = payload.vaxel || '---';
  const platsMottagningOrt = payload.plats_mottagning_ort || '---';
  const planeradStation = payload.planerad_station || '---';
  const bilenStarNuOrt = payload.plats_aktuell_ort || '---';
  const bilenStarNuStation = payload.plats_aktuell_station || '---';
  
  // Blue banner for duplicate
  const duplicateBannerContent = `<div style="background-color:${BANNER_COLOR_BLUE}!important;border:1px solid ${BANNER_COLOR_BLUE};padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">DUBBLETT SKAPAD</div>`;
  const duplicateBanner = `<tr><td style="padding:6px 0;">${duplicateBannerContent}</td></tr>`;
  
  // Determine if there are dangerous conditions (red banners - same as Bilkontroll)
  const hasSkador = payload.har_skador_vid_leverans === true && (payload.skador?.length ?? 0) > 0;
  const skadorCount = payload.skador?.length ?? 0;
  const ejKlarForUthyrning = payload.klar_for_uthyrning === false;
  
  // SKADOR folder path for banner link
  const skadorFolderPath = getSkadorFolderPath(regNr);
  
  // Warning banners
  const alertBanners = `
    ${createAlertBanner(hasSkador, `SKADOR VID LEVERANS (${skadorCount})`, undefined, skadorFolderPath, siteUrl)}
    ${createAlertBanner(ejKlarForUthyrning, 'GÅR INTE ATT HYRA UT', payload.ej_uthyrningsbar_anledning)}
  `;
  
  // Previous registration info (specific to duplicate)
  let previousRegSection = '';
  if (payload.previous_registration) {
    previousRegSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Tidigare registrering</h3>
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Datum:</strong> ${escapeHtml(payload.previous_registration.registreringsdatum)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Bilmärke:</strong> ${escapeHtml(payload.previous_registration.bilmarke)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Modell:</strong> ${escapeHtml(payload.previous_registration.modell)}</td></tr>
          </tbody>
        </table>
      </td></tr>
    `;
  }
  
  // Exists in Bilkontroll info
  let bilkontrollNote = '';
  if (payload.exists_in_bilkontroll) {
    bilkontrollNote = `<tr><td style="padding:4px 0;color:#6b7280;font-style:italic;">Finns även i Bilkontroll-listan</td></tr>`;
  }
  
  // Contract terms section (same as Bilkontroll)
  const serviceintervall = payload.serviceintervall || '---';
  const maxKmManad = payload.max_km_manad || '---';
  const avgiftOverKm = payload.avgift_over_km ? `${payload.avgift_over_km} kr` : '---';
  
  const contractSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Avtalsvillkor</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Serviceintervall:</strong> ${escapeHtml(serviceintervall)}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Max km/månad:</strong> ${escapeHtml(maxKmManad)}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Avgift över-km:</strong> ${escapeHtml(avgiftOverKm)}</td></tr>
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Equipment section (same as Bilkontroll)
  const antalNycklar = payload.antal_nycklar ?? '---';
  const antalLaddkablar = payload.antal_laddkablar ?? 0;
  const dragkrok = payload.dragkrok ? 'Ja' : 'Nej';
  const gummimattor = payload.gummimattor ? 'Ja' : 'Nej';
  const dackkompressor = payload.dackkompressor ? 'Ja' : 'Nej';
  const stoldGps = payload.stold_gps ? 'Ja' : 'Nej';
  const antalInsynsskydd = payload.antal_insynsskydd ?? 0;
  const lasbultarMed = payload.lasbultar_med ? 'Ja' : 'Nej';
  const instruktionsbok = payload.instruktionsbok ? 'Ja' : 'Nej';
  const coc = payload.coc ? 'Ja' : 'Nej';
  
  const equipmentSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Utrustning</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Antal nycklar:</strong> ${antalNycklar}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Antal laddkablar:</strong> ${antalLaddkablar}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Dragkrok:</strong> ${dragkrok}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Gummimattor:</strong> ${gummimattor}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Däckkompressor:</strong> ${dackkompressor}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Stöld-GPS:</strong> ${stoldGps}${payload.stold_gps && payload.stold_gps_spec ? ` (${escapeHtml(payload.stold_gps_spec)})` : ''}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Antal insynsskydd:</strong> ${antalInsynsskydd}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Låsbultar med:</strong> ${lasbultarMed}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Instruktionsbok:</strong> ${instruktionsbok}</td></tr>
          <tr><td style="padding:4px 0;"><strong>COC-dokument:</strong> ${coc}</td></tr>
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Damages section with full details (skadetyp, placering, position, kommentar)
  let damagesSection = '';
  if (hasSkador && payload.skador && payload.skador.length > 0) {
    const damageItems = payload.skador.map((skada) => {
      const positions = (skada.positions || [])
        .map(p => {
          if (p.carPart && p.position) return `${escapeHtml(p.carPart)} (${escapeHtml(p.position)})`;
          if (p.carPart) return escapeHtml(p.carPart);
          return '';
        })
        .filter(Boolean)
        .join(', ');
      
      let damageText = `<strong>Skadetyp:</strong> ${escapeHtml(skada.damageType)}`;
      if (positions) damageText += `<br><strong>Placering:</strong> ${positions}`;
      if (skada.comment) damageText += `<br><strong>Kommentar:</strong> ${escapeHtml(skada.comment)}`;
      
      const hasPhotos = skada.photoUrls && skada.photoUrls.length > 0;
      const damageFolderLink = getDamageFolderLink(skada.folder, payload.media_folder, siteUrl);
      
      return `<li style="margin-bottom:12px;">${damageText}${
        hasPhotos && damageFolderLink
          ? `<br><a href="${damageFolderLink}" target="_blank" style="text-decoration:none;color:#2563eb!important;font-weight:bold;">(Visa media 🔗)</a>`
          : ''
      }</li>`;
    }).join('');
    
    damagesSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;color:#dc2626;">Skador vid leverans</h3>
        <ul style="padding-left:20px;margin-top:0;font-size:14px;">${damageItems}</ul>
      </td></tr>
    `;
  }
  
  // Klar för uthyrning section (same as Bilkontroll)
  const klarForUthyrningText = payload.klar_for_uthyrning === true ? 'Ja' : (payload.klar_for_uthyrning === false ? 'Nej' : '---');
  const klarForUthyrningSection = `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Klar för uthyrning</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;"><strong>Klar för uthyrning:</strong> ${klarForUthyrningText}</td></tr>
          ${payload.klar_for_uthyrning === false && payload.ej_uthyrningsbar_anledning ? `<tr><td style="padding:4px 0;"><strong>Anledning:</strong> ${escapeHtml(payload.ej_uthyrningsbar_anledning)}</td></tr>` : ''}
        </tbody>
      </table>
    </td></tr>
  `;
  
  // Övrigt section (same as Bilkontroll)
  const ovrigtSection = payload.anteckningar ? `
    <tr><td style="padding-top:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Övrigt</h3>
      <table width="100%" style="font-size:14px;">
        <tbody>
          <tr><td style="padding:4px 0;">${escapeHtml(payload.anteckningar)}</td></tr>
        </tbody>
      </table>
    </td></tr>
  ` : '';
  
  // Photo link section
  let photoSection = '';
  if (payload.photo_urls && payload.photo_urls.length > 0 && payload.media_folder) {
    const mediaFolderLink = createStorageLink(payload.media_folder, siteUrl);
    photoSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Nybilsfoton</h3>
        <p style="font-size:14px;"><a href="${mediaFolderLink}" target="_blank" style="color:#2563eb!important;font-weight:bold;">Visa foton (${payload.photo_urls.length} st) 🔗</a></p>
      </td></tr>
    `;
  }
  
  // Status link placeholder
  const statusLinkSection = `
    <tr><td style="padding-top:20px;text-align:center;">
      <a href="https://incheckad.se/status/${regNr}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff!important;text-decoration:none;border-radius:6px;font-weight:bold;">Visa i Status →</a>
      <p style="font-size:12px;color:#6b7280;margin-top:8px;">(Funktionen kommer snart)</p>
    </td></tr>
  `;
  
  // Additional sections using helper functions
  const hjulForvaringSection = buildHjulForvaringSection(payload);
  const connectStatusSection = buildConnectStatusSection(payload);
  const fuelFillingSection = buildFuelFillingSection(payload);
  const saluinfoSection = buildSaluinfoSection(payload);
  const forvaringDetailsSection = buildForvaringDetailsSection(payload);
  
  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 10px;">${escapeHtml(regNr)} - Dubblett skapad</h1>
    </td></tr>
    ${duplicateBanner}
    ${alertBanners}
    ${previousRegSection}
    ${bilkontrollNote ? `<tr><td style="padding:4px 0;color:#6b7280;font-style:italic;">Finns även i Bilkontroll-listan</td></tr>` : ''}
    <tr><td style="padding-top:20px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Bilmärke:</strong> ${escapeHtml(bilmarke)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Modell:</strong> ${escapeHtml(modell)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Mätarställning vid leverans:</strong> ${escapeHtml(matarstallningInkop)}</td></tr>
            ${matarstallningAktuell ? `<tr><td style="padding:4px 0;"><strong>Aktuell mätarställning:</strong> ${escapeHtml(matarstallningAktuell)}</td></tr>` : ''}
            <tr><td style="padding:4px 0;"><strong>Hjultyp:</strong> ${escapeHtml(hjultyp)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Drivmedel:</strong> ${escapeHtml(drivmedel)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Växel:</strong> ${escapeHtml(vaxel)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Plats för mottagning:</strong> ${escapeHtml(platsMottagningOrt)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Planerad station:</strong> ${escapeHtml(planeradStation)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Bilen står nu:</strong> ${escapeHtml(bilenStarNuOrt)} / ${escapeHtml(bilenStarNuStation)}</td></tr>
          </tbody>
        </table>
      </div>
    </td></tr>
    ${hjulForvaringSection}
    ${connectStatusSection}
    ${contractSection}
    ${equipmentSection}
    ${forvaringDetailsSection}
    ${fuelFillingSection}
    ${saluinfoSection}
    ${klarForUthyrningSection}
    ${ovrigtSection}
    ${photoSection}
    ${statusLinkSection}
    ${damagesSection}
    <tr><td>
      <p style="margin-top:20px;font-size:14px;">
        Registrerad av ${escapeHtml(registreradAv)} kl ${time}, ${date}
      </p>
    </td></tr>
  `;
  
  return createBaseLayout(regNr, content);
};

// =================================================================
// 4. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  try {
    const payload: NybilPayload = await request.json();

    // Datum/tid (SE)
    const now = new Date();
    const stockholmDate = now
      .toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');

    const stockholmTime = now.toLocaleTimeString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
    });

    const date = stockholmDate;
    const time = stockholmTime;
    const siteUrl = getSiteUrl(request);

    const regNr = payload.regnr || '';
    const bilmarke = payload.bilmarke || '';
    const modell = payload.modell || '';
    const planeradStation = payload.planerad_station || '';

    // Check for dangerous conditions (red banners)
    const hasSkador = payload.har_skador_vid_leverans && (payload.skador?.length ?? 0) > 0;
    const ejKlarForUthyrning = payload.klar_for_uthyrning === false;
    const hasFarligaConditions = hasSkador || ejKlarForUthyrning;
    
    // Subject format
    const testMarker = hasFarligaConditions ? ' - !!!' : '';
    const baseSubject = `NY BIL REGISTRERAD: ${regNr} - ${bilmarke} ${modell} - till ${planeradStation}${testMarker}`;

    // =================================================================
    // E-posthantering - Under utveckling: alla mejl till per@incheckad.se
    // =================================================================
    const emailPromises: Promise<unknown>[] = [];

    // E-post till Bilkontroll (alltid) - uses BILKONTROLL email builder (no blue banners)
    const bilkontrollHtml = buildNybilBilkontrollEmail(payload, date, time, siteUrl);
    const bilkontrollSubject = `${baseSubject} | BILKONTROLL`;
    console.log(`Sending BILKONTROLL email to ${DEV_EMAIL} (actual: ${BILKONTROLL_EMAIL})`);
    emailPromises.push(
      resend.emails.send({
        from: 'nybil@incheckad.se',
        to: [DEV_EMAIL], // Under utveckling: per@incheckad.se
        subject: bilkontrollSubject,
        html: bilkontrollHtml,
      })
    );

    // E-post till Huvudstation (endast om klar för uthyrning) - uses HUVUDSTATION email builder (with blue banners)
    if (payload.klar_for_uthyrning === true) {
      const huvudstationHtml = buildNybilHuvudstationEmail(payload, date, time, siteUrl);
      const huvudstationSubject = `${baseSubject} | HUVUDSTATION`;
      console.log(`Sending HUVUDSTATION email to ${DEV_EMAIL} (actual: station for ${planeradStation})`);
      emailPromises.push(
        resend.emails.send({
          from: 'nybil@incheckad.se',
          to: [DEV_EMAIL], // Under utveckling: per@incheckad.se
          subject: huvudstationSubject,
          html: huvudstationHtml,
        })
      );
    }

    // E-post för dubblett till Bilkontroll (om is_duplicate === true)
    if (payload.is_duplicate === true) {
      const duplicateHtml = buildNybilDuplicateEmail(payload, date, time, siteUrl);
      const duplicateSubject = `DUBBLETT SKAPAD FÖR ${regNr} - ${bilmarke} ${modell} | BILKONTROLL`;
      console.log(`Sending DUPLICATE email to ${DEV_EMAIL} (actual: ${BILKONTROLL_EMAIL})`);
      emailPromises.push(
        resend.emails.send({
          from: 'nybil@incheckad.se',
          to: [DEV_EMAIL], // Under utveckling: per@incheckad.se
          subject: duplicateSubject,
          html: duplicateHtml,
        })
      );
    }

    await Promise.all(emailPromises);

    console.log('Nybil notification emails sent successfully');
    return NextResponse.json({ message: 'Notifications processed successfully.' });
  } catch (error) {
    console.error('FATAL: Uncaught error in notify-nybil API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}
