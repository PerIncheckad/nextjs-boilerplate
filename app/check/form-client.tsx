'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';

/* =========================================================
   KONFIG – justera här vid behov (eller lämna orört)
   ========================================================= */
const CANDIDATE_CAR_TABLES = [
  // vanliga namn
  'cars_view', 'cars',
  // tänkbara varianter vi ofta ser
  'vehicles_view', 'vehicles', 'fleet', 'fleet_cars', 'car_register', 'carregistry',
  // svenska
  'bilar_view', 'bilar', 'bil_view', 'bil'
];

const CANDIDATE_DAMAGE_TABLES = [
  'damages', 'existing_damages', 'damage', 'skador', 'skada'
];

// kolumner som kan innehålla reg.nr
const REG_COLS = ['regnr_norm', 'regnr', 'registration', 'licensePlate', 'plate', 'reg', 'RegNr'];

// modell + hjulförvaring – vi mappar till `model` / `wheelStorage`
const MODEL_COLS = ['model', 'modell', 'bilmodell', 'vehicleModel', 'vehicle_model', 'Model'];
const WHEEL_COLS = [
  'wheelStorage', 'tyreStorage', 'tireStorage', 'wheels_location',
  'hjulförvaring', 'hjulforvaring', 'hjulforvaring_plats', 'däckhotell', 'dackhotell', 'hjulplats'
];

// kolumner i skador-tabell
const DAMAGE_PLATS_COLS = ['plats', 'place', 'position', 'location'];
const DAMAGE_TYP_COLS = ['typ', 'type', 'category'];
const DAMAGE_DESC_COLS = ['beskrivning', 'desc', 'description'];

// om du har en RPC i din db (tidigare “99%-lösning” brukar ha det)
const CANDIDATE_RPCS = ['car_by_regnr', 'get_car_by_regnr', 'get_vehicle_by_reg', 'find_car_by_reg'];

/* ===================== Typer ===================== */
type RegNr = string;
type DamageEntry = { id: string; plats: string; typ: string; beskrivning?: string };
type CanonicalCar = { regnr: RegNr; model: string; wheelStorage: string; skador: DamageEntry[] };

type DebugStep = { name: string; ok?: boolean; rows?: number; picked?: any | null; error?: string; meta?: any };
type DebugLog = {
  envOk: boolean;
  supabaseUrl?: string;
  steps: DebugStep[];
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

/* ================= Hjälpfunktioner ================= */
const getFirstExisting = (obj: any, cols: string[]) => {
  for (const c of cols) if (obj && obj[c] != null) return obj[c];
  return undefined;
};
const getString = (v: any, fallback = '--') =>
  (v === null || v === undefined || String(v).trim() === '') ? fallback : String(v).trim();

/* Rå → Canonical (utan påhitt utöver "--") */
function toCanonicalCar(raw: any, damagesRaw: any[] | null): CanonicalCar | null {
  if (!raw) return null;

  const reg = getFirstExisting(raw, REG_COLS);
  if (!reg || typeof reg !== 'string') return null;

  const model = getString(getFirstExisting(raw, MODEL_COLS));
  const wheel = getString(getFirstExisting(raw, WHEEL_COLS));

  const list = Array.isArray(damagesRaw) ? damagesRaw : (raw.skador ?? raw.damages ?? []);
  const skador: DamageEntry[] = Array.isArray(list)
    ? list.map((d: any, i: number) => ({
        id: String(d?.id ?? `d${i + 1}`),
        plats: getString(getFirstExisting(d, DAMAGE_PLATS_COLS)),
        typ: getString(getFirstExisting(d, DAMAGE_TYP_COLS)),
        beskrivning: getFirstExisting(d, DAMAGE_DESC_COLS),
      }))
    : [];

  return { regnr: String(reg), model, wheelStorage: wheel, skador };
}

/* pick bästa rad baserat på normaliserat regnr */
function pickBest(rows: any[] | null | undefined, norm: string): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const getReg = (r: any) => getFirstExisting(r, REG_COLS) ?? '';
  return rows.find((r) => normalizeReg(getReg(r)) === norm) ?? rows[0];
}

/* ================== Supabase-uppslag ================== */
async function fetchCarAndDamages(regInput: string): Promise<{ car: CanonicalCar | null; log: DebugLog }> {
  const norm = normalizeReg(regInput);
  const log: DebugLog = {
    envOk: Boolean(supabase),
    supabaseUrl,
    steps: [],
    normalizedInput: norm,
    rawInput: regInput,
  };
  if (!supabase) {
    log.steps.push({ name: 'init', error: 'Saknar NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY' });
    return { car: null, log };
  }

  // 0) RPC-funktioner om de finns
  for (const fn of CANDIDATE_RPCS) {
    try {
      const { data, error } = await supabase.rpc(fn, { regnr: regInput, regnr_norm: norm });
      if (error) {
        // Supabase returnerar 404 för okända RPC → logga och fortsätt
        log.steps.push({ name: `rpc:${fn}`, error: error.message });
      } else if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) {
        const arr = Array.isArray(data) ? data : [data];
        const picked = pickBest(arr, norm);
        // Hämta skador från kandidattabeller
        let damages: any[] = [];
        for (const t of CANDIDATE_DAMAGE_TABLES) {
          const { data: d, error: de } = await supabase
            .from(t)
            .select('*')
            .or([`regnr_norm.eq.${norm}`, `regnr.eq.${picked?.regnr ?? ''}`].join(','))
            .order('id', { ascending: true });
          if (!de && Array.isArray(d) && d.length) {
            damages = d;
            log.steps.push({ name: `damages:${t}`, ok: true, rows: d.length });
            break;
          } else if (de && !/not find the table/i.test(de.message)) {
            log.steps.push({ name: `damages:${t}`, error: de.message });
          }
        }
        log.steps.push({ name: `rpc:${fn}`, ok: true, rows: arr.length, picked });
        return { car: toCanonicalCar(picked, damages), log };
      } else {
        log.steps.push({ name: `rpc:${fn}`, rows: 0 });
      }
    } catch (e: any) {
      log.steps.push({ name: `rpc:${fn}`, error: String(e?.message ?? e) });
    }
  }

  // 1) tabeller/vyer – bred sökning
  for (const table of CANDIDATE_CAR_TABLES) {
    try {
      // bygg en OR-sökning som funkar oavsett vilka kolumner som finns
      const ors: string[] = [];
      for (const col of REG_COLS) {
        ors.push(`${col}.eq.${regInput}`);
        ors.push(`${col}.ilike.%${regInput}%`);
        if (col === 'regnr_norm') ors.push(`${col}.eq.${norm}`);
      }

      const { data, error } = await supabase.from(table).select('*').or(ors.join(',')).limit(50);
      if (error) {
        if (/not find the table/i.test(error.message)) {
          log.steps.push({ name: table, error: error.message }); // tabellen finns inte → fortsätt
          continue;
        }
        log.steps.push({ name: table, error: error.message });
      } else if (data && data.length) {
        const picked = pickBest(data, norm);
        // hämta skador
        let damages: any[] = [];
        for (const t of CANDIDATE_DAMAGE_TABLES) {
          const { data: d, error: de } = await supabase
            .from(t)
            .select('*')
            .or([`regnr_norm.eq.${norm}`, `regnr.eq.${picked?.regnr ?? ''}`].join(','))
            .order('id', { ascending: true });
          if (!de && Array.isArray(d) && d.length) {
            damages = d;
            log.steps.push({ name: `damages:${t}`, ok: true, rows: d.length });
            break;
          } else if (de && !/not find the table/i.test(de.message)) {
            log.steps.push({ name: `damages:${t}`, error: de.message });
          }
        }
        log.steps.push({ name: table, ok: true, rows: data.length, picked });
        return { car: toCanonicalCar(picked, damages), log };
      } else {
        log.steps.push({ name: table, rows: 0 });
      }
    } catch (e: any) {
      log.steps.push({ name: table, error: String(e?.message ?? e) });
    }
  }

  // 2) ingen träff
  return { car: null, log };
}

/* ===================== KOMPONENT ===================== */
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

          {/* Bilinfo + skador – visas bara vid träff */}
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

        {/* Övriga fält – orörda */}
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

        {/* Diagnostik */}
        {debug && (
          <div className="card mt">
            <h2 className="h2">Diagnostik</h2>
            <pre className="pre">{JSON.stringify(debug, null, 2)}</pre>
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
        .incheckad-scope .h1 { font-size: 28px; margin:0 0 4px; font-weight:700; color:#111 !important; }
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
