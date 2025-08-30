// ... överst i filen finns redan:
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

function normalizeReg(s: string) {
  return (s ?? '').toUpperCase().normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\s\-_.]/g, '').trim();
}

type CanonicalCar = { regnr: string; model: string; wheelStorage: string; skador: { id: string; plats: string; typ: string; beskrivning?: string }[] };

async function fetchCarAndDamages(regInput: string): Promise<CanonicalCar | null> {
  const norm = normalizeReg(regInput);

  // 1) bil
  const { data: carRows, error: carErr } = await supabase.rpc('car_lookup_any', { p_reg: regInput });
  if (carErr) {
    console.error('car_lookup_any error', carErr);
    return null;
  }
  const carRow = Array.isArray(carRows) && carRows.length ? carRows[0] : null;
  if (!carRow) return null;

  // 2) skador
  const { data: dmgRows, error: dmgErr } = await supabase.rpc('damages_lookup_any', { p_car_id: carRow.car_id, p_reg: carRow.regnr });
  if (dmgErr) {
    console.error('damages_lookup_any error', dmgErr);
  }
  const skador = (Array.isArray(dmgRows) ? dmgRows : []).map((d, i) => ({
    id: String(d.id ?? i + 1),
    plats: d.plats || '--',
    typ: d.typ || '--',
    beskrivning: d.beskrivning || undefined,
  }));

  return {
    regnr: carRow.regnr || regInput,
    model: carRow.model || '--',
    wheelStorage: carRow.wheelStorage || '--',
    skador,
  };
}
