'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type CarRow = {
  regnr?: string | null;
  model?: string | null;
  wheelstorage?: string | null;
  car_id?: string | null; // uuid i er DB
};

type DamageRow = {
  id?: string | number | null;
  plats?: string | null;
  typ?: string | null;
  beskrivning?: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = createClient(supabaseUrl, supabaseAnonKey);

/* ---------------------------- Hjälpfunktioner ---------------------------- */

function normalizeReg(input: string): string {
  // Versaler + ta bort mellanrum, bindestreck, punkter, backslash/underscore etc
  return input.toUpperCase().replace(/[\s\-._]/g, '');
}

// Prova flera varianter av parameternamn till RPC:er (så vi träffar rätt oavsett vad
// funktionen heter i databasen).
async function rpcTryAll<T = any>(
  fn: string,
  argValue: string | null,
  extra?: Record<string, any>
): Promise<{ data: T[] | null; error: any | null }> {
  const candidates: Record<string, any>[] = [];

  // om bara ett textargument
  if (argValue !== null) {
    candidates.push({ reg: argValue });
    candidates.push({ p_reg: argValue });
    candidates.push({ regr: argValue });
    candidates.push({ regnr: argValue });
    candidates.push({ regrn_norm: argValue });
    candidates.push({ text: argValue });
    candidates.push({ q: argValue });
  }

  // om det finns extra (t.ex. car_id)
  if (extra) {
    candidates.push(extra);
  }

  // Prova tills något funkar
  for (const args of candidates) {
    try {
      const { data, error } = await sb.rpc(fn, args);
      if (error) continue;
      if (data && Array.isArray(data)) {
        return { data, error: null };
      }
    } catch (_) {
      // testa nästa kandidat
    }
  }
  return { data: null, error: new Error(`No matching arg pattern for ${fn}`) };
}

/* --------------------------------- UI ----------------------------------- */

export default function CheckInForm() {
  // Formtillstånd (endast det som behövs för denna vända)
  const [rawReg, setRawReg] = useState('');
  const normalizedReg = useMemo(() => normalizeReg(rawReg), [rawReg]);

  const [lookupTried, setLookupTried] = useState(false);
  const [car, setCar] = useState<CarRow | null>(null);
  const [damages, setDamages] = useState<DamageRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Bilinfo
  const model = car?.model ?? null;
  const wheelstorage = car?.wheelstorage ?? null;
  const carId = car?.car_id ?? null;

  // slå upp när regnumret blir “rimligt” (minst 3 tecken) eller när man lämnar fältet
  useEffect(() => {
    let cancelled = false;

    async function run() {
      // nollställ visning om tomt
      if (!normalizedReg || normalizedReg.length < 3) {
        setCar(null);
        setDamages([]);
        setLookupTried(false);
        return;
      }

      setLoading(true);
      setLookupTried(true);

      // 1) car_lookup_any(reg)
      let picked: CarRow | null = null;

      {
        const { data } = await rpcTryAll<CarRow>('car_lookup_any', normalizedReg);
        if (data && data.length > 0) {
          // välj första
          picked = data[0] ?? null;
        }
      }

      // (Valfri fallback: om ni också har en vy att slå mot – kommenterad)
      // if (!picked) {
      //   const { data } = await sb.from('checkin_lookup')
      //       .select('regnr,model,wheelstorage,car_id')
      //       .eq('regnr_norm', normalizedReg)
      //       .limit(1);
      //   if (data && data.length) picked = data[0] as CarRow;
      // }

      // 2) Skador (om vi hittade bil eller vill försöka på regnorm)
      let dmg: DamageRow[] = [];
      if (picked?.car_id) {
        // Först: prova variant som tar car_id
        const r1 = await rpcTryAll<DamageRow>('damages_lookup_any', null, {
          car_id: picked.car_id,
        });
        if (r1.data) dmg = r1.data;

        // Fallback: prova variant som tar regnorm
        if (dmg.length === 0) {
          const r2 = await rpcTryAll<DamageRow>('damages_lookup_any', normalizedReg);
          if (r2.data) dmg = r2.data;
        }
      } else {
        // Enda chans: variant som tar regnorm
        const r3 = await rpcTryAll<DamageRow>('damages_lookup_any', normalizedReg);
        if (r3.data) dmg = r3.data;
      }

      if (!cancelled) {
        setCar(picked);
        setDamages(dmg);
        setLoading(false);
      }
    }

    // kör bara lookup om användaren faktiskt matat något (3+ tecken)
    if (normalizedReg.trim().length >= 3) {
      run();
    } else {
      setCar(null);
      setDamages([]);
      setLookupTried(false);
    }

    return () => {
      cancelled = true;
    };
  }, [normalizedReg]);

  const unknown = lookupTried && !loading && !car;

  /* -------------------------------- Render ------------------------------- */

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        {/* Regnr + uppslag */}
        <div className="card">
          <label className="label">Registreringsnummer *</label>
          <input
            className={`input ${unknown ? 'invalid' : ''}`}
            value={rawReg}
            placeholder="Skriv reg.nr"
            onChange={(e) => {
              // konvertera till versaler direkt när man skriver
              const v = e.target.value.toUpperCase();
              setRawReg(v);
            }}
          />
          {unknown && <p className="reg-warning">Okänt reg.nr</p>}

          <div className="info">
            <div><span className="muted">Bilmodell:</span> {model ?? '—'}</div>
            <div><span className="muted">Hjulförvaring:</span> {wheelstorage ?? '—'}</div>
            <div>
              <span className="muted">Befintliga skador:</span>{' '}
              {damages.length === 0 ? '—' : null}
            </div>
            {damages.length > 0 && (
              <ul className="damage-list">
                {damages.map((d, i) => {
                  const parts = [d.plats, d.typ, d.beskrivning].filter(Boolean).join(' — ');
                  return <li key={String(d.id ?? i)}>{parts}</li>;
                })}
              </ul>
            )}
          </div>
        </div>

        {/* -- Resten av formuläret (oförändrat – färgerna återställda i CSS nedan) -- */}
        <div className="section">
          <h2>Plats för incheckning</h2>

          <label className="label">Ort *</label>
          <select className="input">
            <option>— Välj ort —</option>
          </select>

          <label className="label">Station / Depå *</label>
          <select className="input" disabled>
            <option>Välj ort först</option>
          </select>

          <a className="link" href="#" onClick={(e) => e.preventDefault()}>
            + Annan plats (fritext)
          </a>
        </div>

        <div className="section">
          <h2>Fordonsstatus</h2>

          <label className="label">Mätarställning *</label>
          <div className="grid-2">
            <input className="input" placeholder="ex. 42 180" />
            <div className="suffix">km</div>
          </div>

          <label className="label">Tanknivå *</label>
          <div className="seg">
            <button type="button" className="segbtn">Fulltankad</button>
            <button type="button" className="segbtn">Ej fulltankad</button>
          </div>

          <label className="label">AdBlue OK? *</label>
          <div className="seg">
            <button type="button" className="segbtn">Ja</button>
            <button type="button" className="segbtn">Nej</button>
          </div>

          <label className="label">Spolarvätska OK? *</label>
          <div className="seg">
            <button type="button" className="segbtn">Ja</button>
            <button type="button" className="segbtn">Nej</button>
          </div>

          <label className="label">Insynsskydd OK? *</label>
          <div className="seg">
            <button type="button" className="segbtn">Ja</button>
            <button type="button" className="segbtn">Nej</button>
          </div>

          <label className="label">Antal laddsladdar *</label>
          <div className="seg">
            <button type="button" className="segbtn">0</button>
            <button type="button" className="segbtn">1</button>
            <button type="button" className="segbtn">2</button>
          </div>

          <label className="label">Hjul som sitter på *</label>
          <div className="seg">
            <button type="button" className="segbtn">Sommarhjul</button>
            <button type="button" className="segbtn">Vinterhjul</button>
          </div>
        </div>

        <div className="section">
          <h2>Nya skador på bilen?</h2>
          <button className="btn outline" type="button">Lägg till skada</button>
        </div>

        <div className="section">
          <button className="btn primary" type="button" disabled>
            Spara incheckning
          </button>
          <div className="thumbs">
            <small className="muted">© Albarone AB 2025</small>
          </div>
        </div>
      </div>

      {/* ------------------------------ Ljus ”99%”-stil ------------------------------ */}
      <style jsx>{`
        .page { padding: 16px; background: #f6f7f9; min-height: 100vh; }
        .container { max-width: 720px; margin: 0 auto; }
        h1 { font-size: 22px; margin: 6px 0 10px; }
        h2 { font-size: 18px; margin: 18px 0 8px; }
        .muted { color: #6b7280; }
        .label { display: block; font-weight: 600; margin: 10px 0 6px; }
        .input {
          width: 100%;
          padding: 12px 12px;
          border-radius: 10px;
          border: 1px solid #d1d5db;
          background: #fff;
          font-size: 16px;
        }
        .input.invalid { border-color: #ef4444; background: #fff; }
        .suffix { align-self: center; margin-left: 8px; color: #6b7280; }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
        }
        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px;
          margin: 12px 0;
        }
        .info { margin-top: 6px; line-height: 1.4; }
        .damage-list { margin: 6px 0 0 18px; }
        .reg-warning { margin-top: 6px; color: #d62828; font-weight: 600; }

        .section {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px;
          margin: 16px 0;
        }

        .seg { display: flex; gap: 8px; flex-wrap: wrap; }
        .segbtn {
          border: 1px solid #d1d5db;
          background: #fff;
          border-radius: 10px;
          padding: 10px 12px;
          font-weight: 600;
        }

        .btn {
          padding: 12px 14px;
          border: 1px solid #cfd6e4;
          border-radius: 12px;
          background: #fff;
          width: 100%;
          font-weight: 700;
          margin-top: 10px;
        }
        .btn.primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
        .btn.outline { background: #fff; color: #1d4ed8; border-color: #1d4ed8; }

        .link {
          display: inline-block;
          margin-top: 10px;
          text-decoration: none;
          color: #1d4ed8;
        }

        .thumbs { display: flex; justify-content: flex-end; margin-top: 10px; }
      `}</style>
    </div>
  );
}
