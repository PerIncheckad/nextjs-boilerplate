import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { normalizeDamageType } from './normalizeDamageType';

// =================================================================
// 1. INITIALIZATION & CONFIGURATION
// =================================================================
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

// Prefer server-only SUPABASE_URL, then fall back to NEXT_PUBLIC_...
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://placeholder.supabase.co';

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- E-postmottagare (oförändrat) ---
const bilkontrollAddress = ['per@incheckad.se', 'latif@incheckad.se'];
const defaultHuvudstationAddress = 'per@incheckad.se';

const stationEmailMapping: { [ort: string]: string } = {
  Helsingborg: 'helsingborg@incheckad.se',
  Ängelholm: 'helsingborg@incheckad.se',
};

const getSiteUrl = (request: Request): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  return host ? `${protocol}://${host}` : 'https://nextjs-boilerplate-eight-zeta-15.vercel.app';
};

const LOGO_URL =
  'https://ufioaijcmaujlvmveyra.supabase.co/storage/v1/object/public/MABI%20Syd%20logga/MABI%20Syd%20logga%202.png';

// =================================================================
// 2. HELPERS
// =================================================================
const formatCheckerName = (payload: any): string => {
  if (payload?.fullName) return payload.fullName;
  if (payload?.full_name) return payload.full_name;
  const firstName = payload?.firstName || payload?.first_name || payload?.incheckare;
  const lastName = payload?.lastName || payload?.last_name;
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return firstName || payload?.incheckare || '---';
};

const createStorageLink = (folderPath: string | undefined, siteUrl: string): string | null => {
  if (!folderPath) return null;
  return `${siteUrl}/public-media/${folderPath}`;
};

const hasAnyFiles = (damage: any): boolean => {
  const uploads = damage?.uploads;
  if (!uploads) return false;
  const hasPhotos = Array.isArray(uploads.photo_urls) && uploads.photo_urls.length > 0;
  const hasVideos = Array.isArray(uploads.video_urls) && uploads.video_urls.length > 0;
  return hasPhotos || hasVideos;
};

const getDamageString = (damage: any): string => {
  let baseString = damage.fullText || damage.type || damage.userType || 'Okänd skada';
  const positions = (damage.positions || damage.userPositions || [])
    .map((p: any) => {
      if (p.carPart && p.position) return `${p.carPart} (${p.position})`;
      if (p.carPart) return p.carPart;
      return '';
    })
    .filter(Boolean)
    .join(', ');
  if (positions) baseString += `: ${positions}`;
  const comment = damage.text || damage.userDescription || damage.resolvedComment;
  if (comment) baseString += `<br><small><strong>Kommentar:</strong> ${comment}</small>`;
  return baseString;
};

const formatDamagesToHtml = (damages: any[], title: string, siteUrl: string, fallbackText?: string): string => {
  if (!damages || damages.length === 0) {
    if (fallbackText) {
      return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><p style="margin-top:0;font-size:14px;">${fallbackText}</p>`;
    }
    return '';
  }
  const items = damages
    .map(d => {
      const text = getDamageString(d);
      const storageLink = hasAnyFiles(d) ? createStorageLink(d.uploads?.folder, siteUrl) : null;
      return `<li style="margin-bottom:8px;">${text}${
        storageLink
          ? ` <a href="${storageLink}" target="_blank" style="text-decoration:none;color:#2563eb!important;font-weight:bold;">(Visa media 🔗)</a>`
          : ''
      }</li>`;
    })
    .join('');
  return `<h3 style="margin:20px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;">${title}</h3><ul style="padding-left:20px;margin-top:0;font-size:14px;">${items}</ul>`;
};

const createBaseLayout = (regnr: string, content: string): string => `<!DOCTYPE html>
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

// Basic builders (fallback) – tills vi återkopplar original‑layouten
function buildHuvudstationEmailBasic(payload: any, date: string, time: string, siteUrl: string, regnr: string): string {
  const content = `
    <h2>Incheckning (Huvudstation)</h2>
    <p><strong>Regnr:</strong> ${regnr}</p>
    <p><strong>Datum:</strong> ${date} ${time}</p>
    ${formatDamagesToHtml(payload.dokumenterade_skador || [], 'Dokumenterade skador', siteUrl, 'Inga dokumenterade skador')}
    ${formatDamagesToHtml(payload.nya_skador || [], 'Nya skador', siteUrl, 'Inga nya skador')}
  `;
  return createBaseLayout(regnr, content);
}
function buildBilkontrollEmailBasic(payload: any, date: string, time: string, siteUrl: string, regnr: string): string {
  const content = `
    <h2>Bilkontroll</h2>
    <p><strong>Regnr:</strong> ${regnr}</p>
    <p><strong>Datum:</strong> ${date} ${time}</p>
    ${formatDamagesToHtml(payload.nya_skador || [], 'Nya skador', siteUrl, 'Inga nya skador')}
  `;
  return createBaseLayout(regnr, content);
}

// TS declarations – om externa builders finns i modulen använder vi dem
// (typeof på en icke-definierad symbol är säkert i runtime)
declare const buildHuvudstationEmail:
  | ((payload: any, date: string, time: string, siteUrl: string) => string)
  | undefined;
declare const buildBilkontrollEmail:
  | ((payload: any, date: string, time: string, siteUrl: string) => string)
  | undefined;

// =================================================================
// 4. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  try {
    // Tillåt både { meta: {...} } och { ... }
    const fullRequestPayload = await request.json();
    const payload = fullRequestPayload?.meta ?? fullRequestPayload ?? {};

    // Query flags
    const url = new URL(request.url);
    const dryRunParam = url.searchParams.get('dryRun');
    const debugParam = url.searchParams.get('debug');
    const isDryRun = dryRunParam === '1' || dryRunParam === 'true' || payload.dryRun === true;
    const isDebug = debugParam === '1' || debugParam === 'true';

    const siteUrl = getSiteUrl(request);

    // Datum/tid (SE)
    const now = new Date();
    const stockholmDate = now
      .toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');
    const stockholmTime = now.toLocaleTimeString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
    });
    const date = stockholmDate;
    const time = stockholmTime;

    // Robust identitet
    const checkerName = formatCheckerName(payload);
    const checkerEmail =
      payload?.email ||
      payload?.user?.email ||
      request.headers.get('x-user-email') ||
      null;
    console.debug('Checker identity', { checkerName, checkerEmail });

    // Media counts (kvar för bakåtkompatibel logg)
    const countMedia = (damages: any[] = []) => {
      let photos = 0;
      let videos = 0;
      damages.forEach(d => {
        if (d.uploads?.photo_urls) photos += d.uploads.photo_urls.length;
        if (d.uploads?.video_urls) videos += d.uploads.video_urls.length;
      });
      return { photos, videos };
    };
    console.log('Media counts received:', {
      nya_skador: countMedia(payload.nya_skador || []),
      dokumenterade_skador: countMedia(payload.dokumenterade_skador || []),
      rekond: payload.rekond?.hasMedia ? 'yes' : 'no',
      husdjur: payload.husdjur?.hasMedia ? 'yes' : 'no',
      rokning: payload.rokning?.hasMedia ? 'yes' : 'no',
    });

    const regNr = payload.regnr || '';
    if (!regNr) {
      console.warn('Saknar regnr i payload – avbryter.');
      return NextResponse.json({ error: 'Missing regnr' }, { status: 400 });
    }

    // Mottagare/ämnen (oförändrat)
    const region = payload.region || null;
    const finalOrt = payload.bilen_star_nu?.ort || payload.ort;
    const huvudstationTo = [defaultHuvudstationAddress];
    const stationSpecificEmail = stationEmailMapping[finalOrt];
    if (stationSpecificEmail && !huvudstationTo.includes(stationSpecificEmail)) {
      huvudstationTo.push(stationSpecificEmail);
    }

    const stationForSubject = payload.bilen_star_nu?.station || payload.station;
    const cleanStation = stationForSubject?.includes(' / ')
      ? stationForSubject.split(' / ').pop()?.trim()
      : stationForSubject;

    const showChargeWarning = payload.drivmedel === 'elbil' && parseInt(payload.laddning?.laddniva, 10) < 95;
    const notRefueled = payload.drivmedel === 'bensin_diesel' && payload.tankning?.tankniva === 'ej_upptankad';
    const hasFarligaConditions =
      payload.rental?.unavailable ||
      payload.varningslampa?.lyser ||
      payload.rekond?.behoverRekond ||
      notRefueled ||
      showChargeWarning ||
      payload.status?.insynsskyddSaknas ||
      (payload.nya_skador && payload.nya_skador.length > 0) ||
      payload.husdjur?.sanerad ||
      payload.rokning?.sanerad;

    const testMarker = hasFarligaConditions ? ' - !!! - ' : ' - ';
    const huvudstationSubject = `INCHECKAD: ${regNr} - ${cleanStation || finalOrt || ''}${testMarker}HUVUDSTATION`;
    const bilkontrollSubject = `INCHECKAD: ${regNr} - ${cleanStation || finalOrt || ''}${testMarker}BILKONTROLL`;

    // =================================================================
    // DATABASE PERSISTENCE (normaliserad damage_type)
    // =================================================================
    let checkinId: string | null = null;
    let dbStatus: { checkin?: string; damages?: string; checkinDamages?: string; error?: string } = {};

    const envStatus = {
      supabaseUrlUsed: supabaseUrl,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasPublicUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    };

    if (!isDryRun) {
      try {
        // Checkin
        const checkinData = {
          regnr: regNr,
          region: region || payload.region || null,
          city: payload.ort || null,
          station: payload.station || null,
          current_city: payload.bilen_star_nu?.ort || payload.ort || null,
          current_station: payload.bilen_star_nu?.station || payload.station || null,
          current_location_note: payload.bilen_star_nu?.kommentar || null,
          checker_name: checkerName,
          checker_email: checkerEmail,
          completed_at: new Date().toISOString(),
          status: 'complete',
          user_type: payload.user_type || null,
        };

        const { data: checkinRecord, error: checkinError } = await supabaseAdmin
          .from('checkins')
          .insert([checkinData])
          .select()
          .single();

        if (checkinError) {
          console.error('Error inserting checkin record:', checkinError);
          dbStatus.error = `checkinError: ${checkinError.message || checkinError}`;
          throw checkinError;
        }

        checkinId = checkinRecord.id;
        dbStatus.checkin = `ok:${checkinId}`;

        // damages + checkin_damages
        const damageInserts: any[] = [];
        const checkinDamageInserts: any[] = [];

        // Nya skador
        (payload.nya_skador || []).forEach((skada: any) => {
          const rawType = skada.type || skada.userType || null;
          const normalized = normalizeDamageType(rawType);

          damageInserts.push({
            regnr: regNr,
            damage_date: new Date().toISOString().split('T')[0],
            region: region || payload.region || null,
            ort: payload.ort || null,
            station_namn: payload.station || null,
            damage_type: normalized.typeCode,
            damage_type_raw: rawType,
            user_type: rawType,
            description: skada.text || skada.userDescription || null,
            inchecker_name: checkerName,
            inchecker_email: checkerEmail,
            status: 'complete',
            uploads: skada.uploads || null,
            created_at: new Date().toISOString(),
          });

          const positions = skada.positions || skada.userPositions || [];
          if (positions.length > 0) {
            positions.forEach((pos: any) => {
              checkinDamageInserts.push({
                checkin_id: checkinId,
                type: 'new',
                damage_type: normalized.typeCode,
                car_part: pos.carPart || null,
                position: pos.position || null,
                description: skada.text || skada.userDescription || null,
                photo_urls: skada.uploads?.photo_urls || [],
                video_urls: skada.uploads?.video_urls || [],
                positions: [pos],
                created_at: new Date().toISOString(),
              });
            });
          } else {
            checkinDamageInserts.push({
              checkin_id: checkinId,
              type: 'new',
              damage_type: normalizeDamageType(skada.type || skada.userType || null).typeCode,
              car_part: null,
              position: null,
              description: skada.text || skada.userDescription || null,
              photo_urls: skada.uploads?.photo_urls || [],
              video_urls: skada.uploads?.video_urls || [],
              positions: [],
              created_at: new Date().toISOString(),
            });
          }
        });

        // Dokumenterade BUHS
        (payload.dokumenterade_skador || []).forEach((skada: any) => {
          const rawType = skada.userType || skada.type || null;
          const normalized = normalizeDamageType(rawType);

          damageInserts.push({
            regnr: regNr,
            damage_date: new Date().toISOString().split('T')[0],
            region: region || payload.region || null,
            ort: payload.ort || null,
            station_namn: payload.station || null,
            damage_type: normalized.typeCode,
            damage_type_raw: rawType,
            user_type: rawType,
            description: skada.userDescription || skada.text || null,
            inchecker_name: checkerName,
            inchecker_email: checkerEmail,
            status: 'complete',
            uploads: skada.uploads || null,
            legacy_damage_source_text: skada.fullText || null,
            created_at: new Date().toISOString(),
          });

          const positions = skada.userPositions || skada.positions || [];
          if (positions.length > 0) {
            positions.forEach((pos: any) => {
              checkinDamageInserts.push({
                checkin_id: checkinId,
                type: 'documented',
                damage_type: normalized.typeCode,
                car_part: pos.carPart || null,
                position: pos.position || null,
                description: skada.userDescription || skada.text || null,
                photo_urls: skada.uploads?.photo_urls || [],
                video_urls: skada.uploads?.video_urls || [],
                positions: [pos],
                created_at: new Date().toISOString(),
              });
            });
          } else {
            checkinDamageInserts.push({
              checkin_id: checkinId,
              type: 'documented',
              damage_type: normalized.typeCode,
              car_part: null,
              position: null,
              description: skada.userDescription || skada.text || null,
              photo_urls: skada.uploads?.photo_urls || [],
              video_urls: skada.uploads?.video_urls || [],
              positions: [],
              created_at: new Date().toISOString(),
            });
          }
        });

        console.debug(`Inserting ${damageInserts.length} damage records and ${checkinDamageInserts.length} checkin_damage records`);

        if (damageInserts.length > 0) {
          const { error: damagesError } = await supabaseAdmin.from('damages').insert(damageInserts);
          if (damagesError) {
            console.error('Error inserting damages:', damagesError);
            dbStatus.error = `damagesError: ${damagesError.message || damagesError}`;
            throw damagesError;
          }
          dbStatus.damages = `ok:${damageInserts.length}`;
        }

        if (checkinDamageInserts.length > 0) {
          const { error: checkinDamagesError } = await supabaseAdmin.from('checkin_damages').insert(checkinDamageInserts);
          if (checkinDamagesError) {
            console.error('Error inserting checkin_damages:', checkinDamagesError);
            dbStatus.error = `checkinDamagesError: ${checkinDamagesError.message || checkinDamagesError}`;
            throw checkinDamagesError;
          }
          dbStatus.checkinDamages = `ok:${checkinDamageInserts.length}`;
        }

        console.debug('Database persistence completed successfully');
      } catch (dbError: any) {
        console.error('Database persistence failed:', dbError);
        // Fortsätt till mejl även om DB fallerar
      }
    } else {
      console.log('DryRun mode: Skipping database persistence');
    }

    // =================================================================
    // E-posthantering (fallback om externa builders saknas)
    // =================================================================
    const huvudstationHtml =
      typeof buildHuvudstationEmail === 'function'
        ? buildHuvudstationEmail(payload, date, time, siteUrl)
        : buildHuvudstationEmailBasic(payload, date, time, siteUrl, regNr);

    const bilkontrollHtml =
      typeof buildBilkontrollEmail === 'function'
        ? buildBilkontrollEmail(payload, date, time, siteUrl)
        : buildBilkontrollEmailBasic(payload, date, time, siteUrl, regNr);

    const emailResults: any[] = [];
    try {
      const r1 = await resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: huvudstationTo,
        subject: huvudstationSubject,
        html: huvudstationHtml,
      });
      emailResults.push({ huvudstation: r1?.id || 'ok' });
    } catch (e) {
      console.error('Failed sending huvudstation email', e);
    }

    try {
      const r2 = await resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: bilkontrollAddress,
        subject: bilkontrollSubject,
        html: bilkontrollHtml,
      });
      emailResults.push({ bilkontroll: r2?.id || 'ok' });
    } catch (e) {
      console.error('Failed sending bilkontroll email', e);
    }

    console.debug('Email results:', emailResults);

    // Debug-svar på begäran
    if (isDebug) {
      return NextResponse.json({
        message: 'Debug info',
        dryRun: isDryRun,
        regnr: regNr,
        envStatus,
        dbStatus,
        emailResults: emailResults.map(r => Object.keys(r)[0]),
      });
    }

    return NextResponse.json({ message: 'Notifications processed successfully.', dryRun: isDryRun, regnr: regNr });
  } catch (error) {
    console.error('FATAL: Uncaught error in API route:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}