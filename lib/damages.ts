import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type DamageViewRow = {
  regnr: string;
  salutdatum: string | null;      // finns i vyn
  skador: string[] | string | null; // ibland text[], ibland text/sträng
};

function normalizeReg(input: string): string {
  return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function fetchDamageCard(regnr: string): Promise<DamageViewRow & { skador: string[] } | null> {
  const plate = normalizeReg(regnr);

  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('regnr, salutdatum, skador')   // ❗️endast kolumner som finns
    .eq('regnr', plate)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Normalisera "skador" till string[]
  let skadorArray: string[] = [];
  const raw = (data as any).skador;

  if (Array.isArray(raw)) {
    skadorArray = raw as string[];
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    skadorArray = raw
      .replace(/[{}"]/g, '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  return { ...(data as DamageViewRow), skador: skadorArray };
}
