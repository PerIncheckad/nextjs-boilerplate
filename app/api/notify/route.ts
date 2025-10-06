import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Initiera e-postklienten med din API-nyckel
const resend = new Resend(process.env.RESEND_API_KEY);

// Hämta mottagaradresser från miljövariabler
const toAddress = process.env.EMAIL_TO_ADDRESS;
const bilkontrollAddress = process.env.EMAIL_BILKONTROLL_ADDRESS;

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
    const formData = await request.formData();

    // Hämta all data från formuläret
    const regnr = (formData.get('regnr') as string) || 'Okänt regnr';
    const mileage = (formData.get('mileage') as string) || 'Ej angivet';
    const fuel = (formData.get('fuel') as string) || 'Ej angivet';
    const station = (formData.get('station') as string) || 'Okänd station';
    const newDamages = (formData.get('new_damages') as string) || 'Inga nya skador';
    const smoking = formData.get('smoking') === 'on' ? 'Ja' : 'Nej';
    const pets = formData.get('pets') === 'on' ? 'Ja' : 'Nej';
    const otherNotes = (formData.get('other_notes') as string) || 'Inga övriga noteringar';
    
    // Hämta den kritiska status-flaggan
    const status = formData.get('status') as string;

    // --- NY LOGIK FÖR VARNING TILL BILKONTROLL ---
    let bilkontrollWarning = '';
    if (status === 'PARTIAL_MATCH_DAMAGE_ONLY' || status === 'NO_MATCH') {
      bilkontrollWarning = `
        <p style="padding: 12px; border-left: 4px solid #f59e0b; background-color: #fffbeb; font-weight: bold; margin-bottom: 20px;">
          OBS! Registreringsnumret saknas i filen "MABISYD Bilkontroll 2024-2025" och behöver läggas till.
        </p>
      `;
    }
    // --- SLUT PÅ NY LOGIK ---

    const subject = `Incheckning för ${regnr} - ${station}`;

    // Bygg HTML-innehållet för mejlet
    const emailHtml = `
      <div style="font-family: sans-serif; line-height: 1.6;">
        ${bilkontrollWarning}
        <h1 style="font-size: 24px;">Incheckning för ${regnr}</h1>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Station:</td>
            <td style="padding: 8px;">${station}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Mätarställning:</td>
            <td style="padding: 8px;">${mileage} km</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Bränsle:</td>
            <td style="padding: 8px;">${fuel}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Nya skador:</td>
            <td style="padding: 8px;">${newDamages.replace(/\n/g, '<br>')}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Rökning i bil:</td>
            <td style="padding: 8px;">${smoking}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Djur i bil:</td>
            <td style="padding: 8px;">${pets}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; font-weight: bold;">Övriga noteringar:</td>
            <td style="padding: 8px;">${otherNotes.replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
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
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
