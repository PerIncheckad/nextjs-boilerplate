'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* -------------------------------------------------------
   Supabase-klient (lättvikts-init för klient-sida)
--------------------------------------------------------*/
type Supa = {
  from: (tbl: string) => any;
  rpc: (fn: string, args?: any) => Promise<{ data: any; error: any }>;
};
function createSupa(): Supa | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // vi undviker tunga imports – nyttjar fetch direkt till RPC
  if (!url || !key) return null;
  return {
    from: () => null,
    async rpc(fn: string, args?: any) {
      try {
        const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(args ?? {}),
        });
        if (!res.ok) {
          const t = await res.text();
          return { data: null, error: new Error(t || res.statusText) };
        }
        const data = await res.json();
        return { data, error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
  };
}
const supa = createSupa();

/* -------------------------------------------------------
   Platser (Ort → Station/depå)
   – fyll på/ändra här om listan växer
--------------------------------------------------------*/
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
  ÄNGELHOLM: [
    'Huvudstation Ängelholm',
    'FORD Ängelholm',
    'Mekonomen Ängelholm',
    'Flyget Ängelholm',
  ],
  HALMSTAD: [
    'Huvudstation Halmstad',
    'Flyget Halmstad',
    'KIA Halmstad',
    'FORD Halmstad',
  ],
  FALKENBERG: ['Huvudstation Falkenberg'],
  TRELLEBORG: ['Huvudstation Trelleborg'],
  VARBERG: [
    'Huvudstation Varberg',
    'Ford Varberg',
    'Hedin Automotive Varberg',
    'Sällstorp lack plåt',
    'Finnveden plåt',
  ],
  LUND: [
    'Huvudstation Lund',
    'Ford Lund',
    'Hedin Lund',
    'B/S Lund',
    'P7 Revinge',
  ],
};

/* -------------------------------------------------------
   Hjälpfunktioner
--------------------------------------------------------*/
function normalizeReg(input: string): string {
  return (input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÅÄÖ]/gi, '')
    .trim();
}
function isEmpty(v: any) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/* -------------------------------------------------------
   Typer
--------------------------------------------------------*/
type PickedCar = {
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};
type Damage = {
  id: string;
  plats?: string | null;
  typ?: string | null;
  beskrivning?: string | null;
};

/* -------------------------------------------------------
   Komponent
--------------------------------------------------------*/
export default function CheckInForm() {
  // ––––– Reg-nr & uppslag –––––
  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<PickedCar | null>(null);
  const [knownWarning, setKnownWarning] = useState<string | null>(null);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [lookingUp, setLookingUp] = useState(false);

  // ––––– Plats för incheckning –––––
  const [useFreePlace, setUseFreePlace] = useState(false);
  const [freePlace, setFreePlace] = useState('');
  const [city, setCity] = useState('');
  const [station, setStation] = useState('');

  const stations = useMemo(() => (city ? PLATSER[city] ?? [] : []), [city]);

  // ––––– Fordonsstatus –––––
  const [odo, setOdo] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [refuelLiters, setRefuelLiters] = useState(''); // decimal med komma
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | ''>('');
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynOk, setInsynOk] = useState<boolean | null>(null);
  const [cables, setCables] = useState<0 | 1 | 2 | null>(null);
  const [wheels, setWheels] = useState<'Sommarhjul' | 'Vinterhjul' | ''>('');

  // ––––– Nya skador – bilder –––––
  type Photo = { id: string; url: string; file: File };
  type NewDamage = { id: string; text: string; photos: Photo[] };
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ––––– UI-status –––––
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});

  // ––––– Regnr-uppslag –––––
  useEffect(() => {
    let active = true;
    async function up() {
      const raw = regInput;
      const norm = normalizeReg(raw);
      setKnownWarning(null);
      setCar(null);
      setDamages([]);
      if (!norm || norm.length < 3) return;
      if (!supa) return;

      setLookingUp(true);
      try {
        // Hämta bil (model, wheelstorage, car_id)
        const { data: c1, error: e1 } = await supa.rpc('car_lookup_any', { regnorm: norm });
        if (e1) {
          setKnownWarning('Okänt reg.nr');
          return;
        }
        const picked = Array.isArray(c1) && c1.length > 0 ? (c1[0] as PickedCar) : null;
        if (!active) return;

        if (!picked) {
          setKnownWarning('Okänt reg.nr');
          setCar(null);
          setDamages([]);
          return;
        }

        setCar(picked);
        setKnownWarning(null);

        // Hämta befintliga skador
        if (picked.car_id) {
          const { data: d1, error: e2 } = await supa.rpc('damages_lookup_any', {
            p_car_id: picked.car_id,
            p_regnr: norm,
          });
          if (!active) return;
          if (!e2 && Array.isArray(d1)) {
            // Normalisera utfall som { plats, typ, beskrivning, id }
            const mapped: Damage[] = d1.map((d: any, i: number) => ({
              id: String(d.id ?? `k${i}`),
              plats: d.plats ?? d.place ?? null,
              typ: d.typ ?? d.type ?? null,
              beskrivning: d.beskrivning ?? d.desc ?? null,
            }));
            setDamages(mapped);
          } else {
            setDamages([]);
          }
        } else {
          setDamages([]);
        }
      } finally {
        if (active) setLookingUp(false);
      }
    }
    up();
    return () => {
      active = false;
    };
  }, [regInput]);

  /* -------------------------- validering -------------------------- */
  function recomputeInvalid() {
    const inv: Record<string, boolean> = {};

    const norm = normalizeReg(regInput);
    inv.reg = norm.length < 3;

    if (useFreePlace) {
      inv.freePlace = isEmpty(freePlace);
    } else {
      inv.city = isEmpty(city);
      inv.station = isEmpty(station);
    }

    inv.odo = isEmpty(odo);
    inv.tank = tankFull === null;
    if (tankFull === false) {
      // kräver följdfrågor
      inv.refuel = isEmpty(refuelLiters);
      inv.fuelType = fuelType === '';
    }
    inv.adBlue = adBlueOk === null;
    inv.spolar = spolarOk === null;
    inv.insyn = insynOk === null;
    inv.cables = cables === null;
    inv.wheels = wheels === '';

    // minst 1 text för varje ny skada
    newDamages.forEach((d, idx) => {
      inv[`nd_text_${idx}`] = isEmpty(d.text);
    });

    setInvalidFields(inv);
    return inv;
  }

  const formValid = useMemo(() => {
    const inv = recomputeInvalid();
    return Object.values(inv).every((v) => v === false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    regInput,
    useFreePlace,
    freePlace,
    city,
    station,
    odo,
    tankFull,
    refuelLiters,
    fuelType,
    adBlueOk,
    spolarOk,
    insynOk,
    cables,
    wheels,
    newDamages,
  ]);

  /* ----------------------- handlers ----------------------- */
  function onSelectCity(v: string) {
    setCity(v);
    setStation('');
  }
  function toggleUseFreePlace(v: boolean) {
    setUseFreePlace(v);
    if (v) {
      setCity('');
      setStation('');
    } else {
      setFreePlace('');
    }
  }
  function addDamage() {
    setNewDamages((arr) => [...arr, { id: crypto.randomUUID(), text: '', photos: [] }]);
  }
  function removeDamage(id: string) {
    setNewDamages((arr) => arr.filter((d) => d.id !== id));
  }
  function openFilePicker(forId: string) {
    if (!fileInputRef.current) return;
    // Spara aktuell damage-id i data-attribut så vi kan lägga till i rätt post
    fileInputRef.current.dataset.forDamage = forId;
    // Viktigt: **ingen** capture-attribut => systemet visar **kamera eller galleri**
    fileInputRef.current.click();
  }
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    const dId = e.currentTarget.dataset.forDamage;
    if (!files || !dId) return;

    const picked: Photo[] = [];
    Array.from(files).forEach((f) => {
      const url = URL.createObjectURL(f);
      picked.push({ id: crypto.randomUUID(), url, file: f });
    });

    setNewDamages((arr) =>
      arr.map((d) => (d.id === dId ? { ...d, photos: [...d.photos, ...picked] } : d)),
    );

    // nollställ så att samma fil kan väljas igen vid behov
    e.currentTarget.value = '';
    delete e.currentTarget.dataset.forDamage;
  }
  function removePhoto(damageId: string, photoId: string) {
    setNewDamages((arr) =>
      arr.map((d) => (d.id === damageId ? { ...d, photos: d.photos.filter((p) => p.id !== photoId) } : d)),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const inv = recomputeInvalid();
    const hasErrors = Object.values(inv).some(Boolean);

    setSaveError(null);
    setSaveOk(null);

    if (hasErrors) {
      // fält markeras redan, visa även en tydlig rad längst ner
      setSaveError('Vänligen fyll i all obligatorisk information först.');
      return;
    }

    setSaving(true);
    // Simulerad sparning
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    setSaveOk('Tack Bob! Incheckningen sparades.');
  }

  /* ----------------------- render ----------------------- */
  const invalid = (name: string) => (invalidFields[name] ? 'invalid' : '');
  const disabled = saving ? { disabled: true } : {};

  // Antal liter – begränsa bredd
  const refuelInputStyle: React.CSSProperties = { maxWidth: 120 };

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        <form onSubmit={onSubmit} noValidate>
          {/* Regnr + fordonsinfo */}
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              type="text"
              inputMode="text"
              className={`input ${invalid('reg')}`}
              placeholder="Skriv reg.nr"
              value={regInput}
              onChange={(e) => setRegInput(e.target.value)}
              {...disabled}
            />
            {knownWarning && <p className="reg-warning">Okänt reg.nr</p>}

            <div className="kv">
              <div>
                <div className="small-title">Bilmodell</div>
                <div className="small-value">{car?.model ?? '--'}</div>
              </div>
              <div>
                <div className="small-title">Hjulförvaring</div>
                <div className="small-value">{car?.wheelstorage ?? '--'}</div>
              </div>
            </div>

            <div className="small-title">Befintliga skador:</div>
            {damages.length === 0 ? (
              <div className="small-value">–</div>
            ) : (
              <ul className="damage-list">
                {damages.map((d) => (
                  <li key={d.id}>
                    {[d.plats, d.typ, d.beskrivning].filter(Boolean).join(' – ')}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Plats för incheckning */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            <label className="check">
              <input
                type="checkbox"
                checked={useFreePlace}
                onChange={(e) => toggleUseFreePlace(e.target.checked)}
              />
              <span>Annan plats (fritext)</span>
            </label>

            {useFreePlace ? (
              <>
                <label className="label">Beskriv plats *</label>
                <input
                  type="text"
                  className={`input ${invalid('freePlace')}`}
                  placeholder="Skriv platsbeskrivning"
                  value={freePlace}
                  onChange={(e) => setFreePlace(e.target.value)}
                  {...disabled}
                />
              </>
            ) : (
              <>
                <label className="label">Ort *</label>
                <div className="select-wrap">
                  <select
                    className={`select ${invalid('city')}`}
                    value={city}
                    onChange={(e) => onSelectCity(e.target.value)}
                    {...disabled}
                  >
                    <option value="">— Välj ort —</option>
                    {Object.keys(PLATSER).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="label">Station / Depå *</label>
                <div className="select-wrap">
                  <select
                    className={`select ${invalid('station')}`}
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                    disabled={!city || saving}
                  >
                    <option value="">— Välj station / depå —</option>
                    {stations.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Fordonsstatus */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <label className="label">Mätarställning *</label>
            <div className="with-suffix">
              <input
                type="text"
                inputMode="numeric"
                className={`input ${invalid('odo')}`}
                placeholder="ex. 42 180"
                value={odo}
                onChange={(e) => setOdo(e.target.value)}
                {...disabled}
              />
              <span className="suffix muted">km</span>
            </div>

            <div className="fieldset">
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
              {invalidFields['tank'] && <div className="field-hint invalid-hint">Välj ett alternativ</div>}

              {tankFull === false && (
                <div className="followups">
                  <div className="row gap">
                    <div>
                      <label className="label">Antal liter påfyllda *</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`input ${invalid('refuel')}`}
                        style={refuelInputStyle}
                        placeholder="0,0"
                        value={refuelLiters}
                        onChange={(e) => {
                          // tillåt siffror + komma
                          const v = e.target.value.replace(/[^\d,]/g, '');
                          setRefuelLiters(v);
                        }}
                        {...disabled}
                      />
                    </div>
                    <div>
                      <label className="label">Drivmedel *</label>
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
                      {(invalidFields['fuelType']) && (
                        <div className="field-hint invalid-hint">Välj drivmedel</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="fieldset">
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

            <div className="fieldset">
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

            <div className="fieldset">
              <div className="label">Insynsskydd OK? *</div>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${insynOk === true ? 'on' : ''}`}
                  onClick={() => setInsynOk(true)}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`segbtn ${insynOk === false ? 'on' : ''}`}
                  onClick={() => setInsynOk(false)}
                >
                  Nej
                </button>
              </div>
            </div>

            <div className="fieldset">
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

            <div className="fieldset">
              <div className="label">Hjul som sitter på *</div>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${wheels === 'Sommarhjul' ? 'on' : ''}`}
                  onClick={() => setWheels('Sommarhjul')}
                >
                  Sommarhjul
                </button>
                <button
                  type="button"
                  className={`segbtn ${wheels === 'Vinterhjul' ? 'on' : ''}`}
                  onClick={() => setWheels('Vinterhjul')}
                >
                  Vinterhjul
                </button>
              </div>
            </div>
          </div>

          {/* Nya skador */}
          <h2>Nya skador på bilen?</h2>
          {newDamages.map((d, i) => (
            <div className="damage-card" key={d.id}>
              <div className="damage-head">
                <div className="damage-title">Skada {i + 1}</div>
                <button type="button" className="link danger" onClick={() => removeDamage(d.id)}>
                  Ta bort
                </button>
              </div>

              <label className="label">Text (obligatorisk)</label>
              <input
                type="text"
                className={`input ${invalid(`nd_text_${i}`)}`}
                placeholder="Beskriv skadan…"
                value={d.text}
                onChange={(e) =>
                  setNewDamages((arr) =>
                    arr.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)),
                  )
                }
                {...disabled}
              />

              <div className="label">Bilder</div>
              <div className="photos">
                {d.photos.map((p) => (
                  <div key={p.id} className="photo">
                    <img src={p.url} alt="Skada" />
                    <button
                      type="button"
                      className="chip"
                      onClick={() => removePhoto(d.id, p.id)}
                    >
                      Ta bort
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="btn secondary" onClick={() => openFilePicker(d.id)}>
                Lägg till bild
              </button>
            </div>
          ))}

          <button type="button" className="btn ghost" onClick={addDamage}>
            Lägg till ytterligare en skada
          </button>

          {/* Fel/ok längst ner */}
          {saveError && <div className="banner error">{saveError}</div>}
          {saveOk && <div className="banner ok">{saveOk}</div>}

          <button type="submit" className="btn primary" disabled={!formValid || saving}>
            {saving ? 'Sparar…' : 'Spara incheckning'}
          </button>

          {/* Hidden file input för bilder */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPickFiles}
          />
        </form>
      </div>

      {/* Stil – ljus, tydlig, med felmarkeringar */}
      <style jsx>{`
        :root {
          --bg: #f6f7f9;
          --card: #ffffff;
          --text: #111827;
          --muted: #6b7280;
          --border: #e5e7eb;
          --primary: #1e4dd8;
          --primary-pressed: #153aa7;
          --danger: #c03630;

          --seg-bg: #f3f4f6;
          --seg-on-bg: #e0edff;
          --seg-on-border: #1e4dd8;

          --invalid-bg: #fff2f2;
          --invalid-border: #e11d48;
        }
        .page {
          background: var(--bg);
          min-height: 100vh;
          padding: 24px 16px 80px;
          color: var(--text);
        }
        .container {
          max-width: 720px;
          margin: 0 auto;
        }
        h1 {
          margin: 0 0 8px;
          font-size: 28px;
          font-weight: 700;
        }
        h2 {
          margin: 28px 0 12px;
          font-size: 18px;
          font-weight: 700;
        }
        .muted { color: var(--muted); }
        .card, .damage-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 14px 16px;
          margin-bottom: 12px;
        }
        .damage-card { border-left: 4px solid #ffe5b4; }
        .label { display: block; font-weight: 600; margin: 10px 0 6px; }
        .input, .select {
          width: 100%;
          border: 1px solid var(--border);
          background: #fff;
          padding: 12px 12px;
          border-radius: 10px;
          font-size: 16px;
          outline: none;
        }
        .with-suffix { position: relative; }
        .suffix { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); }

        .select-wrap { position: relative; }
        .select { appearance: none; }

        .fieldset { margin-top: 14px; }
        .seg { display: flex; gap: 10px; flex-wrap: wrap; }
        .segbtn {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--seg-bg);
          font-weight: 600;
        }
        .segbtn.on {
          background: var(--seg-on-bg);
          border-color: var(--seg-on-border);
        }

        .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
        .small-title { font-size: 12px; color: var(--muted); }
        .small-value { font-size: 16px; }

        .damage-list { margin: 6px 0 0 18px; padding: 0; list-style: disc; }
        .damage-head { display: flex; align-items: center; justify-content: space-between; }
        .damage-title { font-weight: 700; }

        .check { display: flex; gap: 10px; align-items: center; margin: 2px 0 10px; }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          padding: 12px 16px;
          border: 1px solid var(--border);
          background: #fff;
          font-weight: 700;
        }
        .btn.primary {
          width: 100%;
          background: var(--primary);
          color: #fff;
          border-color: var(--primary);
          margin-top: 12px;
        }
        .btn.primary:disabled {
          background: #a7b7ff;
          border-color: #a7b7ff;
          cursor: not-allowed;
        }
        .btn.primary:not(:disabled):active { background: var(--primary-pressed); }
        .btn.secondary { background: #eef2ff; border-color: #dde5ff; }
        .btn.ghost { background: transparent; }
        .link { color: var(--primary); background: transparent; border: 0; padding: 0; }
        .link.danger { color: var(--danger); }

        .reg-warning { color: #c02626; margin: 6px 0 4px; font-weight: 700; }

        .field-hint { margin-top: 6px; font-size: 13px; }
        .invalid-hint { color: var(--danger); }

        .invalid {
          border-color: var(--invalid-border) !important;
          background: var(--invalid-bg) !important;
        }

        .row.gap { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
        .photos { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 10px; }
        .photo { position: relative; width: 96px; height: 96px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: #fafafa; }
        .photo img { width: 100%; height: 100%; object-fit: cover; }
        .chip {
          position: absolute; left: 6px; bottom: 6px;
          background: rgba(255,255,255,0.9);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 12px;
        }

        .banner { margin: 10px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); }
        .banner.ok { background: #ecfdf5; border-color: #a7f3d0; }
        .banner.error { background: #fff1f2; border-color: #fecdd3; }

        .hidden { display: none; }
        @media (max-width: 520px) {
          .kv { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
