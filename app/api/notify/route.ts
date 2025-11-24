import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { normalizeDamageType } from './normalizeDamageType';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- E-postmottagare ---
const defaultHuvudstationAddress = 'per@incheckad.se';

const stationEmailMapping: { [ort: string]: string } = {
  Helsingborg: 'helsingborg@incheckad.se',
  Ängelholm: 'helsingborg@incheckad.se',
};

const getSiteUrl = (request: Request): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  return host ? `${protocol}://${host}` : 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';
};

const LOGO_URL =
  'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

// =================================================================
// 2. HELPERS (oförändrade från tidigare version)
// =================================================================

/**
 * Safely extracts a description string from a damage object.
 * Falls back through multiple fields to ensure a non-null value is returned.
 * @param skada - Damage object that may contain userDescription, text, or fullText
 * @returns A description string (never null) - returns empty string if no description is available
 */
const getDescription = (skada: any): string => {
  return (
    skada.userDescription ||
    skada.text ||
    skada.fullText ||
    ''
  );
};

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
const escapeHtml = (text: string): string => {
  const htmlEscapeMap: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
};

const formatCheckerName = (payload: any): string => {
  if (payload.fullName) return payload.fullName;
  if (payload.full_name) return payload.full_name;
  const firstName = payload.firstName || payload.first_name || payload.incheckare;
  const lastName = payload.lastName || payload.last_name;
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return firstName || payload.incheckare || '---';
};

const createStorageLink = (folderPath: string | undefined, siteUrl: string): string | null => {
  if (!folderPath) return null;
  return `${siteUrl}/public-media/${folderPath}`;
};

const hasAnyFiles = (damage: any): boolean => {
  const uploads = damage?.uploads;
  if (!uploads) return false;
  const hasPhotos = Array.isArray(uploads.photo_urls) && uploads.photo_urls.length > 0;
  const hasVideos = Array.isArray(uploads.video_urls) && uploads.video_urls.length > 0;
  return hasPhotos || hasVideos;
};

const createAlertBanner = (
  condition: boolean,
  text: string,
  details?: string,
  folderPath?: string,
  siteUrl?: string,
  count?: number
): string => {
  if (!condition) return '';
  const storageLink = siteUrl ? createStorageLink(folderPath, siteUrl) : null;
  let bannerText = text;
  if (count !== undefined && count > 0 && Number.isInteger(count)) bannerText += ` (${count})`;
  let fullText = `⚠️ ${bannerText}`;
  if (details) fullText += `<br>${details}`;
  const bannerContent = `<div style="background-color:#B30E0E!important;border:1px solid #B30E0E;padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">${fullText}</div>`;
  return `<tr><td style="padding:6px 0;">${
    storageLink
      ? `<a href="${storageLink}" target="_blank" style="text-decoration:none;color:#FFFFFF!important;">${bannerContent}</a>`
      : bannerContent
  }</td></tr>`;
};

const createAdminBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  const bannerContent = `<div style="background-color:#15418C!important;border:1px solid #15418C;padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">${text}</div>`;
  return `<tr><td style="padding:6px 0;">${bannerContent}</td></tr>`;
};

const getDamageString = (damage: any, showPreviousInfo: boolean = false): string => {
  // Build new structured description
  let structuredText = damage.type || damage.userType || 'Okänd skada';
  const positions = (damage.positions || damage.userPositions || [])
    .map((p: any) => {
      if (p.carPart && p.position) return `${p.carPart} (${p.position})`;
      if (p.carPart) return p.carPart;
      return '';
    })
    .filter(Boolean)
    .join(', ');
  if (positions) structuredText += `: ${positions}`;
  
  // Add comment if present (but not resolvedComment - that's handled separately)
  const comment = damage.text || damage.userDescription;
  if (comment) structuredText += `<br><small><strong>Kommentar:</strong> ${escapeHtml(comment)}</small>`;
  
  // For documented BUHS damages, show previous info if different
  if (showPreviousInfo && damage.fullText) {
    // Normalize both texts for comparison (NOT for output - comparison only)
    // Multiple passes ensure all HTML-like content is removed for comparison purposes
    const normalize = (text: string) => {
      let normalized = text;
      // Remove HTML tags in multiple passes to handle nested/malformed tags
      let prevLength;
      do {
        prevLength = normalized.length;
        normalized = normalized.replace(/<[^>]*>/g, '');
      } while (normalized.length < prevLength);
      // Remove punctuation, normalize spaces, lowercase
      return normalized
        .replace(/[^\w\sÅÄÖåäö]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
    };
    
    const fullTextNormalized = normalize(damage.fullText);
    const structuredTextNormalized = normalize(structuredText);
    
    // Only show previous info if texts are substantially different
    // Check if one is not contained in the other (accounting for order differences)
    if (!structuredTextNormalized.includes(fullTextNormalized) && 
        !fullTextNormalized.includes(structuredTextNormalized)) {
      // IMPORTANT: Use escapeHtml() for output to prevent XSS attacks
      // The normalize() function above is ONLY for comparison, not output
      const escapedFullText = escapeHtml(damage.fullText);
      structuredText += `<br><small><strong>Tidigare information om skadan:</strong> ${escapedFullText}</small>`;
    }
  }
  
  return structuredText;
};

/**
 * Format a resolved damage (marked as "Går inte att dokumentera")
 * Shows BUHS fullText first, then the inchecker's comment explaining why
 * 
 * A resolved damage is one that exists in BUHS but cannot be documented during check-in,
 * typically because it has been repaired or cannot be located. The inchecker provides
 * a comment explaining why it couldn't be documented.
 * 
 * @param damage - Damage object with fullText (BUHS description) and resolvedComment (inchecker explanation)
 * @returns HTML-formatted string with escaped text, showing primary BUHS description and optional comment
 */
const getResolvedDamageString = (damage: any): string => {
  // Primary text: the original BUHS text
  const primaryText = damage.fullText || 'Okänd skada';
  
  // Secondary text: the resolved comment
  const resolvedComment = damage.resolvedComment || '';
  let result = escapeHtml(primaryText);
  
  if (resolvedComment) {
    result += `<br><small><strong>Kommentar:</strong> ${escapeHtml(resolvedComment)}</small>`;
  }
  
  return result;
};

const formatDamagesToHtml = (damages: any[], title: string, siteUrl: string, fallbackText?: string, showPreviousInfo: boolean = false): string => {
  if (!damages || damages.length === 0) {
    if (fallbackText) {
      return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><p style="margin-top:0;font-size:14px;">${fallbackText}</p>`;
    }
    return '';
  }
  const items = damages
    .map(d => {
      const text = getDamageString(d, showPreviousInfo);
      const storageLink = hasAnyFiles(d) ? createStorageLink(d.uploads?.folder, siteUrl) : null;
      return `<li style="margin-bottom:8px;">${text}${
        storageLink
          ? ` <a href="${storageLink}" target="_blank" style="text-decoration:none;color:#2563eb!important;font-weight:bold;">(Visa media 🔗)</a>`
          : ''
      }</li>`;
    })
    .join('');
  return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><ul style="padding-left:20px;margin-top:0;font-size:14px;">${items}</ul>`;
};

/**
 * Format resolved damages (marked as "Går inte att dokumentera") to HTML
 * Uses BUHS fullText + resolved comment instead of structured form data
 */
const formatResolvedDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) {
    return '';
  }
  const items = damages
    .map(d => {
      const text = getResolvedDamageString(d);
      return `<li style="margin-bottom:8px;">${text}</li>`;
    })
    .join('');
  return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><ul style="padding-left:20px;margin-top:0;font-size:14px;">${items}</ul>`;
};

const formatTankning = (tankning: any): string => {
  if (!tankning) return '---';
  if (tankning.tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
  if (tankning.tankniva === 'tankad_nu') {
    const parts = [
      'Tankad nu av MABI',
      tankning.liters ? `(${tankning.liters}L` : null,
      tankning.bransletyp ? `${tankning.bransletyp}` : null,
      tankning.literpris ? `@ ${tankning.literpris} kr/L)` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return parts;
  }
  if (tankning.tankniva === 'ej_upptankad') return '<span style="font-weight:bold;color:#b91c1c;">Ej upptankad</span>';
  return '---';
};

const buildBilagorSection = (rekond: any, husdjur: any, rokning: any, siteUrl: string): string => {
  const bilagor: string[] = [];
  if (rekond.folder && rekond.hasMedia)
    bilagor.push(`<li><a href="${siteUrl}/public-media/${rekond.folder}" target="_blank">Rekond 🔗</a></li>`);
  if (husdjur.folder && husdjur.hasMedia)
    bilagor.push(`<li><a href="${siteUrl}/public-media/${husdjur.folder}" target="_blank">Husdjur 🔗</a></li>`);
  if (rokning.folder && rokning.hasMedia)
    bilagor.push(`<li><a href="${siteUrl}/public-media/${rokning.folder}" target="_blank">Rökning 🔗</a></li>`);
  if (bilagor.length === 0) return '';
  return `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;">
    <h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Bilagor</h2>
    <ul style="padding-left:20px;margin:0;">${bilagor.join('')}</ul>
  </div>`;
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
// 3. HTML BUILDERS (Huvudstation & Bilkontroll)
// =================================================================

/**
 * Build Huvudstation (main station) email with full details including Saludatum warnings
 */
const buildHuvudstationEmail = (payload: any, date: string, time: string, siteUrl: string): string => {
  const regNr = payload.regnr || '';
  const checkerName = formatCheckerName(payload);
  
  // Build fact box content
  const bilModel = payload.bilmodel || payload.brand_model || '---';
  const matarstallning = payload.matarstallning ? `${payload.matarstallning} km` : '---';
  const hjultyp = payload.hjultyp || '---';
  
  // Fuel or charge info
  let fuelOrChargeInfo = '';
  if (payload.drivmedel === 'elbil') {
    const laddniva = payload.laddning?.laddniva || '---';
    const antalKablar = payload.laddning?.antal_laddkablar || 0;
    fuelOrChargeInfo = `<tr><td style="padding:4px 0;"><strong>Laddnivå:</strong> ${laddniva}%</td></tr>` +
                       `<tr><td style="padding:4px 0;"><strong>Laddkablar:</strong> ${antalKablar} st</td></tr>`;
  } else if (payload.drivmedel === 'bensin_diesel') {
    const tankningText = formatTankning(payload.tankning);
    fuelOrChargeInfo = `<tr><td style="padding:4px 0;"><strong>Tankning:</strong> ${tankningText}</td></tr>`;
  }
  
  // Location info
  const platsOrt = payload.ort || '---';
  const platsStation = payload.station || '---';
  const bilenStarNuOrt = payload.bilen_star_nu?.ort || platsOrt;
  const bilenStarNuStation = payload.bilen_star_nu?.station || platsStation;
  const parkeringsInfo = payload.bilen_star_nu?.kommentar || null;
  
  // Calculate Saludatum warnings
  let saludatumBanners = '';
  const existingDamages = payload.dokumenterade_skador || [];
  const resolvedDamages = payload.åtgärdade_skador || [];
  const allDamages = [...(payload.nya_skador || []), ...existingDamages, ...resolvedDamages];
  
  // Check for Saludatum from any damage
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (const damage of allDamages) {
    const saludatum = damage.saludatum || damage.saludatum_date;
    if (saludatum) {
      const saludatumDate = new Date(saludatum);
      saludatumDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((saludatumDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        // Passed
        saludatumBanners += createAlertBanner(
          true,
          `Saludatum passerat (${saludatum})! Kontakta Bilkontroll! Undvik långa hyror.`,
          '',
          undefined,
          siteUrl
        );
        break; // Only show once
      } else if (diffDays >= 0 && diffDays <= 10) {
        // Within 10 days
        saludatumBanners += createAlertBanner(
          true,
          `Kontakta Bilkontroll - saludatum: ${saludatum}. Undvik långa hyror på detta reg.nr!`,
          '',
          undefined,
          siteUrl
        );
        break; // Only show once
      }
    }
  }
  
  // Warning banners
  const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning?.laddniva, 10) < 95;
  const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning?.tankniva === 'ej_upptankad';
  
  const nyaSkadorCount = (payload.nya_skador || []).length;
  const dokumenteradeSkadorCount = existingDamages.filter((d: any) => hasAnyFiles(d)).length;
  const ejDokumenteradeSkadorCount = existingDamages.filter((d: any) => !hasAnyFiles(d)).length + resolvedDamages.length;
  
  // Calculate total handled existing damages for new banner
  const befintligaSkadorHanteradeCount = existingDamages.length + resolvedDamages.length;
  
  const banners = `
    ${createAlertBanner(nyaSkadorCount > 0, 'NYA SKADOR DOKUMENTERADE', '', undefined, siteUrl, nyaSkadorCount)}
    ${createAlertBanner(befintligaSkadorHanteradeCount > 0, 'BEFINTLIGA SKADOR HAR HANTERATS', '', undefined, siteUrl, befintligaSkadorHanteradeCount)}
    ${saludatumBanners}
    ${createAlertBanner(payload.rental?.unavailable, 'GÅR INTE ATT HYRA UT', payload.rental?.comment || '')}
    ${createAlertBanner(payload.varningslampa?.lyser, 'VARNINGSLAMPA EJ SLÄCKT', payload.varningslampa?.beskrivning || '')}
    ${createAlertBanner(showChargeWarning, 'LÅG LADDNIVÅ', `Laddnivå: ${payload.laddning?.laddniva}%`)}
    ${createAlertBanner(notRefueled, 'EJ UPPTANKAD')}
    ${createAlertBanner(payload.rekond?.behoverRekond, 'REKOND BEHÖVS', payload.rekond?.text || '', payload.rekond?.folder, siteUrl)}
    ${createAlertBanner(payload.husdjur?.sanerad, 'HUSDJUR (SANERING)', payload.husdjur?.text || '', payload.husdjur?.folder, siteUrl)}
    ${createAlertBanner(payload.rokning?.sanerad, 'RÖKNING (SANERING)', payload.rokning?.text || '', payload.rokning?.folder, siteUrl)}
    ${createAlertBanner(payload.status?.insynsskyddSaknas, 'INSYNSSKYDD SAKNAS')}
  `;
  
  // Damage sections
  const nyaSkadorHtml = formatDamagesToHtml(payload.nya_skador || [], 'NYA SKADOR', siteUrl, 'Inga nya skador', false);
  const dokumenteradeSkadorHtml = formatDamagesToHtml(
    existingDamages.filter((d: any) => hasAnyFiles(d)),
    'Befintliga skador (från BUHS) som dokumenterades',
    siteUrl,
    undefined,
    true  // Show previous info for documented BUHS damages
  );
  // Resolved damages in their own section
  const resolvedDamagesHtml = formatResolvedDamagesToHtml(
    resolvedDamages,
    'Befintliga skador (från BUHS) som inte gick att dokumentera'
  );
  // Undocumented damages (those without media but not explicitly resolved)
  const ejDokumenteradeSkadorHtml = formatDamagesToHtml(
    existingDamages.filter((d: any) => !hasAnyFiles(d)),
    'Befintliga skador (från BUHS) som inte dokumenterades',
    siteUrl,
    undefined,
    false
  );
  
  // Attachments section
  const bilagorSection = buildBilagorSection(
    payload.rekond || {},
    payload.husdjur || {},
    payload.rokning || {},
    siteUrl
  );
  
  // Comment section
  const commentSection = payload.notering
    ? `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;">
         <h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Kommentar</h2>
         <p style="margin:0;font-size:14px;">${payload.notering}</p>
       </div>`
    : '';
  
  // Build content
  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 10px;">${regNr} incheckad</h1>
    </td></tr>
    ${banners}
    <tr><td style="padding-top:20px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Bilmodell:</strong> ${bilModel}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Mätarställning:</strong> ${matarstallning}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Hjultyp:</strong> ${hjultyp}</td></tr>
            ${fuelOrChargeInfo}
            <tr><td style="padding:4px 0;"><strong>Plats för incheckning:</strong> ${platsOrt} / ${platsStation}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Bilen står nu:</strong> ${bilenStarNuOrt} / ${bilenStarNuStation}</td></tr>
            ${parkeringsInfo ? `<tr><td style="padding:4px 0;"><strong>Parkeringsinfo:</strong> ${parkeringsInfo}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </td></tr>
    <tr><td>
      ${bilagorSection}
      ${nyaSkadorHtml}
      ${dokumenteradeSkadorHtml}
      ${resolvedDamagesHtml}
      ${ejDokumenteradeSkadorHtml}
      ${commentSection}
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:14px;">
        <p style="margin:0 0 5px;"><strong>Incheckad av:</strong> ${checkerName}</p>
        <p style="margin:0 0 5px;"><strong>Datum:</strong> ${date}</p>
        <p style="margin:0;"><strong>Tid:</strong> ${time}</p>
      </div>
      <p style="margin-top:20px;font-size:14px;">
        Incheckad av ${checkerName} kl ${time}, ${date}
      </p>
    </td></tr>
  `;
  
  return createBaseLayout(regNr, content);
};

/**
 * Build Bilkontroll email with damage focus (no Saludatum warnings)
 */
const buildBilkontrollEmail = (payload: any, date: string, time: string, siteUrl: string): string => {
  const regNr = payload.regnr || '';
  const checkerName = formatCheckerName(payload);
  
  // Build fact box content
  const bilModel = payload.bilmodel || payload.brand_model || '---';
  const matarstallning = payload.matarstallning ? `${payload.matarstallning} km` : '---';
  
  // Location info
  const bilenStarNuOrt = payload.bilen_star_nu?.ort || payload.ort || '---';
  const bilenStarNuStation = payload.bilen_star_nu?.station || payload.station || '---';
  const parkeringsInfo = payload.bilen_star_nu?.kommentar || null;
  
  // Damage sections
  const existingDamages = payload.dokumenterade_skador || [];
  const resolvedDamages = payload.åtgärdade_skador || [];
  
  // Calculate counts for banners
  const nyaSkadorCount = (payload.nya_skador || []).length;
  const befintligaSkadorHanteradeCount = existingDamages.length + resolvedDamages.length;
  
  // Warning banners for Bilkontroll
  const banners = `
    ${createAdminBanner(payload.regnrSaknas, 'Reg.nr saknas!')}
    ${createAlertBanner(nyaSkadorCount > 0, 'NYA SKADOR DOKUMENTERADE', '', undefined, siteUrl, nyaSkadorCount)}
    ${createAlertBanner(befintligaSkadorHanteradeCount > 0, 'BEFINTLIGA SKADOR HAR HANTERATS', '', undefined, siteUrl, befintligaSkadorHanteradeCount)}
  `;
  
  const nyaSkadorHtml = formatDamagesToHtml(payload.nya_skador || [], 'NYA SKADOR', siteUrl, 'Inga nya skador', false);
  const dokumenteradeSkadorHtml = formatDamagesToHtml(
    existingDamages.filter((d: any) => hasAnyFiles(d)),
    'Befintliga skador (från BUHS) som dokumenterades',
    siteUrl,
    undefined,
    true  // Show previous info for documented BUHS damages
  );
  // Resolved damages in their own section
  const resolvedDamagesHtml = formatResolvedDamagesToHtml(
    resolvedDamages,
    'Befintliga skador (från BUHS) som inte gick att dokumentera'
  );
  // Undocumented damages (those without media but not explicitly resolved)
  const ejDokumenteradeSkadorHtml = formatDamagesToHtml(
    existingDamages.filter((d: any) => !hasAnyFiles(d)),
    'Befintliga skador (från BUHS) som inte dokumenterades',
    siteUrl,
    undefined,
    false
  );
  
  // Comment section
  const commentSection = payload.notering
    ? `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;">
         <h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Kommentar</h2>
         <p style="margin:0;font-size:14px;">${payload.notering}</p>
       </div>`
    : '';
  
  // Build content
  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 10px;">${regNr} incheckad</h1>
    </td></tr>
    ${banners}
    <tr><td style="padding-top:20px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Bilmodell:</strong> ${bilModel}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Mätarställning:</strong> ${matarstallning}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Bilen står nu:</strong> ${bilenStarNuOrt} / ${bilenStarNuStation}</td></tr>
            ${parkeringsInfo ? `<tr><td style="padding:4px 0;"><strong>Parkeringsinfo:</strong> ${parkeringsInfo}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </td></tr>
    <tr><td>
      ${nyaSkadorHtml}
      ${dokumenteradeSkadorHtml}
      ${resolvedDamagesHtml}
      ${ejDokumenteradeSkadorHtml}
      ${commentSection}
      <div style="margin-top:30px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:14px;">
        <p style="margin:0 0 5px;"><strong>Incheckad av:</strong> ${checkerName}</p>
        <p style="margin:0 0 5px;"><strong>Datum:</strong> ${date}</p>
        <p style="margin:0;"><strong>Tid:</strong> ${time}</p>
      </div>
      <p style="margin-top:20px;font-size:14px;">
        Incheckad av ${checkerName} kl ${time}, ${date}
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
    const fullRequestPayload = await request.json();
    const { meta: payload } = fullRequestPayload;
    const region = payload.region || null;

    // dryRun (skippa endast DB-skrivningar, skicka fortfarande mejl)
    const url = new URL(request.url);
    const dryRunParam = url.searchParams.get('dryRun');
    const isDryRun = dryRunParam === '1' || dryRunParam === 'true' || payload.dryRun === true;

    const siteUrl = getSiteUrl(request);

    // Media counts (logg)
    const countMedia = (damages: any[] = []) => {
      let photos = 0;
      let videos = 0;
      damages.forEach(d => {
        if (d.uploads?.photo_urls) photos += d.uploads.photo_urls.length;
        if (d.uploads?.video_urls) videos += d.uploads.video_urls.length;
      });
      return { photos, videos };
    };

    console.log('Media counts received:', {
      nya_skador: countMedia(payload.nya_skador || []),
      dokumenterade_skador: countMedia(payload.dokumenterade_skador || []),
      rekond: payload.rekond?.hasMedia ? 'yes' : 'no',
      husdjur: payload.husdjur?.hasMedia ? 'yes' : 'no',
      rokning: payload.rokning?.hasMedia ? 'yes' : 'no',
    });

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

    // Mottagare/ämnen
    const finalOrt = payload.bilen_star_nu?.ort || payload.ort;
    const huvudstationTo = [defaultHuvudstationAddress];
    const stationSpecificEmail = stationEmailMapping[finalOrt];
    if (stationSpecificEmail && !huvudstationTo.includes(stationSpecificEmail)) {
      huvudstationTo.push(stationSpecificEmail);
    }

    // Bilkontroll recipients: Per always, Latif only for Helsingborg/Ängelholm
    const bilkontrollTo = ['per@incheckad.se'];
    if (finalOrt === 'Helsingborg' || finalOrt === 'Ängelholm') {
      bilkontrollTo.push('latif@incheckad.se');
    }

    const stationForSubject = payload.bilen_star_nu?.station || payload.station;
    const cleanStation = stationForSubject?.includes(' / ')
      ? stationForSubject.split(' / ').pop()?.trim()
      : stationForSubject;

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
      (payload.dokumenterade_skador && payload.dokumenterade_skador.length > 0) ||
      (payload.åtgärdade_skador && payload.åtgärdade_skador.length > 0) ||
      payload.husdjur?.sanerad ||
      payload.rokning?.sanerad;

    const testMarker = hasFarligaConditions ? ' - !!! - ' : ' - ';
    const huvudstationSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}HUVUDSTATION`;
    const bilkontrollSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}BILKONTROLL`;

    // =================================================================
    // DATABASE PERSISTENCE (normaliserad damage_type)
    // =================================================================
    if (!isDryRun) {
      try {
        // Checkin
        const checkinData = {
          regnr: regNr,
          region: region || payload.region || null,
          city: payload.ort || null,
          station: payload.station || null,
          current_city: payload.bilen_star_nu?.ort || payload.ort || null,
          current_station: payload.bilen_star_nu?.station || payload.station || null,
          current_location_note: payload.bilen_star_nu?.kommentar || null,
          checker_name: payload.fullName || payload.full_name || payload.incheckare || null,
          checker_email: payload.email || null,
          completed_at: now.toISOString(),
          status: 'complete',
          // has_new_damages: Array.isArray(payload.nya_skador) && payload.nya_skador.length > 0, // (valfritt)
        };

        const { data: checkinRecord, error: checkinError } = await supabaseAdmin
          .from('checkins')
          .insert([checkinData])
          .select()
          .single();

        if (checkinError) {
          console.error('Error inserting checkin record:', checkinError);
          throw checkinError;
        }

        const checkinId = checkinRecord.id;

        // damages + checkin_damages
        const damageInserts: any[] = [];
        const checkinDamageInserts: any[] = [];

        // Nya skador
        (payload.nya_skador || []).forEach((skada: any) => {
          const rawType = skada.type || skada.userType || null;
          const normalized = normalizeDamageType(rawType);

          damageInserts.push({
            regnr: regNr,
            damage_date: now.toISOString().split('T')[0], // YYYY-MM-DD (behåll enligt #120)
            region: region || payload.region || null,
            ort: payload.ort || null,
            station_namn: payload.station || null,
            damage_type: normalized.typeCode,
            damage_type_raw: rawType,
            user_type: rawType,
            description: getDescription(skada),
            inchecker_name: checkinData.checker_name,
            inchecker_email: checkinData.checker_email,
            status: 'complete',
            uploads: skada.uploads || null,
            created_at: now.toISOString(),
          });

          const positions = skada.positions || skada.userPositions || [];
          if (positions.length > 0) {
            positions.forEach((pos: any) => {
              checkinDamageInserts.push({
                checkin_id: checkinId,
                type: 'new',
                damage_type: normalized.typeCode,
                car_part: pos.carPart || null,
                position: pos.position || null,
                description: getDescription(skada),
                photo_urls: skada.uploads?.photo_urls || [],
                video_urls: skada.uploads?.video_urls || [],
                positions: [pos],
                created_at: now.toISOString(),
              });
            });
          } else {
            checkinDamageInserts.push({
              checkin_id: checkinId,
              type: 'new',
              damage_type: normalized.typeCode,
              car_part: null,
              position: null,
              description: getDescription(skada),
              photo_urls: skada.uploads?.photo_urls || [],
              video_urls: skada.uploads?.video_urls || [],
              positions: [],
              created_at: now.toISOString(),
            });
          }
        });

        // Dokumenterade BUHS
        (payload.dokumenterade_skador || []).forEach((skada: any) => {
          const rawType = skada.userType || skada.type || null;
          const normalized = normalizeDamageType(rawType);

          damageInserts.push({
            regnr: regNr,
            damage_date: now.toISOString().split('T')[0],
            region: region || payload.region || null,
            ort: payload.ort || null,
            station_namn: payload.station || null,
            damage_type: normalized.typeCode,
            damage_type_raw: rawType,
            user_type: rawType,
            description: getDescription(skada),
            inchecker_name: checkinData.checker_name,
            inchecker_email: checkinData.checker_email,
            status: 'complete',
            uploads: skada.uploads || null,
            legacy_damage_source_text: skada.fullText || null,
            // original_damage_date: skada.damage_date || null,                // (valfritt för idempotens)
            // legacy_loose_key: skada.damage_date ? `${regNr}|${skada.damage_date}` : null, // (valfritt)
            created_at: now.toISOString(),
          });

          const positions = skada.userPositions || skada.positions || [];
          if (positions.length > 0) {
            positions.forEach((pos: any) => {
              checkinDamageInserts.push({
                checkin_id: checkinId,
                type: 'documented',
                damage_type: normalized.typeCode,
                car_part: pos.carPart || null,
                position: pos.position || null,
                description: getDescription(skada),
                photo_urls: skada.uploads?.photo_urls || [],
                video_urls: skada.uploads?.video_urls || [],
                positions: [pos],
                created_at: now.toISOString(),
              });
            });
          } else {
            checkinDamageInserts.push({
              checkin_id: checkinId,
              type: 'documented',
              damage_type: normalized.typeCode,
              car_part: null,
              position: null,
              description: getDescription(skada),
              photo_urls: skada.uploads?.photo_urls || [],
              video_urls: skada.uploads?.video_urls || [],
              positions: [],
              created_at: now.toISOString(),
            });
          }
        });

        console.debug(`Inserting ${damageInserts.length} damage records and ${checkinDamageInserts.length} checkin_damage records`);

        if (damageInserts.length > 0) {
          const { error: damagesError } = await supabaseAdmin.from('damages').insert(damageInserts);
          if (damagesError) {
            console.error('Error inserting damages:', damagesError);
            throw damagesError;
          }
        }

        if (checkinDamageInserts.length > 0) {
          const { error: checkinDamagesError } = await supabaseAdmin.from('checkin_damages').insert(checkinDamageInserts);
          if (checkinDamagesError) {
            console.error('Error inserting checkin_damages:', checkinDamagesError);
            throw checkinDamagesError;
          }
        }

        console.debug('Database persistence completed successfully');
      } catch (dbError) {
        console.error('Database persistence failed:', dbError);
        // Fortsätt med mejl även om DB-skrivning faller
      }
    } else {
      console.log('DryRun mode: Skipping database persistence');
    }

    // =================================================================
    // E-posthantering
    // =================================================================
    const emailPromises: Promise<any>[] = [];

    // Antag att dessa builders finns. Om de inte finns – importera dem eller ersätt med createBaseLayout.
    const huvudstationHtml = buildHuvudstationEmail(payload, date, time, siteUrl);
    emailPromises.push(
      resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: huvudstationTo,
        subject: huvudstationSubject,
        html: huvudstationHtml,
      })
    );

    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time, siteUrl);
    emailPromises.push(
      resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: bilkontrollTo,
        subject: bilkontrollSubject,
        html: bilkontrollHtml,
      })
    );

    await Promise.all(emailPromises);

    return NextResponse.json({ message: 'Notifications processed successfully.' });
  } catch (error) {
    console.error('FATAL: Uncaught error in API route:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}