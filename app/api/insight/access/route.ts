import { NextResponse } from 'next/server';
import { authorizeInsightServerRequest } from '@/lib/insight/server-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await authorizeInsightServerRequest(request);
  if (!access.ok) {
    return NextResponse.json(
      { status: 'DENIED', code: access.code, error: access.error },
      { status: access.status },
    );
  }

  return NextResponse.json({
    data: {
      authorized: true,
      consumer: 'INSIGHT',
      scope: 'GLOBAL',
      capabilities: ['AGGREGATE', 'DRILL_DOWN', 'SOURCE_CONTRIBUTOR'],
    },
  });
}
