'use client';

import React, { useEffect, useMemo, useState } from 'react';

// ====== Hjälp: platser (Ort -> stationer/depåer) ======
const PLATSER: Record<string, string[]> = {
  'MALMÖ': [
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
  'LUND': [
    'Huvudstation Lund',
    'Ford Lund',
    'Hedin Lund',
    'B/S Lund',
    'P7 Revinge',
  ],
};

// ====== Supabase RPC-hjälpare ======
async function rpc<T = any>(fn: string, args: any): Promise<{ data: T[]; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    return { data: [], error: `${res.status} ${res.statusText}` };
  }
  const data = (await res.json()) as T[];
  return { data };
}

// ====== Typer för formulär ======
type FuelType = 'Bensin' | 'Diesel' | null;
type DamagePhoto = { id: string; url: string | undefined; file?: File };
type NewDamage = { id: string; text: string; photos: DamagePhoto[] };

export default function CheckInForm() {
  const userName = 'Bob';

  // — Reg.nr
  const [regInput, setRegInput] = useState('');
  const normalizedReg = useMemo(
    () => regInput.toUpperCase().replace(/[^\w]/g, ''),
    [regInput]
  );
  const [carModel, setCarModel] = useState<string | null>(null);
  const [wheelStorage, setWheelStorage] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [isKnownReg, setIsKnownReg] = useState<boolean | null>(null);

  // — Plats
  const orter = Object.keys(PLATSER);
  const [ort, setOrt] = useState('');
  const [station, setStation] = useState('');
  const [showOtherPlace, setShowOtherPlace] = useState(false);
  const [otherPlaceText, setOtherPlaceText] = useState('');

  // — Fordonsstatus
  const [odometer, setOdometer] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cords, setCords] = useState<0 | 1 | 2 | null>(null);
  const [wheelOn, setWheelOn] = useState<'Sommarhjul' | 'Vinterhjul' | null>(null);

  // — Nya skador
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);
  const addDamage = () =>
    setNewDamages((arr) => [...arr, { id: crypto.randomUUID(), text: '', photos: [] }]);
  const removeDamage = (id: string) =>
    setNewDamages((arr) => arr.filter((d) => d.id !== id));
  const setDamageText = (id: string, text: string) =>
    setNewDamages((arr) => arr.map((d) => (d.id === id ? { ...d, text } : d)));
  const addDamagePhoto = (id: string, files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    setNewDamages((arr) =>
      arr.map((d) =>
        d.id === id
          ? {
              ...d,
              photos: [
                ...d.photos,
                { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) },
              ],
            }
          : d
      )
    );
  };
  const removeDamagePhoto = (id: string, photoId: string) =>
    setNewDamages((arr) =>
      arr.map((d) =>
        d.id === id ? { ...d, photos: d.photos.filter((p) => p.id !== photoId) } : d
      )
    );

  // — Fel & status
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState('');

  // ====== Hämtning av fordonsdata ======
  useEffect(() => {
    setIsKnownReg(null);
    setCarModel(null);
    setWheelStorage(null);
    setExistingDamages([]);
    if (!normalizedReg) return;

    (async () => {
      // Bil
      const car = await rpc<any>('car_lookup_any', { regnr: normalizedReg });
      if (car.error || car.data.length === 0) {
        setIsKnownReg(false);
        return;
      }
      const picked = car.data[0];
      setIsKnownReg(true);
      setCarModel(picked?.model ?? null);
      setWheelStorage(picked?.wheelstorage ?? null);

      // Skador
      const carId = picked.car_id ?? null;
      let dm: any[] = [];
      const dmgRes = await rpc<any>('damages_lookup_any', { car_id: carId, regnr: normalizedReg });
      if (!dmgRes.error) dm = dmgRes.data ?? [];
      const texts = dm
        .map((d) => (d?.desc || d?.description || d?.beskrivning || '').toString().trim())
        .filter(Boolean);
      setExistingDamages(texts);
    })();
  }, [normalizedReg]);
  // ====== Validering ======
  const litersValid = useMemo(() => {
    if (tankFull !== false) return true;            // bara relevant när Ej fulltankad
    if (!liters) return false;
    // tillåt 0–4 siffror + ev 1 kommatecken + 1 siffra (12,5)
    return /^(\d{1,4})(,\d)?$/.test(liters);
  }, [tankFull, liters]);

  const canSave = useMemo(() => {
    if (!normalizedReg) return false;

    // Plats
    if (!showOtherPlace) {
      if (!ort) return false;
      if (!station) return false;
    } else {
      if (!otherPlaceText.trim()) return false;
    }

    // Fordonsstatus
    if (!odometer.trim()) return false;
    if (tankFull === null) return false;
    if (tankFull === false) {
      if (!litersValid) return false;
      if (!fuelType) return false;
    }
    if (adBlueOk === null || spolarOk === null || privacyOk === null) return false;
    if (cords === null) return false;
    if (!wheelOn) return false;

    // Skador – inget krav, men om block finns måste text finnas
    for (const d of newDamages) {
      if (!d.text.trim()) return false;
    }
    return true;
  }, [
    normalizedReg,
    showOtherPlace,
    ort,
    station,
    otherPlaceText,
    odometer,
    tankFull,
    litersValid,
    fuelType,
    adBlueOk,
    spolarOk,
    privacyOk,
    cords,
    wheelOn,
    newDamages,
  ]);

  // ====== Submit (dummy) ======
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    setSaveOk('');

    if (!canSave) {
      setSaveError('Vänligen fyll i all information först.');
      return;
    }

    // Dummy: visa lyckad incheckning
    setSaveOk(`Tack ${userName}! Incheckningen är sparad.`);
    // Rulla ned så man ser meddelandet nära knappen
    requestAnimationFrame(() => {
      document.getElementById('save-footer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ====== Render ======
  const stationer = ort ? PLATSER[ort] ?? [] : [];

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>{userName}</strong></p>

        <form onSubmit={onSubmit} noValidate>
          {/* REG/lookup */}
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className="input"
              placeholder="Skriv reg.nr"
              value={regInput}
              onChange={(e) => setRegInput(e.target.value)}
              autoCapitalize="characters"
              inputMode="text"
            />
            {isKnownReg === false && (
              <div className="reg-warning">Okänt reg.nr</div>
            )}

            <div className="kv">
              <div><span className="kv-key">Bilmodell:</span> <span className="kv-val">{carModel ?? '--'}</span></div>
              <div><span className="kv-key">Hjulförvaring:</span> <span className="kv-val">{wheelStorage ?? '--'}</span></div>
              <div className="kv-col">
                <div className="kv-key">Befintliga skador:</div>
                {existingDamages.length ? (
                  <ul className="damage-list">
                    {existingDamages.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                ) : (
                  <div className="kv-val">–</div>
                )}
              </div>
            </div>
          </div>

          {/* PLATS */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            {!showOtherPlace && (
              <>
                <label className="label">Ort *</label>
                <select
                  className="input"
                  value={ort}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOrt(v);
                    setStation('');
                  }}
                >
                  <option value="">— Välj ort —</option>
                  {orter.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>

                <label className="label">Station / Depå *</label>
                <select
                  className="input"
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  disabled={!ort}
                >
                  <option value="">{ort ? '— Välj station / depå —' : 'Välj ort först'}</option>
                  {stationer.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </>
            )}

            {showOtherPlace ? (
              <>
                <label className="label">Annan plats (fritext) *</label>
                <input
                  className="input"
                  placeholder="Skriv platsbeskrivning…"
                  value={otherPlaceText}
                  onChange={(e) => setOtherPlaceText(e.target.value)}
                />
              </>
            ) : null}

            <button
              type="button"
              className="link"
              onClick={() => setShowOtherPlace((b) => !b)}
            >
              {showOtherPlace ? '⟵ Välj från listan istället' : '+ Annan plats (fritext)'}
            </button>
          </div>

          {/* FORDONSSTATUS */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <label className="label">Mätarställning *</label>
            <div className="input-with-suffix">
              <input
                className="input"
                placeholder="ex. 42 180"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <span className="suffix muted">km</span>
            </div>

            <label className="label">Tanknivå *</label>
            <div className="seg">
              <button
                type="button"
                className={`segbtn ${tankFull === true ? 'on' : ''}`}
                onClick={() => { setTankFull(true); setLiters(''); setFuelType(null); }}
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

            {tankFull === false && (
              <div className="subgrid">
                <div className="stack-sm subright">
                  <label className="label">Antal liter påfyllda *</label>
                  <input
                    className={`input narrow ${litersValid ? '' : 'invalid'}`}
                    inputMode="decimal"
                    placeholder="ex. 12,5"
                    value={liters}
                    onChange={(e) => {
                      const v = e.target.value.replace('.', ','); // punkt -> komma
                      if (/^[0-9]{0,4}(,[0-9])?$/.test(v) || v === '') setLiters(v);
                    }}
                  />
                </div>

                <div className="stack-sm subright">
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

            <label className="label">Antal laddsladdar *</label>
            <div className="seg">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`segbtn ${cords === n ? 'on' : ''}`}
                  onClick={() => setCords(n as 0 | 1 | 2)}
                >
                  {n}
                </button>
              ))}
            </div>

            <label className="label">Hjul som sitter på *</label>
            <div className="seg">
              <button
                type="button"
                className={`segbtn ${wheelOn === 'Sommarhjul' ? 'on' : ''}`}
                onClick={() => setWheelOn('Sommarhjul')}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                className={`segbtn ${wheelOn === 'Vinterhjul' ? 'on' : ''}`}
                onClick={() => setWheelOn('Vinterhjul')}
              >
                Vinterhjul
              </button>
            </div>
          </div>

          {/* NYA SKADOR */}
          <h2>Nya skador på bilen?</h2>

          {newDamages.map((dmg, idx) => (
            <div key={dmg.id} className="card dmg">
              <div className="row-between">
                <strong>Skada {idx + 1}</strong>
                <button type="button" className="link danger" onClick={() => removeDamage(dmg.id)}>
                  Ta bort
                </button>
              </div>

              <label className="label">Text (obligatorisk)</label>
              <input
                className={`input ${!dmg.text.trim() ? 'invalid' : ''}`}
                placeholder="Beskriv skadan…"
                value={dmg.text}
                onChange={(e) => setDamageText(dmg.id, e.target.value)}
              />

              <label className="label">Lägg till bild</label>
              <input
                className="file"
                type="file"
                accept="image/*"
                onChange={(e) => addDamagePhoto(dmg.id, e.target.files)}
              />

              {!!dmg.photos.length && (
                <div className="thumbs">
                  {dmg.photos.map((p) => (
                    <div key={p.id} className="thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="skada" />
                      <button type="button" className="thumb-del" onClick={() => removeDamagePhoto(dmg.id, p.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button type="button" className="btn outline" onClick={addDamage}>
            Lägg till ytterligare en skada
          </button>

          {/* SAVE */}
          <div id="save-footer" className="save-wrap">
            {saveError && <div className="alert error">{saveError}</div>}
            {saveOk && <div className="alert ok">{saveOk}</div>}
            <button type="submit" className="btn primary" disabled={!canSave}>
              Spara incheckning
            </button>
          </div>

          {/* Stil */}
          <style jsx>{`
            .page { padding: 16px; background: #f6f7f9; }
            .container { max-width: 720px; margin: 0 auto; }
            h1 { font-size: 28px; margin: 0 0 12px; }
            h2 { font-size: 18px; margin: 24px 0 8px; }
            .muted { color: #6b7280; }

            .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin: 12px 0; }
            .label { display: block; font-size: 14px; margin: 6px 0 4px; color: #111827; }
            .input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 16px; background:#fff; color:#111;}
            .input.invalid { border-color: #ef4444; background: #fff5f5; }

            .input-with-suffix { position: relative; }
            .suffix { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); }

            .seg { display: flex; gap: 10px; margin: 6px 0 10px; }
            .segbtn { padding: 10px 14px; border-radius: 10px; border: 1px solid #d1d5db; background:#fff; }
            .segbtn.on { background: #e8f2ff; border-color: #3b82f6; color: #1d4ed8; }

            .link { margin-top: 6px; background: transparent; border: none; color: #2563eb; padding: 0; }
            .link.danger { color: #b91c1c; }

            .reg-warning { margin-top: 6px; color: #dc2626; font-weight: 600; }

            .kv { margin-top: 10px; display: grid; gap: 6px; }
            .kv-key { color: #374151; margin-right: 8px; }
            .damage-list { margin: 6px 0 0 18px; }

            .subgrid { display: grid; grid-template-columns: 1fr; gap: 8px; }
            .subright { text-align: right; }
            .narrow { max-width: 120px; margin-left: auto; }
            @media (min-width: 560px) {
              .subgrid { grid-template-columns: 1fr 1fr; }
            }

            .file { display: block; }

            .thumbs { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
            .thumb { position: relative; width: 90px; height: 90px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
            .thumb img { width: 100%; height: 100%; object-fit: cover; }
            .thumb-del { position: absolute; top: 2px; right: 2px; border: none; background: rgba(0,0,0,.55); color: #fff; border-radius: 50%; width: 22px; height: 22px; }

            .btn { display: inline-block; padding: 12px 16px; border-radius: 12px; border: 1px solid #d1d5db; background:#fff; }
            .btn.primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
            .btn.primary:disabled { opacity: 0.45; }
            .btn.outline { background:#fff; color:#1f2937; }

            .save-wrap { margin: 18px 0 40px; display: grid; gap: 10px; }
            .alert { padding: 12px; border-radius: 10px; }
            .alert.error { background:#fee2e2; color:#991b1b; }
            .alert.ok { background:#dcfce7; color:#166534; }

            .row-between { display:flex; align-items:center; justify-content:space-between; }
          `}</style>
        </form>
      </div>
    </div>
  );
}
