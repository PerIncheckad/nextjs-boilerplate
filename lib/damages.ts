// lib/damages.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnon);

export const normalizeReg = (s: string) =>
  s.trim().toUpperCase().replace(/[\s-]/g, "");

/**
 * Hämtar skadekort för ett reg.nr från vyn mabi_damage_view.
 * VIKTIGT: Vi selektar ENDAST befintliga kolumner i vyn.
 */
export async function fetchDamageCard(plateRaw: string): Promise<{
  regnr: string | null;
  saludatum: string | null;
  skador: string[];
} | null> {
  const plate = normalizeReg(plateRaw);

  const { data, error } = await supabase
    .from("mabi_damage_view")
    .select("regnr, saludatum, skador") // ← endast kolumner som finns i vyn
    .eq("regnr", plate)
    .maybeSingle();

  if (error) {
    // Bubblar upp tekniska fel (t.ex. om vyn saknas/behörighet etc.)
    throw new Error(`Supabase error (mabi_damage_view): ${error.message}`);
  }

  if (!data) {
    // Ingen rad för detta reg.nr
    return null;
  }

  // Robust normalisering av "skador" → alltid string[]
  const raw = (data as any)?.skador;
  let arr: string[] = [];

  if (Array.isArray(raw)) {
    arr = raw.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  } else if (typeof raw === "string" && raw.trim() !== "") {
    // Om servern mot förmodan serialiserar till sträng (t.ex. "{foo,bar}")
    const cleaned = raw.replace(/[{}\[\]]/g, "");
    arr = cleaned
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    arr = [];
  }

  return {
    regnr: (data as any)?.regnr ?? null,
    saludatum: (data as any)?.saludatum ?? null,
    skador: arr,
  };
}
