'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type CarRow = {
  regnr: string | null;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = { regnr: string; description: string | null };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Hjälpare: normalisera reg.nr (bara A–Z och siffror, versaler)
function normalizePlate(v: string): string {
  return (v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export default function CheckInForm() {
  // --- Form state (endast det som behövs för denna fix) ---
  const [regInput, setRegInput] = useState('');
  const normalizedReg = useMemo(() => normalizePlate(regInput), [regInput]);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [unknownReg, setUnknownReg] = useState(false);

  const [car, setCar] = useState<Pick<CarRow, 'model' | 'wheelstorage' | 'car_id'>>({
    model: null,
    wheelstorage: null,
    car_id: null,
  });

  const [knownDamages, setKnownDamages] = useState<string[]>([]);

  // --- Nya skador (bara knappen/sektionen, inga färgändringar) ---
  const [newDamages, setNewDamages] = useState<
    { id: string; text: string; files: File[] }[]
  >([]);

  // Ladda bil + skador när reg.nr ändras (debounce light)
  useEffect(() => {
    let cancelled = false;
    const plate = normalizedReg;

    // Nollställ visning om fältet är tomt
    if (!plate) {
      setLookupDone(false);
      setUnknownReg(false);
      setCar({ model: null, wheelstorage: null, car_id: null });
      setKnownDamages([]);
      return;
    }

    async function run() {
      setLookupLoading(true);
      setLookupDone(false);
      setUnknownReg(false);

      // 1) Bil-info
      const { data: carRows, error: carErr } = await supabase
        .rpc<CarRow>('car_lookup_any', { p_regnr: plate });

      if (cancelled) return;

      if (carErr) {
        // Vid fel: markera som okänt men crascha inte UI
        setUnknownReg(true);
        setCar({ model: null, wheelstorage: null, car_id: null });
        setKnownDamages([]);
        setLookupLoading(false);
        setLookupDone(true);
        return;
      }

      const first = (carRows && carRows[0]) || null;
      const found = !!first;

      setUnknownReg(!found);
      setCar({
        model: first?.model ?? null,
        wheelstorage: first?.wheelstorage ?? null,
        car_id: first?.car_id ?? null,
      });

      // 2) Skador (hämtas alltid från damages_lookup_any)
      if (found) {
        const { data: dmgRows, error: dmgErr } = await supabase
          .rpc<DamageRow>('damages_lookup_any', { p_regnr: plate });

        if (!cancelled) {
          if (!dmgErr && Array.isArray(dmgRows)) {
            const list = dmgRows
              .map((r) => (r?.description || '').trim())
              .filter(Boolean);
            setKnownDamages(list);
          } else {
            setKnownDamages([]);
          }
        }
      } else {
        setKnownDamages([]);
      }

      if (!cancelled) {
        setLookupLoading(false);
        setLookupDone(true);
      }
    }

    // liten fördröjning så vi inte slår RPC för varje tangent
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [normalizedReg]);

  // UI-hjälpare
  const damageButtonLabel =
    newDamages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada';

  function addNewDamage() {
    setNewDamages((arr) => [
      ...arr,
      { id: Math.random().toString(36).slice(2), text: '', files: [] },
    ]);
  }

  function removeNewDamage(id: string) {
    setNewDamages((arr) => arr.filter((d) => d.id !== id));
  }

  // --- Render (inga färgändringar) ---
  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        {/* Reg.nr */}
        <div className="stack">
          <label className="label">Registreringsnummer *</label>
          <input
            className="input"
            placeholder="Skriv reg.nr"
            value={regInput}
            onChange={(e) => setRegInput(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            inputMode="text"
          />
          {lookupDone && unknownReg && (
            <p className="reg-warning">Okänt reg.nr</p>
          )}

          <div className="stack-sm">
            <div><strong>Bilmodell:</strong> {car.model ?? '—'}</div>
            <div><strong>Hjulförvaring:</strong> {car.wheelstorage ?? '—'}</div>
            <div>
              <strong>Befintliga skador:</strong>{' '}
              {knownDamages.length === 0 ? (
                <span>—</span>
              ) : (
                <ul className="damage-list">
                  {knownDamages.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Plats för incheckning – (oförändrat markup-mönster) */}
        <h2>Plats för incheckning</h2>
        <div className="stack">
          <label className="label">Ort *</label>
          <select className="input">
            <option>— Välj ort —</option>
          </select>

          <label className="label">Station / Depå *</label>
          <select className="input">
            <option>— Välj station / depå —</option>
          </select>

          <button type="button" className="link">
            + Annan plats (fritext)
          </button>
        </div>

        {/* Fordonsstatus – rubrik kvar men innehåll utelämnat här (du har det redan) */}
        <h2>Fordonsstatus</h2>
        <div className="stack">
          <label className="label">Mätarställning *</label>
          <div className="grid-2">
            <input className="input" placeholder="ex. 42 180" />
            <span className="suffix muted">km</span>
          </div>

          <label className="label">Tanknivå *</label>
          <div className="seg">
            <button type="button" className="segbtn">Fulltankad</button>
            <button type="button" className="segbtn">Ej fulltankad</button>
          </div>
        </div>

        {/* Nya skador – endast knappen och enkel lista (ingen färgändring) */}
        <h2>Nya skador på bilen?</h2>
        {newDamages.map((d) => (
          <div className="card" key={d.id}>
            <div className="stack-sm">
              <label className="label">Text (obligatorisk)</label>
              <input
                className="input"
                placeholder="Beskriv skadan…"
                value={d.text}
                onChange={(e) =>
                  setNewDamages((arr) =>
                    arr.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x))
                  )
                }
              />
            </div>
            <div className="stack-sm">
              <label className="label">Lägg till bild</label>
              <input
                className="input"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  setNewDamages((arr) =>
                    arr.map((x) =>
                      x.id === d.id
                        ? { ...x, files: Array.from(e.target.files || []) }
                        : x
                    )
                  )
                }
              />
            </div>
            <div className="followups">
              <button type="button" className="btn outline" onClick={() => removeNewDamage(d.id)}>
                Ta bort skadan
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="btn link" onClick={addNewDamage}>
          {damageButtonLabel}
        </button>

        {/* Spara */}
        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn primary" type="button">
            Spara incheckning
          </button>
        </div>
      </div>
    </div>
  );
}
