import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAuthorized(request: Request): boolean {
  const authorization = request.headers.get('authorization');
  const tokens = [
    process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  ].filter((token): token is string => Boolean(token));

  return tokens.some((token) => authorization === `Bearer ${token}`);
}

function evaluationTime(value: string | null): string | null {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const evaluatedAt = evaluationTime(url.searchParams.get('at'));
  if (!evaluatedAt) {
    return NextResponse.json({ error: 'Invalid evaluation time' }, { status: 400 });
  }

  const dryRun = url.searchParams.get('dryRun') === 'true';

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[checkpoint-action-scheduler] Missing server configuration:', error);
    return NextResponse.json({ error: 'Checkpoint action scheduler unavailable' }, { status: 503 });
  }

  try {
    const { data, error } = await admin.rpc('run_checkpoint_action_timers', {
      p_evaluated_at: evaluatedAt,
      p_apply: !dryRun,
    });

    if (error) {
      console.error('[checkpoint-action-scheduler] Timer evaluation failed:', error);
      return NextResponse.json({ error: 'Checkpoint action timer evaluation failed' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        dryRun,
        result: data,
      },
    });
  } catch (error) {
    console.error('[checkpoint-action-scheduler] Unexpected error:', error);
    return NextResponse.json({ error: 'Checkpoint action scheduler failed' }, { status: 500 });
  }
}

export const GET = POST;
