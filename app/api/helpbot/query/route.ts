import { NextResponse } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';
import { answerHelpbotQuestion } from '@/lib/helpbot/runtime';
import type { HelpbotRoutingContext } from '@/lib/helpbot/matcher';

const MAX_QUESTION_LENGTH = 600;
const ALLOWED_CONTEXT_KEYS = new Set(['processType', 'flow']);

function parseRoutingContext(value: unknown): HelpbotRoutingContext | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('routingContext must be an object');
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) throw new Error(`Unsupported routingContext key: ${key}`);
  }

  const result: { processType?: string; flow?: string } = {};
  for (const key of ['processType', 'flow'] as const) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') throw new Error(`${key} must be a string`);
    const trimmed = raw.trim();
    if (trimmed) result[key] = trimmed;
  }
  return result;
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Ogiltig request.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Frågan måste vara 1–${MAX_QUESTION_LENGTH} tecken.` },
      { status: 400 },
    );
  }

  let routingContext: HelpbotRoutingContext | undefined;
  try {
    routingContext = parseRoutingContext(record.routingContext);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ogiltig routingContext.' },
      { status: 400 },
    );
  }

  const result = answerHelpbotQuestion(question, routingContext);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
