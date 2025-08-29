'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ===================== Typer ===================== */
type RegNr = string;
type DamageEntry = { id: string; plats: string; typ: string; beskrivning?: string };
type CanonicalCar = { regnr: RegNr; model: string; wheelStorage: string; skador: DamageEntry[] };

/* =============== Supabase client (public) =============== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnon);

/* =============== Normalisering av reg.nr =============== */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s\-_.]/g, '')
    .trim();
}

/* =========== Mappa rådata → CanonicalCar (utan påhitt) =========== */
function toCanonicalCar(raw: any, damagesRaw: any[] | null): CanonicalCar | null {
  if (!raw) return null;

  // reg
  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationnumber ??
    raw.licenseplate ?? raw.plate ?? raw.regno ?? raw.reg_no ?? raw.RegNr;
  if (!reg || typeof reg !== 'string') return null;

  // model
  const modelRaw =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? raw.Model;
  const model = (modelRaw && String(modelRaw).trim()) || '--';

  // wheels / hjulförvaring
  const wheelRaw =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? raw.hjulplats;
  const wheelStorage = (wheelRaw && String(wheelRaw).trim()) || '--';

  // damages
  const list = Array.isArray(damagesRaw) ? damagesRaw : (raw.skador ?? raw.damages ?? []);
  const skador: DamageEntry[] = Array.isArray(list)
    ? list.map((d: any, i: number) => ({
        id: String(d?.id ?? `d${i + 1}`),
        plats: String(d?.plats ?? d?.place ?? d?.position ?? '--'),
        typ: String(d?.typ ?? d?.type ?? '--'),
        beskrivning: d?.beskrivning ?? d?.desc ?? d?.description ?? undefined,
      }))
    : [];

  return { regnr: String(reg), model, wheelStorage, skador };
}

/* =========== Supabase – uppslag av bil & skador =========== */
/** Vi provar i denna ordning (så som 99%-lösningen brukade göra):
 *  1) cars_view (om du har en vy med normaliserad kolumn "regnr_norm")
 *  2) cars där regnr_norm = normalizeReg(input)
 *  3) cars där regnr = input (exakt) eller ilike på input utan mellanslag/bindestreck
 *  Skador hämtas från:
 *   - damages där car_id = bil.id (om id finns)
 *   - annars damages där regnr matchar (normaliserat eller exakt)
 */
async function fetchCarAndDamages(regInput: string): Promise<CanonicalCar | null> {
  const norm = normalizeReg(regInput);

  // Helper: plocka första raden
  const pick = (rows: any[] | null | undefined) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null);

  // 1) cars_view (om den finns)
  try {
    const { data, error } = await supabase
      .from('cars_view')
      .select('*')
      .eq('regnr_norm', norm)
      .limit(1);
    if (!error && data && data.length) {
      const carRow = pick(data);
      // damages via car_id
      let damages: any[] | null = null;
      if (carRow?.id) {
        const { data: dlist } = await supabase.from('damages').select('*').eq('car_id', carRow.id).order('id', { ascending: true });
        damages = dlist ?? null;
      } else {
        const { data: dlist } = await supabase
          .from('damages')
          .select('*')
          .or(`regnr.eq.${carRow?.regnr},regnr_norm.eq.${norm}`)
          .order('id', { ascending: true });
        damages = dlist ?? null;
      }
      return toCanonicalCar(carRow, damages);
    }
  } catch { /* ignorera – går vidare */ }

  // 2) cars med regnr_norm
  try {
    const { data, error } = await supabase
      .from('cars')
      .select('*')
      .eq('regnr_norm', norm)
      .limit(1);
    if (!error && data && data.length) {
      const carRow = pick(data);
      let damages: any[] | null = null;
      if (carRow?.id) {
        const { data: dlist } = await supabase.from('damages').select('*').eq('car_id', carRow.id).order('id', { ascending: true });
        damages = dlist ?? null;
      } else {
        const { data: dlist } = await supabase
          .from('damages')
          .select('*')
          .or(`regnr.eq.${carRow?.regnr},regnr_norm.eq.${norm}`)
          .order('id', { ascending: true });
        damages = dlist ?? null;
      }
      return toCanonicalCar(carRow, damages);
    }
  } catch {}

  // 3) cars med regnr-exakt eller "ilike" utan mellanrum/bindestreck
  try {
    const { data, error } = await supabase
      .from('cars')
      .select('*')
      .or(
        [
          `regnr.eq.${regInput}`,
          `registration.eq.${regInput}`,
          `licensePlate.eq.${regInput}`,
          `regnr.ilike.%${regInput}%`,
          `registration.ilike.%${regInput}%`,
          `licensePlate.ilike.%${regInput}%`,
        ].join(',')
      )
      .limit(10);
    if (!error && data && data.length) {
      // välj den rad vars normaliserade regnr matchar bäst
      const best = data.find((r: any) => normalizeReg(r?.regnr ?? r?.registration ?? r?.licensePlate ?? '') === norm) ?? data[0];
      let damages: any[] | null = null;
      if (best?.id) {
        const { data: dlist } = await supabase.from('damages').select('*').eq('car_id', best.id).order('id', { ascending: true });
        damages = dlist ?? null;
      } else {
        const { data: dlist } = await supabase
          .from('damages')
          .select('*')
          .or(`regnr.eq.${best?.regnr},regnr_norm.eq.${norm}`)
          .order('id', { ascending: true });
        damages = dlist ?? null;
      }
      return toCanonicalCar(best, damages);
    }
  } catch {}

  // Ingen träff
  return null;
}

/* ===================== Komponent ===================== */
export default function FormClient() {
  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);
  const [loading, setLoading] = useState(false);

  async function lookupNow() {
    const value = regInput.trim();
    if (!value) return;
    setLoading(true);
    const found = await fetchCarAndDamages(value);
    setCar(found);
    setTried(true);
    setLoading(false);
  }

  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    setRegInput(e.target.value);
    setTried(false);
    setCar(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault(); // Enter i fältet
    lookupNow();
  }

  const showError = tried && !car && regInput.trim().length > 0;

  return (
    <section className="incheckad-scope">
      <div className="page">
        <div className="container">
          <h1 className="h1">Ny incheckning</h1>
          <p className="p">Inloggad: <strong>Bob</strong></p>

          {/* Huvudkort */}
          <div className="card stack-lg">
            {/* Reg.nr */}
            <div className="stack-sm">
              <label htmlFor="regnr" className="label">Registreringsnummer *</label>
              <form onSubmit={onSubmit}>
                <input
                  id="regnr"
                  type="text"
                  value={regInput}
                  onChange={onChangeReg}
                  onBlur={lookupNow}
                  placeholder="Skriv reg.nr (t.ex. DGF14H)"
                  autoComplete="off"
                  inputMode="text"
                  className="input"
                />
              </form>
              {loading && <p className="muted">Hämtar…</p>}
              {showError && <p className="error" role="alert">Okänt reg.nr</p>}
            </div>

            {/* Bilinfo + skador – bara när vi har träff */}
            {car && (
              <>
                <div className="info">
                  <div>
                    <div className="muted">Bilmodell</div>
                    <div className="value">{car.model || '--'}</div>
                  </div>
                  <div>
                    <div className="muted">Hjulförvaring</div>
                    <div className="value">{car.wheelStorage || '--'}</div>
                  </div>
                </div>

                <div className="stack-sm">
                  <div className="label">Befintliga skador:</div>
                  <div className="panel">
                    {car.skador.length === 0 ? (
                      <p>--</p>
                    ) : (
                      <ul className="ul">
                        {car.skador.map(s => (
                          <li key={s.id}>
                            <strong>{s.plats || '--'}</strong> – {s.typ || '--'}
                            {s.beskrivning ? ` (${s.beskrivning})` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Övriga fält (lämnade orörda) */}
          <div className="mt grid-2">
            <div>
              <label className="label">Ort *</label>
              <select className="input" defaultValue="">
                <option value="" disabled>— Välj ort —</option>
                <option>Malmö</option><option>Trelleborg</option><option>Halmstad</option>
              </select>
            </div>
            <div>
              <label className="label">Station / Depå *</label>
              <select className="input" defaultValue="">
                <option value="" disabled>— Välj station / depå —</option>
                <option>Malmö – Central</option><option>Trelleborg – Depå</option><option>Halmstad – Hedbergs</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Skopad ljus stil (som tidigare) ---------- */}
      <style jsx global>{`
        .incheckad-scope { all: initial; display:block; }
        .incheckad-scope, .incheckad-scope * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important; }
        .incheckad-scope .page { min-height: 100dvh; background:#ffffff !important; color:#111111 !important; }
        .incheckad-scope .container { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
        .incheckad-scope .h1 { font-size: 28px; line-height:1.2; margin:0 0 4px; font-weight:700; color:#111 !important; }
        .incheckad-scope .p { margin:0 0 16px; color:#111 !important; }

        .incheckad-scope .card { background:#fff !important; border:1px solid #E5E7EB !important; border-radius:16px !important; padding:16px !important; box-shadow:0 1px 2px rgba(0,0,0,.04) !important; }
        .incheckad-scope .stack-sm > * + * { margin-top:8px; }
        .incheckad-scope .stack-lg > * + * { margin-top:16px; }

        .incheckad-scope .label { font-size:14px; font-weight:600; color:#111 !important; }
        .incheckad-scope .input { width:100%; padding:10px 12px !important; border-radius:12px !important; border:1px solid #D1D5DB !important; background:#ffffff !important; color:#111 !important; outline:none !important; }
        .incheckad-scope .input::placeholder { color:#9CA3AF !important; }
        .incheckad-scope .input:focus { box-shadow:0 0 0 2px rgba(0,0,0,.08) !important; }

        .incheckad-scope .info { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:640px){ .incheckad-scope .info { grid-template-columns:1fr; } }
        .incheckad-scope .muted { font-size:13px; color:#6B7280 !important; }
        .incheckad-scope .value { font-weight:600; color:#111 !important; }

        .incheckad-scope .panel { background:#F9FAFB !important; border:1px solid #E5E7EB !important; border-radius:12px !important; padding:12px !important; }
        .incheckad-scope .ul { margin:0; padding-left:22px; }

        .incheckad-scope .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (max-width:640px){ .incheckad-scope .grid-2 { grid-template-columns:1fr; } }

        .incheckad-scope .error { margin-top:6px; font-size:14px; color:#C00000 !important; }
        .incheckad-scope .mt { margin-top:24px !important; }
      `}</style>
    </section>
  );
}
