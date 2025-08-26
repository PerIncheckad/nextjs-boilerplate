// app/api/notify/route.ts
import { NextResponse } from 'next/server';

const FROM = process.env.MAIL_FROM || 'no-reply@incheckad.se';
const RESEND = process.env.RESEND_API_KEY; // valfritt – om den saknas blir det dry-run

export async function POST(req: Request) {
  const { to, subject, html } = await req.json();

  if (!Array.isArray(to) || to.length === 0) {
    return NextResponse.json({ ok: false, error: 'Missing recipients' }, { status: 400 });
  }

  if (!RESEND) {
    console.log('[EMAIL DRY-RUN]', { from: FROM, to, subject });
    return NextResponse.json({ ok: true, dryRun: true });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  const out = await res.json();
  return NextResponse.json(out, { status: res.ok ? 200 : 500 });
}
