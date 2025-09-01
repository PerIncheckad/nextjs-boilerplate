'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ---------- Supabase client ---------- */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = createClient(supabaseUrl, supabaseKey);

/* ---------- Helpers ---------- */
// Normalisera – vi slår i DB på VERSALER utan mellanslag/streck.
// Visningen lämnar vi som användaren skrev, men själva lookup sker på normalized.
const toDbReg = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, '');

const prettyDamages = (rows: Array<{ desc?: string; beskrivning?: string; damage_text?: string }>) =>
  rows
    .map(r => r.desc ?? r.beskrivning ?? r.damage_text ?? '')
    .filter(Boolean);

/* ---------- Typer (mjuka) ---------- */
type CarPick = {
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = {
  id?: string;
  desc?: string;
  beskrivning?: string;
  damage_text?: string;
};

/* ---------- Komponent ---------- */
export default function CheckInForm() {
  /* state: överst – reg.nr och uppslag */
  const [rawReg, setRawReg] = useState('');
  const normalizedReg = useMemo(() => toDbReg(rawReg), [rawReg]);

  const [car, setCar] = useState<CarPick | null>(null);
  const [damages, setDamages] = useState<DamageRow[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /* state: plats */
  const [city, setCity] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [showOtherPlace, setShowOtherPlace] = useState(false);
  const [otherPlace, setOtherPlace] = useState('');

  /* state: fordonsstatus */
  const [odometer, setOdometer] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState(''); // “antal liter påfyllda” (komma tillåtet)
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacy, setPrivacy] = useState<boolean>(true);
  const [insyn, setInsyn] = useState<boolean | null>(null);
  const [cables, setCables] = useState<0 | 1 | 2>(0);
  const [wheelMounted, setWheelMounted] = useState<'Sommarhjul' | 'Vinterhjul' | null>(null);

  /* state: nya skador */
  type NewDmg = { text: string; files: File[]; urls: string[] };
  const [newDamages, setNewDamages] = useState<NewDmg[]>([]);
  const fileInputs = useRef<HTMLInputElement[]>([]);

  /* state: flöde */
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveOk, setSaveOk] = useState<null | { ok: true; msg: string } | { ok: false; msg: string }>(null);

  /* ---------- Uppslag: bil + skador ---------- */
  useEffect(() => {
    let cancel = false;
    async function go() {
      setLookupError(null);
      setCar(null);
      setDamages([]);
      if (!normalizedReg) return;
      setLookupBusy(true);
      try {
        // 1) Bil
        const { data: carRows, error: carErr } = await sb
          .rpc('car_lookup_any', { reg: normalizedReg });

        if (carErr) throw carErr;

        const first: any = Array.isArray(carRows) && carRows.length > 0 ? carRows[0] : null;
        const picked: CarPick | null = first
          ? {
              regnr: first.regnr ?? normalizedReg,
              model: first.model ?? null,
              wheelstorage: first.wheelstorage ?? first.wheel_storage ?? null,
              car_id: first.car_id ?? null,
            }
          : null;

        if (!cancel) setCar(picked);

        // 2) Skador – om vi fick car_id försöker vi med den, annars kör vi reg
        if (picked) {
          let dmgRows: any[] = [];
          if (picked.car_id) {
            const { data, error } = await sb
              .rpc('damages_lookup_any', { car_id: picked.car_id, reg: normalizedReg });
            if (error) throw error;
            dmgRows = data ?? [];
          } else {
            const { data, error } = await sb
              .rpc('damages_lookup_any', { car_id: null, reg: normalizedReg });
            if (error) throw error;
            dmgRows = data ?? [];
          }
          if (!cancel) setDamages(dmgRows as DamageRow[]);
        }
      } catch (e: any) {
        if (!cancel) setLookupError(e?.message ?? 'Kunde inte hämta uppgifter');
      } finally {
        if (!cancel) setLookupBusy(false);
      }
    }
    go();
    return () => {
      cancel = true;
    };
  }, [normalizedReg]);

  /* ---------- Validering ---------- */
  const litersValid = useMemo(() => {
    if (tankFull !== false) return true; // ingen liter behövs
    if (!liters) return false;
    // Tillåt 0–4 siffror + ev kommatecken + 1 siffra
    return /^[0-9]{1,4}([,]\d{1})?$/.test(liters);
  }, [tankFull, liters]);

  const canSave = useMemo(() => {
    if (!normalizedReg) return false;

    // Plats
    if (!showOtherPlace) {
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
    if (adBlueOk === null || spolarOk === null || insyn === null) return false;
    if (!wheelMounted) return false;

    return true;
  }, [
    normalizedReg,
    showOtherPlace,
    city,
    station,
    otherPlace,
    odometer,
    tankFull,
    litersValid,
    fuelType,
    adBlueOk,
    spolarOk,
    insyn,
    wheelMounted,
  ]);

  /* ---------- Handlers ---------- */
  const onRegInput = (v: string) => {
    // användaren kan skriva hur som helst – vi visar det, men vi
    // håller fältet i VERSALER (önskat beteende)
    setRawReg(v.toUpperCase());
  };

  const addDamage = () => {
    setNewDamages(d => [...d, { text: '', files: [], urls: [] }]);
  };
  const rmDamage = (idx: number) => {
    setNewDamages(d => d.filter((_, i) => i !== idx));
  };
  const onPickFiles = (idx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const urls = arr.map(f => URL.createObjectURL(f));
    setNewDamages(d => {
      const clone = [...d];
      const cur = { ...clone[idx] };
      cur.files = [...(cur.files ?? []), ...arr];
      cur.urls = [...(cur.urls ?? []), ...urls];
      clone[idx] = cur;
      return clone;
    });
  };
  const rmImage = (idx: number, url: string) => {
    setNewDamages(d => {
      const clone = [...d];
      const cur = { ...clone[idx] };
      cur.urls = cur.urls.filter(u => u !== url);
      cur.files = cur.files.filter((_f, i) => cur.urls[i] !== url);
      clone[idx] = cur;
      return clone;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveOk(null);
    if (!canSave) {
      setSaveOk({ ok: false, msg: 'Vänligen fyll i all information först.' });
      return;
    }
    setSaveBusy(true);
    try {
      // Här “fejkar” vi incheckningen (ingen DB-skrivning än)
      await new Promise(r => setTimeout(r, 600));
      setSaveOk({ ok: true, msg: `Tack ${'Bob'}! Incheckningen sparades.` });
      // ev. reset av fält kan göras här om du vill
    } catch (e: any) {
      setSaveOk({ ok: false, msg: e?.message ?? 'Något gick fel vid sparandet.' });
    } finally {
      setSaveBusy(false);
    }
  };

  /* ---------- Platsdata (statisk) ---------- */
  // Samma struktur som tidigare – byts enkelt mot Supabase/JSON senare
  const PLATSER: Record<string, string[]> = {
    'MALMÖ JÄGERSRO': [
      'Huvudstation Malmö Jägersro',
      'Ford Malmö',
      'Mechanum',
      'Malmö Automera',
      'Mercedes Malmö',
      'Werksta St Bernstorp',
      'Werksta Malmö Hamn',
      'Hedbergs Malmö',
      'Hedin Automotive Burlöv',
      'Sturup',
    ],
    HELSINGBORG: [
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
    ÄNGELHOLM: ['Huvudstation Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
    HALMSTAD: ['Huvudstation Halmstad', 'Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
    FALKENBERG: ['Huvudstation Falkenberg'],
    TRELLEBORG: ['Huvudstation Trelleborg'],
    VARBERG: ['Huvudstation Varberg', 'Ford Varberg', 'Hedin Automotive Varberg', 'Sällstorp lack plåt', 'Finnveden plåt'],
    LUND: ['Huvudstation Lund', 'Ford Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  };

  const cities = Object.keys(PLATSER);
  const stationsFor = (c: string) => (c ? PLATSER[c] ?? [] : []);

  /* ---------- UI ---------- */
  const known = !!car;
  const damageTexts = prettyDamages(damages);

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">
          Inloggad: <strong>Bob</strong>
        </p>

        <form onSubmit={onSubmit}>
          {/* REGNR + uppslag */}
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className={`input ${!normalizedReg ? '' : known ? '' : 'invalid'}`}
              placeholder="Skriv reg.nr"
              value={rawReg}
              onChange={(e) => onRegInput(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
            />
            {!lookupBusy && !!normalizedReg && !known && (
              <p className="reg-warning">Okänt reg.nr</p>
            )}

            <div className="kv">
              <div>
                <span className="muted">Bilmodell:</span>{' '}
                {car?.model ?? '—'}
              </div>
              <div>
                <span className="muted">Hjulförvaring:</span>{' '}
                {car?.wheelstorage ?? '—'}
              </div>
              <div>
                <span className="muted">Befintliga skador:</span>{' '}
                {damageTexts.length === 0 ? (
                  '—'
                ) : (
                  <ul className="damage-list">
                    {damageTexts.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Plats */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            <label className="label">Ort *</label>
            <select
              className="input"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setStation('');
              }}
            >
              <option value="">— Välj ort —</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="label">Station / Depå *</label>
            <select
              className="input"
              value={station}
              onChange={(e) => setStation(e.target.value)}
              disabled={!city}
            >
              <option value="">— Välj station / depå —</option>
              {stationsFor(city).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="link"
              onClick={() => {
                setShowOtherPlace((v) => !v);
                if (!showOtherPlace) {
                  setCity('');
                  setStation('');
                }
              }}
            >
              {showOtherPlace ? '↩︎ Återgå till lista' : '+ Annan plats (fritext)'}
            </button>

            {showOtherPlace && (
              <div className="stack-sm followups">
                <label className="label">Beskriv plats *</label>
                <input
                  className="input"
                  placeholder="Fritext, t.ex. ’Kundens garage på Storgatan’"
                  value={otherPlace}
                  onChange={(e) => setOtherPlace(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Fordonsstatus */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <div className="grid-2">
              <div>
                <label className="label">Mätarställning *</label>
                <div className="with-suffix">
                  <input
                    className="input"
                    placeholder="ex. 42 180"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value.replace(/[^\d ]/g, ''))}
                    inputMode="numeric"
                  />
                  <span className="suffix muted">km</span>
                </div>
              </div>
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
              <div className="followups">
                <div className="stack-sm followup">
                  <label className="label">Antal liter påfyllda *</label>
                  <input
                    className={`input narrow ${litersValid ? '' : 'invalid'}`}
                    inputMode="decimal"
                    placeholder="ex. 7,5"
                    value={liters}
                    onChange={(e) => {
                      const v = e.target.value.replace('.', ','); // punkt → komma
                      if (/^[0-9]{0,4}(,[0-9]{0,1})?$/.test(v)) setLiters(v);
                    }}
                  />
                </div>

                <div className="stack-sm followup">
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
            )}

            <div className="grid-2">
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
                    className={`segbtn ${insyn === true ? 'on' : ''}`}
                    onClick={() => setInsyn(true)}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    className={`segbtn ${insyn === false ? 'on' : ''}`}
                    onClick={() => setInsyn(false)}
                  >
                    Nej
                  </button>
                </div>
              </div>

              <div className="stack-sm">
                <label className="label">Antal laddsladdar *</label>
                <div className="seg">
                  {[0, 1, 2].map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`segbtn ${cables === n ? 'on' : ''}`}
                      onClick={() => setCables(n as 0 | 1 | 2)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Hjul som sitter på *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${wheelMounted === 'Sommarhjul' ? 'on' : ''}`}
                  onClick={() => setWheelMounted('Sommarhjul')}
                >
                  Sommarhjul
                </button>
                <button
                  type="button"
                  className={`segbtn ${wheelMounted === 'Vinterhjul' ? 'on' : ''}`}
                  onClick={() => setWheelMounted('Vinterhjul')}
                >
                  Vinterhjul
                </button>
              </div>
            </div>
          </div>

          {/* Nya skador */}
          <h2>Nya skador på bilen?</h2>
          <div className="card">
            {newDamages.length === 0 && (
              <button type="button" className="btn outline" onClick={addDamage}>
                Lägg till skada
              </button>
            )}

            {newDamages.map((dmg, idx) => (
              <div className="dmg" key={idx}>
                <div className="dmg-head">
                  <strong>Skada {idx + 1}</strong>
                  <button type="button" className="link danger" onClick={() => rmDamage(idx)}>
                    Ta bort
                  </button>
                </div>

                <label className="label">Text (obligatorisk)</label>
                <input
                  className="input"
                  placeholder="Beskriv skadan…"
                  value={dmg.text}
                  onChange={(e) =>
                    setNewDamages(list => {
                      const clone = [...list];
                      clone[idx] = { ...clone[idx], text: e.target.value };
                      return clone;
                    })
                  }
                />

                <div className="stack-sm">
                  <label className="label">Lägg till bild</label>
                  <input
                    ref={el => {
                      if (el) fileInputs.current[idx] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture={undefined} // gör att telefonen får välja kamera/galleri
                    multiple
                    onChange={(e) => onPickFiles(idx, e.target.files)}
                    className="input"
                  />
                  {dmg.urls?.length ? (
                    <div className="thumbs">
                      {dmg.urls.map(u => (
                        <div key={u} className="thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" />
                          <button type="button" className="link" onClick={() => rmImage(idx, u)}>
                            Ta bort
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {idx === newDamages.length - 1 && (
                  <button type="button" className="btn outline" onClick={addDamage}>
                    Lägg till ytterligare skada
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Spara */}
          <div className="card">
            {saveOk && (
              <div className={`alert ${saveOk.ok ? 'ok' : 'error'}`}>
                {saveOk.msg}
              </div>
            )}
            <button className="btn primary" type="submit" disabled={!canSave || saveBusy}>
              {saveBusy ? 'Sparar…' : 'Spara incheckning'}
            </button>
            <div className="muted small center">© Albarone AB 2025</div>
          </div>
        </form>
      </div>

      <style jsx>{`
        /* layout */
        .page { background:#f6f7f9; min-height:100vh; padding:16px; }
        .container { max-width:720px; margin:0 auto; }
        h1 { font-size:24px; margin:0 0 8px; }
        h2 { font-size:18px; margin:24px 0 12px; }
        .muted { color:#6b7280; }
        .small { font-size:12px; }
        .center { text-align:center; }

        .card {
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:12px;
          padding:16px;
          margin-top:12px;
        }
        .label { display:block; font-weight:600; margin:12px 0 6px; }
        .input {
          width:100%;
          border:1px solid #d1d5db;
          border-radius:8px;
          padding:10px 12px;
          background:#fff;
          color:#111827;
        }
        .input.invalid { border-color:#dc2626; background:#fff5f5; }
        .with-suffix { position:relative; }
        .suffix { position:absolute; right:10px; top:50%; transform:translateY(-50%); }

        .seg { display:flex; gap:8px; flex-wrap:wrap; }
        .segbtn {
          border:1px solid #d1d5db; border-radius:8px; padding:10px 14px;
          background:#fff; color:#1d4ed8; font-weight:600;
        }
        .segbtn.on { background:#e8f0ff; border-color:#3b82f6; color:#1d4ed8; }

        .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        @media (max-width:640px){ .grid-2 { grid-template-columns: 1fr; } }

        .followups { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:8px; }
        @media (max-width:640px){ .followups { grid-template-columns: 1fr; } }
        .followup { text-align:left; }
        .narrow { max-width: 140px; }

        .btn {
          padding:10px 14px; border-radius:10px; border:1px solid #cfd6e4;
          background:#fff; cursor:pointer;
        }
        .btn.primary { width:100%; margin-top:12px; background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
        .btn.primary:disabled { background:#94a3b8; border-color:#94a3b8; }

        .btn.outline { background:#fff; }

        .link { margin-top:8px; background:none; border:none; color:#1d4ed8; padding:0; cursor:pointer; }
        .link.danger { color:#b91c1c; }

        .reg-warning { margin-top:6px; color:#dc2626; font-weight:600; }

        .kv > div { margin-top:6px; }
        .damage-list { margin:6px 0 0 20px; list-style: disc; }

        .alert { margin-top:12px; padding:10px 12px; border-radius:8px; }
        .alert.error { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
        .alert.ok { background:#d1fae5; color:#065f46; border:1px solid #a7f3d0; }

        .dmg { border-top:1px dashed #e5e7eb; padding-top:12px; margin-top:12px; }
        .dmg-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .thumbs { display:flex; flex-wrap:wrap; gap:8px; }
        .thumb img { width:100px; height:100px; object-fit:cover; border-radius:8px; border:1px solid #e5e7eb; display:block; }
      `}</style>
    </div>
  );
}
