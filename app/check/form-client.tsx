'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import { createClient } from '@supabase/supabase-js';

// ⬇️ Justera vid behov: om du redan har en wrapper (t.ex. '@/lib/supabaseClient'), importera den istället
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type PickedCar = {
  car_id: string | null;
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
};

type DamageRow = { regnr: string; description: string };

type NewDamage = {
  text: string;
  files: File[];
};

export default function CheckInForm() {
  // --------- Regnr / lookup -----------
  const [rawReg, setRawReg] = useState('');
  const normalizedReg = useMemo(
    () => rawReg.replace(/\s+/g, '').toUpperCase(),
    [rawReg]
  );

  const [picked, setPicked] = useState<PickedCar | null>(null);
  const [known, setKnown] = useState<boolean | null>(null); // null=ej slagit ännu, true=känd, false=okänd
  const [damageList, setDamageList] = useState<string[]>([]);

  // --------- Plats ---------------------
  const [ort, setOrt] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [showOtherPlace, setShowOtherPlace] = useState(false);
  const [otherPlace, setOtherPlace] = useState('');

  // --------- Fordonsstatus -------------
  const [odometer, setOdometer] = useState<string>('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState<string>(''); // decimal med komma
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | null>(null);

  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacy, setPrivacy] = useState<boolean | null>(null); // Insynsskydd

  const [cables, setCables] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'Sommarhjul' | 'Vinterhjul' | null>(null);

  // --------- Nya skador ----------------
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);

  // --------- UI / status ---------------
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveWarn, setSaveWarn] = useState<string | null>(null);

  // ======== Lookup: bil + skador =========
  useEffect(() => {
    let cancelled = false;

    async function doLookup() {
      if (!normalizedReg) {
        setPicked(null);
        setDamageList([]);
        setKnown(null);
        return;
      }

      // Bil
      const { data: carRows, error: carErr } = await supabase
        .rpc('car_lookup_any', { p_regnr: normalizedReg });

      if (cancelled) return;

      if (carErr) {
        setPicked(null);
        setKnown(false);
        setDamageList([]);
        return;
      }

      if (carRows && carRows.length > 0) {
        const r = carRows[0] as any;
        setPicked({
          car_id: r.car_id ?? null,
          regnr: r.regnr ?? normalizedReg,
          model: r.model ?? null,
          wheelstorage: r.wheelstorage ?? null,
        });
        setKnown(true);
      } else {
        setPicked(null);
        setKnown(false);
      }

      // Skador
      const { data: dmgRows, error: dmgErr } = await supabase
        .rpc('damages_lookup_any', { p_regnr: normalizedReg });

      if (cancelled) return;

      if (dmgErr) {
        setDamageList([]);
        return;
      }

      const list = (dmgRows ?? [])
        .map((d: DamageRow) => (d?.description ?? '').trim())
        .filter(Boolean);

      setDamageList(list);
    }

    doLookup();

    return () => { cancelled = true; };
  }, [normalizedReg]);

  // ======== Validering ===================
  const litersValid = useMemo(() => {
    if (tankFull !== false) return true;     // bara relevant om ej fulltankad
    if (!liters) return false;
    // ersätt ev. punkt med komma, tillåt 0–4 siffror + , + 1 siffra
    const v = liters.replace('.', ',');
    return /^\d{1,4}(,\d)?$/.test(v);
  }, [tankFull, liters]);

  const canSave = useMemo(() => {
    if (!normalizedReg) return false;

    // plats
    if (!showOtherPlace) {
      if (!ort || !station) return false;
    } else {
      if (!otherPlace.trim()) return false;
    }

    // status
    if (!odometer.trim()) return false;
    if (tankFull === null) return false;
    if (tankFull === false) {
      if (!litersValid) return false;
      if (!fuelType) return false;
    }
    if (adBlueOk === null || spolarOk === null || privacy === null) return false;
    if (cables === null) return false;
    if (!wheelsOn) return false;

    return true;
  }, [
    normalizedReg, showOtherPlace, ort, station, otherPlace,
    odometer, tankFull, litersValid, fuelType, adBlueOk, spolarOk, privacy, cables, wheelsOn
  ]);

  // ======== Nya skador – helpers =========
  function addDamage() {
    setNewDamages((prev) => [...prev, { text: '', files: [] }]);
  }
  function updateDamageText(idx: number, v: string) {
    setNewDamages((prev) => prev.map((d, i) => i === idx ? { ...d, text: v } : d));
  }
  function addDamageFiles(idx: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    setNewDamages((prev) => prev.map((d, i) => i === idx ? { ...d, files: [...d.files, ...Array.from(files)] } : d));
  }
  function removeDamageFile(idx: number, fidx: number) {
    setNewDamages((prev) => prev.map((d, i) => i === idx ? { ...d, files: d.files.filter((_, j) => j !== fidx) } : d));
  }

  // ======== Submit (dummy) ===============
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveOk(null);
    setSaveWarn(null);

    if (!canSave) {
      setSaveWarn('Vänligen fyll i all information först.');
      return;
    }

    setSaving(true);
    try {
      // Dummy: simulera lyckad incheckning
      await new Promise((r) => setTimeout(r, 500));
      setSaveOk(`Tack Bob! Incheckningen för ${normalizedReg} är sparad.`);
      // ev. nollställ delar om du vill
    } finally {
      setSaving(false);
    }
  }

  // ======== UI ===========================
  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        <form onSubmit={onSubmit}>

          {/* REGNR */}
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className={`input ${known === false ? 'invalid' : ''}`}
              placeholder="Skriv reg.nr"
              value={rawReg}
              onChange={(e) => setRawReg(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
            />
            {known === false && <p className="reg-warning">Okänt reg.nr</p>}

            <div className="meta">
              <div><strong>Bilmodell:</strong> {picked?.model || '—'}</div>
              <div><strong>Hjulförvaring:</strong> {picked?.wheelstorage || '—'}</div>
              <div><strong>Befintliga skador:</strong></div>
              {damageList.length === 0 ? (
                <div className="muted">—</div>
              ) : (
                <ul className="damage-list">
                  {damageList.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          </div>

          {/* PLATS */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            {!showOtherPlace && (
              <>
                <label className="label">Ort *</label>
                <select className="input" value={ort} onChange={(e) => { setOrt(e.target.value); setStation(''); }}>
                  <option value="">— Välj ort —</option>
                  <option>MALMÖ</option>
                  <option>HELSINGBORG</option>
                  <option>ÄNGELHOLM</option>
                  <option>HALMSTAD</option>
                  <option>FALKENBERG</option>
                  <option>TRELLEBORG</option>
                  <option>VARBERG</option>
                  <option>LUND</option>
                </select>

                <label className="label">Station / Depå *</label>
                <select className="input" value={station} onChange={(e) => setStation(e.target.value)} disabled={!ort}>
                  <option value="">— Välj station / depå —</option>
                  {/* (förenklat) – lägg gärna in dina faktiska par per ort */}
                  {ort === 'MALMÖ' && <>
                    <option>Huvudstation Malmö Jägersro</option>
                    <option>Ford Malmö</option>
                    <option>Mechanum</option>
                    <option>Mercedes Malmö</option>
                    <option>Hedin Automotive Burlöv</option>
                    <option>Sturup</option>
                  </>}
                  {ort === 'HELSINGBORG' && <>
                    <option>Huvudstation Helsingborg</option>
                    <option>BMW Helsingborg</option>
                    <option>Werksta Helsingborg</option>
                  </>}
                  {/* …osv */}
                </select>

                <button type="button" className="link" onClick={() => { setShowOtherPlace(true); setOrt(''); setStation(''); }}>
                  + Annan plats (fritext)
                </button>
              </>
            )}

            {showOtherPlace && (
              <div className="other-place">
                <label className="label">Annan plats *</label>
                <input
                  className="input"
                  placeholder="Beskriv plats (t.ex. adress, koordinater)"
                  value={otherPlace}
                  onChange={(e) => setOtherPlace(e.target.value)}
                />
                <button type="button" className="link" onClick={() => setShowOtherPlace(false)}>
                  Tillbaka till Ort / Station
                </button>
              </div>
            )}
          </div>

          {/* FORDONSSTATUS */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <label className="label">Mätarställning *</label>
            <div className="with-suffix">
              <input
                className="input"
                placeholder="ex. 42 180"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <span className="suffix muted">km</span>
            </div>

            <div className="stack-sm">
              <label className="label">Tanknivå *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${tankFull === true ? 'on' : ''}`} onClick={() => { setTankFull(true); setLiters(''); setFuelType(null); }}>
                  Fulltankad
                </button>
                <button type="button" className={`segbtn ${tankFull === false ? 'on' : ''}`} onClick={() => setTankFull(false)}>
                  Ej fulltankad
                </button>
              </div>
            </div>

            {tankFull === false && (
              <div className="grid-2 followups">
                <div className="stack-sm">
                  <label className="label">Antal liter påfyllda *</label>
                  <input
                    className={`input narrow ${!litersValid ? 'invalid' : ''}`}
                    inputMode="decimal"
                    placeholder="ex. 7,5"
                    value={liters}
                    onChange={(e) => {
                      const v = e.target.value.replace('.', ',');
                      // tillåt 1–4 siffror + ev. , + 1 siffra
                      if (/^\d{0,4}(,\d)?$/.test(v)) setLiters(v);
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
                    >Bensin</button>
                    <button
                      type="button"
                      className={`segbtn ${fuelType === 'Diesel' ? 'on' : ''}`}
                      onClick={() => setFuelType('Diesel')}
                    >Diesel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="stack-sm">
              <label className="label">AdBlue OK? *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${adBlueOk === true ? 'on' : ''}`} onClick={() => setAdBlueOk(true)}>Ja</button>
                <button type="button" className={`segbtn ${adBlueOk === false ? 'on' : ''}`} onClick={() => setAdBlueOk(false)}>Nej</button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Spolarvätska OK? *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${spolarOk === true ? 'on' : ''}`} onClick={() => setSpolarOk(true)}>Ja</button>
                <button type="button" className={`segbtn ${spolarOk === false ? 'on' : ''}`} onClick={() => setSpolarOk(false)}>Nej</button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Insynsskydd OK? *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${privacy === true ? 'on' : ''}`} onClick={() => setPrivacy(true)}>Ja</button>
                <button type="button" className={`segbtn ${privacy === false ? 'on' : ''}`} onClick={() => setPrivacy(false)}>Nej</button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Antal laddsladdar *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${cables === 0 ? 'on' : ''}`} onClick={() => setCables(0)}>0</button>
                <button type="button" className={`segbtn ${cables === 1 ? 'on' : ''}`} onClick={() => setCables(1)}>1</button>
                <button type="button" className={`segbtn ${cables === 2 ? 'on' : ''}`} onClick={() => setCables(2)}>2</button>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Hjul som sitter på *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${wheelsOn === 'Sommarhjul' ? 'on' : ''}`} onClick={() => setWheelsOn('Sommarhjul')}>Sommarhjul</button>
                <button type="button" className={`segbtn ${wheelsOn === 'Vinterhjul' ? 'on' : ''}`} onClick={() => setWheelsOn('Vinterhjul')}>Vinterhjul</button>
              </div>
            </div>
          </div>

          {/* Nya skador */}
          <h2>Nya skador på bilen?</h2>
          {newDamages.length === 0 ? (
            <button type="button" className="btn outline" onClick={addDamage}>
              Lägg till skada
            </button>
          ) : (
            <>
              {newDamages.map((d, i) => (
                <div className="card light" key={i}>
                  <div className="row space">
                    <strong>Skada {i + 1}</strong>
                  </div>
                  <label className="label">Text (obligatorisk)</label>
                  <input
                    className="input"
                    placeholder="Beskriv skadan…"
                    value={d.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                  />
                  <div className="stack-sm">
                    <label className="label">Lägg till bild</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => addDamageFiles(i, e.target.files)}
                    />
                    {d.files.length > 0 && (
                      <div className="thumbs">
                        {d.files.map((f, j) => (
                          <div key={j}>
                            <small className="muted">{f.name}</small><br />
                            <button type="button" className="link danger" onClick={() => removeDamageFile(i, j)}>Ta bort</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="btn outline" onClick={addDamage}>
                Lägg till ytterligare skada
              </button>
            </>
          )}

          {/* Alerts & Save */}
          {saveWarn && <div className="alert error">{saveWarn}</div>}
          {saveOk && <div className="alert ok">{saveOk}</div>}

          <button type="submit" className="btn primary" disabled={!canSave || saving}>
            {saving ? 'Sparar…' : 'Spara incheckning'}
          </button>
        </form>

        <p className="copy muted">© Albarone AB 2025</p>
      </div>

      {/* ====== STIL (ljust tema, läsbar text) ====== */}
      <style jsx>{`
        .page { background: #f6f7f9; min-height: 100vh; }
        .container { max-width: 720px; margin: 0 auto; padding: 16px; }
        h1 { font-size: 1.6rem; margin: 8px 0 4px; color: #0f172a; }
        h2 { font-size: 1.1rem; margin: 20px 0 8px; color: #111827; }
        .muted { color: #6b7280; }
        .copy { margin-top: 24px; text-align: center; }

        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin: 10px 0; }
        .card.light { background: #fafafa; }

        .label { display: block; font-weight: 600; color: #111827; margin: 8px 0 6px; }
        .input {
          width: 100%; background: #fff; color: #111827;
          border: 1px solid #d1d5db; border-radius: 8px;
          padding: 10px 12px; outline: none;
        }
        .input.invalid { border-color: #ef4444; }
        .with-suffix { position: relative; }
        .suffix { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); }

        .seg { display: flex; gap: 8px; flex-wrap: wrap; }
        .segbtn {
          border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 10px 12px;
          color: #111827; font-weight: 600;
        }
        .segbtn.on { background: #e8f0ff; border-color: #3b82f6; color: #1d4ed8; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .stack-sm { margin-top: 10px; }
        .followups { margin-top: 6px; }
        .narrow { max-width: 130px; }

        .damage-list { margin: 6px 0 0 16px; color: #111827; }
        .reg-warning { margin-top: 6px; color: #dc2626; font-weight: 600; }

        .btn { padding: 10px 14px; border-radius: 10px; border: 1px solid #cfd6e4; background:#fff; }
        .btn.primary {
          width: 100%; margin-top: 14px; background: #1d4ed8; color: #fff;
          border-color: #1d4ed8;
        }
        .btn.primary:disabled { background: #94a3b8; border-color: #94a3b8; }
        .btn.outline { background: #fff; border-color: #1d4ed8; color: #1d4ed8; }

        .link { margin-top: 10px; background: none; border: none; color: #1d4ed8; padding: 0; }
        .link.danger { color: #b91c1c; }

        .alert { margin-top: 12px; padding: 10px 12px; border-radius: 8px; }
        .alert.error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        .alert.ok { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }

        .thumbs { display: flex; gap: 10px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}
