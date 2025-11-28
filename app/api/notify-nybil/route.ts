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

// Station email mapping for production (not used during development)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  details?: string
): string => {
  if (!condition) return '';
  let fullText = `⚠️ ${text}`;
  if (details) fullText += `<br>${escapeHtml(details)}`;
  const bannerContent = `<div style="background-color:${BANNER_COLOR_RED}!important;border:1px solid ${BANNER_COLOR_RED};padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">${fullText}</div>`;
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
}

interface NybilPayload {
  regnr: string;
  bilmarke: string;
  modell: string;
  matarstallning: string;
  hjultyp: string;
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
  // Equipment
  antal_nycklar?: number;
  antal_laddkablar?: number;
  dragkrok?: boolean;
  gummimattor?: boolean;
  dackkompressor?: boolean;
  stold_gps?: boolean;
  stold_gps_spec?: string;
  antal_insynsskydd?: number;
  lasbultar_med?: boolean;
  instruktionsbok?: boolean;
  coc?: boolean;
  // Damages
  har_skador_vid_leverans?: boolean;
  skador?: DamageInfo[];
  // Rental status
  klar_for_uthyrning?: boolean;
  ej_uthyrningsbar_anledning?: string;
  // Metadata
  registrerad_av: string;
  photo_urls?: string[];
  media_folder?: string;
}

/**
 * Build the email for Nybil registration
 */
const buildNybilEmail = (payload: NybilPayload, date: string, time: string): string => {
  const regNr = payload.regnr || '';
  const registreradAv = payload.registrerad_av || '---';
  
  // Build fact box content
  const bilmarke = payload.bilmarke || '---';
  const modell = payload.modell || '---';
  const matarstallning = payload.matarstallning ? `${payload.matarstallning} km` : '---';
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
  
  // Warning banners
  const banners = `
    ${createAlertBanner(hasSkador, `SKADOR VID LEVERANS (${skadorCount})`)}
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
  
  // Damages section
  let damagesSection = '';
  if (hasSkador && payload.skador && payload.skador.length > 0) {
    const damageItems = payload.skador.map((skada, index) => {
      const positions = (skada.positions || [])
        .map(p => {
          if (p.carPart && p.position) return `${escapeHtml(p.carPart)} (${escapeHtml(p.position)})`;
          if (p.carPart) return escapeHtml(p.carPart);
          return '';
        })
        .filter(Boolean)
        .join(', ');
      
      let damageText = `${escapeHtml(skada.damageType)}`;
      if (positions) damageText += `: ${positions}`;
      if (skada.comment) damageText += `<br><small><strong>Kommentar:</strong> ${escapeHtml(skada.comment)}</small>`;
      
      // Photo links
      let photoLinks = '';
      if (skada.photoUrls && skada.photoUrls.length > 0) {
        photoLinks = skada.photoUrls.map((url, i) => 
          `<a href="${url}" target="_blank" style="color:#2563eb;text-decoration:none;">[Foto ${index + 1}.${i + 1}]</a>`
        ).join(' ');
        damageText += `<br><small>${photoLinks}</small>`;
      }
      
      return `<li style="margin-bottom:8px;">${damageText}</li>`;
    }).join('');
    
    damagesSection = `
      <tr><td style="padding-top:20px;">
        <h3 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;color:#dc2626;">Skador vid leverans</h3>
        <ul style="padding-left:20px;margin-top:0;font-size:14px;">${damageItems}</ul>
      </td></tr>
    `;
  }
  
  // Build content
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
            <tr><td style="padding:4px 0;"><strong>Mätarställning:</strong> ${escapeHtml(matarstallning)}</td></tr>
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
    ${contractSection}
    ${equipmentSection}
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
    const emailHtml = buildNybilEmail(payload, date, time);

    // E-post till Bilkontroll (alltid)
    const bilkontrollSubject = `${baseSubject} | BILKONTROLL`;
    console.log(`Sending BILKONTROLL email to ${DEV_EMAIL} (actual: ${BILKONTROLL_EMAIL})`);
    emailPromises.push(
      resend.emails.send({
        from: 'nybil@incheckad.se',
        to: [DEV_EMAIL], // Under utveckling: per@incheckad.se
        subject: bilkontrollSubject,
        html: emailHtml,
      })
    );

    // E-post till Huvudstation (endast om klar för uthyrning)
    if (payload.klar_for_uthyrning === true) {
      const huvudstationSubject = `${baseSubject} | HUVUDSTATION`;
      console.log(`Sending HUVUDSTATION email to ${DEV_EMAIL} (actual: station for ${planeradStation})`);
      emailPromises.push(
        resend.emails.send({
          from: 'nybil@incheckad.se',
          to: [DEV_EMAIL], // Under utveckling: per@incheckad.se
          subject: huvudstationSubject,
          html: emailHtml,
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
