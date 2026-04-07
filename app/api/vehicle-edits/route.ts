import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';

// =================================================================
// 1. INITIALIZATION
// =================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// Server-side Supabase client with service role - bypasses RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

const LOGO_URL = 'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

const defaultHuvudstationAddress = 'per@incheckad.se';

const stationEmailMapping: Record<string, string> = {
  Helsingborg: 'helsingborg@incheckad.se',
  Ängelholm: 'helsingborg@incheckad.se',
  Varberg: 'varberg@incheckad.se',
  Malmö: 'malmo@incheckad.se',
  Trelleborg: 'trelleborg@incheckad.se',
  Lund: 'lund@incheckad.se',
  Halmstad: 'halmstad@incheckad.se',
  Falkenberg: 'falkenberg@incheckad.se',
};
// =================================================================
// 2. EMAIL HELPERS
// =================================================================

function getFullNameFromEmailLocal(email: string): string {
  if (!email) return 'Okänd';
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  if (parts.length >= 2) {
    return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)} ${parts[1].charAt(0).toUpperCase()}${parts[1].slice(1)}`;
  }
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

function formatDateTimeEmail(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', ' kl');
  } catch { return dateStr; }
}

const createBaseLayoutEmail = (regnr: string, content: string): string => `<!DOCTYPE html>
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

function buildUthyrningsbarEmail(
  regnr: string,
  bilmodell: string,
  stationDisplay: string,
  editedByName: string,
  editedAt: string,
  kommentar: string | null,
): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const tidpunkt = formatDateTimeEmail(editedAt);
  const content = `
    <tr><td style="text-align:center;padding-bottom:20px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 10px;">🟢 ${esc(regnr)} är nu uthyrningsbar</h1>
    </td></tr>
    <tr><td style="padding:6px 0;">
      <div style="background-color:#C45400;border:1px solid #C45400;padding:12px;text-align:center;font-weight:bold;color:#FFFFFF!important;border-radius:6px;">
        NU UTHYRNINGSBAR
      </div>
    </td></tr>
    ${kommentar ? `<tr><td style="padding:6px 0;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:6px;font-size:14px;">
        <strong>Kommentar:</strong> ${esc(kommentar)}
      </div>
    </td></tr>` : ''}
    <tr><td style="padding-top:16px;">
      <div style="background:#f9fafb!important;border:1px solid #e5e7eb;padding:15px;border-radius:6px;margin-bottom:20px;">
        <table width="100%" style="font-size:14px;"><tbody>
          <tr><td style="padding:4px 0;"><strong>Reg.nr:</strong> ${esc(regnr)}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Bilmodell:</strong> ${esc(bilmodell)}</td></tr>
          <tr><td style="padding:4px 0;"><strong>Senaste station:</strong> ${esc(stationDisplay)}</td></tr>
        </tbody></table>
      </div>
    </td></tr>
    <tr><td>
      <p style="margin-top:20px;font-size:14px;">
        Markerad som uthyrningsbar av ${esc(editedByName)} ${tidpunkt}
      </p>
    </td></tr>`;
  return createBaseLayoutEmail(regnr, content);
}
// =================================================================
// 2. TYPES
// =================================================================

type EditPayload = {
  regnr: string;
  field_name: string;
  new_value: string | null;
  old_value: string | null;
  edited_by: string;
  comment?: string | null;
};

// =================================================================
// 3. API HANDLER
// =================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { edits } = body as { edits: EditPayload[] };

    // Validate payload
    if (!Array.isArray(edits) || edits.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty edits array' },
        { status: 400 }
      );
    }

    for (const edit of edits) {
      if (!edit.regnr || !edit.field_name || !edit.edited_by) {
        return NextResponse.json(
          { error: 'Each edit must have regnr, field_name, and edited_by' },
          { status: 400 }
        );
      }
    }

    // Generate a shared batch_id for all edits in this save
    const batchId = randomUUID();
    const editsWithBatch = edits.map((edit: EditPayload) => ({
      ...edit,
      batch_id: batchId,
    }));

    // Insert all edits (edited_at defaults to NOW() in DB)
    const { data, error } = await supabaseAdmin
      .from('vehicle_edits')
      .insert(editsWithBatch)
      .select();

    if (error) {
      console.error('[API /vehicle-edits] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save edits', details: error },
        { status: 500 }
      );
    }

    // Mejltrigger: skicka mejl om klar_for_uthyrning ändrades Nej → Ja
    const uthyrningsbarEdit = edits.find(
      (e: EditPayload) => e.field_name === 'klar_for_uthyrning' && e.new_value === 'Ja' && e.old_value === 'Nej'
    );

    if (uthyrningsbarEdit) {
      try {
        const kommentarEdit = edits.find((e: EditPayload) => e.field_name === 'ej_uthyrningsbar_anledning');

        // Hämta senaste checkin för ort och station
        const { data: checkinData } = await supabaseAdmin
          .from('checkins')
          .select('current_city, current_ort, current_station')
          .eq('regnr', uthyrningsbarEdit.regnr)
          .eq('status', 'COMPLETED')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Hämta bilmodell (nybil_inventering → vehicles)
        let bilmodell = '---';
        const { data: nybilData } = await supabaseAdmin
          .from('nybil_inventering')
          .select('bilmarke, modell')
          .eq('regnr', uthyrningsbarEdit.regnr)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (nybilData?.bilmarke || nybilData?.modell) {
          bilmodell = [nybilData.bilmarke, nybilData.modell].filter(Boolean).join(' ');
        } else {
          const { data: vehicleData } = await supabaseAdmin
            .from('vehicles')
            .select('brand, model')
            .eq('regnr', uthyrningsbarEdit.regnr)
            .maybeSingle();
          if (vehicleData?.brand || vehicleData?.model) {
            bilmodell = [vehicleData.brand, vehicleData.model].filter(Boolean).join(' ');
          }
        }

        const ort = checkinData?.current_city || checkinData?.current_ort || '';
        const station = checkinData?.current_station || '---';
        const stationDisplay = ort && station !== '---' ? `${ort} / ${station}` : station;

        const editedByName = getFullNameFromEmailLocal(uthyrningsbarEdit.edited_by);
        const editedAt = new Date().toISOString();
        const kommentar = kommentarEdit?.new_value || null;

        const emailHtml = buildUthyrningsbarEmail(
          uthyrningsbarEdit.regnr,
          bilmodell,
          stationDisplay,
          editedByName,
          editedAt,
          kommentar,
        );

        // Mottagare — TESTLÄGE: endast per@incheckad.se
        // TODO: inför go-live, avkommentera stationsroutingen nedan
        const recipients = [defaultHuvudstationAddress];
        // const stationEmail = stationEmailMapping[ort];
        // if (stationEmail && !recipients.includes(stationEmail)) recipients.push(stationEmail);

        await resend.emails.send({
          from: 'incheckning@incheckad.se',
          to: recipients,
          subject: `🟢 NU UTHYRNINGSBAR: ${uthyrningsbarEdit.regnr} - ${station}`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error('[API /vehicle-edits] Email error:', emailError);
        // Resilient: logga felet men returnera success ändå
      }
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[API /vehicle-edits] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
