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
    .eq('regnr', plate)// lib/damages.ts
import { createClient } from '@supabase/supabase-js';

export function normalizeReg(input: string): string {
  return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Interface representing the structure of the data from the Supabase view
type ViewRow = {
  regnr: string;
  carModel: string | null;
  saludatum: string | null;
  viewWheelStorage: boolean | null;
  skador: string[] | string | null;
};

// The data structure our application will use
export interface DamageCardData {
  regnr: string;
  carModel: string | null;
  saludatum: string | null;
  viewWheelStorage: boolean;
  skador: string[];
}

/** 
 * Fetches a single row from the mabi_damage_view and normalizes the 'skador' field to a string array.
 * Now includes carModel and viewWheelStorage.
 */
export async function fetchDamageCard(plate: string): Promise<DamageCardData | null> {
  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('regnr, carModel, saludatum, viewWheelStorage, skador') // ADDED carModel and viewWheelStorage
    .eq('regnr', plate)
    .maybeSingle();

  if (error) {
    console.error('fetchDamageCard error:', error);
    return null;
  }

  const row = data as ViewRow | null;
  if (!row) return null;

  // Normalize the 'skador' field
  const rawSkador = row.skador;
  let skadorArray: string[] = [];
  if (Array.isArray(rawSkador)) {
    skadorArray = rawSkador.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof rawSkador === 'string' && rawSkador.trim() !== '') {
    skadorArray = rawSkador
      .replace(/[{}\[\]"]/g, '') // Also remove quotes
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  return {
    regnr: row.regnr,
    carModel: row.carModel || null,
    saludatum: row.saludatum ?? null,
    viewWheelStorage: row.viewWheelStorage ?? false,
    skador: skadorArray,
  };
}
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
