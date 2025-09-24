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

    // Bilkontroll → TEST om satt, annars BILKONTROLL
    const toQuality = normRecipients(
      process.env.NEXT_PUBLIC_TEST_MAIL
        ?? process.env.NEXT_PUBLIC_BILKONTROLL_MAIL
        ?? ''
    );
    if (toQuality.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'NO_RECIPIENTS_QUALITY' },
        { status: 400 }
      );
    }

    // Region (syd@/mitt@/norr@) → TEST om satt, annars regions-env
    const region = (body.region ?? 'Syd') as 'Syd' | 'Mitt' | 'Norr';
    const toRegion = normRecipients(
      process.env.NEXT_PUBLIC_TEST_MAIL
        ?? (region === 'Syd'
              ? process.env.NEXT_PUBLIC_MAIL_REGION_SYD
              : region === 'Mitt'
                ? process.env.NEXT_PUBLIC_MAIL_REGION_MITT
                : process.env.NEXT_PUBLIC_MAIL_REGION_NORR)
        ?? ''
    );
    if (toRegion.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'NO_RECIPIENTS_REGION', region },
        { status: 400 }
      );
    }

    // --- ämnen + html ---
    const subjectBase = body.subjectBase ?? 'Incheckning';
    const htmlBody = body.htmlBody ?? '';

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'MISSING_RESEND_API_KEY' }, { status: 500 });
    }
    const from = process.env.RESEND_FROM ?? 'onboarding@resend.dev';

    // 1) Bilkontroll
    const r1 = await send(apiKey, {
      from,
      to: toQuality,
      subject: `${subjectBase} - Bilkontroll`,
      html: `<p>Hej Bilkontroll!</p>${htmlBody}`,
    });
    if (!r1.ok) {
      return NextResponse.json(
        { ok: false, where: 'send1', status: r1.status, error: r1.error, payload: { from, to: toQuality } },
        { status: 500 }
      );
    }

    // 2) Region
    const r2 = await send(apiKey, {
      from,
      to: toRegion,
      subject: `${subjectBase} - Region ${region}`,
      html: `<p>Hej Region ${region}!</p>${htmlBody}`,
    });
    if (!r2.ok) {
      return NextResponse.json(
        { ok: false, where: 'send2', status: r2.status, error: r2.error, payload: { from, to: toRegion } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      ids: [r1.id, r2.id],
      from,
      recipients: { quality: toQuality, region: toRegion },
      keyPrefix: (process.env.RESEND_API_KEY ?? '').slice(0, 7),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
