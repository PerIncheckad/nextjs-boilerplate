export const runtime = 'nodejs';


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

// 1) Skicka första mejlet
const send1 = await resend.emails.send({
  from,
  to,
  subject: msg1.subject,
  html: msg1.html,
});
if (send1.error) {
  return NextResponse.json({ ok: false, where: 'send1', error: send1.error }, { status: 500 });
}
const id1 = send1.data?.id || null;

// 2) Skicka andra mejlet
const send2 = await resend.emails.send({
  from,
  to,
  subject: msg2.subject,
  html: msg2.html,
});
if (send2.error) {
  return NextResponse.json({ ok: false, where: 'send2', error: send2.error }, { status: 500 });
}
const id2 = send2.data?.id || null;

// 3) (valfritt) hämta status för debug
const get1 = id1 ? await resend.emails.get(id1) : null;
const get2 = id2 ? await resend.emails.get(id2) : null;
const s1 = get1?.data?.status ?? null;
const s2 = get2?.data?.status ?? null;

// 4) visa första tecknen av nyckeln som verkligen används
const keyPrefix = (process.env.RESEND_API_KEY || '').slice(0, 7);

// 5) svar
return NextResponse.json({
  ok: true,
  ids: [id1, id2],
  statuses: [s1, s2],
  to,
  from,
  keyPrefix,
});

  }
}
