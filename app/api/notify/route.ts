// app/api/notify/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

type MailPayload = {
  to?: string | string[];
  region?: 'Syd' | 'Mitt' | 'Norr';
  subjectBase?: string;
  htmlBody?: string;
};

function normRecipients(input?: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : (input ? [input] : []);
  const cleaned = raw.map(s => String(s || '').trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

async function send(apiKey: string, body: {
  from: string; to: string[]; subject: string; html: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: body.from,
      to: body.to,
      subject: body.subject,
      html: body.html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: data };
  }
  return { ok: true as const, status: res.status, id: data?.id ?? null, data };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MailPayload;

    // --- mottagare ---
    const to = normRecipients(
      body.to ?? process.env.NEXT_PUBLIC_TEST_MAIL ?? 'per.andersson@mabi.se'
    );
    if (to.length === 0) {
      return NextResponse.json({ ok: false, error: 'NO_RECIPIENTS' }, { status: 400 });
    }

    // --- ämnen + html ---
    const subjectBase = body.subjectBase ?? 'Incheckning';
    const region = (body.region ?? 'Syd') as 'Syd' | 'Mitt' | 'Norr';
    const htmlBody = body.htmlBody ?? '';

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'MISSING_RESEND_API_KEY' }, { status: 500 });
    }
    const from = process.env.RESEND_FROM ?? 'onboarding@resend.dev';

    // 1) Bilkontroll
    const r1 = await send(apiKey, {
      from,
      to,
      subject: `${subjectBase} - Bilkontroll`,
      html: `<p>Hej Bilkontroll!</p>${htmlBody}`,
    });
    if (!r1.ok) {
      return NextResponse.json(
        { ok: false, where: 'send1', status: r1.status, error: r1.error, payload: { from, to } },
        { status: 500 }
      );
    }

    // 2) Region
    const r2 = await send(apiKey, {
      from,
      to,
      subject: `${subjectBase} - Region ${region}`,
      html: `<p>Hej Region ${region}!</p>${htmlBody}`,
    });
    if (!r2.ok) {
      return NextResponse.json(
        { ok: false, where: 'send2', status: r2.status, error: r2.error, payload: { from, to } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      ids: [r1.id, r2.id],
      from,
      to,
      keyPrefix: (process.env.RESEND_API_KEY ?? '').slice(0, 7),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
