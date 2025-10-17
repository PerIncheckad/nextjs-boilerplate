import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const bilkontrollAddress = process.env.BILKONTROLL_MAIL;
const regionSydAddress = process.env.MAIL_REGION_SYD;
const regionMittAddress = process.env.MAIL_REGION_MITT;
const regionNorrAddress = process.env.MAIL_REGION_NORR;
const fallbackAddress = process.env.TEST_MAIL;

const regionMapping: { [ort: string]: string | undefined } = {
  'Malmö': regionSydAddress,
  'Helsingborg': regionSydAddress,
  'Ängelholm': regionSydAddress,
  'Halmstad': regionSydAddress,
  'Falkenberg': regionSydAddress,
  'Trelleborg': regionSydAddress,
  'Varberg': regionSydAddress,
  'Lund': regionSydAddress,
};

const LOGO_URL = 'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/INcheckad%20logo/INCHECKAD%20LOGO%20yellow%20DRAFT.png';

// =================================================================
// 2. HTML BUILDER - HELPERS
// =================================================================

const createAlertBanner = (condition: boolean, text: string, details?: string): string => {
  if (!condition) return '';
  let fullText = `⚠️ ${text}`;
  if (details) {
    fullText += `: ${details}`;
  }
  return `
    <tr>
      <td style="padding: 12px 0;">
        <div style="background-color: #FFFBEB !important; border: 1px solid #FDE68A; padding: 12px; text-align: center; font-weight: bold; color: #92400e !important; border-radius: 8px;">
          <span style="color: #92400e !important;">${fullText}</span>
        </div>
      </td>
    </tr>
  `;
};

const getDamageString = (damage: any): string => {
    let baseString = '';
    let comment = '';
    let positionsString = '';

    // Ny skada med expanderade positioner
    if (damage.positions && damage.positions.length > 0) {
        const positionParts = damage.positions.map((p: any) => `${p.carPart} (${p.position})`).join(', ');
        baseString = `${damage.type}: ${positionParts}`;
        comment = damage.text;
    } 
    // Gammal struktur för dokumenterad befintlig skada
    else if (damage.userType || damage.userCarPart) { 
        const mainInfo = (damage.fullText || '').split(' - ').map((s:string) => s.trim()).filter(Boolean);
        const userParts = [damage.userType, damage.userCarPart, damage.userPosition].filter(Boolean);
        const combined = [...new Set([...mainInfo, ...userParts])];
        baseString = combined.join(' - ');
        comment = damage.userDescription;
    } 
    // Fallback
    else { 
        baseString = damage.fullText || damage.text || String(damage);
    }

    if (comment) {
        return `${baseString}<br><small style="color: #000000 !important;"><strong>Kommentar:</strong> ${comment}</small>`;
    }
    return baseString;
};


const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  const items = damages.map(d => `<li style="margin-bottom: 8px; color: #000000 !important;">${getDamageString(d)}</li>`).join('');
  return `<h3 style="margin-bottom: 10px; margin-top: 20px; font-size: 14px; color: #000000 !important; text-transform: uppercase; letter-spacing: 0.5px;">${title}</h3><ul style="padding-left: 20px; margin-top: 0;">${items}</ul>`;
};

const formatTankning = (tankning: any): string => {
    if (!tankning) return '---';
    if (tankning.tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
    if (tankning.tankniva === 'tankad_nu') {
        const parts = [
            'Tankad nu av MABI',
            tankning.liters ? `(${tankning.liters}L` : null,
            tankning.bransletyp ? `${tankning.bransletyp}` : null,
            tankning.literpris ? `@ ${tankning.literpris} kr/L)` : (tankning.liters ? ')' : null)
        ].filter(Boolean).join(' ');
        return parts;
    }
    return '---';
};

const createBaseLayout = (regnr: string, content: string): string => `
  <!DOCTYPE html>
  <html lang="sv" xmlns:v="urn:schemas-microsoft-com:vml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <!--[if !mso]><!-->
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      body, div, table, tbody, tr, td {
        background-color: #ffffff !important;
      }
      h1, h2, h3, h4, h5, h6, p, a, li, span, strong, small {
        color: #000000 !important;
      }
      a, a:visited {
        color: #005A9C !important;
        text-decoration: none !important;
      }
    </style>
    <!--<![endif]-->
  </head>
  <body style="margin: 0; padding: 0; width: 100%; background-color: #ffffff !important;">
    <center>
      <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="680" style="background-color: #ffffff !important;">
        <tr>
        <td style="background-color: #ffffff !important;">
      <![endif]-->
      <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff !important;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff !important;">
          <tr>
            <td style="padding: 20px 40px; background-color: #ffffff !important;">
              <div style="text-align: center; margin-bottom: 20px;">
                <img src="${LOGO_URL}" alt="Incheckad" style="width: 60px; height: auto;">
              </div>
              <div style="text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
                <h1 style="font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px; color: #000000 !important;">${regnr}</h1>
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                ${content}
              </table>
              <div style="text-align: center; margin-top: 30px; font-size: 12px;">
                <p style="color: #000000 !important;">Detta mejl skickades automatiskt från incheckad.se</p>
              </div>
            </td>
          </tr>
        </table>
      </div>
      <!--[if mso]>
        </td>
        </tr>
        </table>
      <![endif]-->
    </center>
  </body>
  </html>
`;

const createRekondSection = (rekond_details: any, regnr: string, projectRef: string): string => {
    if (!rekond_details || !rekond_details.text && (!rekond_details.photo_urls || rekond_details.photo_urls.length === 0)) return '';
    
    const { text, photo_urls = [], folder } = rekond_details;
    const galleryLink = `https://app.supabase.com/project/${projectRef}/storage/buckets/damage-photos?path=${folder}`;

    let photosHtml = '';
    if (photo_urls.length > 0) {
        photosHtml = `
            <p style="margin:10px 0 5px 0; color: #000000 !important; font-weight: bold;">Bilder:</p>
            ${photo_urls.map((url: string, index: number) => `<a href="${url}" style="color: #005A9C !important; text-decoration: none !important; margin-right: 10px;">Visa bild ${index + 1}</a>`).join('')}
            <br/><a href="${galleryLink}" style="color: #005A9C !important; text-decoration: none !important; margin-top: 5px; display: inline-block;">Öppna Rekond-galleri →</a>
        `;
    }

    return `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin-top: 10px;">
            <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 14px; color: #991b1b !important; text-transform: uppercase; letter-spacing: 0.5px;">Rekondinformation</h3>
            ${text ? `<p style="margin:0 0 10px 0; color: #000000 !important;"><strong>Kommentar:</strong> ${text}</p>` : ''}
            ${photosHtml}
        </div>
    `;
};

// =================================================================
// 3. HTML BUILDERS - SPECIFIC EMAILS
// =================================================================

const buildHuvudstationEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, ort, station, incheckare, matarstallning, tankning, laddning, rekond, varningslampa, varningslampa_beskrivning, nya_skador = [], notering, bilen_star_nu, rekond_details } = payload;
  const projectRef = supabaseUrl.split('.')[0].split('//')[1];
  const storageLink = `https://app.supabase.com/project/${projectRef}/storage/buckets/damage-photos`;

  let bilenStarNuText = '---';
  if (bilen_star_nu && bilen_star_nu.ort && bilen_star_nu.station) {
    bilenStarNuText = `${bilen_star_nu.ort} / ${bilen_star_nu.station}`;
    if (bilen_star_nu.kommentar) {
      bilenStarNuText += `<br><small style="color: #000000 !important;">(${bilen_star_nu.kommentar})</small>`;
    }
  }
  
  const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning.laddniva, 10) < 95;

  const content = `
    ${createAlertBanner(showChargeWarning, 'Kolla bilens laddnivå!')}
    ${createAlertBanner(varningslampa, 'Varningslampa lyser', varningslampa_beskrivning)}
    ${createAlertBanner(rekond, 'Behöver rekond')}
    ${rekond ? createRekondSection(rekond_details, regnr, projectRef) : ''}
    ${createAlertBanner(nya_skador.length > 0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0; color: #000000 !important;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Sammanfattning</h2>
        <table class="info-grid" style="color: #000000 !important; width: 100%;">
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Reg.nr:</td><td style="color: #000000 !important; padding: 4px 0;">${regnr}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Bilmodell:</td><td style="color: #000000 !important; padding: 4px 0;">${carModel || '---'}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0; vertical-align: top;">Incheckad vid:</td><td style="color: #000000 !important; padding: 4px 0;">${ort} / ${station}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0; vertical-align: top;">Bilen står nu:</td><td style="color: #000000 !important; padding: 4px 0;">${bilenStarNuText}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Datum:</td><td style="color: #000000 !important; padding: 4px 0;">${date}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Tid:</td><td style="color: #000000 !important; padding: 4px 0;">${time}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Incheckare:</td><td style="color: #000000 !important; padding: 4px 0;">${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Fordonsstatus</h2>
        <table class="info-grid" style="color: #000000 !important; width: 100%;">
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Mätarställning:</td><td style="color: #000000 !important; padding: 4px 0;">${matarstallning} km</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Tankning:</td><td style="color: #000000 !important; padding: 4px 0;">${payload.drivmedel === 'elbil' ? '---' : formatTankning(tankning)}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Laddning:</td><td style="color: #000000 !important; padding: 4px 0;">${payload.drivmedel === 'elbil' ? `${laddning.laddniva}%` : '---'}</td></tr>
        </table>
      </div>
      ${nya_skador.length > 0 ? `
        <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
          ${formatDamagesToHtml(nya_skador, 'Nya skador')}
        </div>
      ` : ''}
      ${notering ? `
        <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
          <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Övriga kommentarer</h2>
          <p style="margin:0; color: #000000 !important;">${notering}</p>
        </div>
      ` : ''}
      <div style="padding-top: 10px;"><a href="${storageLink}" style="color: #005A9C !important; text-decoration: none !important;">Öppna bildgalleri för ${regnr} →</a></div>
    </td></tr>
  `;

  return createBaseLayout(regnr, content);
};

const buildBilkontrollEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, hjultyp, ort, station, incheckare, rekond, varningslampa, varningslampa_beskrivning, notering, bilen_star_nu,
          åtgärdade_skador = [], dokumenterade_skador = [], nya_skador = [], rekond_details } = payload;
  const projectRef = supabaseUrl.split('.')[0].split('//')[1];
  const storageLink = `https://app.supabase.com/project/${projectRef}/storage/buckets/damage-photos`;

  let bilenStarNuText = '---';
  if (bilen_star_nu && bilen_star_nu.ort && bilen_star_nu.station) {
    bilenStarNuText = `${bilen_star_nu.ort} / ${bilen_star_nu.station}`;
    if (bilen_star_nu.kommentar) {
      bilenStarNuText += ` (${bilen_star_nu.kommentar})`;
    }
  }
          
  const content = `
    ${createAlertBanner(varningslampa, 'Varningslampa lyser', varningslampa_beskrivning)}
    ${createAlertBanner(rekond, 'Behöver rekond')}
    ${rekond ? createRekondSection(rekond_details, regnr, projectRef) : ''}
    ${createAlertBanner(nya_skador.length > 0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0; color: #000000 !important;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Fordonsinformation</h2>
        <table class="info-grid" style="color: #000000 !important; width: 100%;">
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Reg.nr:</td><td style="color: #000000 !important; padding: 4px 0;">${regnr}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Bilmodell:</td><td style="color: #000000 !important; padding: 4px 0;">${carModel || '---'}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Däck:</td><td style="color: #000000 !important; padding: 4px 0;">${hjultyp || '---'}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Incheckningsdetaljer</h2>
        <table class="info-grid" style="color: #000000 !important; width: 100%;">
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0; vertical-align: top;">Incheckad vid:</td><td style="color: #000000 !important; padding: 4px 0;">${ort} / ${station}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0; vertical-align: top;">Bilen står nu:</td><td style="color: #000000 !important; padding: 4px 0;">${bilenStarNuText}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Datum:</td><td style="color: #000000 !important; padding: 4px 0;">${date}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Tid:</td><td style="color: #000000 !important; padding: 4px 0;">${time}</td></tr>
          <tr><td style="font-weight: bold; color: #000000 !important; width: 120px; padding: 4px 0;">Incheckare:</td><td style="color: #000000 !important; padding: 4px 0;">${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Skadeöversikt</h2>
        ${formatDamagesToHtml(åtgärdade_skador, 'Åtgärdade / Hittas ej')}
        ${formatDamagesToHtml(dokumenterade_skador, 'Dokumenterade befintliga skador')}
        ${formatDamagesToHtml(nya_skador, 'Nya skador')}
      </div>
      ${notering ? `
        <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
          <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Övriga kommentarer</h2>
          <p style="margin:0; color: #000000 !important;">${notering}</p>
        </div>
      ` : ''}
      <div style="padding-top: 10px;"><a href="${storageLink}" style="color: #005A9C !important; text-decoration: none !important;">Öppna bildgalleri för ${regnr} →</a></div>
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
    const payload = fullRequestPayload.meta; 

    const { regnr, ort, station, status, nya_skador = [], dokumenterade_skador = [] } = payload;

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };
    const date = now.toLocaleDateString('sv-SE', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = now.toLocaleTimeString('sv-SE', { ...options, hour: '2-digit', minute: '2-digit' });

    // E-posthantering
    const regionalAddress = regionMapping[ort as keyof typeof regionMapping] || fallbackAddress;
    const emailPromises = [];
    const huvudstationHtml = buildHuvudstationEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: regionalAddress, subject: `INCHECKAD: ${fullRequestPayload.subjectBase} - HUVUDSTATION`, html: huvudstationHtml }));
    
    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: `INCHECKAD: ${fullRequestPayload.subjectBase} - BILKONTROLL`, html: bilkontrollHtml }));
    
    if (status === 'PARTIAL_MATCH_DAMAGE_ONLY' || status === 'NO_MATCH') {
      const warningSubject = `VARNING: ${regnr} saknas i bilregistret`;
      const warningHtml = createBaseLayout(regnr, `<tr><td><p style="color: #000000 !important;">Registreringsnumret <strong>${regnr}</strong>, som nyss checkades in på station ${station} (${ort}), saknas i bilregistret. Vänligen kontrollera om det är korrekt inmatat.</p></td></tr>`);
      emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: warningSubject, html: warningHtml }));
    }
    
    Promise.all(emailPromises).catch(err => console.error("Email sending failed:", err));

    // Databashantering
    const damagesToProcess = [...nya_skador, ...dokumenterade_skador];
    
    for (const damage of damagesToProcess) {
        const isNewDamage = 'positions' in damage;
        const firstPhoto = damage.uploads?.photo_urls?.[0] || null;

        // Steg 1: Skapa huvudinlägget för skadan i 'damages'-tabellen (utan positionsdata)
        const damageData = {
            regnr: payload.regnr,
            damage_date: now.toISOString(),
            ort: payload.ort || null,
            station_namn: payload.station || null,
            inchecker_name: payload.incheckare || null,
            damage_type: isNewDamage ? damage.type : (damage.fullText || 'Dokumenterad befintlig skada'),
            description: isNewDamage ? damage.text : (damage.userDescription || damage.fullText),
            media_url: firstPhoto,
            status: "complete",
            notering: payload.notering || null,
        };
        
        const { data: newDamage, error: damageError } = await supabaseAdmin
            .from('damages')
            .insert(damageData)
            .select('id')
            .single();

        if (damageError) {
            console.error('Supabase DB error during damage INSERT:', damageError);
            continue; // Gå till nästa skada om detta misslyckas
        }

        if (!newDamage) {
            console.error('Failed to get ID for new damage, cannot save positions or media.');
            continue;
        }

        // Steg 2: Spara positionerna i den nya 'damage_positions'-tabellen
        if (isNewDamage && damage.positions && damage.positions.length > 0) {
            const positionsToInsert = damage.positions.map((pos: any) => ({
                damage_id: newDamage.id,
                car_part: pos.carPart,
                position: pos.position,
            }));

            const { error: positionsError } = await supabaseAdmin
                .from('damage_positions')
                .insert(positionsToInsert);

            if (positionsError) {
                console.error('Supabase DB error during damage_positions INSERT:', positionsError);
            }
        }

        // Steg 3: Spara media i 'damage_media'-tabellen (oförändrat)
        const mediaToInsert = [];
        const allPhotoUrls = damage.uploads?.photo_urls || [];
        const allVideoUrls = damage.uploads?.video_urls || [];

        for (const url of allPhotoUrls) {
            mediaToInsert.push({
                damage_id: newDamage.id,
                url: url,
                type: 'image',
                comment: isNewDamage ? damage.text : damage.userDescription,
            });
        }
        for (const url of allVideoUrls) {
            mediaToInsert.push({
                damage_id: newDamage.id,
                url: url,
                type: 'video',
                comment: isNewDamage ? damage.text : damage.userDescription,
            });
        }

        if (mediaToInsert.length > 0) {
            const { error: mediaError } = await supabaseAdmin
                .from('damage_media')
                .insert(mediaToInsert);
            
            if (mediaError) {
                console.error('Supabase DB error during damage_media INSERT:', mediaError);
            }
        }
    }

    return NextResponse.json({ message: 'Notifications processed.' });

  } catch (error) {
    console.error('FATAL: Uncaught error in API route:', error);
    if (error instanceof Error) {
        console.error(error.message);
    }
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
