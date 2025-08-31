'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type CarRow = {
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = {
  id: string;
  beskrivning: string | null;
};

type Option = { value: string; label: string };

const ORTER: Option[] = [
  { value: 'MALMÖ', label: 'MALMÖ' },
  { value: 'HELSINGBORG', label: 'HELSINGBORG' },
  { value: 'ÄNGELHOLM', label: 'ÄNGELHOLM' },
  { value: 'HALMSTAD', label: 'HALMSTAD' },
  { value: 'FALKENBERG', label: 'FALKENBERG' },
  { value: 'TRELLEBORG', label: 'TRELLEBORG' },
  { value: 'VARBERG', label: 'VARBERG' },
  { value: 'LUND', label: 'LUND' },
];

const DEPÅER: Record<string, Option[]> = {
  MALMÖ: [
    { value: 'HUVUDSTATION MALMÖ JÄGERSRO', label: 'Huvudstation Malmö Jägersro' },
    { value: 'FORD MALMÖ', label: 'Ford Malmö' },
    { value: 'MECHANUM', label: 'Mechanum' },
    { value: 'MALMÖ AUTOMERA', label: 'Malmö Automera' },
    { value: 'MERCEDES MALMÖ', label: 'Mercedes Malmö' },
    { value: 'WERKSTA ST BERNSTORP', label: 'Werksta St Bernstorp' },
    { value: 'WERKSTA MALMÖ HAMN', label: 'Werksta Malmö Hamn' },
    { value: 'HEDBERGS MALMÖ', label: 'Hedbergs Malmö' },
    { value: 'HEDIN AUTOMOTIVE BURLÖV', label: 'Hedin Automotive Burlöv' },
    { value: 'STURUP', label: 'Sturup' },
  ],
  HELSINGBORG: [
    { value: 'HUVUDSTATION HELSINGBORG', label: 'Huvudstation Helsingborg' },
    { value: 'HBSC HELSINGBORG', label: 'HBSC Helsingborg' },
    { value: 'FORD HELSINGBORG', label: 'Ford Helsingborg' },
    { value: 'TRANSPORT HELSINGBORG', label: 'Transport Helsingborg' },
    { value: 'S JÖNSSON', label: 'S. Jönsson' },
    { value: 'BMW HELSINGBORG', label: 'BMW Helsingborg' },
    { value: 'KIA HELSINGBORG', label: 'KIA Helsingborg' },
    { value: 'EUROMASTER HELSINGBORG', label: 'Euromaster Helsingborg' },
    { value: 'B/S KLIPPAN', label: 'B/S Klippan' },
    { value: 'B/S MUNKA-LJUNGBY', label: 'B/S Munka-Ljungby' },
    { value: 'B/S HELSINGBORG', label: 'B/S Helsingborg' },
    { value: 'WERKSTA HELSINGBORG', label: 'Werksta Helsingborg' },
    { value: 'BÅSTAD', label: 'Båstad' },
  ],
  ÄNGELHOLM: [
    { value: 'HUVUDSTATION ÄNGELHOLM', label: 'Huvudstation Ängelholm' },
    { value: 'FORD ÄNGELHOLM', label: 'FORD Ängelholm' },
    { value: 'MEKONOMEN ÄNGELHOLM', label: 'Mekonomen Ängelholm' },
    { value: 'FLYGET ÄNGELHOLM', label: 'Flyget Ängelholm' },
  ],
  HALMSTAD: [
    { value: 'HUVUDSTATION HALMSTAD', label: 'Huvudstation Halmstad' },
    { value: 'FLYGET HALMSTAD', label: 'Flyget Halmstad' },
    { value: 'KIA HALMSTAD', label: 'KIA Halmstad' },
    { value: 'FORD HALMSTAD', label: 'FORD Halmstad' },
  ],
  FALKENBERG: [{ value: 'HUVUDSTATION FALKENBERG', label: 'Huvudstation Falkenberg' }],
  TRELLEBORG: [{ value: 'HUVUDSTATION TRELLEBORG', label: 'Huvudstation Trelleborg' }],
  VARBERG: [
    { value: 'HUVUDSTATION VARBERG', label: 'Huvudstation Varberg' },
    { value: 'FORD VARBERG', label: 'Ford Varberg' },
    { value: 'HEDIN AUTOMOTIVE VARBERG', label: 'Hedin Automotive Varberg' },
    { value: 'SÄLLSTORP LACK PLÅT', label: 'Sällstorp lack plåt' },
    { value: 'FINNVEDEN PLÅT', label: 'Finnveden plåt' },
  ],
  LUND: [
    { value: 'HUVUDSTATION LUND', label: 'Huvudstation Lund' },
    { value: 'FORD LUND', label: 'Ford Lund' },
    { value: 'HEDIN LUND', label: 'Hedin Lund' },
    { value: 'B/S LUND', label: 'B/S Lund' },
    { value: 'P7 REVINGE', label: 'P7 Revinge' },
  ],
};

type NewDamage = {
  id: string;
  text: string;
  photos: string[]; // just names/urls placeholder
};

export default function CheckInForm() {
  const supabase = useMemo(() => createClient(), []);
  // ————————— State
  const [rawReg, setRawReg] = useState('');
  const normalizedReg = useMemo(
    () => rawReg.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    [rawReg]
  );

  // lookup data
  const [car, setCar] = useState<CarRow | null>(null);
  const [known, setKnown] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageRow[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);

  // plats
  const [city, setCity] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [otherPlace, setOtherPlace] = useState(false);
  const [otherPlaceText, setOtherPlaceText] = useState('');

  // fordonsstatus
  const [odometer, setOdometer] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState('');
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacy, setPrivacy] = useState<boolean>(false);
  const [tintedOk, setTintedOk] = useState<boolean | null>(null);
  const [cables, setCables] = useState<0 | 1 | 2 | null>(null);
  const [wheels, setWheels] = useState<'Sommarhjul' | 'Vinterhjul' | null>(null);

  // nya skador
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);

  // submit UI
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<boolean>(false);

  // ————————— Lookup on normalizedReg
  useEffect(() => {
    setSaveOk(false);
    setSaveError(null);

    if (!normalizedReg) {
      setKnown(null);
      setCar(null);
      setDamages([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingLookup(true);
      try {
        // 1) car
        const { data: carRows, error: carErr } = await supabase
          .rpc('car_lookup_any', { reg: normalizedReg });
        if (carErr) throw carErr;

        const carRow = Array.isArray(carRows) && carRows.length > 0 ? (carRows[0] as CarRow) : null;
        if (!cancelled) {
          setCar(carRow);
          setKnown(!!carRow);
        }

        // 2) damages (om car_id finns)
        if (carRow?.car_id) {
          const { data: dmg, error: dmgErr } = await supabase
            .rpc('damages_lookup_any', { car_id: carRow.car_id, reg: normalizedReg });
          if (dmgErr) throw dmgErr;
          if (!cancelled) setDamages((dmg as DamageRow[]) ?? []);
        } else {
          if (!cancelled) setDamages([]);
        }
      } catch (e) {
        if (!cancelled) {
          setKnown(false);
          setCar(null);
          setDamages([]);
        }
      } finally {
        if (!cancelled) setLoadingLookup(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedReg, supabase]);

  // ————————— Validation
  const litersValid = useMemo(() => {
    if (tankFull !== false) return true;
    if (!liters) return false;
    // tillåt 0-4 siffror + ev , + 1 siffra
    return /^[0-9]{1,4}(,[0-9])?$/.test(liters);
  }, [tankFull, liters]);

  const canSave = useMemo(() => {
    if (!normalizedReg) return false;

    // plats
    if (!otherPlace) {
      if (!city) return false;
      if (!station) return false;
    } else {
      if (!otherPlaceText.trim()) return false;
    }

    // fordonsstatus
    if (!odometer.trim()) return false;
    if (tankFull === null) return false;
    if (tankFull === false) {
      if (!litersValid) return false;
      if (!fuelType) return false;
    }

    if (adBlueOk === null || spolarOk === null || tintedOk === null) return false;
    if (cables === null) return false;
    if (wheels === null) return false;

    return true;
  }, [
    normalizedReg,
    otherPlace,
    otherPlaceText,
    city,
    station,
    odometer,
    tankFull,
    litersValid,
    fuelType,
    adBlueOk,
    spolarOk,
    tintedOk,
    cables,
    wheels,
  ]);

  // ————————— Handlers
  const onAddDamage = () => {
    setNewDamages((ds) => [
      ...ds,
      { id: crypto.randomUUID(), text: '', photos: [] },
    ]);
  };

  const onRemoveDamage = (id: string) => {
    setNewDamages((ds) => ds.filter((d) => d.id !== id));
  };

  const onPhotoPick = (id: string) => {
    // Dummy: visa filpicker & lägg till ett “foto-namn”.
    const name = `foto_${Math.floor(Math.random() * 1000)}.jpg`;
    setNewDamages((ds) =>
      ds.map((d) => (d.id === id ? { ...d, photos: [...d.photos, name] } : d))
    );
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);

    if (!canSave) {
      setSaveError('Vänligen fyll i all obligatorisk information först.');
      return;
    }

    // Dummy-spara: lyckas alltid om odometer är ifyllt och >= 0
    if (odometer.trim()) {
      setSaveOk(true);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else {
      setSaveError('Något gick fel vid sparande. Försök igen.');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  const stationOptions = city ? DEPÅER[city] ?? [] : [];

  const showFuelFollowups = tankFull === false;

  // ————————— Render
  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        <form onSubmit={onSubmit}>
          {/* REG */}
          <section className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className="input"
              placeholder="Skriv reg.nr"
              value={rawReg}
              onChange={(e) => setRawReg(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />

            {normalizedReg && known === false && (
              <div className="reg-warning">Okänt reg.nr</div>
            )}

            <div className="row-meta">
              <div>
                <div className="meta-title">Bilmodell:</div>
                <div className="meta-val">{car?.model || '--'}</div>
              </div>
              <div>
                <div className="meta-title">Hjulförvaring:</div>
                <div className="meta-val">{car?.wheelstorage || '--'}</div>
              </div>
            </div>

            <div className="meta-title" style={{ marginTop: 8 }}>Befintliga skador:</div>
            {damages.length === 0 ? (
              <div className="meta-val">–</div>
            ) : (
              <ul className="damage-list">
                {damages.map((d) => (
                  <li key={d.id}>{d.beskrivning || '—'}</li>
                ))}
              </ul>
            )}
          </section>

          {/* PLATS */}
          <h2>Plats för incheckning</h2>
          <section className="card">
            <label className="label">Ort *</label>
            <select
              className={`input select ${!otherPlace && !city && 'invalid'}`}
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setStation('');
              }}
              disabled={otherPlace}
            >
              <option value="">— Välj ort —</option>
              {ORTER.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="label">Station / Depå *</label>
            <select
              className={`input select ${!otherPlace && !station && 'invalid'}`}
              value={station}
              onChange={(e) => setStation(e.target.value)}
              disabled={otherPlace || !city}
            >
              <option value="">{city ? '— Välj station / depå —' : 'Välj ort först'}</option>
              {stationOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {!otherPlace ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setOtherPlace(true);
                  setCity('');
                  setStation('');
                }}
              >
                + Annan plats (fritext)
              </button>
            ) : (
              <div className="stack-sm">
                <label className="label">Annan plats *</label>
                <input
                  className={`input ${otherPlace && !otherPlaceText.trim() && 'invalid'}`}
                  placeholder="Beskriv platsen…"
                  value={otherPlaceText}
                  onChange={(e) => setOtherPlaceText(e.target.value)}
                />
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setOtherPlace(false);
                    setOtherPlaceText('');
                  }}
                >
                  – Avbryt annan plats
                </button>
              </div>
            )}
          </section>

          {/* FORDONSSTATUS */}
          <h2>Fordonsstatus</h2>
          <section className="card">
            <label className="label">Mätarställning *</label>
            <div className="seg input-with-suffix">
              <input
                className={`input ${!odometer.trim() && 'invalid'}`}
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

            {showFuelFollowups && (
              <div className="followups">
                <div className="followup">
                  <label className="label">Antal liter påfyllda *</label>
                  <input
                    className={`input narrow ${!litersValid && 'invalid'}`}
                    inputMode="decimal"
                    placeholder="ex. 7,5"
                    value={liters}
                    onChange={(e) => {
                      const v = e.target.value.replace('.', ',');
                      if (/^[0-9]{0,4}(,[0-9])?$/.test(v)) setLiters(v);
                    }}
                  />
                </div>

                <div className="followup">
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
                    className={`segbtn ${tintedOk === true ? 'on' : ''}`}
                    onClick={() => setTintedOk(true)}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    className={`segbtn ${tintedOk === false ? 'on' : ''}`}
                    onClick={() => setTintedOk(false)}
                  >
                    Nej
                  </button>
                </div>
              </div>

              <div className="stack-sm">
                <label className="label">Antal laddsladdar *</label>
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
            </div>

            <div className="stack-sm">
              <label className="label">Hjul som sitter på *</label>
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
          </section>

          {/* NYA SKADOR */}
          <h2>Nya skador på bilen?</h2>
          {newDamages.length === 0 ? (
            <button type="button" className="btn outline" onClick={onAddDamage}>
              Lägg till skada
            </button>
          ) : (
            <>
              {newDamages.map((dmg, idx) => (
                <section key={dmg.id} className="card warn">
                  <div className="card-title">
                    <strong>Skada {idx + 1}</strong>
                    <button
                      type="button"
                      className="link danger"
                      onClick={() => onRemoveDamage(dmg.id)}
                      aria-label="Ta bort skada"
                    >
                      Ta bort
                    </button>
                  </div>

                  <label className="label">Text (obligatorisk)</label>
                  <input
                    className={`input ${!dmg.text.trim() && 'invalid'}`}
                    placeholder="Beskriv skadan…"
                    value={dmg.text}
                    onChange={(e) =>
                      setNewDamages((ds) =>
                        ds.map((x) => (x.id === dmg.id ? { ...x, text: e.target.value } : x))
                      )
                    }
                  />

                  <div className="stack-sm">
                    <label className="label">Bilder</label>
                    <div className="seg">
                      <button type="button" className="btn" onClick={() => onPhotoPick(dmg.id)}>
                        Lägg till bild
                      </button>
                    </div>
                    {dmg.photos.length > 0 && (
                      <div className="thumbs">
                        {dmg.photos.map((p, i) => (
                          <div key={i} className="thumb">
                            <div className="ph">{p}</div>
                          </div>
                        ))}
                      </div>
                    )}
                 
