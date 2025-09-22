import { NextResponse } from 'next/server';

type MailPayload = {
  to?: string | string[];
  region?: 'Syd' | 'Mitt' | 'Norr';
  subjectBase?: string;
  htmlBody?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MailPayload;

    // --- Mottagare (tillåter både sträng och array) ---
    const toInput =
      body.to ??
      process.env.NEXT_PUBLIC_TEST_MAIL ??
      'per.andersson@mabi.se';
    const to = Array.isArray(toInput) ? toInput : [toInput];

    // --- Ämne + HTML ---
    const subjectBase = body.subjectBase ?? 'Incheckning';
    const region = body.region ?? 'Syd';
    const htmlBody = body.htmlBody ?? '';

    const msg1 = {
      subject: `${subjectBase} - Bilkontroll`,
      html: `<p>Hej Bilkontroll!</p>${htmlBody}`,
    };
    const msg2 = {
      subject: `${subjectBase} - Region ${region}`,
      html: `<p>Hej Region ${region}!</p>${htmlBody}`,
    };

    // --- Resend setup (kräver API-nyckel + from) ---
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Missing RESEND_API_KEY' },
        { status: 500 }
      );
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    // funkar direkt utan domänverifiering
    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

    const r1 = await resend.emails.send({
      from,
      to,
      subject: msg1.subject,
      html: msg1.html,
    });
    const r2 = await resend.emails.send({
      from,
      to,
      subject: msg2.subject,
      html: msg2.html,
    });

    // Skicka tillbaka IDs så vi kan verifiera i Resend dashboard
    return NextResponse.json({ ok: true, ids: [r1?.id, r2?.id], to, from });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
