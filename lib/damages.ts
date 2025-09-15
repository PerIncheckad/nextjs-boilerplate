import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnon);

export const normalizeReg = (s: string) =>
  (s || "").trim().toUpperCase().replace(/[\s-]/g, "");

const normalizeSkador = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim());
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const cleaned = raw.replace(/[{}\[\]]/g, "");
    return cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

/** Läs ALLA rader för plåten från vyn och fläta ihop skadorna */
export async function fetchDamageCard(plateRaw: string): Promise<{
  regnr: string | null;
  saludatum: string | null;
  skador: string[];
} | null> {
  const plate = normalizeReg(plateRaw);
  if (!plate) return null;

  const { data, error } = await supabase
    .from("mabi_damage_view")
    .select("regnr, saludatum, skador")
    .eq("regnr", plate); // ← hämta alla rader

  if (error) throw new Error(`Supabase error (mabi_damage_view): ${error.message}`);
  if (!data || data.length === 0) return null;

  const allSkador = Array.from(
    new Set(data.flatMap((row: any) => normalizeSkador(row?.skador)))
  );

  const vals = (data.map((r: any) => r?.saludatum).filter(Boolean) as string[]);
  const saludatum =
    vals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))
      ? vals.sort((a, b) => (a < b ? 1 : -1))[0] ?? null
      : vals[0] ?? null;

  return {
    regnr: (data[0] as any)?.regnr ?? plate,
    saludatum,
    skador: allSkador,
  };
}
