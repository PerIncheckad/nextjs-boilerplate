import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type StorageSource = 'EDIT' | 'NYBIL' | 'VEHICLES' | 'MISSING';
type StorageFact = {
  regnr: string;
  wheel_storage_location: string | null;
  wheel_storage_source: StorageSource;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanRegnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/\s+/g, '').trim();
  return normalized || null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function joinStorage(ort: string | null, spec: string | null): string | null {
  const parts = [ort, spec].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' - ') : null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[garage-wheel-storage] Missing server configuration:', error);
    return NextResponse.json({ error: 'Hjulförvaring är inte tillgänglig' }, { status: 503 });
  }

  try {
    const [nybilResponse, editsResponse, vehiclesResponse] = await Promise.all([
      admin
        .from('nybil_inventering')
        .select('regnr,hjul_forvaring_ort,hjul_forvaring_spec,hjul_forvaring,created_at')
        .not('regnr', 'is', null)
        .order('created_at', { ascending: false }),
      admin
        .from('vehicle_edits')
        .select('regnr,field_name,new_value,edited_at')
        .in('field_name', ['hjul_forvaring_ort', 'hjul_forvaring_spec'])
        .order('edited_at', { ascending: false }),
      admin
        .from('vehicles')
        .select('regnr,wheel_storage_location')
        .not('regnr', 'is', null),
    ]);

    if (nybilResponse.error) throw nybilResponse.error;
    if (editsResponse.error) throw editsResponse.error;
    if (vehiclesResponse.error) throw vehiclesResponse.error;

    const nybilByRegnr = new Map<string, { ort: string | null; spec: string | null }>();
    for (const row of nybilResponse.data ?? []) {
      const regnr = cleanRegnr(row.regnr);
      if (!regnr || nybilByRegnr.has(regnr)) continue;
      nybilByRegnr.set(regnr, {
        ort: cleanText(row.hjul_forvaring_ort),
        spec: cleanText(row.hjul_forvaring_spec) ?? cleanText(row.hjul_forvaring),
      });
    }

    const latestEdits = new Map<string, string | null>();
    for (const row of editsResponse.data ?? []) {
      const regnr = cleanRegnr(row.regnr);
      if (!regnr || typeof row.field_name !== 'string') continue;
      const key = `${regnr}:${row.field_name}`;
      if (!latestEdits.has(key)) latestEdits.set(key, cleanText(row.new_value));
    }

    const legacyByRegnr = new Map<string, string>();
    for (const row of vehiclesResponse.data ?? []) {
      const regnr = cleanRegnr(row.regnr);
      const location = cleanText(row.wheel_storage_location);
      if (regnr && location && !legacyByRegnr.has(regnr)) legacyByRegnr.set(regnr, location);
    }

    const regnrs = new Set<string>([
      ...nybilByRegnr.keys(),
      ...legacyByRegnr.keys(),
      ...Array.from(latestEdits.keys(), (key) => key.split(':')[0]),
    ]);

    const storage: StorageFact[] = Array.from(regnrs, (regnr) => {
      const nybil = nybilByRegnr.get(regnr);
      const editOrtKey = `${regnr}:hjul_forvaring_ort`;
      const editSpecKey = `${regnr}:hjul_forvaring_spec`;
      const hasEdit = latestEdits.has(editOrtKey) || latestEdits.has(editSpecKey);
      const ort = latestEdits.get(editOrtKey) ?? nybil?.ort ?? null;
      const spec = latestEdits.get(editSpecKey) ?? nybil?.spec ?? null;
      const currentStorage = joinStorage(ort, spec);

      if (currentStorage) {
        return {
          regnr,
          wheel_storage_location: currentStorage,
          wheel_storage_source: hasEdit ? 'EDIT' : 'NYBIL',
        };
      }

      const legacyStorage = legacyByRegnr.get(regnr) ?? null;
      return {
        regnr,
        wheel_storage_location: legacyStorage,
        wheel_storage_source: legacyStorage ? 'VEHICLES' : 'MISSING',
      };
    });

    return NextResponse.json({ data: { storage } });
  } catch (error) {
    console.error('[garage-wheel-storage] Read failed:', error);
    return NextResponse.json({ error: 'Kunde inte läsa hjulförvaring' }, { status: 500 });
  }
}
