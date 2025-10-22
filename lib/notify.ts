import { supabase } from './supabase';

// =================================================================
// 1. TYPE DEFINITIONS
// =================================================================

interface NotifyCheckinProps {
    region: 'Syd' | 'Väst' | 'Öst';
    subjectBase: string;
    htmlBody: string;
    meta: Record<string, any>;
}

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

function getStationEmail(region: string, stationName: string): string | null {
    const stationEmailsSyd: Record<string, string> = {
        'Ford Malmö': 'ford.malmo@mabi.se',
        'Mechanum': 'mechanum.malmo@mabi.se',
        'Malmö Automera': 'automera.malmo@mabi.se',
        'Mercedes Malmö': 'mercedes.malmo@mabi.se',
        'Werksta St Bernstorp': 'werksta.stbernstorp@mabi.se',
        'Werksta Malmö Hamn': 'werksta.malmohamn@mabi.se',
        'Hedbergs Malmö': 'hedbergs.malmo@mabi.se',
        'Hedin Automotive Burlöv': 'hedin.burlov@mabi.se',
        'Sturup': 'sturup@mabi.se',
        'HBSC Helsingborg': 'hbsc.helsingborg@mabi.se',
        'Ford Helsingborg': 'ford.helsingborg@mabi.se',
        'Transport Helsingborg': 'transport.helsingborg@mabi.se',
        'S. Jönsson': 'sjonsson.helsingborg@mabi.se',
        'BMW Helsingborg': 'bmw.helsingborg@mabi.se',
        'KIA Helsingborg': 'kia.helsingborg@mabi.se',
        'Euromaster Helsingborg': 'euromaster.helsingborg@mabi.se',
        'B/S Klippan': 'bs.klippan@mabi.se',
        'B/S Munka-Ljungby': 'bs.munkaljungby@mabi.se',
        'Ford Lund': 'ford.lund@mabi.se',
        'Hedin Lund': 'hedin.lund@mabi.se',
        'B/S Lund': 'bs.lund@mabi.se',
        'P7 Revinge': 'p7.revinge@mabi.se',
        'FORD Ängelholm': 'ford.angelholm@mabi.se',
        'Mekonomen Ängelholm': 'mekonomen.angelholm@mabi.se',
        'Flyget Ängelholm': 'angelholm.flygplats@mabi.se',
        'Falkenberg': 'falkenberg@mabi.se',
        'Flyget Halmstad': 'halmstad.flygplats@mabi.se',
        'KIA Halmstad': 'kia.halmstad@mabi.se',
        'FORD Halmstad': 'ford.halmstad@mabi.se',
        'Trelleborg': 'trelleborg@mabi.se',
        'Ford Varberg': 'ford.varberg@mabi.se',
        'Hedin Automotive Varberg': 'hedin.varberg@mabi.se',
        'Sällstorp lack plåt': 'sallstorp.varberg@mabi.se',
        'Finnveden plåt': 'finnveden.varberg@mabi.se'
    };

    if (region === 'Syd') {
        return stationEmailsSyd[stationName] || null;
    }
    return null;
}

function getBilkontrollEmail(region: string): string {
    const bilkontrollEmails = {
        'Syd': 'bilkontrollsyd@mabi.se',
        'Väst': 'bilkontrollvast@mabi.se',
        'Öst': 'bilkontrollost@mabi.se',
    };
    return bilkontrollEmails[region] || 'bilkontrollsyd@mabi.se'; // Default fallback
}

function generateDamageList(damages: any[], title: string): string {
    if (!damages || damages.length === 0) return '';
    
    let listHtml = `<h3>${title}</h3><ul>`;
    damages.forEach((d: any) => {
        const type = d.userType || d.type || d.fullText || 'Okänd skada';
        const positions = (d.userPositions || d.positions || [])
            .map((p: any) => `${p.carPart} ${p.position}`.trim())
            .filter(Boolean)
            .join(', ');
        const description = d.userDescription || d.text || '';
        const resolvedComment = d.resolvedComment || '';

        listHtml += `<li><strong>${type}</strong>`;
        if (positions) listHtml += `<br/>&nbsp;&nbsp;&nbsp;Plats: ${positions}`;
        if (description) listHtml += `<br/>&nbsp;&nbsp;&nbsp;Beskrivning: ${description}`;
        if (resolvedComment) listHtml += `<br/>&nbsp;&nbsp;&nbsp;Kommentar: ${resolvedComment}`;
        listHtml += `</li>`;
    });
    listHtml += `</ul>`;
    return listHtml;
}

// =================================================================
// 3. EMAIL BODY GENERATORS
// =================================================================

function generateBilkontrollBody(meta: Record<string, any>): string {
    let body = `
        <h1>Incheckning: ${meta.regnr}</h1>
        <p><strong>Incheckare:</strong> ${meta.incheckare}</p>
        <p><strong>Tid:</strong> ${new Date(meta.timestamp).toLocaleString('sv-SE')}</p>
        <p><strong>Incheckad vid:</strong> ${meta.ort} / ${meta.station}</p>
        <p><strong>Bilen står nu vid:</strong> ${meta.bilen_star_nu.ort} / ${meta.bilen_star_nu.station}</p>
        ${meta.bilen_star_nu.kommentar ? `<p><strong>Parkeringsinfo:</strong> ${meta.bilen_star_nu.kommentar}</p>` : ''}
        <hr>
        <h2>Status</h2>
        <p><strong>Mätarställning:</strong> ${meta.matarstallning} km</p>
        <p><strong>Däck:</strong> ${meta.hjultyp}</p>
    `;

    if (meta.drivmedel === 'bensin_diesel') {
        const tankText = meta.tankning.tankniva === 'tankad_nu'
            ? `Upptankad av MABI (${meta.tankning.liters}L ${meta.tankning.bransletyp} @ ${meta.tankning.literpris} kr/L)`
            : meta.tankning.tankniva === 'ej_upptankad'
            ? 'Ej upptankad'
            : 'Återlämnades fulltankad';
        body += `<p><strong>Tankning:</strong> ${tankText}</p>`;
    } else if (meta.drivmedel === 'elbil') {
        body += `<p><strong>Laddning:</strong> ${meta.laddning.laddniva}%</p>`;
    }

    if (meta.varningslampa.lyser) {
        body += `<p><strong>Varningslampa:</strong> Ja, ${meta.varningslampa.beskrivning}. Status: ${meta.varningslampa.uthyrningsstatus === 'ok_att_hyra_ut' ? 'Går att hyra ut' : 'Går INTE att hyra ut'}</p>`;
    }

    if (meta.rekond.behoverRekond) {
        const rekondTypes = [];
        if (meta.rekond.utvandig) rekondTypes.push('Utvändig');
        if (meta.rekond.invandig) rekondTypes.push('Invändig');
        body += `<p><strong>Rekond:</strong> Ja, ${rekondTypes.join(' & ')}. ${meta.rekond.text || ''}</p>`;
    }
    if (meta.husdjur.sanerad) {
        body += `<p><strong>Husdjurssanering:</strong> Ja. ${meta.husdjur.text || ''}</p>`;
    }
    if (meta.rokning.sanerad) {
        body += `<p><strong>Röksanering:</strong> Ja. ${meta.rokning.text || ''}</p>`;
    }
    
    body += `<hr>`;
    body += generateDamageList(meta.dokumenterade_skador, 'Dokumenterade befintliga skador');
    body += generateDamageList(meta.nya_skador, 'Nya skador');
    body += generateDamageList(meta.åtgärdade_skador, 'Åtgärdade befintliga skador');

    if (meta.notering) {
        body += `<hr><h3>Övrig notering</h3><p>${meta.notering}</p>`;
    }

    return body;
}

function generateStationBody(meta: Record<string, any>): string {
    let urgentNotes: string[] = [];

    // Add urgent notes based on the new logic
    if (meta.tankning.tankniva === 'ej_upptankad') {
        urgentNotes.push('Ej upptankad - kontakta Bilkontroll!');
    }
    if (meta.husdjur.sanerad) {
        urgentNotes.push('Sanerad för husdjur - kontakta Bilkontroll!');
    }
    if (meta.rokning.sanerad) {
        urgentNotes.push('Sanerad för rökning - kontakta Bilkontroll!');
    }
    if (meta.varningslampa.lyser && meta.varningslampa.uthyrningsstatus === 'ej_ok_att_hyra_ut') {
        urgentNotes.push('Varningslampa lyser - går ej att hyra ut! - Kontakta Bilkontroll.');
    } else if (meta.varningslampa.lyser) {
        urgentNotes.push(`Varningslampa lyser (${meta.varningslampa.beskrivning}) - men markerad som OK att hyra ut.`);
    }

    if (meta.rekond.behoverRekond) {
        const rekondTypes = [];
        if (meta.rekond.utvandig) rekondTypes.push('Utvändig');
        if (meta.rekond.invandig) rekondTypes.push('Invändig');
        urgentNotes.push(`Bilen behöver rekond (${rekondTypes.join(' & ')}).`);
    }

    if (meta.nya_skador && meta.nya_skador.length > 0) {
        urgentNotes.push(`Bilen har ${meta.nya_skador.length} ny(a) skada/skador.`);
    }

    let body = `
        <h1>Incheckning: ${meta.regnr}</h1>
        <p><strong>Incheckad av:</strong> ${meta.incheckare}</p>
        <p><strong>Bilen står nu vid:</strong> ${meta.bilen_star_nu.ort} / ${meta.bilen_star_nu.station}</p>
        ${meta.bilen_star_nu.kommentar ? `<p><strong>Parkeringsinfo:</strong> ${meta.bilen_star_nu.kommentar}</p>` : ''}
    `;

    if (urgentNotes.length > 0) {
        body += `
            <div style="background-color: #fef2f2; border-left: 5px solid #dc2626; padding: 10px; margin-top: 20px;">
                <h2 style="color: #991b1b; margin-top: 0;">Viktig information:</h2>
                <ul>
                    ${urgentNotes.map(note => `<li><strong>${note}</strong></li>`).join('')}
                </ul>
            </div>
        `;
    }

    return body;
}

// =================================================================
// 4. MAIN EXPORTED FUNCTION
// =================================================================

export async function notifyCheckin(props: NotifyCheckinProps) {
    const { region, subjectBase, meta } = props;

    const bilkontrollEmail = getBilkontrollEmail(region);
    const stationEmail = getStationEmail(region, meta.station);

    const bilkontrollBody = generateBilkontrollBody(meta);
    const stationBody = generateStationBody(meta);

    try {
        // Send detailed email to Bilkontroll
        const { error: bilkontrollError } = await supabase.rpc('send_email', {
            to_email: bilkontrollEmail,
            subject: `Incheckning: ${subjectBase}`,
            html_content: bilkontrollBody
        });
        if (bilkontrollError) {
            console.error('Failed to send email to Bilkontroll:', bilkontrollError);
            throw new Error(`Bilkontroll email failed: ${bilkontrollError.message}`);
        }

        // Send summary email to Station if an email is found
        if (stationEmail) {
            const { error: stationError } = await supabase.rpc('send_email', {
                to_email: stationEmail,
                subject: `Incheckning: ${subjectBase}`,
                html_content: stationBody
            });
            if (stationError) {
                console.error('Failed to send email to Station:', stationError);
                // We don't throw here, as the primary email is more important
            }
        }
    } catch (error) {
        console.error('An error occurred in notifyCheckin:', error);
        throw error;
    }
}
