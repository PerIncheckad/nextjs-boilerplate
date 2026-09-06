import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const { data: flags, error } = await admin
    .from('salu_flags')
    .select('flag_id,regnr,cycle_saludatum,current_saludatum,status,closure_outcome,closure_comment,created_at')
    .neq('status', 'STÄNGD')
    .order('current_saludatum', { ascending: true });
  if (error) {
    console.error('[garage salu sources] SALU lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa SALU' }, { status: 500 });
  }

  const ids = (flags ?? []).map((row) => row.flag_id);
  let imported = new Set<string>();
  if (ids.length > 0) {
    const { data, error: importedError } = await admin
      .from('garage_items')
      .select('source_salu_flag_id')
      .eq('source_kind', 'SALU')
      .is('voided_at', null)
      .in('source_salu_flag_id', ids);
    if (importedError) {
      console.error('[garage salu sources] imported lookup failed', importedError);
      return NextResponse.json({ error: 'Kunde inte läsa redan hämtade SALU-bilar' }, { status: 500 });
    }
    imported = new Set((data ?? []).map((row) => String(row.source_salu_flag_id)));
  }

  const regnrs = [...new Set((flags ?? []).map((row) => String(row.regnr)))];
  const vehicleMap = new Map<string, { brand: string | null; model: string | null }>();
  if (regnrs.length > 0) {
    const { data: vehicles, error: vehicleError } = await admin.from('vehicles').select('regnr,brand,model').in('regnr', regnrs);
    if (vehicleError) {
      console.error('[garage salu sources] vehicle lookup failed', vehicleError);
      return NextResponse.json({ error: 'Kunde inte läsa fordonsregister' }, { status: 500 });
    }
    for (const vehicle of vehicles ?? []) vehicleMap.set(String(vehicle.regnr), { brand: vehicle.brand, model: vehicle.model });
  }

  return NextResponse.json({
    data: (flags ?? []).map((row) => ({
      ...row,
      imported: imported.has(String(row.flag_id)),
      brand: vehicleMap.get(String(row.regnr))?.brand ?? null,
      model: vehicleMap.get(String(row.regnr))?.model ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  return NextResponse.json({
    error: 'Den gamla manuella SALU → Garage-ingången är stängd. SALU går endast till Garage via verifierad STÄNGD + SÄLJAS-handoff.',
  }, { status: 410 });
}
