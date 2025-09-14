import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type DamageViewRow = {
  regnr: string;
  brand_model: string | null;
  'hjulförvaring': string | null; // kolumnnamn med å i vyn
  saludatum: string | null;
  skador: string[] | string | null;
};

/** Normalisera regnr: versaler + endast A-Z0-9 */
function normalizeReg(input: string): string {
  return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Hämta en rad från vyn och normalisera skador till string[] */
export async function fetchDamageCard(regnr: string): Promise<DamageViewRow & { skador: string[] } | null> {
  const plate = normalizeReg(regnr);

  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('regnr, brand_model, "hjulförvaring", saludatum, skador')
    .eq('regnr', plate)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Normalisera skador -> string[]
  let skadorArray: string[] = [];
  const raw = (data as any).skador;

  if (Array.isArray(raw)) {
    skadorArray = raw as string[];
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    skadorArray = raw.replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
  }

  return { ...(data as any), skador: skadorArray };
}
