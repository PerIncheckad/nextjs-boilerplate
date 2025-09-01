'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type CarLookupRow = {
  regnr: string | null;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = {
  regnr: string | null;
  description: string | null;
};

function useSupabase() {
  // Standard Next.js-klient. Ingen färg/stil ändras här.
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );
  return supabase;
}

export default function CheckInForm() {
  const supabase = useSupabase();

  // ------- Form-state (ENDAST funktionslogik, ingen färg) -------
  const [rawReg, setRawReg] = useState<string>('');
  const normalizedReg = useMemo(() => rawReg.toUpperCase().trim(), [rawReg]);

  const [car, setCar] = useState<CarLookupRow | null>(null);
  const [carOk, setCarOk] = useState<boolean | null>(null); // null = ej slaget, true = hittad, false = okänd

  const [damages, setDamages] = useState<DamageRow[]>([]);
  const [loading, setLoading] = useState(false);

  // ------- Hjälpare -------
  const showUnknown = useMemo(
    () => normalizedReg.length > 0 && carOk === false,
    [normalizedReg, carOk]
  );

  // Slå upp bil + skador när reg.nr ser “vettigt” ut
  useEffect(() => {
    let cancelled = false;

    async function doLookup() {
      if (!normalizedReg) {
        setCar(null);
        setDamages([]);
        setCarOk(null);
        return;
      }

      setLoading(true);

      // 1) Bil-modell/hjul
      const { data: carRows, error: carErr } = await supabase
        .rpc('car_lookup_any', { p_regnr: normalizedReg })
        .select();

      if (cancelled) return;

      if (carErr) {
        console.error('car_lookup_any error', carErr);
        setCar(null);
        setDamages([]);
        setCarOk(false);
        setLoading(false);
        return;
      }

      const picked: CarLookupRow | null =
        Array.isArray(carRows) && carRows.length > 0
          ? {
              regnr: carRows[0].regnr ?? null,
              model: carRows[0].model ?? null,
              wheelstorage: carRows[0].wheelstorage ?? null,
              car_id: carRows[0].car_id ?? null,
            }
          : null;

      setCar(picked);
      setCarOk(!!picked);

      // 2) Befintliga skador (om bilen hittades)
      if (picked) {
        const { data: dmgRows, error: dmgErr } = await supabase
          .rpc('damages_lookup_any', { p_regnr: normalizedReg })
          .select();

        if (cancelled) return;

        if (dmgErr) {
          console.error('damages_lookup_any error', dmgErr);
          setDamages([]);
        } else {
          const list: DamageRow[] = Array.isArray(dmgRows)
            ? dmgRows.map((r: any) => ({
                regnr: r.regnr ?? null,
                description: (r.description ?? '').toString(),
              }))
            : [];
          setDamages(list);
        }
      } else {
        setDamages([]);
      }

      setLoading(false);
    }

    // Kör lookup när man skrivit 3+ tecken (svenska reg.nr är 3–7 tecken)
    if (normalizedReg.length >= 3) {
      doLookup();
    } else {
      setCar(null);
      setDamages([]);
      setCarOk(null);
    }

    return () => {
      cancelled = true;
    };
  }, [normalizedReg, supabase]);

  // ------- Dummy-submit (ingen färgändring / bara logik) -------
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const canSave = useMemo(() => {
    // Enkelt exempel: måste känna igen reg.nr
    return !!(normalizedReg && carOk);
  }, [normalizedReg, carOk]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) {
      setSaveMsg('Vänligen fyll i all information först.');
      return;
    }
    setSaving(true);
    // Dummy – här skulle riktig inskickning ske. Vi fejkar lyckat svar:
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    setSaveMsg(`Tack Bob! Incheckningen är sparad.`);
  }

  // ------- Render (enbart markup – inga färgförändringar) -------
  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        <form onSubmit={onSubmit} noValidate>
          {/* Reg.nr */}
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className="input"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Skriv reg.nr"
              value={rawReg}
              onChange={(e) => setRawReg(e.target.value.toUpperCase())}
            />
            {showUnknown && (
              <div className="reg-warning">Okänt reg.nr</div>
            )}

            <div className="muted" style={{ marginTop: 8 }}>
              <div><strong>Bilmodell:</strong> {car?.model ?? '–'}</div>
              <div><strong>Hjulförvaring:</strong> {car?.wheelstorage ?? '–'}</div>
              <div style={{ marginTop: 6 }}>
                <strong>Befintliga skador:</strong>
                <div>
                  {damages.length === 0 ? (
                    <span> –</span>
                  ) : (
                    <ul className="damage-list">
                      {damages.map((d, i) => (
                        <li key={i}>{(d.description ?? '').toString().trim() || '—'}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Plats för incheckning – din befintliga markup och klasser lämnas orörda */}
          <section className="card">
            <h2>Plats för incheckning</h2>

            {/* Ort */}
            <div className="stack-sm">
              <label className="label">Ort *</label>
              <div className="seg">
                {/* Din befintliga select/komponent för ort går här */}
                <select className="input">
                  <option>— Välj ort —</option>
                </select>
              </div>
            </div>

            {/* Station/depå */}
            <div className="stack-sm">
              <label className="label">Station / Depå *</label>
              <div className="seg">
                {/* Din befintliga select/komponent för station går här */}
                <select className="input">
                  <option>— Välj station / depå —</option>
                </select>
              </div>
            </div>

            {/* + Annan plats (fritext) – din länk/stil kvar */}
            <div className="followup">
              <a className="link" href="#" onClick={(e) => e.preventDefault()}>
                + Annan plats (fritext)
              </a>
            </div>
          </section>

          {/* Fordonsstatus – behåll din befintliga markup/stil */}
          <section className="card">
            <h2>Fordonsstatus</h2>

            <div className="stack-sm">
              <label className="label">Mätarställning *</label>
              <div className="seg">
                <input className="input" placeholder="ex. 42 180" />
                <span className="suffix muted">km</span>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Tanknivå *</label>
              <div className="seg">
                <button type="button" className="segbtn">Fulltankad</button>
                <button type="button" className="segbtn">Ej fulltankad</button>
              </div>
            </div>

            {/* … (resten av dina befintliga knappar/fält för AdBlue, Spolarvätska, Insynsskydd, Laddsladdar, Hjul) … */}
          </section>

          {/* Skador (din tidigare sektion för nya skador – markup kvar oförändrad om du hade den) */}
          <section className="card">
            <h2>Nya skador på bilen?</h2>
            <button type="button" className="btn outline">
              Lägg till skada
            </button>
          </section>

          {/* Spara */}
          <div className="stack-sm">
            <button
              type="submit"
              className="btn primary"
              disabled={!canSave || saving}
            >
              {saving ? 'Sparar…' : 'Spara incheckning'}
            </button>
            {saveMsg && (
              <div className={`alert ${saveMsg.startsWith('Tack') ? 'ok' : 'error'}`}>
                {saveMsg}
              </div>
            )}
          </div>

          {/* Diagnostik (frivilligt – ingen färgändring) */}
          <details className="debug" style={{ marginTop: 12 }}>
            <summary>Diagnostik</summary>
            <pre>
{JSON.stringify(
  {
    reg: rawReg,
    normalizedReg,
    envOk: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    carOk,
    car,
    damagesCount: damages.length,
  },
  null,
  2
)}
            </pre>
          </details>
        </form>

        <p className="muted" style={{ marginTop: 24 }}>&copy; Albarone AB 2025</p>
      </div>
    </div>
  );
}
