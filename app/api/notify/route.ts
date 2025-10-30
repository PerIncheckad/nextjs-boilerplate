import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const bilkontrollAddress = 'per@incheckad.se';
const huvudstationAddress = 'per@incheckad.se';
const fallbackAddress = 'per@incheckad.se';

const supabaseProjectId = supabaseUrl.match(/https:\/\/(.*)\.supabase\.co/)?.[1];

// Get the site URL from environment or construct it dynamically from the request
// This ensures media links always point to the correct host (production or preview)
const getSiteUrl = (request: Request): string => {
  // First try environment variable
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  // Otherwise, use the request's host
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  
  if (host) {
    return `${protocol}://${host}`;
  }
  
  // Final fallback (should rarely be used)
  return 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';
};

const regionMapping: { [ort: string]: string | undefined } = {
  'Malmö': huvudstationAddress,
  'Helsingborg': huvudstationAddress,
  'Ängelholm': huvudstationAddress,
  'Halmstad': huvudstationAddress,
  'Falkenberg': huvudstationAddress,
  'Trelleborg': huvudstationAddress,
  'Varberg': huvudstationAddress,
  'Lund': huvudstationAddress,
};

const LOGO_URL = 'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

// =================================================================
// 2. HTML BUILDER - HELPERS
// =================================================================

const formatCheckerName = (payload: any): string => {
  // Try to get full name from various possible fields (defensive approach)
  if (payload.fullName) return payload.fullName;
  if (payload.full_name) return payload.full_name;
  
  // Try to combine first and last name if available
  const firstName = payload.firstName || payload.first_name || payload.incheckare;
  const lastName = payload.lastName || payload.last_name;
  
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  
  // Fallback to just first name or email-based name
  return firstName || payload.incheckare || '---';
};

const createStorageLink = (folderPath: string | undefined, siteUrl: string): string | null => {
    if (!folderPath) return null;
    return `${siteUrl}/media/${folderPath}`;
}

const createAlertBanner = (condition: boolean, text: string, details?: string, folderPath?: string, siteUrl?: string, count?: number): string => {
  if (!condition) return '';
  
  const storageLink = siteUrl ? createStorageLink(folderPath, siteUrl) : null;
  let bannerText = text;
  if (count !== undefined && count > 0 && Number.isInteger(count)) bannerText += ` (${count})`;
  let fullText = `⚠️ ${bannerText}`;
  if (details) fullText += `<br>${details}`;

  const bannerContent = `<div style="background-color: #FFFBEB !important; border: 1px solid #FDE68A; padding: 12px; text-align: center; font-weight: bold; color: #92400e !important; border-radius: 8px;">${fullText}${storageLink ? ' <span style="font-size: 1.1em;">🔗</span>' : ''}</div>`;

  const finalHtml = storageLink 
    ? `<a href="${storageLink}" target="_blank" style="text-decoration: none; color: #92400e !important;">${bannerContent}</a>`
    : bannerContent;

  return `<tr><td style="padding: 6px 0;">${finalHtml}</td></tr>`;
};

const createAdminBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  
  const bannerContent = `<div style="background-color: #DBEAFE !important; border: 1px solid #93C5FD; padding: 12px; text-align: center; font-weight: bold; color: #1E40AF !important; border-radius: 8px;">${text}</div>`;

  return `<tr><td style="padding: 6px 0;">${bannerContent}</td></tr>`;
};

const getDamageString = (damage: any): string => {
    let baseString = damage.fullText || damage.type || damage.userType || 'Okänd skada';
    
    const positions = (damage.positions || damage.userPositions || [])
        .map((p: any) => {
            if (p.carPart && p.position) return `${p.carPart} (${p.position})`;
            if (p.carPart) return p.carPart;
            return '';
        })
        .filter(Boolean)
        .join(', ');

    if (positions) baseString += `: ${positions}`;
    
    const comment = damage.text || damage.userDescription || damage.resolvedComment;
    if (comment) baseString += `<br><small style="color: inherit !important;"><strong>Kommentar:</strong> ${comment}</small>`;
    
    return baseString;
};

const formatDamagesToHtml = (damages: any[], title: string, siteUrl: string, fallbackText?: string): string => {
  if (!damages || damages.length === 0) {
    if (fallbackText) {
      return `<h3 style="margin-bottom: 10px; margin-top: 20px; font-size: 14px; color: inherit !important; text-transform: uppercase; letter-spacing: 0.5px;">${title}</h3><p style="margin-top: 0; color: inherit !important;">${fallbackText}</p>`;
    }
    return '';
  }
  
  const items = damages.map(d => {
    const text = getDamageString(d);
    const storageLink = createStorageLink(d.uploads?.folder, siteUrl);
    const linkContent = storageLink 
      ? ` <a href="${storageLink}" target="_blank" style="text-decoration: none; color: #2563eb !important; font-weight: bold;">(Visa media 🔗)</a>`
      : '';
    return `<li style="margin-bottom: 8px; color: inherit !important;">${text}${linkContent}</li>`;
  }).join('');

  return `<h3 style="margin-bottom: 10px; margin-top: 20px; font-size: 14px; color: inherit !important; text-transform: uppercase; letter-spacing: 0.5px;">${title}</h3><ul style="padding-left: 20px; margin-top: 0; color: inherit !important;">${items}</ul>`;
};

const formatTankning = (tankning: any): string => {
    if (!tankning) return '---';
    if (tankning.tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
    if (tankning.tankniva === 'tankad_nu') {
        const parts = ['Tankad nu av MABI', tankning.liters ? `(${tankning.liters}L` : null, tankning.bransletyp ? `${tankning.bransletyp}` : null, tankning.literpris ? `@ ${tankning.literpris} kr/L)` : ')']
            .filter(Boolean)
            .join(' ');
        return parts;
    }
    if (tankning.tankniva === 'ej_upptankad') return '<span style="font-weight: bold; color: #b91c1c !important;">Ej upptankad</span>';
    return '---';
};

const buildBilagorSection = (rekond: any, husdjur: any, rokning: any, siteUrl: string): string => {
    const bilagor = [];
    if (rekond.folder && rekond.hasMedia) {
        bilagor.push(`<li><a href="${siteUrl}/media/${rekond.folder}" target="_blank" style="color: #2563eb !important;">Rekond 🔗</a></li>`);
    }
    if (husdjur.folder && husdjur.hasMedia) {
        bilagor.push(`<li><a href="${siteUrl}/media/${husdjur.folder}" target="_blank" style="color: #2563eb !important;">Husdjur 🔗</a></li>`);
    }
    if (rokning.folder && rokning.hasMedia) {
        bilagor.push(`<li><a href="${siteUrl}/media/${rokning.folder}" target="_blank" style="color: #2563eb !important;">Rökning 🔗</a></li>`);
    }
    
    if (bilagor.length === 0) return '';
    
    return `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;"><h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Bilagor</h2><ul style="padding-left: 20px; margin-top: 0; color: #000000 !important;">${bilagor.join('')}</ul></div>`;
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
    body { 
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
      background-color: #f9fafb !important; 
      color: #000000 !important; 
      margin: 0; 
      padding: 20px; 
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background-color: #ffffff !important; 
      border-radius: 8px; 
      padding: 30px; 
      border: 1px solid #e5e7eb; 
    }
    p, td, h1, h2, h3, li, span, div, strong, small { 
      color: #000000 !important; 
    }
    a { 
      color: #2563eb !important; 
    }
    /* Force light mode in email clients that support dark mode */
    @media (prefers-color-scheme: dark) {
      :root { color-scheme: light only !important; }
      body { 
        background-color: #f9fafb !important; 
        color: #000000 !important; 
      }
      .container { 
        background-color: #ffffff !important; 
        border-color: #e5e7eb !important; 
      }
      p, td, h1, h2, h3, li, span, div, strong, small { 
        color: #000000 !important; 
      }
      a { 
        color: #2563eb !important; 
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px;">
      <img src="${LOGO_URL}" alt="MABI Logo" width="150" style="margin-left: 6px;">
    </div>
    <table width="100%" style="color: #000000 !important;">
      <tbody>${content}</tbody>
    </table>
  </div>
</body>
</html>`;

// =================================================================
// 3. HTML BUILDERS - SPECIFIC EMAILS
// =================================================================

const buildHuvudstationEmail = (payload: any, date: string, time: string, siteUrl: string): string => {
  const { regnr, carModel, ort, station, matarstallning, hjultyp, tankning, laddning, rekond, varningslampa, husdjur, rokning, rental, status, nya_skador = [], notering, bilen_star_nu } = payload;
  
  const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(laddning.laddniva, 10) < 95;
  const notRefueled = payload.drivmedel === 'bensin_diesel' && tankning.tankniva === 'ej_upptankad';

  // Find folder for new damages (prefer first damage with folder)
  const nyaSkadorFolder = nya_skador.find((d: any) => d.uploads?.folder)?.uploads?.folder;
  
  const checkerName = formatCheckerName(payload);

  const content = `
    ${createAlertBanner(rental?.unavailable, 'Går inte att hyra ut', rental?.comment, undefined, siteUrl)}
    ${createAlertBanner(varningslampa.lyser, 'Varningslampa ej släckt', varningslampa.beskrivning, undefined, siteUrl)}
    ${createAlertBanner(rekond.behoverRekond, 'Rekond', rekond.text, rekond.folder, siteUrl)}
    ${createAlertBanner(notRefueled, 'Bilen är ej upptankad', undefined, undefined, siteUrl)}
    ${createAlertBanner(showChargeWarning, 'Kolla bilens laddnivå!', undefined, undefined, siteUrl)}
    ${createAlertBanner(status?.insynsskyddSaknas, 'Insynsskydd saknas', undefined, undefined, siteUrl)}
    ${createAlertBanner(nya_skador.length > 0, 'Nya skador dokumenterade', undefined, nyaSkadorFolder, siteUrl, nya_skador.length)}
    ${createAlertBanner(husdjur.sanerad, 'Husdjur', husdjur.text, husdjur.folder, siteUrl)}
    ${createAlertBanner(rokning.sanerad, 'Rökning', rokning.text, rokning.folder, siteUrl)}

    <tr><td style="padding: 10px 0;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Sammanfattning</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Reg.nr:</td><td>${regnr}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Bilmodell:</td><td>${carModel || '---'}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;vertical-align:top;">Incheckad vid:</td><td>${ort} / ${station}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;vertical-align:top;">Bilen står nu:</td><td>${bilen_star_nu?.ort || ort} / ${bilen_star_nu?.station || station}${bilen_star_nu?.kommentar ? `<br><small>(${bilen_star_nu?.kommentar})</small>` : ''}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Datum:</td><td>${date}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Tid:</td><td>${time}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Incheckare:</td><td>${checkerName}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Fordonsstatus</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Mätarställning:</td><td>${matarstallning} km</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Däcktyp:</td><td>${hjultyp || '---'}</td></tr>
          ${payload.drivmedel === 'elbil' ? '' : `<tr><td style="font-weight:bold;width:120px;padding:4px 0;">Tankning:</td><td>${formatTankning(tankning)}</td></tr>`}
          ${payload.drivmedel === 'elbil' ? `<tr><td style="font-weight:bold;width:120px;padding:4px 0;">Laddning:</td><td>${laddning.laddniva}%</td></tr>` : ''}
          ${payload.drivmedel === 'elbil' ? `<tr><td style="font-weight:bold;width:120px;padding:4px 0;">Antal laddkablar:</td><td>${laddning.antal_laddkablar}</td></tr>` : ''}
        </table>
      </div>
      ${formatDamagesToHtml(nya_skador, 'Nya skador', siteUrl, 'Inga nya skador rapporterade.')}
      ${notering ? `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;"><h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Övriga kommentarer</h2><p style="margin-top:0;">${notering}</p></div>` : ''}
      ${buildBilagorSection(rekond, husdjur, rokning, siteUrl)}
    </td></tr>
  `;
  return createBaseLayout(regnr, content);
};

const buildBilkontrollEmail = (payload: any, date: string, time: string, siteUrl: string): string => {
  const { regnr, carModel, hjultyp, ort, station, rekond, husdjur, rokning, varningslampa, rental, status, vehicleStatus, notering, åtgärdade_skador = [], dokumenterade_skador = [], nya_skador = [], bilen_star_nu } = payload;
  
  const unknownRegStatus = vehicleStatus === 'PARTIAL_MATCH_DAMAGE_ONLY' || vehicleStatus === 'NO_MATCH';

  // Find folder for new damages (prefer first damage with folder)
  const nyaSkadorFolder = nya_skador.find((d: any) => d.uploads?.folder)?.uploads?.folder;
  
  const checkerName = formatCheckerName(payload);
          
  const content = `
    ${createAdminBanner(unknownRegStatus, 'Reg.nr saknas i "MABISYD Bilkontroll 2024–2025"')}
    ${createAlertBanner(rental?.unavailable, 'Går inte att hyra ut', rental?.comment, undefined, siteUrl)}
    ${createAlertBanner(varningslampa.lyser, 'Varningslampa ej släckt', varningslampa.beskrivning, undefined, siteUrl)}
    ${createAlertBanner(rekond.behoverRekond, 'Rekond', rekond.text, rekond.folder, siteUrl)}
    ${createAlertBanner(status?.insynsskyddSaknas, 'Insynsskydd saknas', undefined, undefined, siteUrl)}
    ${createAlertBanner(nya_skador.length > 0, 'Nya skador dokumenterade', undefined, nyaSkadorFolder, siteUrl, nya_skador.length)}
    ${createAlertBanner(husdjur.sanerad, 'Husdjur', husdjur.text, husdjur.folder, siteUrl)}
    ${createAlertBanner(rokning.sanerad, 'Rökning', rokning.text, rokning.folder, siteUrl)}
    ${createAlertBanner(nya_skador.length > 0 || dokumenterade_skador.length > 0, 'Skador har hanterats', undefined, undefined, siteUrl)}

    <tr><td style="padding: 10px 0;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Fordonsinformation</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Reg.nr:</td><td>${regnr}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Bilmodell:</td><td>${carModel || 'Modell saknas, vänligen uppdatera i MABISYD Bilkontroll-filen'}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Däck:</td><td>${hjultyp || '---'}</td></tr>
          ${payload.drivmedel === 'elbil' ? `<tr><td style="font-weight:bold;width:120px;padding:4px 0;">Antal laddkablar:</td><td>${payload.laddning?.antal_laddkablar}</td></tr>` : ''}
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Incheckningsdetaljer</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Incheckad vid:</td><td>${ort} / ${station}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;vertical-align:top;">Bilen står nu:</td><td>${bilen_star_nu?.ort || ort} / ${bilen_star_nu?.station || station}${bilen_star_nu?.kommentar ? `<br><small>(${bilen_star_nu?.kommentar})</small>` : ''}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Datum:</td><td>${date}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Tid:</td><td>${time}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Incheckare:</td><td>${checkerName}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Skadeöversikt</h2>
        ${formatDamagesToHtml(åtgärdade_skador, 'Åtgärdade / Hittas ej', siteUrl)}
        ${formatDamagesToHtml(dokumenterade_skador, 'Dokumenterade befintliga skador', siteUrl, 'Inga gamla skador dokumenterade.')}
        ${formatDamagesToHtml(nya_skador, 'Nya skador', siteUrl, 'Inga nya skador rapporterade.')}
      </div>
      ${notering ? `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;"><h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Övriga kommentarer</h2><p style="margin-top:0;">${notering}</p></div>` : ''}
      ${buildBilagorSection(rekond, husdjur, rokning, siteUrl)}
    </td></tr>
  `;
  return createBaseLayout(regnr, content);
};

// =================================================================
// 4. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  try {
    const fullRequestPayload = await request.json();
    const { meta: payload, subjectBase, region } = fullRequestPayload; 

    // Get the site URL from the request to ensure media links work correctly
    const siteUrl = getSiteUrl(request);
    console.log('Using site URL for media links:', siteUrl);

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };
    const date = now.toLocaleDateString('sv-SE', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = now.toLocaleTimeString('sv-SE', { ...options, hour: '2-digit', minute: '2-digit' });

    // Compute station for subject - use "Bilen står nu" station when present
    const stationForSubject = payload.bilen_star_nu?.station || payload.station;
    // If station contains "Ort / Station", keep only the Station portion
    const cleanStation = stationForSubject.includes(' / ') ? stationForSubject.split(' / ').pop()?.trim() : stationForSubject;
    
    // Check for "farliga" conditions (test mode marker in subject)
    const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning?.laddniva, 10) < 95;
    const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning?.tankniva === 'ej_upptankad';
    const hasFarligaConditions = 
      payload.rental?.unavailable ||
      payload.varningslampa?.lyser ||
      payload.rekond?.behoverRekond ||
      notRefueled ||
      showChargeWarning ||
      payload.status?.insynsskyddSaknas ||
      (payload.nya_skador && payload.nya_skador.length > 0) ||
      payload.husdjur?.sanerad ||
      payload.rokning?.sanerad;
    
    const testMarker = hasFarligaConditions ? ' - !!! - ' : ' - ';
    
    // Format subject: "INCHECKAD: [REG] - [STATION] - [MARKER] [HUVUDSTATION|BILKONTROLL]"
    const regNr = payload.regnr || '';
    const huvudstationSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}HUVUDSTATION`;
    const bilkontrollSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}BILKONTROLL`;

    // E-posthantering
    const emailPromises = [];
    
    const huvudstationHtml = buildHuvudstationEmail(payload, date, time, siteUrl);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: huvudstationAddress, subject: huvudstationSubject, html: huvudstationHtml }));
    
    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time, siteUrl);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: bilkontrollSubject, html: bilkontrollHtml }));
    
    await Promise.all(emailPromises);

    return NextResponse.json({ message: 'Notifications processed successfully.' });

  } catch (error) {
    console.error('FATAL: Uncaught error in API route:', error);
    if (error instanceof Error) {
        console.error(error.message);
    }
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
