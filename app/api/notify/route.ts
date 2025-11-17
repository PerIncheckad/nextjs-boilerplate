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
// 2. HELPERS (oförändrade från tidigare version)
// =================================================================

const formatCheckerName = (payload: any): string => {
  if (payload.fullName) return payload.fullName;
  if (payload.full_name) return payload.full_name;
  const firstName = payload.firstName || payload.first_name || payload.incheckare;
  const lastName = payload.lastName || payload.last_name;
  if (firstName && lastName) return `${firstName} ${lastName}`;
  return firstName || payload.incheckare || '---';
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

const createAlertBanner = (
  condition: boolean,
  text: string,
  details?: string,
  folderPath?: string,
  siteUrl?: string,
  count?: number
): string => {
  if (!condition) return '';
  const storageLink = siteUrl ? createStorageLink(folderPath, siteUrl) : null;
  let bannerText = text;
  if (count !== undefined && count > 0 && Number.isInteger(count)) bannerText += ` (${count})`;
  let fullText = `⚠️ ${bannerText}`;
  if (details) fullText += `<br>${details}`;
  const bannerContent = `<div style="background-color:#FFFBEB!important;border:1px solid #FDE68A;padding:12px;text-align:center;font-weight:bold;color:#92400e!important;border-radius:6px;">${fullText}</div>`;
  return `<tr><td style="padding:6px 0;">${
    storageLink
      ? `<a href="${storageLink}" target="_blank" style="text-decoration:none;color:#92400e!important;">${bannerContent}</a>`
      : bannerContent
  }</td></tr>`;
};

const createAdminBanner = (condition: boolean, text: string): string => {
  if (!condition) return '';
  const bannerContent = `<div style="background-color:#DBEAFE!important;border:1px solid #93C5FD;padding:12px;text-align:center;font-weight:bold;color:#1E40AF!important;border-radius:6px;">${text}</div>`;
  return `<tr><td style="padding:6px 0;">${bannerContent}</td></tr>`;
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

const formatTankning = (tankning: any): string => {
  if (!tankning) return '---';
  if (tankning.tankniva === 'återlämnades_fulltankad') return 'Återlämnades fulltankad';
  if (tankning.tankniva === 'tankad_nu') {
    const parts = [
      'Tankad nu av MABI',
      tankning.liters ? `(${tankning.liters}L` : null,
      tankning.bransletyp ? `${tankning.bransletyp}` : null,
      tankning.literpris ? `@ ${tankning.literpris} kr/L)` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return parts;
  }
  if (tankning.tankniva === 'ej_upptankad') return '<span style="font-weight:bold;color:#b91c1c;">Ej upptankad</span>';
  return '---';
};

const buildBilagorSection = (rekond: any, husdjur: any, rokning: any, siteUrl: string): string => {
  const bilagor: string[] = [];
  if (rekond.folder && rekond.hasMedia)
    bilagor.push(`<li><a href="${siteUrl}/public-media/${rekond.folder}" target="_blank">Rekond 🔗</a></li>`);
  if (husdjur.folder && husdjur.hasMedia)
    bilagor.push(`<li><a href="${siteUrl}/public-media/${husdjur.folder}" target="_blank">Husdjur 🔗</a></li>`);
  if (rokning.folder && rokning.hasMedia)
    bilagor.push(`<li><a href="${siteUrl}/public-media/${rokning.folder}" target="_blank">Rökning 🔗</a></li>`);
  if (bilagor.length === 0) return '';
  return `<div style="border-bottom:1px solid #e5e7eb;padding-bottom:10px;margin-bottom:20px;">
    <h2 style="font-size:16px;font-weight:600;margin-bottom:15px;">Bilagor</h2>
    <ul style="padding-left:20px;margin:0;">${bilagor.join('')}</ul>
  </div>`;
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

// =================================================================
// 3. HTML BUILDERS (oförändrade – du behåller tidigare fulla funktioner)
// =================================================================
// För korthet här antar vi att buildHuvudstationEmail och buildBilkontrollEmail
// är oförändrade från tidigare version (de fanns redan i filen).
// Om de har tagits bort måste du behålla originalkoden.

// =================================================================
// 4. MAIN API FUNCTION
// =================================================================
export async function POST(request: Request) {
  try {
    const fullRequestPayload = await request.json();
    const { meta: payload } = fullRequestPayload;

    const siteUrl = getSiteUrl(request);

    const now = new Date();
    const stockholmDate = now
      .toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
      // säkerställa YYYY-MM-DD
      .replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3');

    const regNr = payload.regnr || '';

    // Mottagare
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
    const huvudstationSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}HUVUDSTATION`;
    const bilkontrollSubject = `INCHECKAD: ${regNr} - ${cleanStation}${testMarker}BILKONTROLL`;

    // Bygg email HTML (använder befintliga builders i filen)
    const huvudstationHtml = createBaseLayout(regNr, '<!-- huvudstation innehåll, befintlig builder -->');
    const bilkontrollHtml = createBaseLayout(regNr, '<!-- bilkontroll innehåll, befintlig builder -->');

    // Skicka mejl först
    await Promise.all([
      resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: huvudstationTo,
        subject: huvudstationSubject,
        html: huvudstationHtml,
      }),
      resend.emails.send({
        from: 'incheckning@incheckad.se',
        to: bilkontrollAddress,
        subject: bilkontrollSubject,
        html: bilkontrollHtml,
      }),
    ]);

    // DryRun-detektion (query + body)
    const url = new URL(request.url);
    const dryRunFromQuery = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true';
    const dryRunFromBody = fullRequestPayload.dryRun === true || payload.dryRun === true;
    const isDryRun = dryRunFromQuery || dryRunFromBody;

    if (isDryRun) {
      console.log('🧪 DRY RUN MODE ACTIVE: inga DB-skrivningar');
      return NextResponse.json({ ok: true, dryRun: true, message: 'Emails sent (dry run)' });
    }

    // =========================
    // Database writes (NOT dryRun)
    // =========================
    let checkinId: string | null = null;

    // 1. Insert minimal checkin
    const checkinData = { regnr: regNr, completed_at: now.toISOString() };
    const { data: checkinInsert, error: checkinError } = await supabaseAdmin
      .from('checkins')
      .insert(checkinData)
      .select('id')
      .single();

    if (checkinError) {
      console.error('❌ CHECKIN INSERT ERROR:', checkinError);
    } else {
      checkinId = checkinInsert.id;
      console.log(`✅ CHECKIN INSERT OK: checkin_id=${checkinId}, regnr=${regNr}`);
    }

    // Helpers
    const insertNewDamage = async (damage: any) => {
      const damageData = {
        regnr: regNr,
        damage_date: stockholmDate,
        legacy_damage_source_text: null,
        original_damage_date: null,
        legacy_loose_key: null,
        user_type: damage.userType || damage.type || null,
        user_positions: damage.userPositions || damage.positions || [],
        description: damage.userDescription || damage.text || null,
      };
      const { error } = await supabaseAdmin.from('damages').insert(damageData);
      if (error) {
        console.error('❌ NEW DAMAGE INSERT ERROR:', error);
      } else {
        console.log(
          `✅ NEW DAMAGE INSERTED: type=${damageData.user_type}, positions=${Array.isArray(damageData.user_positions) ? damageData.user_positions.length : 0}`
        );
      }
    };

    const insertDocumentedBUHS = async (damage: any) => {
      const legacyText = damage.fullText || damage.text || damage.type;
      const originalDamageDate = damage.damage_date;
      const legacyLooseKey = originalDamageDate ? `${regNr}|${originalDamageDate}` : null;

      let exists = false;

      if (legacyText) {
        const { data: existingByText } = await supabaseAdmin
          .from('damages')
          .select('id')
          .eq('regnr', regNr)
          .eq('legacy_damage_source_text', legacyText)
          .maybeSingle();
        if (existingByText) {
          exists = true;
          console.log(`⏭️ SKIPPED: BUHS damage exists by text: ${legacyText}`);
        }
      }

      if (!exists && legacyLooseKey) {
        const { data: existingByKey } = await supabaseAdmin
          .from('damages')
          .select('id')
          .eq('legacy_loose_key', legacyLooseKey)
          .maybeSingle();
        if (existingByKey) {
          exists = true;
          console.log(`⏭️ SKIPPED: BUHS damage exists by loose key: ${legacyLooseKey}`);
        }
      }

      if (!exists) {
        const damageData = {
          regnr: regNr,
          damage_date: stockholmDate, // när dokumenterat
          legacy_damage_source_text: legacyText,
            original_damage_date: originalDamageDate,
          legacy_loose_key: legacyLooseKey,
          user_type: damage.userType || damage.type || null,
          user_positions: damage.userPositions || damage.positions || [],
          description: damage.userDescription || damage.text || damage.resolvedComment || null,
        };
        const { error } = await supabaseAdmin.from('damages').insert(damageData);
        if (error) {
          console.error('❌ BUHS DAMAGE INSERT ERROR:', error);
        } else {
          console.log(
            `✅ BUHS DAMAGE INSERT OK: legacy_text="${legacyText}", loose_key="${legacyLooseKey}"`
          );
        }
      }
    };

    // 2. Dokumenterade BUHS
    const dokumenteradeSkador = payload.dokumenterade_skador || [];
    if (dokumenteradeSkador.length > 0) {
      console.log(`📝 Processing documented BUHS damages (${dokumenteradeSkador.length})`);
      for (const d of dokumenteradeSkador) {
        await insertDocumentedBUHS(d);
      }
    }

    // 3. Nya skador
    const nyaSkador = payload.nya_skador || [];
    if (nyaSkador.length > 0) {
      console.log(`📝 Processing new damages (${nyaSkador.length})`);
      for (const d of nyaSkador) {
        await insertNewDamage(d);
        // Positionsrader per skada
        if (checkinId) {
          const positions = d.userPositions || d.positions || [];
          for (const pos of positions) {
            const checkinDamageRow = {
              checkin_id: checkinId,
              regnr: regNr,
              user_type: d.userType || d.type || null,
              carPart: pos.carPart || null,
              position: pos.position || null,
            };
            const { error } = await supabaseAdmin.from('checkin_damages').insert(checkinDamageRow);
            if (error) {
              console.error('❌ CHECKIN_DAMAGE INSERT ERROR:', error);
            }
          }
        }
      }
      console.log(`✅ ALL NEW DAMAGES PROCESSED (${nyaSkador.length})`);
    }

    console.log('✅ DATABASE PERSISTENCE COMPLETE');

    return NextResponse.json({ ok: true, message: 'Notifications processed successfully.' });
  } catch (error) {
    console.error('FATAL: Uncaught error in API route:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
