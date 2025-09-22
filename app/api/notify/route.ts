// app/api/notify/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

type MailPayload = {
  to?: string | string[];
  region?: 'Syd' | 'Mitt' | 'Norr';
  subjectBase?: string;
  htmlBody?: string;
};

function normRecipients(input: string | string[] | undefined): string[] {
  const raw = Array.isArray(input) ? input : (input ? [input] : []);
  // filtrera, trimma, undvik dubbletter
  const cleaned = raw
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Skicka tillbaka allt Resend säger (lätt att felsöka)
    return {
      ok: false as const,
      status: res.status,
      error: data,
    };
  }

  // Resend svarar { id: 'email_xxx', ... }
  return {
    ok: true as const,
    status: res.status,
    id: data?.id ?? null,
    data,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MailPayload;

    // --- Mottagare ---
    const toFallback =
      process.env.NEXT_PUBLIC_TEST_MAIL || 'per.andersson@mabi.se';
    const to = normRecipients(body.to ?? toFallback);
    if (to.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No recipients' },
        { status: 400 }
      );
    }

    // -
