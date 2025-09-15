// lib/damages.ts
import { createClient } from '@supabase/supabase-js';

export function normalizeReg(input: string): string {
  return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ViewRow = {
  regnr: string;
  saludatum: string | null;
  skador: string[] | string | null;
};

/** Hämtar en (1) rad ur mabi_damage_view + normaliserar skador till string[] */
export async function fetchDamageCard(plate: string): Promise<{ regnr: string; saludatum: string | null; skador: string[] } | null> {
  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('regnr, saludatum, skador')
    .eq('regnr', plate)
    .maybeSingle();

  if (error) {
    console.error('fetchDamageCard error:', error);
    return null;
  }

  const row = data as ViewRow | null;
  if (!row) return null;

  const raw = row.skador;
  let arr: string[] = [];
  if (Array.isArray(raw)) {
    arr = raw.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    arr = raw
      .replace(/[{}\[\]]/g, '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  return { regnr: row.regnr, saludatum: row.saludatum ?? null, skador: arr };
}
