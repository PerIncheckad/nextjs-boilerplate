import { NextResponse } from 'next/server';

type MailPayload = {
  to?: string;
  region?: 'Syd' | 'Mitt' | 'Norr';
  subjectBase?: string;     // valfritt
  htmlBody?: string;        // valfritt
};

export async function POST(req: Request) {
  const body = (await req.json()) as MailPayload;

  const to = body.to ?? 'per.andersson@mabi.se';
  const region = body.region ?? 'Syd';

  // Två olika hälsningar som du önskat:
  const msg1 = {
    subject: (body.subjectBase ?? 'Incheckning') + ' – Bilkontroll',
    html: `<p>Hej Bilkontroll!</p>${body.htmlBody ?? ''}`,
  };

  const msg2 = {
    subject: (body.subjectBase ?? 'Incheckning') + ` – Region ${region}`,
    html: `<p>Hej Region ${region}!</p>${body.htmlBody ?? ''}`,
  };

  // Enkelt mailskick: om RESEND_API_KEY finns använder vi Resend, annars mock-loggar vi.
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log('[MOCK MAIL]', { to, msg1, msg2 });
      return NextResponse.json({ ok: true, mocked: true });
    }

// Dynamisk import för att undvika bundling när nyckel saknas
const { Resend } = await import('resend');
const resend = new Resend(apiKey);

const from = process.env.RESEND_FROM || 'onboarding@resend.dev'; // funkar direkt utan domän
const recipients = Array.isArray(to) ? to : [to];

await resend.emails.send({ from, to: recipients, subject: msg1.subject, html: msg1.html });
await resend.emails.send({ from, to: recipients, subject: msg2.subject, html: msg2.html });

return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('Mail error:', err);
    return NextResponse.json({ ok: false, error: 'MAIL_SEND_FAILED' }, { status: 500 });
  }
}
