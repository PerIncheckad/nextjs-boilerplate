import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// =================================================================
// 1. TYPES & MAPPINGS
// =================================================================

type Damage = {
    id: string;
    type?: string;
    carPart?: string;
    position?: string;
    text?: string;
    userType?: string;
    userCarPart?: string;
    userPosition?: string;
    userDescription?: string;
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
    hjultyp: 'Sommardäck' | 'Vinterdäck';
    rekond: boolean;
    nya_skador: Damage[];
    dokumenterade_skador: Damage[];
};

type RegionName = 'SYD' | 'MITT' | 'NORR';

const ORT_TO_REGION: Record<string, RegionName> = {
    'Lund': 'SYD',
    'Sturup': 'SYD',
    'Malmö': 'SYD',
    'Trelleborg': 'SYD',
    'Helsingborg': 'MITT',
    'Ängelholm': 'MITT',
    'Varberg': 'NORR',
    'Falkenberg': 'NORR',
    'Halmstad': 'NORR',
};

const INCHECKAD_LOGO_URL = ''; // LÄGG TILL PUBLIK URL TILL LOGGAN HÄR

// =================================================================
// 2. EMAIL TEMPLATES
// =================================================================

function createDamageListHtml(damages: Damage[], isNew: boolean): string {
    if (damages.length === 0) return '';
    
    return damages.map(d => {
        const type = isNew ? d.type : d.userType;
        const part = isNew ? d.carPart : d.userCarPart;
        const pos = isNew ? d.position : d.userPosition;
        const desc = isNew ? d.text : d.userDescription;
        const title = [type, part, pos].filter(Boolean).join(' - ');
        
        let html = `<li>`;
        if (isNew) {
            html += `<strong>💥 ${title}</strong>`;
        } else {
            html += `${title}`;
        }
        if (desc) {
            html += `<br><span style="font-size: 0.85em; color: #555;">&nbsp;&nbsp;&nbsp;<em>${desc}</em></span>`;
        }
        html += `</li>`;
        return html;
    }).join('');
}

function createBaseLayout(title: string, content: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f0f2f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            .header { background-color: #111827; color: white; padding: 24px; text-align: center; }
            .header img { max-height: 40px; }
            .header h1 { margin: 10px 0 0; font-size: 24px; }
            .content { padding: 24px; }
            .section { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
            .section:last-child { margin-bottom: 0; border-bottom: none; }
            .section h2 { font-size: 18px; margin: 0 0 12px; color: #111827; }
            .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 8px; }
            .info-grid dt { font-weight: 600; color: #4b5563; }
            .highlight-box { padding: 16px; border-radius: 6px; margin-bottom: 16px; }
            .highlight-box.rekond { background-color: #fffbeb; border: 1px solid #f59e0b; }
            .highlight-box.damage { background-color: #fef2f2; border: 1px solid #dc2626; }
            .highlight-box strong { font-size: 1.1em; }
            .damage-list { list-style-type: none; padding-left: 0; }
            .damage-list li { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .damage-list li:last-child { border-bottom: none; }
            .footer { background-color: #f9fafb; padding: 16px 24px; font-size: 12px; color: #6b7280; text-align: center; }
            a { color: #2563eb; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                ${INCHECKAD_LOGO_URL ? `<img src="${INCHECKAD_LOGO_URL}" alt="Incheckad Logotyp">` : `<h1>INCHECKAD</h1>`}
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                Detta mejl skickades automatiskt från incheckad.se
            </div>
        </div>
    </body>
    </html>`;
}

function createRegionEmail(p: CheckinPayload): string {
    const checkinDate = new Date(p.timestamp).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
    const checkinTime = new Date(p.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const hasNewDamages = p.nya_skador.length > 0;
    
    const content = `
        <div class="section">
            ${p.rekond ? `<div class="highlight-box rekond"><strong>⚠️ Behöver rekond</strong></div>` : ''}
            ${hasNewDamages ? `<div class="highlight-box damage"><strong>💥 Nya skador har rapporterats</strong></div>` : ''}
        </div>
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
            <a href="https://incheckad.se/gallery/${p.regnr}" target="_blank">Öppna bildgalleri för ${p.regnr} &rarr;</a>
        </div>
    `;
    return createBaseLayout(`Incheckning ${p.regnr}`, content);
}

function createBilkontrollEmail(p: CheckinPayload): string {
    const checkinDate = new Date(p.timestamp).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
    const checkinTime = new Date(p.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const allDamages = [...p.nya_skador, ...p.dokumenterade_skador];
    
    const content = `
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
                <dt>Behöver rekond:</dt><dd>${p.rekond ? 'Ja ⚠️' : 'Nej'}</dd>
            </dl>
        </div>
        <div class="section">
            <h2>Skadeöversikt</h2>
            ${allDamages.length > 0 ? `
                <ul class="damage-list">
                    ${createDamageListHtml(p.nya_skador, true)}
                    ${createDamageListHtml(p.dokumenterade_skador, false)}
                </ul>
            ` : '<p>Inga skador rapporterade vid denna incheckning.</p>'}
        </div>
        <div class="section">
            <a href="https://incheckad.se/gallery/${p.regnr}" target="_blank">Öppna bildgalleri för ${p.regnr} &rarr;</a>
        </div>
    `;
    return createBaseLayout(`Detaljerad incheckning ${p.regnr}`, content);
}

// =================================================================
// 3. ROUTE HANDLER
// =================================================================

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as CheckinPayload;

        const region = ORT_TO_REGION[body.ort] || 'SYD';
        const location = `${body.ort} / ${body.station}`;

        // --- Email Addresses (Reverted to old, safe logic) ---
        const FORCE_EMAIL_TO =
            process.env.NEXT_PUBLIC_FORCE_DEBUG_EMAIL ||
            process.env.NEXT_PUBLIC_TEST_MAIL ||
            null;

        const REGION_MAIL_ADDRESSES: Record<RegionName, string> = {
            SYD: process.env.NEXT_PUBLIC_MAIL_REGION_SYD || 'syd@incheckad.se',
            MITT: process.env.NEXT_PUBLIC_MAIL_REGION_MITT || 'mitt@incheckad.se',
            NORR: process.env.NEXT_PUBLIC_MAIL_REGION_NORR || 'norr@incheckad.se',
        };
        
        const regionEmail = FORCE_EMAIL_TO || REGION_MAIL_ADDRESSES[region];
        const bilkontrollEmail = FORCE_EMAIL_TO || process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || 'bilkontroll@incheckad.se';

        // --- Subjects ---
        const baseSubject = `INCHECKAD: ${body.regnr} - ${location}`;
        const regionSubject = `${baseSubject} - REGION`;
        const bilkontrollSubject = `${baseSubject} - BILKONTROLL`;

        // --- HTML Bodies ---
        const regionHtml = createRegionEmail(body);
        const bilkontrollHtml = createBilkontrollEmail(body);
        
        // --- Send Emails ---
        // **ÅTERSTÄLLD AVSÄNDARE**
        const fromAddress = 'onboarding@resend.dev'; 

        const sentToRegion = await resend.emails.send({
            from: fromAddress,
            to: regionEmail,
            subject: regionSubject,
            html: regionHtml,
        });

        if (sentToRegion.error) {
            console.error("Resend error (Region):", { error: sentToRegion.error, recipient: regionEmail });
            throw new Error(`Failed to send email to Region: ${sentToRegion.error.message}`);
        }
        
        await new Promise((r) => setTimeout(r, 400));

        const sentToBilkontroll = await resend.emails.send({
            from: fromAddress,
            to: bilkontrollEmail,
            subject: bilkontrollSubject,
            html: bilkontrollHtml,
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
