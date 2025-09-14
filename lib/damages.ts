// lib/damages.ts
import { createClient } from '@supabase/supabase-js';

// Justera dessa två rader om du redan har en delad klient:
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type DamageViewRow = {
  hjulförvaring: string | null;
  saludatum: string | null;     // 'YYYY-MM-DD'
  skador: string[] | null;
};

// Normalisera regnr: versaler, utan mellanslag
export function normalizeReg(reg: string) {
  return reg.trim().toUpperCase().replace(/\s+/g, '');
}

export async function fetchDamageCard(reg: string): Promise<DamageViewRow | null> {
  const normalized = normalizeReg(reg);
  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('hjulförvaring, saludatum, skador')
    .eq('regnr', normalized)
    .maybeSingle();

  if (error) throw error;
  return (data as DamageViewRow) ?? null;
}
