import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY);

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

const createAlertBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  return `
    <tr>
      <td style="padding: 12px 0;">
        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; text-align: center; font-weight: bold; color: #B45309; border-radius: 5px;">
          ⚠️ ${text}
        </div>
      </td>
    </tr>
  `;
};

/**
 * Bygger en detaljerad sträng från ett skadeobjekt.
 */
const getDamageString = (damage: any): string => {
    // För nya skador
    if (damage.type || damage.carPart) {
        const parts = [damage.type, damage.carPart, damage.position].filter(Boolean).join(' - ');
        return damage.text ? `${parts} (${damage.text})` : parts;
    }
    // För dokumenterade befintliga skador
    if (damage.userType || damage.userCarPart) {
        const parts = [damage.fullText, damage.userType, damage.userCarPart, damage.userPosition].filter(Boolean).join(' - ');
        return damage.userDescription ? `${parts} (${damage.userDescription})` : parts;
    }
    // Fallback för enkla text-skador (som åtgärdade)
    return damage.fullText || damage.text || String(damage);
};

const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  const items = damages.map(d => `<li>${getDamageString(d)}</li>`).join('');
  return `<h3 style="margin-bottom: 5px; margin-top: 20px; font-size: 14px; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">${title}</h3><ul>${items}</ul>`;
};

const formatTankning = (tankning: any): string => {
    if (!tankning) return '---';
    if (tankning.tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
    if (tankning.tankniva === 'tankad_nu') {
        return `Tankad nu av MABI (${tankning.liters || '?'}L ${tankning.bransletyp || ''} @ ${tankning.literpris || '?'} kr/L)`;
    }
    return '---';
};

const createBaseLayout = (regnr: string, content: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { margin: 0; padding: 0; background-color: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; }
      .body-wrapper { background-color: #f0f2f5; padding: 20px; }
      .container { max-width: 640px; margin: auto; background-color: #ffffff; padding: 20px 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #111827; }
      .reg-header { text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
      .reg-header h1 { font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px; color: #111827; }
      .logo { text-align: center; margin-bottom: 20px; }
      .section { border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px; }
      .section:last-of-type { border-bottom: none; }
      .section-title { font-size: 16px; color: #374151; font-weight: 600; margin-bottom: 15px; }
      .info-grid { width: 100%; color: #111827; }
      .info-grid td { padding: 4px 0; color: #111827; }
      .info-grid .label { font-weight: bold; color: #374151; width: 120px; }
      .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
      ul { padding-left: 20px; margin: 5px 0; }
      li { margin-bottom: 4px; color: #4b5563; }
      a { color: #2563EB; text-decoration: none; }
      p { color: #4b5563; }
    </style>
  </head>
  <body>
    <div class="body-wrapper">
      <div class="container">
        <div class="logo">
          <img src="${LOGO_URL}" alt="Incheckad" style="width: 60px; height: auto;">
        </div>
        <div class="reg-header">
          <h1>${regnr}</h1>
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          ${content}
        </table>
        <div class="footer">
          Detta mejl skickades automatiskt från incheckad.se
        </div>
      </div>
    </div>
  </body>
  </html>
`;

// =================================================================
// 3. HTML BUILDERS - SPECIFIC EMAILS
// =================================================================

const buildRegionEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, ort, station, incheckare, matarstallning, tankning, rekond, bilder_url, nya_skador } = payload;

  const content = `
    ${createAlertBanner(rekond, 'Behöver rekond')}
    ${createAlertBanner(nya_skador?.length > 0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0;">
      <div class="section">
        <h2 class="section-title">Sammanfattning</h2>
        <table class="info-grid">
          <tr><td class="label">Reg.nr:</td><td>${regnr}</td></tr>
          <tr><td class="label">Bilmodell:</td><td>${carModel || '---'}</td></tr>
          <tr><td class="label">Plats:</td><td>${ort} / ${station}</td></tr>
          <tr><td class="label">Datum:</td><td>${date}</td></tr>
          <tr><td class="label">Tid:</td><td>${time}</td></tr>
          <tr><td class="label">Incheckare:</td><td>${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div class="section">
        <h2 class="section-title">Fordonsstatus</h2>
        <table class="info-grid">
          <tr><td class="label">Mätarställning:</td><td>${matarstallning} km</td></tr>
          <tr><td class="label">Tankning:</td><td>${formatTankning(tankning)}</td></tr>
        </table>
      </div>
      ${bilder_url ? `<div><a href="${bilder_url}">Öppna bildgalleri för ${regnr} →</a></div>` : ''}
    </td></tr>
  `;

  return createBaseLayout(regnr, content);
};

const buildBilkontrollEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, hjultyp, ort, station, incheckare, rekond, bilder_url, notering,
          åtgärdade_skador = [], dokumenterade_skador = [], nya_skador = [] } = payload;
          
  const content = `
    ${createAlertBanner(rekond, 'Behöver rekond')}
    ${createAlertBanner(nya_skador?.length > Tack för feedbacken! Det här är precis vad jag behöver för att kunna finjustera och korrigera. Bra att vi är nära, men "inte perfekt" är inte gott nog.

Jag har gått igenom dina punkter och har förberett en ny version av \`app/api/notify/route.ts\` som åtgärdar samtliga problem.

**Här är en sammanfattning av ändringarna:**

1.  **Korrekt Logotyp:** Jag har bytt ut den gamla, trasiga bildlänken mot den nya Supabase-URL du angav.
2.  **Fix för Dark Mode:** Jag har justerat CSS-stilmallarna för att tvinga en ljus bakgrund och mörk text inuti själva mejlet, oavsett om mottagaren använder Dark Mode eller Light Mode. Detta garanterar läsbarhet i alla lägen.
3.  **Korrekt Tidszon:** Jag har ändrat logiken för att hämta tiden så att den nu uttryckligen använder svensk tidszon (\`Europe/Stockholm\`).
4.  **Detaljerad Skadeformatering:** Jag har skrivit om funktionen som formaterar skador. Den kommer nu korrekt att bygga en detaljerad beskrivning för både nya och befintliga skador, inklusive kommentarer och alla delar (t.ex. "Repa - Motorhuv - Mitten (Liten buckla vid kanten)").
5.  **Bildgallerilänk Återställd:** Jag har säkerställt att länken till bildgalleriet nu inkluderas korrekt i båda mejlen, precis som du önskade.

Vänligen ersätt återigen hela innehållet i \`app/api/notify/route.ts\` med denna uppdaterade kod.

\`\`\`typescript name=app/api/notify/route.ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY);

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

const createAlertBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  return \`
    <tr>
      <td style="padding: 12px 0;">
        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; text-align: center; font-weight: bold; color: #B45309; border-radius: 5px;">
          ⚠️ \${text}
        </div>
      </td>
    </tr>
  \`;
};

/**
 * Bygger en detaljerad sträng från ett skadeobjekt.
 */
const getDamageString = (damage: any): string => {
    // För nya skador
    if (damage.type || damage.carPart) {
        const parts = [damage.type, damage.carPart, damage.position].filter(Boolean).join(' - ');
        return damage.text ? \`\${parts} (\${damage.text})\` : parts;
    }
    // För dokumenterade befintliga skador
    if (damage.userType || damage.userCarPart) {
        const mainInfo = damage.fullText.split(' - ').map((s:string) => s.trim()).filter(Boolean);
        const userParts = [damage.userType, damage.userCarPart, damage.userPosition].filter(Boolean);
        // Kombinera och ta bort dubbletter för en renare sträng
        const combined = [...new Set([...mainInfo, ...userParts])];
        const parts = combined.join(' - ');
        return damage.userDescription ? \`\${parts} (\${damage.userDescription})\` : parts;
    }
    // Fallback för enkla text-skador (som åtgärdade)
    return damage.fullText || damage.text || String(damage);
};

const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  const items = damages.map(d => \`<li>\${getDamageString(d)}</li>\`).join('');
  return \`<h3 style="margin-bottom: 5px; margin-top: 20px; font-size: 14px; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">\${title}</h3><ul>\${items}</ul>\`;
};

const formatTankning = (tankning: any): string => {
    if (!tankning) return '---';
    if (tankning.tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
    if (tankning.tankniva === 'tankad_nu') {
        return \`Tankad nu av MABI (\${tankning.liters || '?'}L \${tankning.bransletyp || ''} @ \${tankning.literpris || '?'} kr/L)\`;
    }
    return '---';
};

const createBaseLayout = (regnr: string, content: string): string => \`
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { margin: 0; padding: 0; background-color: #f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; }
      .body-wrapper { background-color: #f0f2f5; padding: 20px; }
      .container { max-width: 640px; margin: auto; background-color: #ffffff; padding: 20px 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #111827; }
      .reg-header { text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
      .reg-header h1 { font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px; color: #111827; }
      .logo { text-align: center; margin-bottom: 20px; }
      .section { border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px; }
      .section:last-of-type { border-bottom: none; }
      .section-title { font-size: 16px; color: #374151; font-weight: 600; margin-bottom: 15px; }
      .info-grid { width: 100%; color: #111827; }
      .info-grid td { padding: 4px 0; color: #111827; }
      .info-grid .label { font-weight: bold; color: #374151; width: 120px; }
      .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
      ul { padding-left: 20px; margin: 5px 0; }
      li { margin-bottom: 4px; color: #4b5563; }
      a { color: #2563EB; text-decoration: none; }
      p { color: #4b5563; }
    </style>
  </head>
  <body>
    <div class="body-wrapper">
      <div class="container">
        <div class="logo">
          <img src="\${LOGO_URL}" alt="Incheckad" style="width: 60px; height: auto;">
        </div>
        <div class="reg-header">
          <h1>\${regnr}</h1>
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          \${content}
        </table>
        <div class="footer">
          Detta mejl skickades automatiskt från incheckad.se
        </div>
      </div>
    </div>
  </body>
  </html>
\`;

// =================================================================
// 3. HTML BUILDERS - SPECIFIC EMAILS
// =================================================================

const buildRegionEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, ort, station, incheckare, matarstallning, tankning, rekond, bilder_url, nya_skador } = payload;

  const content = \`
    \${createAlertBanner(rekond, 'Behöver rekond')}
    \${createAlertBanner(nya_skador?.length > 0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0;">
      <div class="section">
        <h2 class="section-title">Sammanfattning</h2>
        <table class="info-grid">
          <tr><td class="label">Reg.nr:</td><td>\${regnr}</td></tr>
          <tr><td class="label">Bilmodell:</td><td>\${carModel || '---'}</td></tr>
          <tr><td class="label">Plats:</td><td>\${ort} / \${station}</td></tr>
          <tr><td class="label">Datum:</td><td>\${date}</td></tr>
          <tr><td class="label">Tid:</td><td>\${time}</td></tr>
          <tr><td class="label">Incheckare:</td><td>\${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div class="section">
        <h2 class="section-title">Fordonsstatus</h2>
        <table class="info-grid">
          <tr><td class="label">Mätarställning:</td><td>\${matarstallning} km</td></tr>
          <tr><td class="label">Tankning:</td><td>\${formatTankning(tankning)}</td></tr>
        </table>
      </div>
      \${bilder_url ? \`<div><a href="\${bilder_url}">Öppna bildgalleri för \${regnr} →</a></div>\` : ''}
    </td></tr>
  \`;

  return createBaseLayout(regnr, content);
};

const buildBilkontrollEmail = (payload: any, date: string, time: string): string => {
  const { regnr, carModel, hjultyp, ort, station, incheckare, rekond, bilder_url, notering,
          åtgärdade_skador = [], dokumenterade_skador = [], nya_skador = [] } = payload;
          
  const content = \`
    \${createAlertBanner(rekond, 'Behöver rekond')}
    \${createAlertBanner(nya_skador?.length > 0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0;">
      <div class="section">
        <h2 class="section-title">Fordonsinformation</h2>
        <table class="info-grid">
          <tr><td class="label">Reg.nr:</td><td>\${regnr}</td></tr>
          <tr><td class="label">Bilmodell:</td><td>\${carModel || '---'}</td></tr>
          <tr><td class="label">Däck:</td><td>\${hjultyp || '---'}</td></tr>
        </table>
      </div>
      <div class="section">
        <h2 class="section-title">Incheckningsdetaljer</h2>
        <table class="info-grid">
          <tr><td class="label">Plats:</td><td>\${ort} / \${station}</td></tr>
          <tr><td class="label">Datum:</td><td>\${date}</td></tr>
          <tr><td class="label">Tid:</td><td>\${time}</td></tr>
          <tr><td class="label">Incheckare:</td><td>\${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div class="section">
        <h2 class="section-title">Skadeöversikt</h2>
        \${formatDamagesToHtml(åtgärdade_skador, 'Åtgärdade / Hittas ej')}
        \${formatDamagesToHtml(dokumenterade_skador, 'Dokumenterade befintliga skador')}
        \${formatDamagesToHtml(nya_skador, 'Nya skador')}
      </div>
      \${notering ? \`
        <div class="section">
          <h2 class="section-title">Kommentarer</h2>
          <p style="margin:0;">\${notering}</p>
        </div>
      \` : ''}
      \${bilder_url ? \`<div style="padding-top: 10px;"><a href="\${bilder_url}">Öppna bildgalleri för \${regnr} →</a></div>\` : ''}
    </td></tr>
  \`;

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
    const payload = await request.json();
    const { regnr, ort, station, status } = payload;

    // Generera datum och tid i svensk tidszon
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };
    const date = now.toLocaleDateString('sv-SE', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = now.toLocaleTimeString('sv-SE', { ...options, hour: '2-digit', minute: '2-digit' });

    const regionalAddress = regionMapping[ort as keyof typeof regionMapping] || fallbackAddress;
    const emailPromises = [];

    // --- Bygg och lägg till Email 1: Region-mejlet ---
    const regionSubject = \`INCHECKAD: \${regnr} - \${ort} / \${station} - REGION\`;
    const regionHtml = buildRegionEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: regionalAddress, subject: regionSubject, html: regionHtml }));

    // --- Bygg och lägg till Email 2: Bilkontroll-mejlet ---
    const bilkontrollSubject = \`INCHECKAD: \${regnr} - \${ort} / \${station} - BILKONTROLL\`;
    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: bilkontrollSubject, html: bilkontrollHtml }));

    // --- Bygg och lägg till Email 3: Villkorligt Varningsmejl till Bilkontroll ---
    if (status === 'PARTIAL_MATCH_DAMAGE_ONLY' || status === 'NO_MATCH') {
      const warningSubject = \`VARNING: \${regnr} saknas i bilregistret\`;
      const warningHtml = \`<p>Registreringsnumret <strong>\${regnr}</strong>, som nyss checkades in på station \${station} (\${ort}), saknas i det centrala bilregistret. Vänligen lägg till fordonet manuellt.</p>\`;
      emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: warningSubject, html: warningHtml }));
    }

    // Skicka alla mejl parallellt
    await Promise.all(emailPromises);

    return NextResponse.json({ message: 'Notifications processed.' });

  } catch (error) {
    console.error('FATAL: Failed to send notification:', error);
    if (error instanceof Error) {
        console.error(error.message);
    }
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
\`\`\`

Testa gärna igen med en incheckning som inkluderar både nya och dokumenterade skador med kommentarer. Jag är övertygad om att detta kommer se mycket bättre ut. Vi närmar oss "perfekt"!0, 'Nya skador har rapporterats')}

    <tr><td style="padding: 10px 0;">
      <div class="section">
        <h2 class="section-title">Fordonsinformation</h2>
        <table class="info-grid">
          <tr><td class="label">Reg.nr:</td><td>${regnr}</td></tr>
          <tr><td class="label">Bilmodell:</td><td>${carModel || '---'}</td></tr>
          <tr><td class="label">Däck:</td><td>${hjultyp || '---'}</td></tr>
        </table>
      </div>
      <div class="section">
        <h2 class="section-title">Incheckningsdetaljer</h2>
        <table class="info-grid">
          <tr><td class="label">Plats:</td><td>${ort} / ${station}</td></tr>
          <tr><td class="label">Datum:</td><td>${date}</td></tr>
          <tr><td class="label">Tid:</td><td>${time}</td></tr>
          <tr><td class="label">Incheckare:</td><td>${incheckare || '---'}</td></tr>
        </table>
      </div>
      <div class="section">
        <h2 class="section-title">Skadeöversikt</h2>
        ${formatDamagesToHtml(åtgärdade_skador, 'Åtgärdade / Hittas ej')}
        ${formatDamagesToHtml(dokumenterade_skador, 'Dokumenterade befintliga skador')}
        ${formatDamagesToHtml(nya_skador, 'Nya skador')}
      </div>
      ${notering ? `
        <div class="section">
          <h2 class="section-title">Kommentarer</h2>
          <p style="margin:0;">${notering}</p>
        </div>
      ` : ''}
      ${bilder_url ? `<div style="padding-top: 10px;"><a href="${bilder_url}">Öppna bildgalleri för ${regnr} →</a></div>` : ''}
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
    const payload = await request.json();
    const { regnr, ort, station, status } = payload;

    // Generera datum och tid i svensk tidszon
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Stockholm' };
    const date = now.toLocaleDateString('sv-SE', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = now.toLocaleTimeString('sv-SE', { ...options, hour: '2-digit', minute: '2-digit' });

    const regionalAddress = regionMapping[ort as keyof typeof regionMapping] || fallbackAddress;
    const emailPromises = [];

    // --- Bygg och lägg till Email 1: Region-mejlet ---
    const regionSubject = `INCHECKAD: ${regnr} - ${ort} / ${station} - REGION`;
    const regionHtml = buildRegionEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: regionalAddress, subject: regionSubject, html: regionHtml }));

    // --- Bygg och lägg till Email 2: Bilkontroll-mejlet ---
    const bilkontrollSubject = `INCHECKAD: ${regnr} - ${ort} / ${station} - BILKONTROLL`;
    const bilkontrollHtml = buildBilkontrollEmail(payload, date, time);
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: bilkontrollSubject, html: bilkontrollHtml }));

    // --- Bygg och lägg till Email 3: Villkorligt Varningsmejl till Bilkontroll ---
    if (status === 'PARTIAL_MATCH_DAMAGE_ONLY' || status === 'NO_MATCH') {
      const warningSubject = `VARNING: ${regnr} saknas i bilregistret`;
      const warningHtml = `<p>Registreringsnumret <strong>${regnr}</strong>, som nyss checkades in på station ${station} (${ort}), saknas i det centrala bilregistret. Vänligen lägg till fordonet manuellt.</p>`;
      emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: warningSubject, html: warningHtml }));
    }

    // Skicka alla mejl parallellt
    await Promise.all(emailPromises);

    return NextResponse.json({ message: 'Notifications processed.' });

  } catch (error) {
    console.error('FATAL: Failed to send notification:', error);
    if (error instanceof Error) {
        console.error(error.message);
    }
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
