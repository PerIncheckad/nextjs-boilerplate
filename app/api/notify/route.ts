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

// =================================================================
// 2. HELPER TO FORMAT DAMAGES (för Bilkontroll-mejlet)
// =================================================================
const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  const items = damages.map(d => `<li>${d.fullText || d.text}</li>`).join('');
  return `<h4 style="margin-bottom: 5px; margin-top: 15px; color: #555;">${title}</h4><ul>${items}</ul>`;
};

// =================================================================
// 3. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  if (!bilkontrollAddress || !fallbackAddress) {
    console.error('SERVER ERROR: BILKONTROLL_MAIL or TEST_MAIL is not configured.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const { 
        regnr, status, carModel, ort, station, matarstallning, hjultyp, rekond, notering, incheckare, 
        dokumenterade_skador = [], nya_skador = [], åtgärdade_skador = [], bilder_url,
        datum, tid, tankning // Inkluderar alla fält från dina mallar
    } = payload;

    const regionalAddress = regionMapping[ort as keyof typeof regionMapping] || fallbackAddress;
    const emailPromises = []; // En lista för att samla alla mejl som ska skickas

    // --- Bygg och lägg till Email 1: Region-mejlet (Sammanfattning) ---
    const regionSubject = `INCHECKAD: ${regnr} - ${ort} / ${station} - REGION`;
    const regionHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: #f0f2f5; padding: 20px;">
        <div style="max-width: 680px; margin: auto; background-color: white; padding: 20px 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://incheckad.se/incheckad-logo-pin.png" alt="Incheckad" style="width: 60px; height: auto;">
          </div>
          ${rekond ? `<div style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; margin-bottom: 20px; text-align: center; font-weight: bold; color: #B45309; border-radius: 5px;">⚠️ Behöver rekond</div>` : ''}
          <h2 style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; font-size: 16px; color: #374151;">Sammanfattning</h2>
          <p style="margin: 4px 0;"><strong>Reg.nr:</strong> ${regnr}</p>
          <p style="margin: 4px 0;"><strong>Bilmodell:</strong> ${carModel || '---'}</p>
          <p style="margin: 4px 0;"><strong>Plats:</strong> ${ort} / ${station}</p>
          <p style="margin: 4px 0;"><strong>Datum:</strong> ${datum || '---'}</p>
          <p style="margin: 4px 0;"><strong>Tid:</strong> ${tid || '---'}</p>
          <p style="margin: 4px 0;"><strong>Incheckare:</strong> ${incheckare || '---'}</p>
          <h2 style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-top: 30px; font-size: 16px; color: #374151;">Fordonsstatus</h2>
          <p style="margin: 4px 0;"><strong>Mätarställning:</strong> ${matarstallning} km</p>
          <p style="margin: 4px 0;"><strong>Tankning:</strong> ${tankning || '---'}</p>
          ${bilder_url ? `<div style="margin-top: 30px;"><a href="${bilder_url}" style="color: #005A9C; text-decoration: none;">Öppna bildgalleri för ${regnr} →</a></div>` : ''}
        </div>
      </div>
    `;
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: regionalAddress, subject: regionSubject, html: regionHtml }));

    // --- Bygg och lägg till Email 2: Bilkontroll-mejlet (Detaljerad skaderapport) ---
    const bilkontrollSubject = `INCHECKAD: ${regnr} - ${ort} / ${station} - BILKONTROLL`;
    const bilkontrollHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: #f0f2f5; padding: 20px;">
        <div style="max-width: 680px; margin: auto; background-color: white; padding: 20px 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://incheckad.se/incheckad-logo-pin.png" alt="Incheckad" style="width: 60px; height: auto;">
          </div>
          ${rekond ? `<div style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; margin-bottom: 20px; text-align: center; font-weight: bold; color: #B45309; border-radius: 5px;">⚠️ Behöver rekond</div>` : ''}
          <h2 style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; font-size: 16px; color: #374151;">Fordonsinformation</h2>
          <p style="margin: 4px 0;"><strong>Reg.nr:</strong> ${regnr}</p>
          <p style="margin: 4px 0;"><strong>Bilmodell:</strong> ${carModel || '---'}</p>
          <p style="margin: 4px 0;"><strong>Däck:</strong> ${hjultyp || '---'}</p>
          <h2 style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-top: 30px; font-size: 16px; color: #374151;">Incheckningsdetaljer</h2>
          <p style="margin: 4px 0;"><strong>Plats:</strong> ${ort} / ${station}</p>
          <p style="margin: 4px 0;"><strong>Datum:</strong> ${datum || '---'}</p>
          <p style="margin: 4px 0;"><strong>Tid:</strong> ${tid || '---'}</p>
          <p style="margin: 4px 0;"><strong>Incheckare:</strong> ${incheckare || '---'}</p>
          <h2 style="border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-top: 30px; font-size: 16px; color: #374151;">Skadeöversikt</h2>
          ${formatDamagesToHtml(åtgärdade_skador, 'Åtgärdade / Hittas ej')}
          ${formatDamagesToHtml(dokumenterade_skador, 'Dokumenterade befintliga skador')}
          ${formatDamagesToHtml(nya_skador, 'Nya skador')}
          ${bilder_url ? `<div style="margin-top: 30px;"><a href="${bilder_url}" style="color: #005A9C; text-decoration: none;">Öppna bildgalleri för ${regnr} →</a></div>` : ''}
        </div>
      </div>
    `;
    emailPromises.push(resend.emails.send({ from: 'incheckning@incheckad.se', to: bilkontrollAddress, subject: bilkontrollSubject, html: bilkontrollHtml }));

    // --- Bygg och lägg till Email 3: Villkorligt Varningsmejl till Bilkontroll ---
    if (status === 'PARTIAL_MATCH_DAMAGE_ONLY' || status === 'NO_MATCH') {
      const warningSubject = `VARNING: ${regnr} saknas i bilkontrollfilen`;
      const warningHtml = `<p>Registreringsnumret <strong>${regnr}</strong>, som nyss checkades in på station ${station} (${ort}), saknas i den centrala bilkontrollfilen. Vänligen lägg till fordonet.</p>`;
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
