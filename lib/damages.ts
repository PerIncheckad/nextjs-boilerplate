// ALL IMPORTS MUST BE AT THE TOP OF THE FILE
import { createClient } from '@supabase/supabase-js';

// EXPORTS MUST BE AT THE TOP LEVEL
export function normalizeReg(input: string): string {
  return (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// The data structure our application will use. Exporting it allows other files to use it.
export interface DamageCardData {
  regnr: string;
  carModel: string | null;
  saludatum: string | null;
  viewWheelStorage: boolean;
  skador: string[];
}

// Internal type for the Supabase row. Not exported as it's only used here.
type ViewRow = {
  regnr: string;
  carModel: string | null;
  saludatum: string | null;
  viewWheelStorage: boolean | null;
  skador: string[] | string | null;
};

// Initialize Supabase client. This is not exported.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** 
 * Fetches a single row from the mabi_damage_view and normalizes the 'skador' field to a string array.
 * Now includes carModel and viewWheelStorage.
 */
export async function fetchDamageCard(plate: string): Promise<DamageCardData | null> {
  // Use .limit(1).single() to be robust against duplicates.
  // It fetches the first row and errors if no row is found.
  const { data, error } = await supabase
    .from('mabi_damage_view')
    .select('regnr, carModel, saludatum, viewWheelStorage, skador')
    .eq('regnr', plate)
    .limit(1)
    .single();

  if (error) {
    // Log the error but return null to the component, which will handle the "not found" state.
    console.error(`fetchDamageCard error for plate ${plate}:`, error);
    return null;
  }

  const row = data as ViewRow; // No need to check for null, .single() would have thrown an error.

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
