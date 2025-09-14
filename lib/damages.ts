// lib/damages.ts

export type DamageViewRow = {
  regnr: string;
  saludatum: string | null;
  skador: string[];
};

function normalizeReg(input: string): string {
  return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function fetchDamageCard(regnr: string): Promise<DamageViewRow | null> {
  const plate = normalizeReg(regnr);

  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('regnr, saludatum, skador') // ⬅️ enbart befintliga kolumner
    .eq('regnr', plate)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Normalisera 'skador' till string[]
  const raw = (data as any).skador;
  let arr: string[] = [];
  if (Array.isArray(raw)) {
    arr = raw.filter(Boolean);
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    arr = raw
      .replace(/[{}\[\]"]/g, '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  return { regnr: data.regnr, saludatum: data.saludatum, skador: arr };
}
