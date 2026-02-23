// app/api/notify-arrival/route.ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- E-postmottagare ---
const defaultHuvudstationAddress = 'per@incheckad.se';

const stationEmailMapping: { [ort: string]: string } = {
  Helsingborg: 'helsingborg@incheckad.se',
  Ängelholm: 'helsingborg@incheckad.se',
  Varberg: 'varberg@incheckad.se',
  Malmö: 'malmo@incheckad.se',
  Trelleborg: 'trelleborg@incheckad.se',
  Lund: 'lund@incheckad.se',
  Halmstad: 'halmstad@incheckad.se',
  Falkenberg: 'falkenberg@incheckad.se',
};

const LOGO_URL =
  'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

// =================================================================
// 2. HELPERS
// =================================================================

const escapeHtml = (text: string): string => {
  const htmlEscapeMap: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
};

const formatTankning = (payload: any): string => {
  if (!payload.fuel_level) return '---';
  if (payload.fuel_level === 'elbil') {
    if (payload.charge_level) {
      const level = parseInt(payload.charge_level, 10);
      if (!isNaN(level) && level < 95) {
        return `<span style="font-weight:bold;color:#b91c1c;">Laddningsnivå: ${payload.charge_level}%</span>`;
      }
      return `Laddningsnivå: ${payload.charge_level}%`;
    }
    return 'Elbil';
  }
  if (payload.fuel_level === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
  if (payload.fuel_level === 'tankad_nu') {
    const parts = [
      'Tankad nu av MABI',
      payload.fuel_liters ? `(${payload.fuel_liters}L` : null,
      payload.fuel_type ? `${payload.fuel_type}` : null,
      payload.fuel_price_per_liter ? `@ ${payload.fuel_price_per_liter} kr/L)` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return parts;
  }
  if (payload.fuel_level === 'ej_upptankad') return '<span style="font-weight:bold;color:#b91c1c;">Ej upptankad</span>';
  return '---';
};

// =================================================================
// 3. EMAIL HTML BUILDER
// =================================================================

const buildArrivalEmail = (payload: any, date: string, time: string): string => {
  const regNr = payload.regnr || '';
  const carModel = payload.car_model || '---';
  const checkerName = payload.checker_name || '---';
  const ort = payload.current_city || '---';
  const station = payload.current_station || '---';
  const odometer = payload.odometer_km || '---';
  const tankningText = formatTankning(payload);
  const isElbil = payload.fuel_level === 'elbil';
  const tankningLabel = isElbil ? 'Laddning' : 'Tankning';
  const notesText = payload.notes ? escapeHtml(payload.notes) : null;

  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 4px;">
        ${escapeHtml(regNr)}
      </h1>
      <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Bilen har anlänt men är inte incheckad</p>
    </td></tr>
    <tr><td style="padding-top:12px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;">
          <tbody>
            <tr><td style="padding:4px 0;"><strong>Bilmodell:</strong> ${escapeHtml(carModel)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Plats:</strong> ${escapeHtml(ort)} / ${escapeHtml(station)}</td></tr>
            <tr><td style="padding:4px 0;"><strong>Mätarställning:</strong> ${odometer} km</td></tr>
            <tr><td style="padding:4px 0;"><strong>${tankningLabel}:</strong> ${tankningText}</td></tr>
            ${notesText ? `<tr><td style="padding:4px 0;"><strong>Kommentar:</strong> ${notesText}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </td></tr>
    <tr><td>
      <p style="margin-top:12px;font-size:14px;color:#6b7280;">
        Registrerad av ${escapeHtml(checkerName)} kl ${time}, ${date}
      </p>
      <div style="margin-top:12px;padding:12px 16px;background:#fff5f5;border:1px solid #fecaca;border-radius:6px;">
        <p style="margin:0 0 8px 0;font-weight:bold;color:#b91c1c;font-size:14px;">Obs! Bilen är inte incheckad!</p>
        <p style="margin:0 0 4px 0;font-weight:bold;color:#b91c1c;font-size:13px;">Det innebär bland annat:</p>
        <ul style="margin:0 0 8px 0;padding-left:20px;color:#b91c1c;font-size:13px;font-weight:bold;">
          <li>Bilen är inte tvättad</li>
          <li>Bilen är inte skadekontrollerad</li>
        </ul>
        <p style="margin:0;font-weight:bold;color:#b91c1c;font-size:13px;">Separat mejl skickas när bilen är incheckad.</p>
      </div>
    </td></tr>
  `;

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<style>
:root { color-scheme: light only; }
body { font-family: ui-sans-serif, system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  background:#f9fafb!important;color:#000;margin:0;padding:20px; }
.container { max-width:600px;margin:0 auto;background:#fff!important;border-radius:8px;
  padding:30px;border:1px solid #e5e7eb; }
a { color:#2563eb!important; }
</style>
</head>
<body>
  <div class="container">
    <div style="text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:20px;margin-bottom:20px;">
      <img src="${LOGO_URL}" alt="MABI Logo" width="150" style="margin-left:6px;">
    </div>
    <table width="100%"><tbody>${content}</tbody></table>
    <div style="margin-top:20px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
      &copy; ${new Date().getFullYear()} Albarone AB &mdash; Alla rättigheter förbehållna
    </div>
  </div>
</body>
</html>`;
};

// =================================================================
// 4. MAIN HANDLER
// =================================================================

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // --- Date/time (SE) ---
    const now = new Date();
    const date = now.toLocaleDateString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const time = now.toLocaleTimeString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
    });

    const regNr = (payload.regnr || '').toUpperCase().replace(/\s/g, '');

    // --- 1. Save to arrivals table ---
    const arrivalData = {
      regnr: regNr,
      current_city: payload.current_city || null,
      current_station: payload.current_station || null,
      odometer_km: (() => {
        const val = payload.odometer_km;
        if (!val) return null;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? null : parsed;
      })(),
      fuel_level: payload.fuel_level || null,
      fuel_type: payload.fuel_type || null,
      fuel_liters: (() => {
        if (!payload.fuel_liters) return null;
        const parsed = parseFloat(payload.fuel_liters);
        return isNaN(parsed) ? null : parsed;
      })(),
      fuel_price_per_liter: (() => {
        if (!payload.fuel_price_per_liter) return null;
        const parsed = parseFloat(payload.fuel_price_per_liter);
        return isNaN(parsed) ? null : parsed;
      })(),
      checker_email: payload.checker_email || null,
      checker_name: payload.checker_name || null,
      car_model: payload.car_model || null,
      charge_level: (() => {
        if (!payload.charge_level) return null;
        const parsed = parseInt(payload.charge_level, 10);
        return isNaN(parsed) ? null : parsed;
      })(),
      notes: payload.notes || null,
    };

    const { error: insertError } = await supabaseAdmin
      .from('arrivals')
      .insert(arrivalData);

    if (insertError) {
      console.error('Failed to insert arrival:', insertError);
      // Continue with email even if DB insert fails
    }

    // --- 2. Update vehicles.bransletyp if fuel_type was provided ---
    if (payload.fuel_type && regNr) {
      const { error: updateError } = await supabaseAdmin
        .from('vehicles')
        .update({ bransletyp: payload.fuel_type })
        .eq('regnr', regNr);

      if (updateError) {
        console.error('Failed to update vehicle bransletyp:', updateError);
        // Non-critical, continue
      }
    }

    // --- 3. Build email recipients ---
    const finalOrt = payload.current_city || '';
    const huvudstationTo = [defaultHuvudstationAddress];
    const stationSpecificEmail = stationEmailMapping[finalOrt];
    if (stationSpecificEmail && !huvudstationTo.includes(stationSpecificEmail)) {
      huvudstationTo.push(stationSpecificEmail);
    }

    // --- 4. Build subject ---
    const cleanStation = payload.current_station || finalOrt || '---';
    const subject = `🔵 PRELLA: ${regNr} - ${cleanStation}`;

    // --- 5. Send email ---
    const html = buildArrivalEmail(payload, date, time);
    await resend.emails.send({
      from: 'incheckning@incheckad.se',
      to: huvudstationTo,
      subject,
      html,
    });

    return NextResponse.json({ success: true, message: 'Ankomst registrerad.' });
  } catch (error) {
    console.error('FATAL: Uncaught error in notify-arrival:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
