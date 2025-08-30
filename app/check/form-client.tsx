'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';

/* Supabase – initiera endast i browsern */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

function getSupabaseClient() {
  if (typeof window === 'undefined') return null; // aldrig på server
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}
const supabase = getSupabaseClient();

/* Typer */
type DamageEntry = { id: string; plats: string; typ: string; beskrivning?: string };
type CanonicalCar = { regnr: string; model: string; wheelStorage: string; skador: DamageEntry[] };
type DebugStep = { name: string; ok?: boolean; rows?: number; error?: string; picked?: any };
type DebugLog = { envOk: boolean; steps: DebugStep[]; rawInput: string; normalizedInput: string };

/* Normalisering av reg.nr */
function normalizeReg(s: string) {
  return (s ?? '').toUpperCase().normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\s\-_.]/g, '').trim();
}

/* Uppslag via RPC (kräver att du körde SQL:et som skapar car_lookup_any & damages_lookup_any) */
async function fetchCarAndDamages(regInput: string): Promise<{ car: CanonicalCar | null; log: DebugLog }> {
  const norm = normalizeReg(regInput);
  const log: DebugLog = { envOk: Boolean(supabase), steps: [], rawInput: regInput, normalizedInput: norm };

  if (!supabase) {
    log.steps.push({ name: 'init', error: 'Supabase saknas (kolla NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)' });
    return { car: null, log };
  }

  const { data: carRows, error: carErr } = await supabase.rpc('car_lookup_any', { p_reg: regInput });
  if (carErr) {
    log.steps.push({ name: 'rpc:car_lookup_any', error: carErr.message });
    return { car: null, log };
  }
  const carRow = Array.isArray(carRows) && carRows.length ? carRows[0] : null;
  log.steps.push({ name: 'rpc:car_lookup_any', ok: Boolean(carRow), rows: Array.isArray(carRows) ? carRows.length : 0, picked: carRow || undefined });
  if (!carRow) return { car: null, log };

  const { data: dmgRows, error: dmgErr } = await supabase.rpc('damages_lookup_any', {
    p_car_id: carRow.car_id ?? null,
    p_reg: carRow.regnr ?? regInput,
  });
  if (dmgErr) log.steps.push({ name: 'rpc:damages_lookup_any', error: dmgErr.message });

  const skador: DamageEntry[] = (Array.isArray(dmgRows) ? dmgRows : []).map((d: any, i: number) => ({
    id: String(d?.id ?? i + 1),
    plats: (d?.plats && String(d.plats).trim()) || '--',
    typ: (d?.typ && String(d.typ).trim()) || '--',
    beskrivning: d?.beskrivning ? String(d.beskrivning) : undefined,
  }));

  const car: CanonicalCar = {
    regnr: carRow.regnr || regInput,
    model: (carRow.model && String(carRow.model).trim()) || '--',
    wheelStorage:
      (carRow.wheelstorage && String(carRow.wheelstorage).trim()) ||
      (carRow.wheelStorage && String(carRow.wheelStorage).trim()) ||
      '--',
    skador,
  };

  return { car, log };
}

/* Komponent */
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
    setCar(found);
    setDebug(log);
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
              <p className="error" role="alert">Supabase ej konfigurerat (env-nycklar saknas).</p>
            )}
          </div>

          {/* Bilinfo + skador – bara när bil finns */}
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

        {/* Övrigt UI (placeholder) */}
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

      {/* Skopad ljus stil */}
      <style jsx global>{`
        .incheckad-scope { all: initial; display:block; }
        .incheckad-scope, .incheckad-scope * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important; }
        .incheckad-scope .page { min-height: 100dvh; background:#ffffff !important; color:#111 !important; }
        .incheckad-scope .container { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
        .incheckad-scope .h1 { font-size: 28px; margin:0 0 4px; font-weight:700; color:#111 !important; }
        .incheckad-scope .h2 { font-size: 18px; margin:0 0 8px; font-weight:700; color:#111 !important; }
        .incheckad-scope .p { margin:0 0 16px; color:#111 !important; }
        .incheckad-scope .card { background:#fff !important; border:1px solid #E5E7EB !important; border-radius:16px !important; padding:16px !important; box-shadow:0 1px 2px rgba(0,0,0,.04) !important; }
        .incheckad-scope .stack-sm > * + * { margin-top:8px; }
        .incheckad-scope .stack-lg > * + * { margin-top:16px; }
        .incheckad-scope .label { font-size:14px; font-weight:600; color:#111 !important; }
        .incheckad-scope .input { width:100%; padding:10px 12px !important; border-radius:12px !important; border:1px solid #D1D5DB !important; background:#fff !important; color:#111 !important; outline:none !important; }
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
