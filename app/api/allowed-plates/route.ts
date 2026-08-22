import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

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

function normalizeRegnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/\s/g, '');
  return normalized || null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  try {
    const admin = createAdminClient();
    const excludeSold = new URL(request.url).searchParams.get('excludeSold') === 'true';
    const { data, error } = await admin.rpc('get_all_allowed_plates').range(0, 4999);
    if (error) throw error;

    let plates: string[] = (data ?? [])
      .map((row: { regnr?: unknown }) => normalizeRegnr(row.regnr))
      .filter((regnr: string | null): regnr is string => Boolean(regnr));

    if (excludeSold) {
      const [soldInventoryResponse, soldEditsResponse] = await Promise.all([
        admin.from('nybil_inventering').select('regnr').eq('is_sold', true),
        admin
          .from('vehicle_edits')
          .select('regnr,new_value,edited_at')
          .eq('field_name', 'is_sold')
          .order('edited_at', { ascending: false }),
      ]);

      if (soldInventoryResponse.error) throw soldInventoryResponse.error;
      if (soldEditsResponse.error) throw soldEditsResponse.error;

      const soldEditsMap = new Map<string, string>();
      for (const edit of soldEditsResponse.data ?? []) {
        const regnr = normalizeRegnr(edit.regnr);
        if (regnr && !soldEditsMap.has(regnr)) {
          soldEditsMap.set(regnr, edit.new_value ?? '');
        }
      }

      const soldSet = new Set<string>();
      for (const row of soldInventoryResponse.data ?? []) {
        const regnr = normalizeRegnr(row.regnr);
        if (regnr) soldSet.add(regnr);
      }
      for (const [regnr, value] of soldEditsMap.entries()) {
        if (value === 'true') soldSet.add(regnr);
        if (value === 'false') soldSet.delete(regnr);
      }

      plates = plates.filter((regnr: string) => !soldSet.has(regnr));
    }

    return NextResponse.json({ data: plates });
  } catch (error) {
    console.error('[allowed-plates] Read failed:', error);
    return NextResponse.json({ error: 'Could not load allowed plates' }, { status: 500 });
  }
}
