import { supabase } from './supabase';

export type DamageCardData = {
  regnr: string;
  carModel: string | null;
  hjulförvaring: string | null;
  saludatum: string | null;
  skador: string[];
};

export function normalizeReg(reg: string): string {
  if (!reg) return '';
  return reg.toUpperCase().replace(/\s/g, '');
}

export async function fetchDamageCard(reg: string): Promise<DamageCardData | null> {
  const normalized = normalizeReg(reg);
  if (normalized.length < 6) {
    return null;
  }

  try {
    // Vi gör två anrop parallellt.
    const carDataPromise = supabase
      .from('car_data')
      .select('brand_model')
      .eq('regnr', normalized)
      .limit(1)
      .maybeSingle(); // maybeSingle() returnerar null istället för fel om inget hittas.

    const damageViewPromise = supabase
      .from('mabi_damage_view')
      .select('regnr, hjulförvaring, saludatum, skador')
      .eq('regnr', normalized)
      .maybeSingle(); // maybeSingle() är nyckeln här, den kraschar inte om rad saknas.

    const [carDataResult, damageViewResult] = await Promise.all([
      carDataPromise,
      damageViewPromise
    ]);

    // Logga eventuella oväntade fel, men ignorera "hittades inte".
    if (carDataResult.error) console.error('Supabase error (car_data):', carDataResult.error);
    if (damageViewResult.error) console.error('Supabase error (mabi_damage_view):', damageViewResult.error);

    // Om en bil finns i allowed_plates men saknar en post i car_data (t.ex. TDG14N),
    // kommer carDataResult.data vara null. Vi sätter då en standardtext.
    const carModel = carDataResult.data?.brand_model || 'Modell saknas'; 
    
    // Nu bygger vi vårt svarsobjekt. Om data saknas blir fälten null eller en tom array.
    const combinedData: DamageCardData = {
      regnr: normalized,
      carModel: carModel,
      hjulförvaring: damageViewResult.data?.hjulförvaring || null,
      saludatum: damageViewResult.data?.saludatum || null,
      // Om 'skador' är null eller undefined från vyn, returnera en tom array.
      skador: Array.isArray(damageViewResult.data?.skador) ? damageViewResult.data.skador.filter(Boolean) : [],
    };
    
    // Denna funktion kommer ALLTID att returnera ett objekt, så länge reg.nr är giltigt.
    // Detta förhindrar "hittades inte"-felet.
    return combinedData;

  } catch (err) {
    console.error(`Exception during robust fetch for ${normalized}:`, err);
    return null; // Returnera null bara vid ett totalt haveri.
  }
}
