import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// =================================================================
// 1. TYPES & MAPPINGS
// =================================================================

type Damage = {
    id: string;
    // Nya skador
    type?: string;
    carPart?: string;
    position?: string;
    text?: string;
    // Befintliga skador
    fullText?: string;
    userType?: string;
    userCarPart?: string;
    userPosition?: string;
    userDescription?: string;
    // Gemensam
    uploads: {
        photo_urls: string[];
        video_urls: string[];
        folder: string;
    }
};

type CheckinPayload = {
    regnr: string;
    carModel?: string;
    ort: string;
    station: string;
    incheckare: string;
    timestamp: string;
    matarstallning: string;
    drivmedel: 'bensin_diesel' | 'elbil';
    tankning: {
        tankniva: 'återlämnades_fulltankad' | 'tankad_nu';
        liters?: string;
        bransletyp?: 'Bensin' | 'Diesel';
        literpris?: string;
    };
    laddning: {
        laddniva?: string;
    };
    hjultyp: 'Sommardäck' | 'Vinterdäck';
    rekond: boolean;
    nya_skador: Damage[];
    dokumenterade_skador: Damage[];
    åtgärdade_skador: Damage[];
};

type RegionName = 'SYD' | 'MITT' | 'NORR';

const ORT_TO_REGION: Record<string, RegionName> = {
    'Lund': 'SYD', 'Sturup': 'SYD', 'Malmö': 'SYD', 'Trelleborg': 'SYD',
    'Helsingborg': 'MITT', 'Ängelholm': 'MITT',
    'Varberg': 'NORR', 'Falkenberg': 'NORR', 'Halmstad': 'NORR',
};

// **VIKTIGT**: Klistra in den publika URL:en till er logotyp här.
const INCHECKAD_LOGO_URL = 'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/INcheckad%20logo/INCHECKAD%20LOGO%20DRAFT.png'; // EXEMPEL: 'https://xyz.supabase.co/storage/v1/object/pub[...]


// =================================================================
// 2. EMAIL TEMPLATES
// =================================================================

function createDamageSectionHtml(title: string, damages: Damage[], highlightNew = false): string {
    if (damages.length === 0) return '';

    const listItems = damages.map(d => {
        const type = highlightNew ? d.type : (d.userType || d.type);
        const part = highlightNew ? d.carPart : (d.userCarPart || d.carPart);
        const pos = highlightNew ? d.position : (d.userPosition || d.position);
        const desc = highlightNew ? d.text : (d.userDescription || d.text || d.fullText);
        
        const damageTitle = [type, part, pos].filter(Boolean).join(' - ');
        
        let html = `<li class="damage-item">`;
        if (highlightNew) {
            html += `<span class="damage-title">💥 ${damageTitle}</span>`;
        } else {
            html += `<span class="damage-title">${damageTitle || desc}</span>`;
        }
        if (desc && damageTitle) { // only show sub-description if we have a title
            html += `<br><span class="damage-desc">&nbsp;&nbsp;&nbsp;<em>${desc}</em></span>`;
        }
        html += `</li>`;
        return html;
    }).join('');

    return `
        <h3 class="damage-section-title">${title}</h3>
        <ul class="damage-list">${listItems}</ul>
    `;
}


function getFuelStatusHtml(p: CheckinPayload): string {
    if (p.drivmedel === 'elbil') {
        return `<dt>Laddning:</dt><dd>${p.laddning.laddniva || '0'}%</dd>`;
    }
    if (p.drivmedel === 'bensin_diesel') {
        if (p.tankning.tankniva === 'återlämnades_fulltankad') {
            return `<dt>Tankning:</dt><dd>Återlämnades fulltankad</dd>`;
        }
        const details = [
            p.tankning.liters ? `${p.tankning.liters}L` : '',
            p.tankning.bransletyp,
            p.tankning.literpris ? `@ ${p.tankning.literpris} kr/L` : ''
        ].filter(Boolean).join(' ');
        return `<dt>Tankning:</dt><dd>Tankad av MABI (${details})</dd>`;
    }
    return '';
}

function createBaseLayout(content: string): string {
    // CSS with dark mode support
    const styles = `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .body-wrap { background-color: #f0f2f5; margin: 0; padding: 20px; color: #111827; }
        .container { max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; }
        .header { background-color: #111827; color: white; padding: 24px; text-align: center; }
        .header img { max-height: 40px; }
        .header-title { margin: 10px 0 0; font-size: 24px; color: #ffffff; }
        .content { padding: 24px; }
        .section { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
        .section:last-child { margin-bottom: 0; border-bottom: none; }
        .section h2 { font-size: 18px; margin: 0 0 12px; color: #111827; }
        .info-grid { display: grid; grid-template-columns: 140px 1fr; gap: 8px; }
        .info-grid dt { font-weight: 600; color: #4b5563; }
        .info-grid dd { margin: 0; color: #111827; }
        .highlight-box { padding: 16px; border-radius: 6px; margin-bottom: 16px; border: 1px solid; }
        .highlight-box strong { font-size: 1.1em; }
        .highlight-rekond { background-color: #fffbeb; border-color: #f59e0b; color: #18181b !important; }
        .highlight-damage { background-color: #fef2f2; border-color: #dc2626; color: #991b1b !important; }
        .damage-section-title { font-size: 16px; color: #374151; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
        .damage-list { list-style-type: none; padding-left: 0; margin: 0; }
        .damage-item { padding: 8px 0; }
        .damage-title { color: #111827; font-weight: 500; }
        .damage-desc { color: #4b5563; font-size: 0.9em; }
        .footer { padding: 16px 24px; font-size: 12px; color: #6b7280; text-align: center; background-color: #f9fafb; }
        a { color: #2563eb; text-decoration: none; }
        a:hover { text-decoration: underline; }

        @media (prefers-color-scheme: dark) {
            .body-wrap { background-color: #000000; color: #e5e7eb; }
            .container { background-color: #1f2937; border-color: #4b5563; }
            .section h2, .damage-title, .info-grid dd { color: #f9fafb; }
            .info-grid dt, .damage-desc { color: #9ca3af; }
            .section, .damage-section-title { border-color: #4b5563; }
            .highlight-rekond { background-color: #452c0d; border-color: #b45309; color: #fefce8 !important; }
            .highlight-damage { background-color: #5c1a1a; border-color: #b91c1c; color: #fecaca !important; }
            .footer { background-color: #111827; color: #9ca3af; }
        }
    `;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <style>${styles}</style>
    </head>
    <body>
        <div class="body-wrap">
            <div class="container">
                <div class="header">
                    ${INCHECKAD_LOGO_URL ? `<img src="${INCHECKAD_LOGO_URL}" alt="Incheckad Logotyp">` : `<h1 class="header-title">INCHECKAD</h1>`}
                </div>
                <div class="content">${content}</div>
                <div class="footer">Detta mejl skickades automatiskt från incheckad.se</div>
            </div>
        </div>
    </body>
    </html>`;
}


function createRegionEmail(p: CheckinPayload): string {
    const checkinDate = new Date(p.timestamp).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
    const checkinTime = new Date(p.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    
    const content = `
        ${p.rekond ? `<div class="highlight-box highlight-rekond"><strong>⚠️ Behöver rekond</strong></div>` : ''}
        ${p.nya_skador.length > 0 ? `<div class="highlight-box highlight-damage"><strong>💥 Nya skador har rapporterats</strong></div>` : ''}
        
        <div class="section">
            <h2>Sammanfattning</h2>
            <dl class="info-grid">
                <dt>Reg.nr:</dt><dd>${p.regnr}</dd>
                <dt>Bilmodell:</dt><dd>${p.carModel || '---'}</dd>
                <dt>Plats:</dt><dd>${p.ort} / ${p.station}</dd>
                <dt>Datum:</dt><dd>${checkinDate}</dd>
                <dt>Tid:</dt><dd>${checkinTime}</dd>
                <dt>Incheckare:</dt><dd>${p.incheckare}</dd>
            </dl>
        </div>

        <div class="section">
            <h2>Fordonsstatus</h2>
            <dl class="info-grid">
                <dt>Mätarställning:</dt><dd>${p.matarstallning} km</dd>
                ${getFuelStatusHtml(p)}
            </dl>
        </div>

        <div class="section">
            <a href="https://incheckad.se/gallery/${p.regnr}" target="_blank">Öppna bildgalleri för ${p.regnr} &rarr;</a>
        </div>
    `;
    return createBaseLayout(content);
}

function createBilkontrollEmail(p: CheckinPayload): string {
    const checkinDate = new Date(p.timestamp).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
    const checkinTime = new Date(p.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

    const content = `
        ${p.rekond ? `<div class="highlight-box highlight-rekond"><strong>⚠️ Behöver rekond</strong></div>` : ''}
        ${p.nya_skador.length > 0 ? `<div class="highlight-box highlight-damage"><strong>💥 Nya skador har rapporterats</strong></div>` : ''}

        <div class="section">
            <h2>Fordonsinformation</h2>
            <dl class="info-grid">
                <dt>Reg.nr:</dt><dd>${p.regnr}</dd>
                <dt>Bilmodell:</dt><dd>${p.carModel || '---'}</dd>
                <dt>Däck:</dt><dd>${p.hjultyp}</dd>
            </dl>
        </div>

        <div class="section">
            <h2>Incheckningsdetaljer</h2>
            <dl class="info-grid">
                <dt>Plats:</dt><dd>${p.ort} / ${p.station}</dd>
                <dt>Datum:</dt><dd>${checkinDate}</dd>
                <dt>Tid:</dt><dd>${checkinTime}</dd>
                <dt>Incheckare:</dt><dd>${p.incheckare}</dd>
            </dl>
        </div>

        <div class="section">
            <h2>Skadeöversikt</h2>
            ${createDamageSectionHtml('Nya skador', p.nya_skador, true)}
            ${createDamageSectionHtml('Dokumenterade befintliga skador', p.dokumenterade_skador)}
            ${createDamageSectionHtml('Åtgärdade / Hittas ej', p.åtgärdade_skador)}
            ${p.nya_skador.length === 0 && p.dokumenterade_skador.length === 0 && p.åtgärdade_skador.length === 0 ? '<p>Inga skador hanterade vid denna incheckning.</p>' : ''}
        </div>

        <div class="section">
            <a href="https://incheckad.se/gallery/${p.regnr}" target="_blank">Öppna bildgalleri för ${p.regnr} &rarr;</a>
        </div>
    `;
    return createBaseLayout(content);
}

// =================================================================
// 3. ROUTE HANDLER
// =================================================================

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as CheckinPayload;

        const region = ORT_TO_REGION[body.ort] || 'SYD';
        const location = `${body.ort} / ${body.station}`;

        const FORCE_EMAIL_TO = process.env.NEXT_PUBLIC_FORCE_DEBUG_EMAIL || process.env.NEXT_PUBLIC_TEST_MAIL || null;

        const REGION_MAIL_ADDRESSES: Record<RegionName, string> = {
            SYD: process.env.NEXT_PUBLIC_MAIL_REGION_SYD || 'syd@incheckad.se',
            MITT: process.env.NEXT_PUBLIC_MAIL_REGION_MITT || 'mitt@incheckad.se',
            NORR: process.env.NEXT_PUBLIC_MAIL_REGION_NORR || 'norr@incheckad.se',
        };
        
        const regionEmail = FORCE_EMAIL_TO || REGION_MAIL_ADDRESSES[region];
        const bilkontrollEmail = FORCE_EMAIL_TO || process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || 'bilkontroll@incheckad.se';

        const baseSubject = `INCHECKAD: ${body.regnr} - ${location}`;
        const regionSubject = `${baseSubject} - REGION`;
        const bilkontrollSubject = `${baseSubject} - BILKONTROLL`;

        const regionHtml = createRegionEmail(body);
        const bilkontrollHtml = createBilkontrollEmail(body);
        
        const fromAddress = 'incheckning@incheckad.se'; 

        const sentToRegion = await resend.emails.send({
            from: fromAddress, to: regionEmail, subject: regionSubject, html: regionHtml,
        });

        if (sentToRegion.error) {
            console.error("Resend error (Region):", { error: sentToRegion.error, recipient: regionEmail });
            throw new Error(`Failed to send email to Region: ${sentToRegion.error.message}`);
        }
        
        await new Promise((r) => setTimeout(r, 400));

        const sentToBilkontroll = await resend.emails.send({
            from: fromAddress, to: bilkontrollEmail, subject: bilkontrollSubject, html: bilkontrollHtml,
        });

        if (sentToBilkontroll.error) {
            console.error("Resend error (Bilkontroll):", { error: sentToBilkontroll.error, recipient: bilkontrollEmail });
            throw new Error(`Failed to send email to Bilkontroll: ${sentToBilkontroll.error.message}`);
        }

        return NextResponse.json({ ok: true, message: 'Emails sent successfully' });

    } catch (error: any) {
        console.error('API Notify Route Error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
