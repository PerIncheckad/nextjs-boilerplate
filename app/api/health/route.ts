import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'missing',
  });
}
