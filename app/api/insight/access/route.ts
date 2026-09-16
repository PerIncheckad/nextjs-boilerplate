import { NextResponse } from 'next/server';
import { authorizeInsightRequest } from '@/lib/insight/server-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const decision = await authorizeInsightRequest(request, 'AGGREGATE');
  if (!decision.ok) {
    return NextResponse.json(
      { status: 'DENIED', code: decision.code, error: decision.error },
      { status: decision.status },
    );
  }

  return NextResponse.json({
    data: {
      authorized: true,
      consumer: 'INSIGHT',
      scope: 'GLOBAL',
    },
  });
}
