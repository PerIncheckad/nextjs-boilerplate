'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';

/* ---------- Supabase-klient ---------- */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ---------- Hjälpare ---------- */
const norm = (s: string) =>
  (s || '')
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .trim();

const fmtKm = (v: string) => v.replace(/[^\d]/g, '');
const isNumber = (v: string) => /^-?\d+([,.]\d+)?$/.test(v);

type CarLookup =
  | {
      regnr: string | null;
      model: string | null;
      wheelstorage: string | null;
      car_id: string | null;
    }
  | null;

type DamageRow = { id?: string; plats?: string; typ?: string; beskrivning?: string };

/* ---------- PLATSER ---------- */
/* Denna lista är filtrerad & förenklad ur din Excel. Lägg till/ändra fritt. */
const PLATSER: Record<
  string,
  { label: string; stations: string[] }
> = {
  'MALMÖ JÄGERSRO': {
    label: 'MALMÖ JÄGERSRO',
    stations: [
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
  },
  HELSINGBORG: {
    label: 'HELSINGBORG',
    stations: [
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
  },
  ÄNGELHOLM: {
    label: 'ÄNGELHOLM',
    stations: ['Huvudstation Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm', 'Flyget Ängelholm'],
  },
  HALMSTAD: {
    label: 'HALMSTAD',
    stations: ['Huvudstation Halmstad', 'Flyget Halmstad', 'KIA Halmstad', 'FORD Halmstad'],
  },
  FALKENBERG: {
    label: 'FALKENBERG',
    stations: ['Huvudstation Falkenberg'],
  },
  TRELLEBORG: {
    label: 'TRELLEBORG',
    stations: ['Huvudstation Trelleborg'],
  },
  VARBERG: {
    label: 'VARBERG',
    stations: [
      'Huvudstation Varberg',
      'Ford Varberg',
      'Hedin Automotive Varberg',
      'Sällstorp lack plåt',
      'Finnveden plåt',
    ],
  },
  LUND: {
    label: 'LUND',
    stations: ['Ford Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
  },
};

/* ---------- Komponent ---------- */
export default function CheckinForm() {
  /* Form-state */
  const [regInput, setRegInput] = useState('');
  const regNorm = useMemo(() => norm(regInput), [regInput]);

  const [car, setCar] = useState<CarLookup>(null);
  const [damages, setDamages] = useState<DamageRow[]>([]);
  const [lookedUp, setLookedUp] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  // plats
  const [useCustomPlace, setUseCustomPlace] = useState(false);
  const [ort, setOrt] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [customPlace, setCustomPlace] = useState<string>('');
  const [geo, setGeo] = useState<string>('');

  // fordonsstatus
  const [odo, setOdo] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [fuelLiters, setFuelLiters] = useState(''); // decimal med komma
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | ''>('');
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cables, setCables] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'Sommarhjul' | 'Vinterhjul' | ''>('');
  const [newDamages, setNewDamages] = useState<
    { text: string; files: { file: File; url: string }[] }[]
  >([]);

  // UI
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ---------- Regnr-lookup ---------- */
  useEffect(() => {
    let cancelled = false;

    const doLookup = async () => {
      setLookedUp(false);
      setCar(null);
      setDamages([]);
      if (!regNorm) return;

      setLookupBusy(true);
      try {
        // 1) Hämta bilinfo
        const carRes = await supabase.rpc('car_lookup_any', { regnr: regNorm }).catch(() => null);
        let picked: CarLookup = null;

        if (carRes && (carRes as any).data) {
          const data = (carRes as any).data as any[];
          if (Array.isArray(data) && data.length) {
            const row = data[0];
            picked = {
              regnr: row.regnr ?? row.registration ?? null,
              model: row.model ?? row.brand_model ?? null,
              wheelstorage: row.wheelstorage ?? row.wheel_storage ?? null,
              car_id: row.car_id ?? row.id ?? null,
            };
          }
        }

        // 2) Hämta befintliga skador (om vi har car_id eller regnr)
        let dmg: DamageRow[] = [];
        if (picked?.car_id || regNorm) {
          const damRes = await supabase
            .rpc('damages_lookup_any', {
              car_id: picked?.car_id ?? null,
              regnr: regNorm,
            })
            .catch(() => null);

          if (damRes && (damRes as any).data) {
            const arr = (damRes as any).data as any[];
            if (Array.isArray(arr)) {
              dmg = arr.map((r) => ({
                id: r.id,
                plats: r.plats ?? r.place ?? undefined,
                typ: r.typ ?? r.type ?? undefined,
                beskrivning: r.beskrivning ?? r.description ?? undefined,
              }));
            }
          }
        }

        if (!cancelled) {
          setCar(picked);
          setDamages(dmg);
          setLookedUp(true);
        }
      } finally {
        if (!cancelled) setLookupBusy(false);
      }
    };

    const t = setTimeout(doLookup, 300); // enkel debounce
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [regNorm]);

  /* ---------- Validering ---------- */
  const needFuelFollowUps = tankFull === false;
  const fuelLitersOk =
    !needFuelFollowUps || (fuelLiters && isNumber(fuelLiters.replace('.', ',')));
  const fuelTypeOk = !needFuelFollowUps || !!fuelType;

  const placeOk = useCustomPlace
    ? customPlace.trim().length > 0
    : !!ort && !!station;

  const regOk = regNorm.length > 0;
  const odoOk = fmtKm(odo).length > 0;
  const togglesOk =
    tankFull !== null &&
    adBlueOk !== null &&
    spolarOk !== null &&
    privacyOk !== null &&
    cables !== null &&
    !!wheelsOn &&
    fuelLitersOk &&
    fuelTypeOk;

  const allOk = regOk && placeOk && odoOk && togglesOk;

  const markInvalid = submitAttempted && !allOk;

  /* ---------- Handlers ---------- */
  const onPickGeo = () => {
    if (!navigator.geolocation) {
      setGeo('Geolokalisering saknas i denna webbläsare.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
      },
      (err) => setGeo(`Kunde inte hämta position (${err.code})`)
    );
  };

  const addDamageCard = () =>
    setNewDamages((arr) => [...arr, { text: '', files: [] }]);

  const updateDamageText = (i: number, v: string) =>
    setNewDamages((arr) => {
      const copy = [...arr];
      copy[i] = { ...copy[i], text: v };
      return copy;
    });

  const addDamageFiles = (i: number, files: FileList | null) => {
    if (!files || !files.length) return;
    setNewDamages((arr) => {
      const copy = [...arr];
      const more = Array.from(files).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
      copy[i] = { ...copy[i], files: [...copy[i].files, ...more] };
      return copy;
    });
  };

  const removeDamageFile = (cardIdx: number, url: string) =>
    setNewDamages((arr) => {
      const copy = [...arr];
      copy[cardIdx] = { ...copy[cardIdx], files: copy[cardIdx].files.filter((x) => x.url !== url) };
      return copy;
    });

  const removeDamageCard = (i: number) =>
    setNewDamages((arr) => arr.filter((_, idx) => idx !== i));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    setSubmitOk(false);

    if (!allOk) {
      setSubmitError('Vänligen fyll i all obligatorisk information först.');
      return;
    }

    // Dummy-spara.
    setTimeout(() => {
      setSubmitOk(true);
      setSubmitError(null);
    }, 400);
  };

  /* ---------- Render ---------- */
  const stationsForOrt = useMemo(() => {
    const key = Object.keys(PLATSER).find((k) => k === ort);
    return key ? PLATSER[key].stations : [];
  }, [ort]);

  const unknownReg =
    lookedUp &&
    regNorm &&
    !lookupBusy &&
    (!car || (!car.model && !car.wheelstorage && !damages.length));

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <b>Bob</b></p>

        <form onSubmit={onSubmit} noValidate>
          {/* --- REG + AUTO-DATA --- */}
          <div className="card">
            <div className="field">
              <label>Registreringsnummer *</label>
              <input
                className={submitAttempted && !regOk ? 'invalid' : ''}
                value={regInput}
                onChange={(e) => setRegInput(e.target.value)}
                placeholder="Skriv reg.nr"
                inputMode="text"
                autoCapitalize="characters"
              />
              {unknownReg && <div className="error-inline">Okänt reg.nr</div>}
            </div>

            <div className="auto">
              <div>
                <div className="sub">Bilmodell</div>
                <div className="auto-val">{car?.model || '--'}</div>
              </div>
              <div>
                <div className="sub">Hjulförvaring</div>
                <div className="auto-val">{car?.wheelstorage || '--'}</div>
              </div>
              <div>
                <div className="sub">Befintliga skador:</div>
                {damages.length === 0 ? (
                  <div className="auto-val">–</div>
                ) : (
                  <ul className="damage-list">
                    {damages.map((d, idx) => (
                      <li key={d.id || idx}>
                        {[d.plats, d.typ, d.beskrivning].filter(Boolean).join(' – ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* --- PLATS --- */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            <div className="row between">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={useCustomPlace}
                  onChange={(e) => setUseCustomPlace(e.target.checked)}
                />
                <span>Annan plats (fritext)</span>
              </label>
              {useCustomPlace && (
                <button
                  type="button"
                  className="btnplain"
                  onClick={onPickGeo}
                  title="Hämta geokoordinater från enheten"
                >
                  Hämta position
                </button>
              )}
            </div>

            {!useCustomPlace ? (
              <>
                <div className="field">
                  <label>Ort *</label>
                  <select
                    className={submitAttempted && !ort ? 'invalid' : ''}
                    value={ort}
                    onChange={(e) => {
                      setOrt(e.target.value);
                      setStation('');
                    }}
                  >
                    <option value="">— Välj ort —</option>
                    {Object.keys(PLATSER).map((k) => (
                      <option key={k} value={k}>
                        {PLATSER[k].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Station / Depå *</label>
                  <select
                    className={submitAttempted && !station ? 'invalid' : ''}
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                    disabled={!ort}
                  >
                    <option value="">— Välj station / depå —</option>
                    {stationsForOrt.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label>Beskriv plats *</label>
                  <textarea
                    className={submitAttempted && !customPlace ? 'invalid' : ''}
                    value={customPlace}
                    onChange={(e) => setCustomPlace(e.target.value)}
                    placeholder="Ex. ”Parkering södra infarten, rad 3”"
                  />
                </div>
                <div className="field">
                  <label>Geotagg (valfritt)</label>
                  <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="lat, long" />
                </div>
              </>
            )}
          </div>

          {/* --- FORDONSSTATUS --- */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <div className="field">
              <label>Mätarställning *</label>
              <div className="with-suffix">
                <input
                  className={submitAttempted && !odoOk ? 'invalid' : ''}
                  value={odo}
                  onChange={(e) => setOdo(e.target.value)}
                  placeholder="ex. 42 180"
                  inputMode="numeric"
                />
                <span className="suffix muted">km</span>
              </div>
            </div>

            <div className="group">
              <div className="label">Tanknivå *</div>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${tankFull === true ? 'on' : ''}`}
                  onClick={() => setTankFull(true)}
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

            {needFuelFollowUps && (
              <div className="fuel-extra">
                <div className="field small">
                  <label>Antal liter påfyllda *</label>
                  <input
                    className={submitAttempted && !fuelLitersOk ? 'invalid' : ''}
                    value={fuelLiters}
                    onChange={(e) => {
                      // Tillåt siffror och komma, byt punkt till komma
                      let v = e.target.value.replace('.', ',');
                      // max 4 siffror + ev komma + 1 decimal -> enklare: begränsa längd till 6
                      if (v.length > 6) v = v.slice(0, 6);
                      setFuelLiters(v);
                    }}
                    placeholder="ex. 7,5"
                    inputMode="decimal"
                  />
                </div>
                <div className="field">
                  <label>Bränsletyp *</label>
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

            <div className="group">
              <div className="label">AdBlue OK? *</div>
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

            <div className="group">
              <div className="label">Spolarvätska OK? *</div>
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

            <div className="group">
              <div className="label">Insynsskydd OK? *</div>
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

            <div className="group">
              <div className="label">Antal laddsladdar *</div>
              <div className="seg">
                {[0, 1, 2].map((n) => (
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

            <div className="group">
              <div className="label">Hjul som sitter på *</div>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${wheelsOn === 'Sommarhjul' ? 'on' : ''}`}
                  onClick={() => setWheelsOn('Sommarhjul')}
                >
                  Sommarhjul
                </button>
                <button
                  type="button"
                  className={`segbtn ${wheelsOn === 'Vinterhjul' ? 'on' : ''}`}
                  onClick={() => setWheelsOn('Vinterhjul')}
                >
                  Vinterhjul
                </button>
              </div>
            </div>
          </div>

          {/* --- Nya skador --- */}
          <h2>Nya skador på bilen?</h2>
          {newDamages.map((d, i) => (
            <div className="damage-card" key={i}>
              <div className="row between">
                <div className="title">Skada {i + 1}</div>
                <button
                  type="button"
                  className="link danger"
                  onClick={() => removeDamageCard(i)}
                >
                  Ta bort
                </button>
              </div>

              <div className="field">
                <label>Text (obligatorisk)</label>
                <input
                  className={submitAttempted && !d.text ? 'invalid' : ''}
                  value={d.text}
                  onChange={(e) => updateDamageText(i, e.target.value)}
                  placeholder="Beskriv skadan…"
                />
              </div>

              <div className="field">
                <label>Lägg till bild</label>
                <input
                  type="file"
                  accept="image/*"
                  // ingen capture => användaren får välja kamera eller galleri
                  onChange={(e) => addDamageFiles(i, e.target.files)}
                />
                {!!d.files.length && (
                  <div className="thumbs">
                    {d.files.map((f) => (
                      <div className="thumb" key={f.url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt="bild" />
                        <button
                          type="button"
                          className="x"
                          aria-label="Ta bort bild"
                          onClick={() => removeDamageFile(i, f.url)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="row">
            <button type="button" className="btn outline" onClick={addDamageCard}>
              Lägg till ytterligare en skada
            </button>
          </div>

          {/* --- Fel & Spara --- */}
          {submitError && <div className="form-error">{submitError}</div>}

          <div className="row">
            <button type="submit" className="btn primary" disabled={!allOk}>
              Spara incheckning
            </button>
          </div>

          {submitOk && (
            <div className="success">
              Tack Bob! Incheckningen sparades (dummy). Du kan stänga sidan eller göra en ny.
            </div>
          )}
        </form>
      </div>

      {/* ---------- Stilar (light, ”99%-känsla”) ---------- */}
      <style jsx>{`
        .page { background:#f6f7f9; min-height:100vh; padding:16px; }
        .container { max-width:720px; margin:0 auto; }
        h1 { font-size:28px; margin:6px 0 14px; }
        h2 { margin:22px 0 10px; font-size:18px; color:#2b2f3a; }
        .muted { color:#6b7280; }
        .card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin:8px 0 14px; }
        .field { display:flex; flex-direction:column; gap:6px; margin:10px 0; }
        label { font-weight:600; font-size:14px; color:#2b2f3a; }
        input, select, textarea {
          border:1px solid #cbd5e1; border-radius:10px; padding:12px 12px;
          font-size:16px; background:#fff; outline:none;
        }
        textarea { min-height:80px; resize:vertical; }
        input.invalid, select.invalid, textarea.invalid { border-color:#ef4444; background:#fff6f6; }
        .error-inline { color:#e11d48; margin-top:6px; font-weight:600; }
        .with-suffix { position:relative; }
        .with-suffix .suffix { position:absolute; right:12px; top:50%; transform:translateY(-50%); }
        .group { margin:12px 0; }
        .group .label { font-weight:700; margin-bottom:8px; }
        .seg { display:flex; gap:10px; flex-wrap:wrap; }
        .segbtn {
          border:1px solid #cbd5e1; background:#fff; padding:10px 14px; border-radius:10px;
        }
        .segbtn.on { background:#e8f1ff; border-color:#2563eb; }
        .row { display:flex; gap:12px; align-items:center; margin:10px 0; }
        .row.between { justify-content:space-between; }
        .btn { border-radius:10px; padding:12px 16px; font-weight:700; }
        .btn.primary { background:#1d4ed8; color:#fff; border:1px solid #1d4ed8; }
        .btn.primary[disabled] { background:#a8b3cf; border-color:#a8b3cf; cursor:not-allowed; }
        .btn.outline { border:1px solid #cbd5e1; background:#fff; }
        .btnplain { border:none; background:transparent; color:#1d4ed8; font-weight:700; }
        .link.danger { color:#b91c1c; background:transparent; border:none; }
        .switch input { margin-right:8px; }
        .success { margin:12px 0; padding:12px; border-radius:10px; background:#ecfdf5; border:1px solid #bbf7d0; color:#065f46; font-weight:700; }
        .form-error { margin:12px 0; padding:12px; border-radius:10px; background:#fff1f2; border:1px solid #fecdd3; color:#9f1239; font-weight:700; }
        .auto { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
        .auto .sub { font-size:13px; color:#6b7280; }
        .auto-val { font-size:16px; }
        .damage-list { margin:6px 0 0 16px; }
        .fuel-extra { display:grid; grid-template-columns:140px 1fr; gap:12px; align-items:end; }
        .field.small input { width:110px; }
        .damage-card { border:1px solid #fde68a; background:#fffbeb; border-radius:12px; padding:12px; margin:12px 0; }
        .damage-card .title { font-weight:800; }
        .thumbs { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; }
        .thumb { position:relative; width:90px; height:90px; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb; }
        .thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .thumb .x { position:absolute; right:2px; top:0; border:none; background:#fff; border-radius:0 0 0 8px; padding:0 6px; font-size:18px; }
        @media (max-width:560px) {
          .auto { grid-template-columns:1fr; }
          .fuel-extra { grid-template-columns:1fr; }
          .field.small input { width:100%; max-width:160px; }
        }
      `}</style>
    </div>
  );
}
