// lib/notify.ts
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { supabaseAdmin } from './supabase';

// Resend API-nyckel (skulle vara i en .env-fil i produktion)
const resendApiKey = process.env.RESEND_API_KEY || 'din_resend_api_nyckel_här';
const resend = new Resend(resendApiKey);

// E-postadresser
const PRIMARY_EMAIL = 'per@incheckad.se'; // Huvudsaklig e-postadress för tester
const BCC_RECIPIENTS = ['bilkontroll@incheckad.se']; // BCC-mottagare för alla meddelanden

type NotifyParams = {
  region: string;
  subjectBase: string;
  htmlBody: string;
  target: 'region' | 'station';
  meta: any;
};

export async function notifyCheckin({ region, subjectBase, htmlBody, target, meta }: NotifyParams) {
  try {
    // Bestämma huvudstation baserat på stationen
    const { station } = meta;
    let huvudstation = '';
    
    // Här skulle vi hämta huvudstationen från Supabase
    try {
      const { data } = await supabaseAdmin
        .from('stationer')
        .select('huvudstation_namn')
        .eq('name', station)
        .single();
      
      if (data) {
        huvudstation = data.huvudstation_namn;
      }
    } catch (err) {
      console.error('Fel vid hämtning av huvudstation:', err);
    }

    // Generera e-post ämne med huvudstation
    const subject = `${subjectBase} [${huvudstation || region}]`;

    // Generera HTML-innehåll för e-post
    const { html, text } = generateEmailContent(meta, huvudstation);

    // Bestäm mottagare baserat på target och miljö
    let toRecipients = [PRIMARY_EMAIL]; // I utveckling, skicka alltid till PRIMARY_EMAIL
    
    // I produktion skulle vi bestämma korrekta e-postadresser baserat på target och huvudstation
    // if (process.env.NODE_ENV === 'production') {
    //   if (target === 'station' && huvudstation) {
    //     toRecipients = [`${huvudstation.toLowerCase().replace(/\s+/g, '.')}@incheckad.se`];
    //   } else {
    //     toRecipients = [`${region.toLowerCase()}@incheckad.se`];
    //   }
    // }

    // Skicka e-post via Resend
    const emailData = await resend.emails.send({
      from: 'incheckning@incheckad.se',
      to: toRecipients,
      bcc: BCC_RECIPIENTS,
      subject,
      html,
      text,
    });

    return emailData;
  } catch (error) {
    console.error('Fel vid skickande av incheckning:', error);
    throw error;
  }
}

function generateEmailContent(meta: any, huvudstation: string) {
  const {
    regnr, carModel, ort, station, matarstallning, drivmedel,
    tankning, laddning, hjultyp, rekond, varningslampa, notering, incheckare,
    dokumenterade_skador, nya_skador, currentLocation, currentOrt, currentStation, currentLocationNote
  } = meta;

  // Formatera tankning/laddning baserat på drivmedelstyp
  let fuelInfo = '';
  if (drivmedel === 'elbil') {
    fuelInfo = `Laddnivå: ${laddning?.laddniva || '--'}%`;
  } else if (drivmedel === 'laddhybrid') {
    fuelInfo = `Laddnivå: ${laddning?.laddniva || '--'}%, Tanknivå: ${tankning?.tankniva || '--'}`;
  } else if (['bensin', 'diesel', 'hybrid'].includes(drivmedel)) {
    fuelInfo = `Tanknivå: ${tankning?.tankniva || '--'}`;
  }

  // Formatera information om bilens nuvarande plats
  let locationInfo = '';
  if (currentLocation === 'different' && currentOrt && currentStation) {
    locationInfo = `
      <tr>
        <td colspan="2" style="padding: 8px; border-bottom: 1px solid #eee;">
          <strong>Bilens nuvarande plats:</strong> ${currentOrt} / ${currentStation}
          ${currentLocationNote ? `<br><em>Kommentar: ${currentLocationNote}</em>` : ''}
        </td>
      </tr>
    `;
  }

  // Formatera lista över befintliga skador som dokumenterats
  let dokumenteradeSkadorHTML = '';
  if (dokumenterade_skador && dokumenterade_skador.length > 0) {
    dokumenteradeSkadorHTML = `
      <div style="margin-top: 20px; margin-bottom: 20px; border: 1px solid #f0ad4e; border-left: 5px solid #f0ad4e; padding: 15px; background-color: #fcf8e3;">
        <h3 style="margin-top: 0; color: #8a6d3b;">Dokumenterade befintliga skador</h3>
        <p><strong>OBS! Uppdatera skadan i BUHS!</strong> Använd informationen nedan och komplettera med bifogade bilder vid behov.</p>
        <ul style="padding-left: 20px;">
          ${dokumenterade_skador.map(skada => `
            <li style="margin-bottom: 15px;">
              <strong>${skada.userType} - ${skada.userCarPart} - ${skada.userPosition}</strong>
              <br>Ursprunglig beskrivning: ${skada.fullText}
              ${skada.uploads.photo_urls.length > 0 ? 
                `<br>Bilder: ${skada.uploads.photo_urls.map((url, i) => 
                  `<a href="${url}" target="_blank">Bild ${i+1}</a>`
                ).join(', ')}` : ''}
              ${skada.uploads.video_urls.length > 0 ? 
                `<br>Videor: ${skada.uploads.video_urls.map((url, i) => 
                  `<a href="${url}" target="_blank">Video ${i+1}</a>`
                ).join(', ')}` : ''}
              ${skada.uploads.folder ? 
                `<br><a href="https://incheckad.se/gallery/${skada.id}" target="_blank">Öppna alla bilder/videos för denna skada</a>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // Formatera lista över nya skador
  let nyaSkadorHTML = '';
  if (nya_skador && nya_skador.length > 0) {
    nyaSkadorHTML = `
      <div style="margin-top: 20px; margin-bottom: 20px; border: 1px solid #d9534f; border-left: 5px solid #d9534f; padding: 15px; background-color: #f2dede;">
        <h3 style="margin-top: 0; color: #a94442;">Nya skador</h3>
        <p><strong>Registrera skadan i BUHS med nedan info och bifogade bilder!</strong></p>
        <ul style="padding-left: 20px;">
          ${nya_skador.map(skada => `
            <li style="margin-bottom: 15px;">
              <strong>${skada.type} - ${skada.carPart} - ${skada.position}</strong>
              ${skada.comment ? `<br>Kommentar: ${skada.comment}` : ''}
              <br><strong>Skadeanmälan: ${skada.needsReport === 'yes' ? 'BEHÖVS' : 'Behövs inte'}</strong>
              ${skada.uploads.photo_urls.length > 0 ? 
                `<br>Bilder: ${skada.uploads.photo_urls.map((url, i) => 
                  `<a href="${url}" target="_blank">Bild ${i+1}</a>`
                ).join(', ')}` : ''}
              ${skada.uploads.video_urls.length > 0 ? 
                `<br>Videor: ${skada.uploads.video_urls.map((url, i) => 
                  `<a href="${url}" target="_blank">Video ${i+1}</a>`
                ).join(', ')}` : ''}
              ${skada.uploads.folder ? 
                `<br><a href="https://incheckad.se/gallery/${skada.id}" target="_blank">Öppna alla bilder/videos för denna skada</a>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // Generera HTML för e-post
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Bilincheckning ${regnr}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #0056b3; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0;">Bilincheckning: ${regnr}</h2>
          ${carModel ? `<p style="margin: 5px 0 0 0;">${carModel}</p>` : ''}
        </div>
        
        <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Registreringsnr:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${regnr}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ort:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${ort}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Station:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${station}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Mätarställning:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${matarstallning} km</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Drivmedel:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${drivmedel} - ${fuelInfo}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Däck:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${hjultyp || '--'}</td>
            </tr>
            ${rekond ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; background-color: #fff3cd;" colspan="2">
                <strong style="color: #856404;">Behöver rekond!</strong>
              </td>
            </tr>
            ` : ''}
            ${varningslampa ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; background-color: #f8d7da;" colspan="2">
                <strong style="color: #721c24;">Varningslampa lyser!</strong>
              </td>
            </tr>
            ` : ''}
            ${notering ? `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Allmän kommentar:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${notering}</td>
            </tr>
            ` : ''}
            ${locationInfo}
          </table>
          
          ${dokumenteradeSkadorHTML}
          ${nyaSkadorHTML}
          
          <div style="margin-top: 30px; font-size: 14px; color: #777;">
            <p>Incheckad av: <strong>${incheckare}</strong></p>
            <p>Incheckad: <strong>${new Date().toLocaleString('sv-SE')}</strong></p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #777;">
          <p>Detta är ett automatiskt genererat meddelande från incheckad.se</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Generera text-version för e-post
  const text = `
    Bilincheckning: ${regnr} ${carModel || ''}
    
    Registreringsnr: ${regnr}
    Ort: ${ort}
    Station: ${station}
    Mätarställ
