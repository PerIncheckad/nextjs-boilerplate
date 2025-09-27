import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

type RegionUpper = 'NORR' | 'MITT' | 'SYD';
type RegionTitle = 'Norr' | 'Mitt' | 'Syd';

type CheckinPayload = {
  regnr?: string;
  region?: string;           // kan vara 'NORR'|'MITT'|'SYD' eller 'Norr'|'Mitt'|'Syd'
  regionTitle?: string;      // om klienten redan skickar titelfall
  station?: string;
  time?: string;             // "HH:MM" (sv-SE) eller valfritt
  hasNewDamages?: boolean;
  needsRecond?: boolean;
  // Framtid: start/slut/duration om ni vill visa detta i mejlen
  startAt?: string;          // ISO eller valfritt
  endAt?: string;            // ISO eller valfritt
  durationMinutes?: number;
  subjectBase?: string;      // t.ex. "Incheckning"
  htmlBody?: string;         // ev. klient-renderad HTML (används ej nu)
  [key: string]: any;        // meta mm.
};

function normRegion(input?: string): { upper: RegionUpper; title: RegionTitle } {
  const s = String(input ?? 'SYD').trim();
  const up = s.toUpperCase();
  if (up === 'NORR') return { upper: 'NORR', title: 'Norr' };
  if (up === 'MITT') return { upper: 'MITT', title: 'Mitt' };
  return { upper: 'SYD', title: 'Syd' };
}

function recipients(region: RegionUpper, target: 'station' | 'quality', force?: string | null) {
  if (force) return [force];
  const REGION_MAIL: Record<RegionUpper, string> = {
    NORR: process.env.NEXT_PUBLIC_MAIL_REGION_NORR || 'norr@mabi.se',
    MITT: process.env.NEXT_PUBLIC_MAIL_REGION_MITT || 'mitt@mabi.se',
    SYD:  process.env.NEXT_PUBLIC_MAIL_REGION_SYD  || 'syd@mabi.se',
  };
  const BILKONTROLL = process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || 'bilkontroll@incheckad.se';
  return [target === 'quality' ? BILKONTROLL : REGION_MAIL[region]];
}

// ---------- Mallar (server-renderad HTML) ----------
const row = (label: string, value?: string) => `
  <tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap;">${label}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#111;">${(value ?? '—') || '—'}</td>
  </tr>`;

function layout(title: string, subtitle: string, rowsHtml: string) {
  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f8;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f7f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" width="640" style="background:#ffffff;border:1px solid #e6e6e6;border-radius:12px;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,'Noto Sans','Helvetica Neue','Apple Color Emoji','Segoe UI Emoji';">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #eee;">
              <div style="font-size:18px;font-weight:700;line-height:1.3;color:#111;">${title}</div>
              <div style="margin-top:4px;font-size:13px;color:#666;">${subtitle}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px 0;">
              <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;color:#777;font-size:12px;">
              <div>Detta mejl skickas automatiskt från incheckad.se när en incheckning slutförs.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function yesNo(v?: boolean) { return v ? 'Ja' : 'Nej'; }

function renderRegionEmail(p: CheckinPayload, titleRegion: RegionTitle) {
  const title = `Incheckning – ${p.regnr ?? ''}`.trim();
  const subtitle = `Region: ${titleRegion}${
    p.station ? ` · Station: ${p.station}` : ''
  }${p.time ? ` · Tid: ${p.time}` : ''}`;
  const rows = [
    row('Registreringsnummer', p.regnr),
    row('Region', titleRegion),
    row('Station', p.station),
    row('Tidpunkt', p.time),
    row('Nya skador', yesNo(p.hasNewDamages)),
    row('Behöver rekond', yesNo(p.needsRecond)),
    // Framtid: visa start/slut/duration om fälten börjar skickas
    p.startAt ? row('Start', p.startAt) : '',
    p.endAt ? row('Slut', p.endAt) : '',
    typeof p.durationMinutes === 'number' ? row('Duration (min)', String(p.durationMinutes)) : '',
  ].join('');
  return layout(title, subtitle, rows);
}

function renderBilkontrollEmail(p: CheckinPayload, titleRegion: RegionTitle) {
  const title = `Incheckning – ${p.regnr ?? ''}`.trim();
  const subtitle = `Bilkontroll${
    p.station ? ` · Station: ${p.station}` : ''
  }${p.time ? ` · Tid: ${p.time}` : ''}`;
  const rows = [
    row('Registreringsnummer', p.regnr),
    row('Region', titleRegion),
    row('Station', p.station),
    row('Tidpunkt', p.time),
    row('Nya skador', yesNo(p.hasNewDamages)),
    row('Behöver rekond', yesNo(p.needsRecond)),
    // Här kan vi senare lägga: hjul-setup, länkar till bilder (Supabase), osv.
  ].join('');
  return layout(title, subtitle, rows);
}

// ---------- Route ----------
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckinPayload;

    // Normalisera region
    const regionNorm = body.regionTitle
      ? normRegion(body.regionTitle)
      : normRegion(body.region);
    const { upper: regionUpper, title: regionTitle } = regionNorm;

    const regnr = body.regnr ?? '';
    const subjectBase = body.subjectBase ?? 'Incheckning';

    // FORCE → allt till testadress i utveckling
    const FORCE =
      process.env.NEXT_PUBLIC_FORCE_DEBUG_EMAIL ||
      process.env.NEXT_PUBLIC_TEST_MAIL ||
      null;

    const toStation = recipients(regionUpper, 'station', FORCE);
    const toQuality = recipients(regionUpper, 'quality', FORCE);

    // Bygg HTML för respektive mål (server-renderat)
    const htmlRegion = renderRegionEmail(body, regionTitle);
    const htmlQuality = renderBilkontrollEmail(body, regionTitle);

    // Ämnesrader
    const subjRegion = `${subjectBase} – Region ${regionTitle}${regnr ? ` – ${regnr}` : ''}`;
    const subjQuality = `${subjectBase} – Bilkontroll${regnr ? ` – ${regnr}` : ''}`;

    // Skicka sekventiellt (mindre risk för 429)
    const sent1 = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toStation,
      subject: subjRegion,
      html: htmlRegion,
    });

    // liten paus
    await new Promise((r) => setTimeout(r, 400));

    const sent2 = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toQuality,
      subject: subjQuality,
      html: htmlQuality,
    });

    const ok = Boolean((sent1 as any)?.id) && Boolean((sent2 as any)?.id);
    return NextResponse.json({
      ok,
      where: 'server-both',
      toStation,
      toQuality,
      ids: { station: (sent1 as any)?.id, quality: (sent2 as any)?.id },
    });
  } catch (e: any) {
    const status = e?.statusCode || e?.status || 500;
    return NextResponse.json({ ok: false, where: 'route', status, error: e }, { status });
  }
}
