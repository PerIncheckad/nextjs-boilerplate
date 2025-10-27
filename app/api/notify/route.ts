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

const bilkontrollAddress = process.env.BILKONTROLL_MAIL;
const huvudstationAddress = process.env.HUVUDSTATION_MAIL || 'per@incheckad.se';
const fallbackAddress = process.env.TEST_MAIL;

const supabaseProjectId = supabaseUrl.match(/https:\/\/(.*)\.supabase\.co/)?.[1];
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';

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

const LOGO_URL = 'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/INcheckad%20logo/INCHECKAD%20LOGO%20yellow%20DRAFT.png';

// =================================================================
// 2. HTML BUILDER - HELPERS
// =================================================================

const createStorageLink = (folderPath: string | undefined): string | null => {
    if (!folderPath) return null;
    return `${siteUrl}/media/${folderPath}`;
}

const createAlertBanner = (condition: boolean, text: string, details?: string, folderPath?: string): string => {
  if (!condition) return '';
  
  const storageLink = createStorageLink(folderPath);
  let fullText = `⚠️ ${text}`;
  if (details) fullText += `: ${details}`;

  const bannerContent = `<div style="background-color: #FFFBEB !important; border: 1px solid #FDE68A; padding: 12px; text-align: center; font-weight: bold; color: #92400e !important; border-radius: 8px;">${fullText}${storageLink ? ' <span style="font-size: 1.1em;">🔗</span>' : ''}</div>`;

  const finalHtml = storageLink 
    ? `<a href="${storageLink}" target="_blank" style="text-decoration: none; color: #92400e !important;">${bannerContent}</a>`
    : bannerContent;

  return `<tr><td style="padding: 6px 0;">${finalHtml}</td></tr>`;
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

const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  
  const items = damages.map(d => {
    const text = getDamageString(d);
    const storageLink = createStorageLink(d.uploads?.folder);
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

const createBaseLayout = (regnr: string, content: string): string => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; }
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
    @media (prefers-color-scheme: dark) {
      body { 
        background-color: #111827 !important; 
        color: #ffffff !important; 
      }
      .container { 
        background-color: #1f2937 !important; 
        border-color: #374151 !important; 
      }
      p, td, h1, h2, h3, li, span, div, strong, small { 
        color: #ffffff !important; 
      }
      a { 
        color: #60a5fa !important; 
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px;">
      <img src="${LOGO_URL}" alt="INCHECKAD Logo" width="150">
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

const buildHuvudstationEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, ort, station, incheckare, matarstallning, hjultyp, tankning, laddning, rekond, varningslampa, nya_skador = [], notering, bilen_star_nu } = payload;
  
  const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(laddning.laddniva, 10) < 95;
  const notRefueled = payload.drivmedel === 'bensin_diesel' && tankning.tankniva === 'ej_upptankad';

  const content = `
    ${createAlertBanner(showChargeWarning, 'Kolla bilens laddnivå!')}
    ${createAlertBanner(notRefueled, 'Bilen är ej upptankad!')}
    ${createAlertBanner(varningslampa.lyser, 'Varningslampa lyser', varningslampa.beskrivning)}
    ${createAlertBanner(rekond.behoverRekond, 'Behöver rekond', undefined, rekond.folder)}
    ${createAlertBanner(nya_skador.length > 0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Sammanfattning</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Reg.nr:</td><td>${regnr}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Bilmodell:</td><td>${carModel || '---'}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;vertical-align:top;">Incheckad vid:</td><td>${ort} / ${station}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;vertical-align:top;">Bilen står nu:</td><td>${bilen_star_nu.ort} / ${bilen_star_nu.station}${bilen_star_nu.kommentar ? `<br><small>(${bilen_star_nu.kommentar})</small>` : ''}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Datum:</td><td>${date}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Tid:</td><td>${time}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Incheckare:</td><td>${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Fordonsstatus</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Mätarställning:</td><td>${matarstallning} km</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Däcktyp:</td><td>${hjultyp || '---'}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Tankning:</td><td>${payload.drivmedel === 'elbil' ? '---' : formatTankning(tankning)}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Laddning:</td><td>${payload.drivmedel === 'elbil' ? `${laddning.laddniva}% (${laddning.antal_laddkablar} kablar)` : '---'}</td></tr>
        </table>
      </div>
      ${formatDamagesToHtml(nya_skador, 'Nya skador')}
      ${notering ? `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;"><h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Övriga kommentarer</h2><p style="margin-top:0;">${notering}</p></div>` : ''}
    </td></tr>
  `;
  return createBaseLayout(regnr, content);
};

const buildBilkontrollEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, hjultyp, ort, station, incheckare, rekond, husdjur, rokning, varningslampa, notering, åtgärdade_skador = [], dokumenterade_skador = [], nya_skador = [] } = payload;
          
  const content = `
    ${createAlertBanner(varningslampa.lyser, 'Varningslampa lyser', varningslampa.beskrivning)}
    ${createAlertBanner(rekond.behoverRekond, 'Behöver rekond', rekond.text, rekond.folder)}
    ${createAlertBanner(husdjur.sanerad, 'Husdjur - sanerad', husdjur.text, husdjur.folder)}
    ${createAlertBanner(rokning.sanerad, 'Rökning - sanerad', rokning.text, rokning.folder)}
    ${createAlertBanner(nya_skador.length > 0 || dokumenterade_skador.length > 0, 'Skador har hanterats')}

    <tr><td style="padding: 10px 0;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Fordonsinformation</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Reg.nr:</td><td>${regnr}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Bilmodell:</td><td>${carModel || '---'}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Däck:</td><td>${hjultyp || '---'}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Incheckningsdetaljer</h2>
        <table width="100%">
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Incheckad vid:</td><td>${ort} / ${station}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Datum:</td><td>${date}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Tid:</td><td>${time}</td></tr>
          <tr><td style="font-weight:bold;width:120px;padding:4px 0;">Incheckare:</td><td>${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 15px;">Skadeöversikt</h2>
        ${formatDamagesToHtml(åtgärdade_skador, 'Åtgärdade / Hittas ej')}
        ${formatDamagesToHtml(dokumenterade_skador, 'Dokumenterade befintliga skador')}
        ${formatDamagesToHtml(nya_skador, 'Nya skador')}
      </div>
      ${notering ? `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;"><h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Övriga kommentarer</h2><p style="margin-top:0;">${notering}</p></div>` : ''}
    </td></tr>
  `;
  return createBaseLayout(regnr, content);
};

// =================================================================
// 4. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  if (!bilkontrollAddress || !fallbackAddress) {
    console.error('SERVER ERROR: BILKONTROLL_MAIL or TEST_MAIL is not configured.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const fullRequestPayload = await request.json();
    const { meta: payload, subjectBase, region } = fullRequestPayload; 

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };
    const date = now.toLocaleDateString('sv-SE', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = now.toLocaleTimeString('sv-SE', { ...options, hour: '2-digit', minute: '2-digit' });

    // E-posthantering
    const regionalAddress = regionMapping[payload.ort as keyof typeof regionMapping] || fallbackAddress;
    const emailPromises = [];
    
    const huvudstationHtml = buildHuvudstationEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: regionalAddress, subject: `INCHECKAD: ${subjectBase} - HUVUDSTATION`, html: huvudstationHtml }));
    
    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: `INCHECKAD: ${subjectBase} - BILKONTROLL`, html: bilkontrollHtml }));
    
    if (payload.status === 'PARTIAL_MATCH_DAMAGE_ONLY' || payload.status === 'NO_MATCH') {
      const warningSubject = `VARNING: ${payload.regnr} saknas i bilregistret`;
      const warningHtml = createBaseLayout(payload.regnr, `<tr><td><p>Registreringsnumret <strong>${payload.regnr}</strong>, som nyss checkades in på station ${payload.station} (${payload.ort}), saknas i MABI's bilregister (BUHS). En ny post kommer att skapas, men detta kan behöva följas upp manuellt.</p></td></tr>`);
      emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: warningSubject, html: warningHtml }));
    }
    
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
