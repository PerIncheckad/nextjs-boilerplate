import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Initiera e-postklienten med din API-nyckel
const resend = new Resend(process.env.RESEND_API_KEY);

// Hämta mottagaradresser från miljövariabler
const toAddress = process.env.EMAIL_TO_ADDRESS;
const bilkontrollAddress = process.env.EMAIL_BILKONTROLL_ADDRESS;

// Helper för att formatera skador till HTML
const formatDamagesToHtml = (damages: any[], title: string): string => {
  if (!damages || damages.length === 0) return '';
  
  const items = damages.map(d => {
    const type = d.type || d.userType;
    const carPart = d.carPart || d.userCarPart;
    const position = d.position || d.userPosition;
    const description = d.text || d.userDescription || d.fullText || '';
    
    let damageString = [type, carPart, position].filter(Boolean).join(' - ');
    if (description && description !== damageString) {
      damageString += ` (${description})`;
    }
    return `<li>${damageString}</li>`;
  }).join('');

  return `
    <h3 style="font-size: 18px; margin-top: 20px; margin-bottom: 10px;">${title}</h3>
    <ul>${items}</ul>
  `;
};

export async function POST(request: Request) {
  // Kontrollera att mottagaradresser är konfigurerade
  if (!toAddress || !bilkontrollAddress) {
    console.error('Email receiver addresses are not configured in .env.local');
    return NextResponse.json(
      { error: 'Server configuration error.' },
      { status: 500 }
    );
  }

  try {
    // Läs in JSON-body istället för FormData
    const payload = await request.json();

    const {
      regnr,
      status, // Den kritiska status-flaggan
      carModel,
      ort,
      station,
      matarstallning,
      hjultyp,
      rekond,
      notering,
      incheckare,
      dokumenterade_skador = [],
      nya_skador = [],
      åtgärdade_skador = []
    } = payload;

    // --- Logik för varning till Bilkontroll baserat på status ---
    let bilkontrollWarning = '';
    if (status === 'PARTIAL_MATCH_DAMAGE_ONLY' || status === 'NO_MATCH') {
      bilkontrollWarning = `
        <p style="padding: 12px; border-left: 4px solid #f59e0b; background-color: #fffbeb; font-weight: bold; margin-bottom: 20px;">
          OBS! Registreringsnumret saknas i filen "MABISYD Bilkontroll 2024-2025" och behöver läggas till.
        </p>
      `;
    }

    const subject = `Incheckning för ${regnr} - ${station}`;

    // Bygg HTML-innehållet för mejlet
    const emailHtml = `
      <div style="font-family: sans-serif; line-height: 1.6;">
        ${bilkontrollWarning}
        <h1 style="font-size: 24px;">Incheckning för ${regnr}</h1>
        <p>Incheckare: ${incheckare || 'Okänd'}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Bilmodell:</td>
            <td style="padding: 8px;">${carModel || '---'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Station:</td>
            <td style="padding: 8px;">${ort} / ${station}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Mätarställning:</td>
            <td style="padding: 8px;">${matarstallning} km</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Däck:</td>
            <td style="padding: 8px;">${hjultyp || '---'}</td>
          </tr>
          ${rekond ? `
          <tr style="border-bottom: 1px solid #ddd; background-color: #fef2f2;">
            <td style="padding: 8px; font-weight: bold; color: #dc2626;">Behöver rekond:</td>
            <td style="padding: 8px; color: #dc2626;">Ja</td>
          </tr>
          ` : ''}
          ${notering ? `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Övriga noteringar:</td>
            <td style="padding: 8px;">${notering.replace(/\n/g, '<br>')}</td>
          </tr>
          ` : ''}
        </table>

        ${formatDamagesToHtml(nya_skador, '💥 Nya skador')}
        ${formatDamagesToHtml(dokumenterade_skador, '📋 Dokumenterade befintliga skador')}
        ${formatDamagesToHtml(åtgärdade_skador, '✅ Åtgärdade/Ej funna skador')}

      </div>
    `;

    // Skicka mejlet till båda mottagarna
    await resend.emails.send({
      from: 'incheckning@mabisyd.se',
      to: [toAddress, bilkontrollAddress],
      subject: subject,
      html: emailHtml,
    });

    return NextResponse.json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Failed to send notification:', error);
    // Om felet är ett JSON-parsningsfel, ge ett mer specifikt meddelande
    if (error instanceof SyntaxError) {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 }
        );
    }
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
