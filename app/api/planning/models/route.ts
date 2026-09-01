import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const HOLDING_PERIODS = new Set([4, 6, 9, 12, 18, 24]);

type ModelInput = {
  model_code?: unknown;
  display_name?: unknown;
  brand?: unknown;
  is_electric?: unknown;
  is_automatic?: unknown;
  daily_rate?: unknown;
  holding_period_months?: unknown;
  aliases?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function intOrNull(value: unknown): number | null | undefined {
  if (value === null || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined;
}

function holdingPeriod(value: unknown): number | null | undefined {
  if (value === null || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && HOLDING_PERIODS.has(numeric) ? numeric : undefined;
}

function aliases(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((item) => text(item)).filter((item): item is string => Boolean(item)))];
}

export async function PUT(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: ModelInput;
  try { body = await request.json() as ModelInput; } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const modelCode = text(body.model_code);
  const displayName = text(body.display_name);
  const brand = text(body.brand);
  const electric = bool(body.is_electric);
  const automatic = bool(body.is_automatic);
  const dailyRate = intOrNull(body.daily_rate);
  const holdingMonths = holdingPeriod(body.holding_period_months);
  const sortOrder = intOrNull(body.sort_order);
  const modelAliases = aliases(body.aliases);
  const active = typeof body.is_active === 'boolean' ? body.is_active : true;

  if (!modelCode || !displayName || !brand || electric === null || automatic === null || dailyRate === undefined || holdingMonths === undefined || sortOrder === undefined) {
    return NextResponse.json({ error: 'Modellen kräver kod, namn, märke, EL/AUT samt giltig dygnsdebitering och hålltid' }, { status: 400 });
  }

  const admin = adminClient();
  const now = new Date().toISOString();
  const payload = {
    model_code: modelCode,
    display_name: displayName,
    brand: brand.toUpperCase(),
    is_electric: electric,
    is_automatic: automatic,
    daily_rate: dailyRate,
    holding_period_months: holdingMonths,
    aliases: modelAliases ?? [],
    sort_order: sortOrder ?? 0,
    is_active: active,
    updated_at: now,
    updated_by: verification.user.id,
    created_by: verification.user.id,
  };

  const { data, error } = await admin.from('planning_vehicle_models')
    .upsert(payload, { onConflict: 'model_code' })
    .select('model_code,display_name,brand,is_electric,is_automatic,daily_rate,holding_period_months,aliases,sort_order,is_active')
    .single();

  if (error) {
    console.error('[planning models] PUT failed', error);
    return NextResponse.json({ error: 'Kunde inte spara modellen' }, { status: 500 });
  }
  return NextResponse.json({ data });
}
