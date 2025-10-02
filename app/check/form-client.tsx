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
  if (normalized.length !== 6) {
    return null;
  }

  try {
    // Vi gör två anrop parallellt för att hämta data från båda källorna.
    const [carDataResult, damageViewResult] = await Promise.all([
      // Anrop 1: Hämta bilmodell från 'car_data'. Vi behöver bara en rad.
      supabase
        .from('car_data')
        .select('brand_model')
        .eq('regnr', normalized)
        .limit(1)
        .single(),

      // Anrop 2: Hämta skador etc. från 'mabi_damage_view'.
      supabase
        .from('mabi_damage_view')
        .select('regnr, hjulförvaring, saludatum, skador')
        .eq('regnr', normalized)
        .single()
    ]);

    // Hantera fel från anropen
    if (carDataResult.error && carDataResult.error.code !== 'PGRST116') {
        // PGRST116 betyder "ingen rad hittad", vilket är ok. Alla andra fel ska loggas.
        console.error('Supabase error fetching from car_data:', carDataResult.error);
    }
    if (damageViewResult.error && damageViewResult.error.code !== 'PGRST116') {
        console.error('Supabase error fetching from mabi_damage_view:', damageViewResult.error);
    }

    // Om ingen av källorna returnerade data, finns inte fordonet.
    if (!carDataResult.data && !damageViewResult.data) {
      console.log(`No vehicle found with reg: ${normalized}`);
      return null;
    }

    // Kombinera datan från båda anropen till ett enda objekt.
    const combinedData: DamageCardData = {
      regnr: normalized,
      carModel: carDataResult.data?.brand_model || null,
      hjulförvaring: damageViewResult.data?.hjulförvaring || null,
      saludatum: damageViewResult.data?.saludatum || null,
      skador: Array.isArray(damageViewResult.data?.skador) ? damageViewResult.data.skador.filter(Boolean) : [],
    };

    return combinedData;

  } catch (err) {
    console.error(`Exception during combined fetch for ${normalized}:`, err);
    return null;
  }
}
