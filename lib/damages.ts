// lib/damages.ts
import { supabase } from './supabase';


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
