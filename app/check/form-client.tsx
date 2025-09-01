'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
// Om du redan har en supabase util, ersätt importen nedan med din befintliga
import { createClient } from '@supabase/supabase-js';

type CarPick = {
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = { id?: string; text: string; files: File[]; previews: string[] };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnon);

// ---------- Hjälp ----------
const normalizeReg = (raw: string) =>
  raw.toUpperCase().replace(/[^\p{L}\p{N}]/gu, ''); // versaler, ta bort mellanrum/streck/punkt

const ORTER: Record<string, string[]> = {
  'MALMÖ': [
    'Huvudstation Malmö Jägersro',
    'Ford Malmö',
    'Mechanum',
    'Malmö Automera',
    'Mercedes Malmö',
    'Werksta St Bernstorps',
    'Werksta Malmö Hamn',
    'Hedbergs Malmö',
    'Hedin Automotive Burlöv',
    'Sturup',
  ],
  'HELSINGBORG': [
    'Huvudstation Helsingborg',
    'HBSC Helsingborg',
    'Ford Helsingborg',
    'Transport Helsingborg',
    'S. Jönsson',
    'BMW Helsingborg',
    'KIA Helsingborg',
    'Euromaster Helsingborg',
    'B/S Klippan',
    'B/S Munka-Ljungby',
    'B/S Helsingborg',
    'Werksta Helsingborg',
    'Båstad',
  ],
  'ÄNGELHOLM': [
    'Huvudstation Ängelholm',
    'FORD Ängelholm',
    'Mekonomen Ängelholm',
    'Flyget Ängelholm',
  ],
  'HALMSTAD': [
    'Huvudstation Halmstad',
    'Flyget Halmstad',
    'KIA Halmstad',
    'FORD Halmstad',
  ],
  'FALKENBERG': ['Huvudstation Falkenberg'],
  'TRELLEBORG': ['Huvudstation Trelleborg'],
  'VARBERG': [
    'Huvudstation Varberg',
    'Ford Varberg',
    'Hedin Automotive Varberg',
    'Sällstorp lack plåt',
    'Finnveden plåt',
  ],
};

export default function CheckInForm() {
  // --- fält ---
  const [rawReg, setRawReg] = useState('');
  const reg = normalizeReg(rawReg);
  const [car, setCar] = useState<CarPick | null>(null);
  const [known, setKnown] = useState<boolean | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);

  // Plats
  const [city, setCity] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [useOtherPlace, setUseOtherPlace] = useState(false);
  const [otherPlace, setOtherPlace] = useState('');

  // Fordonsstatus
  const [odometer, setOdometer] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState('');
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null); // Insynsskydd
  const [cables, setCables] = useState<0 | 1 | 2>(0);
  const [tyres, setTyres] = useState<'Sommarhjul' | 'Vinterhjul' | ''>('');

  // Nya skador
  const [newDamages, setNewDamages] = useState<DamageRow[]>([]);
  const [showAddFirstDamageBtn, setShowAddFirstDamageBtn] = useState(true);

  // UI
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // ---------- Ladda fordonsdata ----------
  useEffect(() => {
    setSaveOk(false);
    setSaveError(null);

    if (reg.length < 3) {
      setCar(null);
      setKnown(null);
      setExistingDamages([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 1) Hämta bil/grunddata
        const { data: rows, error } = await supabase.rpc('car_lookup_any', {
          regnr: reg,
        });
        if (error) throw error;

        const pick: CarPick | null =
          rows && rows.length > 0
            ? {
                regnr: rows[0].regnr,
                model: rows[0].model ?? null,
                wheelstorage: rows[0].wheelstorage ?? null,
                car_id: rows[0].car_id ?? null,
              }
            : null;

        if (!cancelled) {
          setCar(pick);
          setKnown(!!pick);
        }

        // 2) Befintliga skador
        if (pick?.car_id) {
          const { data: drows, error: derr } = await supabase.rpc(
            'damages_lookup_any',
            { car_id: pick.car_id, regnr: reg }
          );
          if (derr) throw derr;

          const texts =
            (drows as any[])?.map((r) => (r.desc ?? r.description ?? r.text ?? '').toString()).filter(Boolean) ??
            [];
          if (!cancelled) setExistingDamages(texts);
        } else {
          // fallback via regnr
          const { data: drows2 } = await supabase.rpc('damages_lookup_any', {
            car_id: null,
            regnr: reg,
          });
          const texts =
            (drows2 as any[])?.map((r) => (r.desc ?? r.description ?? r.text ?? '').toString()).filter(Boolean) ??
            [];
          if (!cancelled) setExistingDamages(texts);
        }
      } catch (e) {
        if (!cancelled) {
          setCar(null);
          setKnown(false);
          setExistingDamages([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reg]);

  // ---------- Nya skador helpers ----------
  const addDamage = () => {
    setShowAddFirstDamageBtn(false);
    setNewDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  };
  const removeDamage = (idx: number) => {
    setNewDamages((d) => d.filter((_, i) => i !== idx));
    if (newDamages.length <= 1) setShowAddFirstDamageBtn(true);
  };
  const setDamageText = (idx: number, text: string) => {
    setNewDamages((d) => {
      const c = [...d];
      c[idx] = { ...c[idx], text };
      return c;
    });
  };
  const addDamageFiles = (idx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const previews = list.map((f) => URL.createObjectURL(f));
    setNewDamages((d) => {
      const c = [...d];
      c[idx] = {
        ...c[idx],
        files: [...c[idx].files, ...list],
        previews: [...c[idx].previews, ...previews],
      };
      return c;
    });
  };
  const removeDamageFile = (dIdx: number, fIdx: number) => {
    setNewDamages((d) => {
      const c = [...d];
      const prev = [...c[dIdx].previews];
      const files = [...c[dIdx].files];
      prev.splice(fIdx, 1);
      files.splice(fIdx, 1);
      c[dIdx] = { ...c[dIdx], previews: prev, files };
      return c;
    });
  };

  // ---------- Validering ----------
  const litersValid = useMemo(() => {
    if (tankFull !== false) return true;
    if (!liters) return false;
    // tillåt 0–4 siffror, eventuellt komma+en siffra (svenskt kommatecken)
    return /^\d{1,4}([,]\d{1})?$/.test(liters);
  }, [tankFull, liters]);

  const canSave = useMemo(() => {
    if (!reg) return false;

    // Plats
    if (!useOtherPlace) {
      if (!city) return false;
      if (!station) return false;
    } else {
      if (!otherPlace.trim()) return false;
    }

    // Fordonsstatus
    if (!odometer.trim()) return false;
    if (tankFull === null) return false;
    if (tankFull === false) {
      if (!litersValid) return false;
      if (!fuelType) return false;
    }
    if (adBlueOk === null || spolarOk === null || privacyOk === null) return false;
    if (!tyres) return false;

    // Skador (om rader finns måste text finnas)
    for (const d of newDamages) {
      if (!d.text.trim()) return false;
    }
    return true;
  }, [
    reg,
    city,
    station,
    useOtherPlace,
    otherPlace,
    odometer,
    tankFull,
    litersValid,
    fuelType,
    adBlueOk,
    spolarOk,
    privacyOk,
    tyres,
    newDamages,
  ]);

  // ---------- Spara (dummy) ----------
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveOk(false);
    setSaveError(null);
    if (!canSave) {
      setSaveError('Vänligen fyll i all information först.');
      return;
    }
    try {
      setSaving(true);
      // Här skulle riktig spar-logik ligga. Vi fejkar lyckat svar:
      await new Promise((r) => setTimeout(r, 600));
      setSaving(false);
      setSaveOk(true);
      setSaveError(null);
    } catch (err: any) {
      setSaving(false);
      setSaveOk(false);
      setSaveError('Kunde inte spara, försök igen.');
    }
  };

  // ---------- Render ----------
  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">
          Inloggad: <strong>Bob</strong>
        </p>

        {/* REG */}
        <form onSubmit={onSubmit} noValidate>
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              value={rawReg}
              onChange={(e) => setRawReg(e.target.value)}
              placeholder="Skriv reg.nr"
              className={`input ${known === false ? 'invalid' : ''}`}
            />
            {known === false && <p className="reg-warning">Okänt reg.nr</p>}

            <div className="facts">
              <div>
                <span className="meta">Bilmodell:</span>{' '}
                {car?.model ? car.model : <span className="dim">--</span>}
              </div>
              <div>
                <span className="meta">Hjulförvaring:</span>{' '}
                {car?.wheelstorage ? car.wheelstorage : <span className="dim">--</span>}
              </div>
              <div>
                <span className="meta">Befintliga skador:</span>{' '}
                {existingDamages.length === 0 ? (
                  <span className="dim">–</span>
                ) : (
                  <ul className="damage-list">
                    {existingDamages.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* PLATS */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            {!useOtherPlace && (
              <>
                <label className="label">Ort *</label>
                <div className="select">
                  <select
                    value={city}
                    onChange={(e) => {
                      const c = e.target.value;
                      setCity(c);
                      setStation('');
                    }}
                  >
                    <option value="">— Välj ort —</option>
                    {Object.keys(ORTER).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="label">Station / Depå *</label>
                <div className="select">
                  <select
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                    disabled={!city}
                  >
                    <option value="">
                      {city ? '— Välj station / depå —' : 'Välj ort först'}
                    </option>
                    {(ORTER[city] ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {useOtherPlace && (
              <>
                <label className="label">Annan plats (fritext) *</label>
                <input
                  className="input"
                  placeholder="Skriv platsbeskrivning"
                  value={otherPlace}
                  onChange={(e) => setOtherPlace(e.target.value)}
                />
              </>
            )}

            <button
              type="button"
              className="link"
              onClick={() => {
                setUseOtherPlace((v) => !v);
                setCity('');
                setStation('');
                setOtherPlace('');
              }}
            >
              {useOtherPlace ? '↩︎ Välj från listan' : '+ Annan plats (fritext)'}
            </button>
          </div>

          {/* FORDONSSTATUS */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <label className="label">Mätarställning *</label>
            <div className="grid-2">
              <input
                className="input"
                inputMode="numeric"
                placeholder="ex. 42 180"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <div className="suffix">km</div>
            </div>

            <div className="stack-sm">
              <label className="label">Tanknivå *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${tankFull === true ? 'on' : ''}`}
                  onClick={() => {
                    setTankFull(true);
                    setLiters('');
                    setFuelType(null);
                  }}
                >
                  Fulltankad
                </button>
                <button
                  type="button"
                  className={`segbtn ${tankFull === false ? 'on' : ''}`}
                  onClick={() => setTankFull(false)}
                >
                  Ej fulltankad
                </button>
              </div>
            </div>

            {tankFull === false && (
              <>
                <div className="followups">
                  <div className="stack-sm">
                    <label className="label">Antal liter påfyllda *</label>
                    <input
                      className={`input narrow ${!litersValid ? 'invalid' : ''}`}
                      inputMode="decimal"
                      placeholder="ex. 7,5"
                      value={liters}
                      onChange={(e) => {
                        const v = e.target.value.replace('.', ',');
                        if (/^\d{0,4}([,]\d{0,1})?$/.test(v)) setLiters(v);
                      }}
                    />
                  </div>

                  <div className="stack-sm">
                    <label className="label">Bränsletyp *</label>
                    <div className="seg">
                      <button
                        type="button"
                        className={`segbtn ${fuelType === 'Bensin' ? 'on' : ''}`}
                        onClick={() => setFuelType('Bensin')}
                      >
                        Bensin
                      </button>
                      <button
                        type="button"
                        className={`segbtn ${fuelType === 'Diesel' ? 'on' : ''}`}
                        onClick={() => setFuelType('Diesel')}
                      >
                        Diesel
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="stack-sm">
              <label className="label">AdBlue OK? *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${adBlueOk === true ? 'on' : ''}`}
                  onClick={() => setAdBlueOk(true)}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`segbtn ${adBlueOk === false ? 'on' : ''}`}
                  onClick={() => setAdBlueOk(false)}
                >
                  Nej
                </button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Spolarvätska OK? *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${spolarOk === true ? 'on' : ''}`}
                  onClick={() => setSpolarOk(true)}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`segbtn ${spolarOk === false ? 'on' : ''}`}
                  onClick={() => setSpolarOk(false)}
                >
                  Nej
                </button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Insynsskydd OK? *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${privacyOk === true ? 'on' : ''}`}
                  onClick={() => setPrivacyOk(true)}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`segbtn ${privacyOk === false ? 'on' : ''}`}
                  onClick={() => setPrivacyOk(false)}
                >
                  Nej
                </button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Antal laddsladdar *</label>
              <div className="seg">
                {([0, 1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`segbtn ${cables === n ? 'on' : ''}`}
                    onClick={() => setCables(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Hjul som sitter på *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${tyres === 'Sommarhjul' ? 'on' : ''}`}
                  onClick={() => setTyres('Sommarhjul')}
                >
                  Sommarhjul
                </button>
                <button
                  type="button"
                  className={`segbtn ${tyres === 'Vinterhjul' ? 'on' : ''}`}
                  onClick={() => setTyres('Vinterhjul')}
                >
                  Vinterhjul
                </button>
              </div>
            </div>
          </div>

          {/* NYA SKADOR */}
          <h2>Nya skador på bilen?</h2>

          {showAddFirstDamageBtn && (
            <button type="button" className="btn outline" onClick={addDamage}>
              Lägg till skada
            </button>
          )}

          {newDamages.map((d, i) => (
            <div key={i} className="card warn">
              <div className="row-header">
                <strong>Skada {i + 1}</strong>
                <button
                  type="button"
                  className="link danger"
                  onClick={() => removeDamage(i)}
                >
                  Ta bort
                </button>
              </div>

              <label className="label">Text (obligatorisk)</label>
              <input
                className={`input ${!d.text.trim() ? 'invalid' : ''}`}
                placeholder="Beskriv skadan…"
                value={d.text}
                onChange={(e) => setDamageText(i, e.target.value)}
              />

              <div className="stack-sm">
                <label className="label">Bilder</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  // OBS: ingen capture => mobil låter välja kamera ELLER galleri
                  onChange={(e) => addDamageFiles(i, e.target.files)}
                />
                <div className="thumbs">
                  {d.previews.map((src, idx) => (
                    <div key={idx} className="thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Skadebild ${idx + 1}`} />
                      <button
                        type="button"
                        className="link danger small"
                        onClick={() => removeDamageFile(i, idx)}
                      >
                        Ta bort bild
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" className="btn outline" onClick={addDamage}>
                Lägg till ytterligare skada
              </button>
            </div>
          ))}

          {/* Fel/OK + Spara */}
          {saveError && <div className="alert error">{saveError}</div>}
          {saveOk && (
            <div className="alert ok">
              Tack Bob! Incheckningen sparades (demo).
            </div>
          )}

          <button className="btn primary" disabled={!canSave || saving}>
            {saving ? 'Sparar…' : 'Spara incheckning'}
          </button>
        </form>

        <p className="copy">© Albarone AB 2025</p>
      </div>

      <style jsx>{`
        .page {
          background: #f6f7f9;
          min-height: 100vh;
          padding: 16px;
        }
        .container {
          max-width: 720px;
          margin: 0 auto;
        }
        h1 {
          font-size: 28px;
          margin: 4px 0 2px 0;
          font-weight: 700;
        }
        h2 {
          font-size: 18px;
          margin: 18px 0 8px 0;
          font-weight: 700;
        }
        .muted {
          color: #6b7280;
          margin-bottom: 16px;
        }
        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 12px;
        }
        .card.warn {
          border-color: #ffe6bb;
          box-shadow: 0 0 0 3px #fff4d6 inset;
        }
        .row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .label {
          font-weight: 600;
          font-size: 14px;
          margin: 8px 0 6px 0;
        }
        .meta {
          font-weight: 600;
        }
        .dim {
          color: #9ca3af;
        }
        .facts {
          display: grid;
          gap: 4px;
          margin-top: 6px;
        }
        .damage-list {
          list-style: disc;
          padding-left: 18px;
          margin: 6px 0 0 0;
        }
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fff;
        }
        .input.invalid {
          border-color: #ef4444;
          background: #fff6f6;
        }
        .reg-warning {
          margin-top: 6px;
          color: #dc2626;
          font-weight: 600;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
        }
        .suffix {
          color: #6b7280;
          font-weight: 600;
          padding-right: 6px;
        }
        .seg {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .segbtn {
          border: 1px solid #d1d5db;
          background: #fff;
          border-radius: 8px;
          padding: 10px 14px;
          font-weight: 600;
        }
        .segbtn.on {
          background: #e8f0ff;
          border-color: #3b82f6;
          color: #1d4ed8;
          box-shadow: 0 0 0 1px #3b82f6 inset;
        }
        .followups {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 8px;
        }
        .narrow {
          max-width: 140px;
        }
        .select select {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fff;
        }
        .link {
          margin-top: 10px;
          background: none;
          border: none;
          color: #1d4ed8;
          padding: 0;
          font-weight: 600;
        }
        .link.danger {
          color: #b91c1c;
        }
        .link.small {
          font-size: 12px;
          font-weight: 600;
        }
        .btn {
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #cfd6e4;
          background: #fff;
          font-weight: 700;
        }
        .btn.primary {
          width: 100%;
          margin-top: 14px;
          background: #1d4ed8;
          color: #fff;
          border-color: #1d4ed8;
        }
        .btn.primary:disabled {
          background: #94a3b8;
          border-color: #94a3b8;
        }
        .btn.outline {
          background: #fff;
        }
        .alert {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
        }
        .alert.error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .alert.ok {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .thumbs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .thumb {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 6px;
          background: #fff;
          width: 110px;
        }
        .thumb img {
          display: block;
          width: 100%;
          height: 70px;
          object-fit: cover;
          border-radius: 6px;
          margin-bottom: 4px;
        }
        .copy {
          color: #9ca3af;
          text-align: center;
          margin-top: 18px;
          font-size: 12px;
        }

        @media (max-width: 520px) {
          .followups {
            grid-template-columns: 1fr;
          }
          .narrow {
            max-width: 180px;
          }
        }
      `}</style>
    </div>
  );
}
