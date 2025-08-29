'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ===================== Typer ===================== */
type RegNr = string;
type DamageEntry = { id: string; plats: string; typ: string; beskrivning?: string };
type CanonicalCar = { regnr: RegNr; model: string; wheelStorage: string; skador: DamageEntry[] };

type DebugLog = {
  envOk: boolean;
  supabaseUrl?: string;
  step: Array<{ name: string; error?: string; rows?: number; picked?: any | null }>;
  normalizedInput: string;
  rawInput: string;
};

/* =============== Supabase client (public) =============== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
const supabase = (supabaseUrl && supabaseAnon)
  ? createClient(supabaseUrl, supabaseAnon)
  : null;

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
  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationnumber ??
    raw.licenseplate ?? raw.plate ?? raw.regno ?? raw.reg_no ?? raw.RegNr;
  if (!reg || typeof reg !== 'string') return null;

  const modelRaw =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? raw.Model;
  const model = (modelRaw && String(modelRaw).trim()) || '--';

  const wheelRaw =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? raw.hjulplats;
  const wheelStorage = (wheelRaw && String(wheelRaw).trim()) || '--';

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

/* ======= Hjälp: välj bästa raden utifrån normaliserat reg ======= */
function tryPickBest(rows: any[] | null | undefined, norm: string): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const getReg = (r: any) =>
    r?.regnr ?? r?.registration ?? r?.licensePlate ?? r?.reg ?? r?.reg_no ?? r?.RegNr ?? '';
  const exact = rows.find((r) => normalizeReg(getReg(r)) === norm);
  return exact ?? rows[0];
}

/* =========== Supabase – uppslag av bil & skador (med logg) =========== */
async function fetchCarAndDamages(regInput: string): Promise<{ car: CanonicalCar | null; log: DebugLog }> {
  const norm = normalizeReg(regInput);
  const log: DebugLog = {
    envOk: Boolean(supabase),
    supabaseUrl: supabaseUrl,
    step: [],
    normalizedInput: norm,
    rawInput: regInput,
  };

  if (!supabase) {
    log.step.push({ name: 'init', error: 'Saknar NEXT_PUBLIC_SUPABASE_URL eller NEXT_PUBLIC_SUPABASE_ANON_KEY' });
    return { car: null, log };
  }

  // En helper för bred sökning mot en tabell/vy
  async function queryTable(table: string) {
    // Vi testar flera kolumner med ILIKE. Begränsa antalet för performance.
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .or(
        [
          `regnr.ilike.%${regInput}%`,
          `registration.ilike.%${regInput}%`,
          `licensePlate.ilike.%${regInput}%`,
          `regnr.eq.${regInput}`,
          `registration.eq.${regInput}`,
          `licensePlate.eq.${regInput}`,
          `regnr_norm.eq.${norm}`, // om kolumnen finns
        ].join(',')
      )
      .limit(25);
    return { data, error };
  }

  // 1) cars_view
  try {
    const { data, error } = await queryTable('cars_view');
    if (error) {
      log.step.push({ name: 'cars_view', error: error.message });
    } else {
      log.step.push({ name: 'cars_view', rows: data?.length ?? 0 });
      const picked = tryPickBest(data ?? [], norm);
      if (picked) {
        // hämta skador
        let damages: any[] | null = null;
        if (picked?.id) {
          const { data: dlist, error: derr } = await supabase
            .from('damages')
            .select('*')
            .eq('car_id', picked.id)
            .order('id', { ascending: true });
          if (!derr) damages = dlist ?? null;
          else log.step.push({ name: 'damages(car_id)', error: derr.message });
        } else {
          const { data: dlist, error: derr } = await supabase
            .from('damages')
            .select('*')
            .or(`regnr_norm.eq.${norm},regnr.eq.${picked?.regnr}`)
            .order('id', { ascending: true });
          if (!derr) damages = dlist ?? null;
          else log.step.push({ name: 'damages(regnr)', error: derr.message });
        }
        log.step.push({ name: 'pick(cars_view)', picked });
        return { car: toCanonicalCar(picked, damages), log };
      }
    }
  } catch (e: any) {
    log.step.push({ name: 'cars_view', error: String(e?.message ?? e) });
  }

  // 2) cars
  try {
    const { data, error } = await queryTable('cars');
    if (error) {
      log.step.push({ name: 'cars', error: error.message });
    } else {
      log.step.push({ name: 'cars', rows: data?.length ?? 0 });
      const picked = tryPickBest(data ?? [], norm);
      if (picked) {
        let damages: any[] | null = null;
        if (picked?.id) {
          const { data: dlist, error: derr } = await supabase
            .from('damages')
            .select('*')
            .eq('car_id', picked.id)
            .order('id', { ascending: true });
          if (!derr) damages = dlist ?? null;
          else log.step.push({ name: 'damages(car_id)', error: derr.message });
        } else {
          const { data: dlist, error: derr } = await supabase
            .from('damages')
            .select('*')
            .or(`regnr_norm.eq.${norm},regnr.eq.${picked?.regnr}`)
            .order('id', { ascending: true });
          if (!derr) damages = dlist ?? null;
          else log.step.push({ name: 'damages(regnr)', error: derr.message });
        }
        log.step.push({ name: 'pick(cars)', picked });
        return { car: toCanonicalCar(picked, damages), log };
      }
    }
  } catch (e: any) {
    log.step.push({ name: 'cars', error: String(e?.message ?? e) });
  }

  // 3) ingen träff
  return { car: null, log };
}

/* ===================== Komponent ===================== */
export default function FormClient() {
  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<DebugLog | null>(null);

  async function lookupNow() {
    const value = regInput.trim();
    if (!value) return;
    setLoading(true);
    const { car: found, log } = await fetchCarAndDamages(value);
    setDebug(log);
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
              {!supabase && (
                <p className="error" role="alert">
                  Supabase ej konfigurerat (saknar NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
                </p>
              )}
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

          {/* Övriga fält (oförändrade) */}
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

          {/* Diagnostik – hjälp oss se varför en träff uteblir */}
          {debug && (
            <div className="card mt">
              <h2 className="h2">Diagnostik</h2>
              <pre className="pre">
{JSON.stringify(debug, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Skopad ljus stil ---------- */}
      <style jsx global>{`
        .incheckad-scope { all: initial; display:block; }
        .incheckad-scope, .incheckad-scope * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important; }
        .incheckad-scope .page { min-height: 100dvh; background:#ffffff !important; color:#111111 !important; }
        .incheckad-scope .container { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
        .incheckad-scope .h1 { font-size: 28px; line-height:1.2; margin:0 0 4px; font-weight:700; color:#111 !important; }
        .incheckad-scope .h2 { font-size: 18px; margin:0 0 8px; font-weight:700; color:#111 !important; }
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

        .incheckad-scope .pre { white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; background:#F9FAFB; border:1px solid #E5E7EB; padding:12px; border-radius:12px; }
      `}</style>
    </section>
  );
}
