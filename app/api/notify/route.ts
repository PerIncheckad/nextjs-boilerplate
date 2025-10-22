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
    
    // Anpassad för den NYA damage-strukturen
    const positions = damage.user_positions || [];
    const type = damage.user_type || damage.type || 'Skada';
    
    if (positions.length > 0) {
        const positionParts = positions.map((p: any) => `${p.car_part} ${p.position || ''}`.trim()).filter(Boolean).join(', ');
        baseString = positionParts ? `${type}: ${positionParts}` : type;
    } else {
        baseString = damage.legacyDamageSourceText || type;
    }

    comment = damage.comment || '';

    if (comment) {
        return `${baseString}<br><small style="color: #000000 !important;"><strong>Kommentar:</strong> ${comment}</small>`;
    }
    return baseString;
};


const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  const items = damages.map(d => `<li style="margin-bottom: 8px; color: #000000 !important;">${getDamageString(d)}</li>`).join('');
  return `<h3 style="margin-bottom: 10px; margin-top: 20px; font-size: 14px; color: #000000 !important; text-transform: uppercase; letter-spacing: 0.5px;">${title}</h3><ul style="padding-left: 20px; margin: 0; color: #000000 !important;">${items}</ul>`;
};

const createInfoGrid = (rows: [string, string | undefined | null][]): string => {
  return rows.filter(row => row[0] !== null).map(([label, value]) => `
    <tr>
      <td style="font-weight: bold; color: #000000 !important; width: 150px; padding: 4px 0; vertical-align: top;">${label}</td>
      <td style="color: #000000 !important; padding: 4px 0;">${value || '---'}</td>
    </tr>
  `).join('');
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

// =================================================================
// 3. HTML BUILDERS - SPECIFIC EMAILS
// =================================================================

const buildHuvudstationEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, ort, station, incheckare, notering, bilen_star_nu, drivmedel, tankniva, laddkablar, varningslampa_status } = payload;
  
  const alerts: string[] = [];
  if (tankniva === 'Ej upptankad') alerts.push('Ej upptankad - kontakta Bilkontroll!');
  if (payload.husdjur?.needed) alerts.push('Sanerad för husdjur - kontakta Bilkontroll!');
  if (payload.rokning?.needed) alerts.push('Sanerad för rökning - kontakta Bilkontroll!');
  if (varningslampa_status === 'no') alerts.push('Varningslampa lyser - går ej att hyra ut! - Kontakta Bilkontroll.');

  const content = `
    ${alerts.map(alert => createAlertBanner(true, alert)).join('')}
    <tr><td style="padding: 10px 0; color: #000000 !important;">
      <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Sammanfattning</h2>
      <table class="info-grid" style="color: #000000 !important; width: 100%;">
        ${createInfoGrid([
          ['Reg.nr:', regnr],
          ['Bilmodell:', carModel],
          ['Incheckad vid:', `${ort} / ${station}`],
          ['Bilen står nu:', `${bilen_star_nu.ort} / ${bilen_star_nu.station} ${bilen_star_nu.kommentar ? `(${bilen_star_nu.kommentar})` : ''}`],
          ['Datum:', date],
          ['Tid:', time],
          ['Incheckare:', incheckare],
          ['Drivmedel:', drivmedel],
          ['Tank/Laddnivå:', tankniva],
          [drivmedel === 'Elbil' ? 'Antal laddkablar:' : null, laddkablar],
        ])}
      </table>
      ${formatDamagesToHtml(payload.nya_skador, 'Nya skador')}
      ${notering ? `<h3 style="margin-top: 20px;">Övriga kommentarer</h3><p style="color: #000000 !important;">${notering}</p>` : ''}
    </td></tr>
  `;

  return createBaseLayout(regnr, content);
};

const buildBilkontrollEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, ort, station, incheckare, bilen_star_nu, drivmedel, tankniva, laddkablar, varningslampa_status } = payload;
  
  const alerts: string[] = [];
  if (tankniva === 'Ej upptankad') alerts.push('Ej upptankad');
  if (payload.husdjur?.needed) alerts.push('Sanerad för husdjur');
  if (payload.rokning?.needed) alerts.push('Sanerad för rökning');
  if (payload.varningslampa?.active) alerts.push(`Varningslampa lyser ${varningslampa_status === 'no' ? '(Går ej att hyra ut)' : '(Går att hyra ut)'}`);

  const content = `
    ${alerts.map(alert => createAlertBanner(true, alert)).join('')}
    <tr><td style="padding: 10px 0; color: #000000 !important;">
      <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px;">Incheckningsdetaljer</h2>
      <table class="info-grid" style="color: #000000 !important; width: 100%;">
      ${createInfoGrid([
        ['Reg.nr:', regnr],
        ['Bilmodell:', carModel],
        ['Incheckad vid:', `${ort} / ${station}`],
        ['Datum:', date],
        ['Tid:', time],
        ['Incheckare:', incheckare],
      ])}
      </table>
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="font-size: 16px; color: #000000 !important; font-weight: 600; margin-bottom: 15px; margin-top: 20px;">Skadeöversikt</h2>
        ${formatDamagesToHtml(payload.åtgärdade_skador, 'Åtgärdade / Hittas ej')}
        ${formatDamagesToHtml(payload.dokumenterade_skador, 'Dokumenterade befintliga skador')}
        ${formatDamagesToHtml(payload.nya_skador, 'Nya skador')}
      </div>
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
    const incomingPayload = await request.json();
    const { region, subjectBase, meta } = incomingPayload;

    // --- ADAPTER: Konvertera ny payload-struktur till det "platta" format som e-postmallarna förväntar sig ---
    const emailPayload = {
      // Grundläggande metadata
      regnr: meta.regnr,
      ort: meta.ort,
      station: meta.station,
      incheckare: meta.name,
      notering: meta.generalComment,
      carModel: meta.carModel || 'Okänd', // Antag att bilmodell kan finnas i meta
      bilen_star_nu: {
        ort: meta.ort,
        station: meta.station,
        kommentar: meta.parking,
      },
      // Status-objekt
      drivmedel: meta.status.drivmedel,
      tankniva: meta.status.tankniva,
      laddkablar: meta.status.laddkablar,
      varningslampa: meta.status.varningslampa.active,
      varningslampa_status: meta.status.varningslampa.rentable,
      // Rekond och Sanering
      rekond: meta.rekond.needed,
      husdjur: meta.sanering.husdjur,
      rokning: meta.sanering.rokning,
      // Skador
      nya_skador: meta.damages.new,
      dokumenterade_skador: meta.damages.legacy_documented,
      åtgärdade_skador: meta.damages.legacy_remedied.map((d: any) => ({
        ...d,
        // E-postmallen förväntar sig en enkel textsträng för åtgärdade skador
        fullText: `<strong>${d.legacyDamageSourceText}</strong><br><small>${d.comment}</small>`
      })),
    };
    // --- SLUT ADAPTER ---

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };
    const date = now.toLocaleDateString('sv-SE', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = now.toLocaleTimeString('sv-SE', { ...options, hour: '2-digit', minute: '2-digit' });

    // E-posthantering
    const regionalAddress = regionMapping[emailPayload.ort as keyof typeof regionMapping] || fallbackAddress;
    const emailPromises = [];
    
    const huvudstationHtml = buildHuvudstationEmail(emailPayload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: regionalAddress, subject: `INCHECKAD: ${subjectBase} - HUVUDSTATION`, html: huvudstationHtml }));
    
    const bilkontrollHtml = buildBilkontrollEmail(emailPayload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: `INCHECKAD: ${subjectBase} - BILKONTROLL`, html: bilkontrollHtml }));
    
    Promise.all(emailPromises).catch(err => console.error("Email sending failed:", err));

    // Databashantering (behålls från originalfilen)
    const damagesToProcess = [...emailPayload.nya_skador, ...emailPayload.dokumenterade_skador];
    
    for (const damage of damagesToProcess) {
        const damageData = {
            regnr: emailPayload.regnr,
            damage_date: now.toISOString(),
            ort: emailPayload.ort || null,
            station_namn: emailPayload.station || null,
            inchecker_name: emailPayload.incheckare || null,
            damage_type: damage.user_type || 'Dokumenterad befintlig skada',
            description: damage.comment || damage.legacyDamageSourceText,
            status: "complete",
            legacy_damage_source_text: damage.isLegacy ? damage.legacyDamageSourceText : null,
            user_type: damage.user_type,
            user_positions: damage.user_positions,
        };
        
        const { error: damageError } = await supabaseAdmin
            .from('damages')
            .insert(damageData)
            .select('id')
            .single();

        if (damageError) {
            console.error('Supabase DB error during damage INSERT:', damageError);
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
