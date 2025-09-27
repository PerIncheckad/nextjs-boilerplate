import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

type Region = 'NORR' | 'MITT' | 'SYD';

function recipients(region: Region, target: 'station' | 'quality', force?: string | null) {
  if (force) return [force];
  const REGION_MAIL: Record<Region, string> = {
    NORR: process.env.NEXT_PUBLIC_MAIL_REGION_NORR || 'norr@mabi.se',
    MITT: process.env.NEXT_PUBLIC_MAIL_REGION_MITT || 'mitt@mabi.se',
    SYD:  process.env.NEXT_PUBLIC_MAIL_REGION_SYD  || 'syd@mabi.se',
  };
  const BILKONTROLL = process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || 'bilkontroll@incheckad.se';
  return [target === 'quality' ? BILKONTROLL : REGION_MAIL[region]];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const region: Region = body?.region ?? 'SYD';
    const regionTitle: string =
      body?.regionTitle ?? (region === 'NORR' ? 'Norr' : region === 'MITT' ? 'Mitt' : 'Syd');
    const subjectBase: string = body?.subjectBase ?? 'Incheckning';
    const htmlBody: string = body?.htmlBody ?? `<pre>${JSON.stringify(body, null, 2)}</pre>`;

    // FORCE → allt till per@incheckad.se i test
    const FORCE =
      process.env.NEXT_PUBLIC_FORCE_DEBUG_EMAIL ||
      process.env.NEXT_PUBLIC_TEST_MAIL ||
      null;

    const toStation = recipients(region, 'station', FORCE);
    const toQuality = recipients(region, 'quality', FORCE);

    // Skicka sekventiellt (minskar risk för 429)
    const sent1 = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toStation,
      subject: `${subjectBase} – Region ${regionTitle}`,
      html: htmlBody,
    });

    await new Promise((r) => setTimeout(r, 400)); // liten paus

    const sent2 = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toQuality,
      subject: `${subjectBase} – Bilkontroll`,
      html: htmlBody,
    });

    const ok = Boolean(sent1?.id) && Boolean(sent2?.id);
    return NextResponse.json({ ok, where: 'server-both', toStation, toQuality });
  } catch (e: any) {
    const status = e?.statusCode || 500;
    return NextResponse.json({ ok: false, where: 'route', status, error: e }, { status });
  }
}
