'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// -------------------------------------------------------------
// Supabase-klient (läser från env som tidigare)
// -------------------------------------------------------------
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || (globalThis as any).__SUPABASE_URL__;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (globalThis as any).__SUPABASE_ANON_KEY__;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// -------------------------------------------------------------
// Hjälp: normalisera reg.nr (versaler + ta bort tecken)
// -------------------------------------------------------------
function normalizeReg(raw: string) {
  if (!raw) return '';
  const up = raw.toUpperCase();
  return up.replace(/[^\w]/g, '');
}

// -------------------------------------------------------------
// Stationer/depåer (enbart den struktur vi använder i UI:t)
// OBS: färger/stil påverkas inte här.
// -------------------------------------------------------------
type DepotsByCity = Record<string, string[]>;
const DEPOTS: DepotsByCity = {
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
  'FALKENBERG': [
    'Huvudstation Falkenberg',
  ],
  'TRELLEBORG': [
    'Huvudstation Trelleborg',
  ],
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

// -------------------------------------------------------------
// Typer
// -------------------------------------------------------------
type LookupRow = {
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null; // UUID
};

type DamageRow = {
  id: string;
  plats: string | null;
  typ: string | null;
  beskrivning: string | null;
};

// -------------------------------------------------------------
// Komponent
// -------------------------------------------------------------
export default function CheckInForm() {
  // -------------- Form state --------------
  const [rawReg, setRawReg] = useState('');
  const normalizedReg = useMemo(() => normalizeReg(rawReg), [rawReg]);

  // data från backend
  const [car, setCar] = useState<LookupRow | null>(null);
  const [damageList, setDamageList] = useState<string[]>([]);
  const [diag, setDiag] = useState<any>(null);

  // UI: plats
  const cityList = Object.keys(DEPOTS);
  const [city, setCity] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [showOtherPlace, setShowOtherPlace] = useState(false);
  const [otherPlaceText, setOtherPlaceText] = useState('');

  // Fordonsstatus
  const [odometer, setOdometer] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState(''); // ex 12,5
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | ''>('');
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [privacy, setPrivacy] = useState(true); // dummy, behåll om du redan har
  const [insynOk, setInsynOk] = useState<boolean | null>(null);
  const [cables, setCables] = useState<0 | 1 | 2 | null>(null);
  const [wheelOnCar, setWheelOnCar] = useState<'Sommarhjul' | 'Vinterhjul' | ''>('');

  // Nya skador
  type NewDamage = { text: string; files: File[]; preview: string[] };
  const [newDamages, setNewDamages] = useState<NewDamage[]>([]);

  // Ladda “sann” data för regnr: modell, hjulförvaring, skador
  useEffect(() => {
    (async () => {
      if (!supabase || !normalizedReg) {
        setCar(null);
        setDamageList([]);
        return;
      }
      const steps: any[] = [];
      try {
        // RPC 1: car_lookup_any (läser från din tabell byggd från “Skador Aktiva bilar …”)
        const { data: carRows, error: carErr } = await supabase.rpc('car_lookup_any', {
          regnr: normalizedReg,
        });
        steps.push({
          name: 'rpc:car_lookup_any',
          ok: !carErr,
          error: carErr?.message,
          rows: carRows?.length ?? 0,
        });

        let picked: LookupRow | null = null;
        if (!carErr && Array.isArray(carRows) && carRows.length > 0) {
          picked = {
            regnr: carRows[0].regnr,
            model: carRows[0].model ?? null,
            wheelstorage: carRows[0].wheelstorage ?? null,
            car_id: carRows[0].car_id ?? null,
          };
        }
        setCar(picked);

        // RPC 2: damages_lookup_any (hämta skador efter car_id eller reg)
        let dmg: DamageRow[] = [];
        if (picked?.car_id) {
          const { data, error } = await supabase.rpc('damages_lookup_any', {
            car_id: picked.car_id,
            regnr: normalizedReg,
          });
          steps.push({
            name: 'rpc:damages_lookup_any',
            ok: !error,
            error: error?.message,
            rows: data?.length ?? 0,
          });
          if (!error && Array.isArray(data)) {
            dmg = data;
          }
        } else {
          // fallback: försök med regnr
          const { data, error } = await supabase.rpc('damages_lookup_any', {
            car_id: null,
            regnr: normalizedReg,
          });
          steps.push({
            name: 'rpc:damages_lookup_any (fallback)',
            ok: !error,
            error: error?.message,
            rows: data?.length ?? 0,
          });
          if (!error && Array.isArray(data)) {
            dmg = data;
          }
        }

        setDamageList(
          dmg.map((d) =>
            [d.plats, d.typ, d.beskrivning].filter(Boolean).join(' – ')
          )
        );

        setDiag({
          envOk: !!supabaseUrl,
          steps,
          rawInput: rawReg,
          normalizedInput: normalizedReg,
        });
      } catch (e: any) {
        steps.push({ name: 'catch', error: String(e) });
        setDiag({
          envOk: !!supabaseUrl,
          steps,
          rawInput: rawReg,
          normalizedInput: normalizedReg,
        });
        setCar(null);
        setDamageList([]);
      }
    })();
  }, [normalizedReg, rawReg]);

  // -------- Validering / Save-enable --------
  const litersValid = useMemo(() => {
    if (tankFull !== false) return true; // ej relevant
    if (!liters) return false;
    // tillåt 0–4 siffror + ev , + 1 siffra
    return /^\d{0,4}([,]\d)?$/.test(liters);
  }, [tankFull, liters]);

  const canSave = useMemo(() => {
    if (!normalizedReg) return false;

    // plats
    if (!showOtherPlace) {
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
    if (adBlueOk === null || spolarOk === null || insynOk === null) return false;
    if (cables === null) return false;
    if (!wheelOnCar) return false;

    // dummy privacy (om du tidigare hade krav)
    if (!privacy) return false;

    // skador: om någon rad finns, måste text vara ifylld
    for (const nd of newDamages) {
      if (!nd.text.trim()) return false;
    }
    return true;
  }, [
    normalizedReg,
    showOtherPlace,
    city,
    station,
    otherPlaceText,
    odometer,
    tankFull,
    litersValid,
    fuelType,
    adBlueOk,
    spolarOk,
    insynOk,
    cables,
    wheelOnCar,
    privacy,
    newDamages,
  ]);

  // ---------- Handlers ----------
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      setAlert({ type: 'error', text: 'Vänligen fyll i all information först.' });
      return;
    }
    // Dummy-spara – visa “Tack Bob!” längst ned
    setTimeout(() => {
      setAlert({
        type: 'ok',
        text: `Tack Bob! Incheckning för ${normalizedReg} är sparad.`,
      });
      // scrolla till botten
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  // --------- Alerts (fel / OK) ----------
  const [alert, setAlert] = useState<{ type: 'ok' | 'error'; text: string } | null>(
    null
  );
  const endRef = useRef<HTMLDivElement | null>(null);

  // --------- Bilduppladdning för nya skador ----------
  const addDamage = () =>
    setNewDamages((prev) => [...prev, { text: '', files: [], preview: [] }]);

  const removeDamageAt = (idx: number) =>
    setNewDamages((prev) => prev.filter((_, i) => i !== idx));

  const updateDamageText = (idx: number, v: string) =>
    setNewDamages((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], text: v };
      return copy;
    });

  const addDamageFiles = (idx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const previews = arr.map((f) => URL.createObjectURL(f));
    setNewDamages((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        files: [...copy[idx].files, ...arr],
        preview: [...copy[idx].preview, ...previews],
      };
      return copy;
    });
  };

  const removeDamageImage = (dIdx: number, pIdx: number) =>
    setNewDamages((prev) => {
      const copy = [...prev];
      const previews = [...copy[dIdx].preview];
      const files = [...copy[dIdx].files];
      previews.splice(pIdx, 1);
      files.splice(pIdx, 1);
      copy[dIdx] = { ...copy[dIdx], preview: previews, files };
      return copy;
    });

  // -------------------------------------------------------------
  // Render
  // -------------------------------------------------------------
  const stationOptions = city ? DEPOTS[city] ?? [] : [];

  // första knappen för skador
  const damageBtnLabel = newDamages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada';

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <strong>Bob</strong></p>

        <form onSubmit={onSubmit} noValidate>
          {/* Regnr + “sann” info */}
          <div className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className="input"
              value={rawReg}
              onChange={(e) => {
                // håll tangentbordet fritt – vi gör uppercase i state
                setRawReg(e.target.value.toUpperCase());
                setAlert(null);
              }}
              placeholder="Skriv reg.nr"
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
            />

            {!car && normalizedReg && (
              <p className="reg-warning">Okänt reg.nr</p>
            )}

            <div className="info">
              <div><span className="muted">Bilmodell:</span> {car?.model || '--'}</div>
              <div><span className="muted">Hjulförvaring:</span> {car?.wheelstorage || '--'}</div>
              <div>
                <span className="muted">Befintliga skador:</span>{' '}
                {damageList.length === 0 ? (
                  <span>–</span>
                ) : (
                  <ul className="damage-list">
                    {damageList.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Plats */}
          <h2>Plats för incheckning</h2>
          <div className="card">
            {!showOtherPlace && (
              <>
                <label className="label">Ort *</label>
                <div className="select">
                  <select
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setStation('');
                    }}
                  >
                    <option value="">— Välj ort —</option>
                    {cityList.map((c) => (
                      <option key={c} value={c}>{c}</option>
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
                    <option value="">— Välj station / depå —</option>
                    {stationOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setShowOtherPlace(true);
                    setCity('');
                    setStation('');
                  }}
                >
                  + Annan plats (fritext)
                </button>
              </>
            )}

            {showOtherPlace && (
              <div className="stack-sm">
                <label className="label">Annan plats *</label>
                <input
                  className="input"
                  value={otherPlaceText}
                  placeholder="Beskriv platsen kort…"
                  onChange={(e) => setOtherPlaceText(e.target.value)}
                />
                <div className="followup">
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setShowOtherPlace(false);
                      setOtherPlaceText('');
                    }}
                  >
                    Välj från lista i stället
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fordonsstatus */}
          <h2>Fordonsstatus</h2>
          <div className="card">
            <label className="label">Mätarställning *</label>
            <div className="odometer">
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
                <button
                  type="button"
                  className={`segbtn ${tankFull === true ? 'on' : ''}`}
                  onClick={() => {
                    setTankFull(true);
                    setLiters('');
                    setFuelType('');
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
                {/* Lägg underordnade frågor på egen rad, visuellt smalare */}
                <div className="grid-2">
                  <div className="stack-sm">
                    <label className="label">Antal liter påfyllda *</label>
                    <input
                      className={`input narrow ${litersValid ? '' : 'invalid'}`}
                      inputMode="decimal"
                      placeholder="ex. 7,5"
                      value={liters}
                      onChange={(e) => {
                        const v = e.target.value.replace('.', ','); // ersätt punkt med komma
                        if (/^\d{0,4}([,]\d)?$/.test(v) || v === '') setLiters(v);
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

            {/* Övrigt */}
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

            <div className="stack-sm">
              <label className="label">Antal laddsladdar *</label>
              <div className="seg">
                {[0, 1, 2].map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={`segbtn ${cables === n ? 'on' : ''}`}
                    onClick={() => setCables(n as 0 | 1 | 2)}
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
                  className={`segbtn ${wheelOnCar === 'Sommarhjul' ? 'on' : ''}`}
                  onClick={() => setWheelOnCar('Sommarhjul')}
                >
                  Sommarhjul
                </button>
                <button
                  type="button"
                  className={`segbtn ${wheelOnCar === 'Vinterhjul' ? 'on' : ''}`}
                  onClick={() => setWheelOnCar('Vinterhjul')}
                >
                  Vinterhjul
                </button>
              </div>
            </div>
          </div>

          {/* Nya skador */}
          <h2>Nya skador på bilen?</h2>
          {newDamages.map((dmg, idx) => (
            <div className="card damage" key={idx}>
              <div className="row-head">
                <strong>Skada {idx + 1}</strong>
                <button
                  type="button"
                  className="link danger"
                  onClick={() => removeDamageAt(idx)}
                >
                  Ta bort
                </button>
              </div>

              <label className="label">Text (obligatorisk)</label>
              <input
                className={`input ${dmg.text.trim() ? '' : 'invalid'}`}
                placeholder="Beskriv skadan…"
                value={dmg.text}
                onChange={(e) => updateDamageText(idx, e.target.value)}
              />

              <label className="label">Lägg till bild</label>
              <input
                type="file"
                accept="image/*"
                // “capture” öppnar kamera direkt i många mobiler men användaren kan byta till galleri;
                // om man vill tvinga val kan capture tas bort.
                capture="environment"
                onChange={(e) => addDamageFiles(idx, e.target.files)}
              />
              {dmg.preview.length > 0 && (
                <div className="thumbs">
                  {dmg.preview.map((src, pIdx) => (
                    <div key={pIdx} className="thumb">
                      <img src={src} alt={`Skada ${idx + 1}`} />
                      <button
                        type="button"
                        className="link danger"
                        onClick={() => removeDamageImage(idx, pIdx)}
                      >
                        Ta bort bild
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="followups">
            <button type="button" className="btn outline" onClick={addDamage}>
              {damageBtnLabel}
            </button>
          </div>

          {/* Alerts nära “Spara” enligt önskemål */}
          {alert && (
            <div className={`alert ${alert.type === 'ok' ? 'ok' : 'error'}`}>
              {alert.text}
            </div>
          )}

          <button className="btn primary" type="submit" disabled={!canSave}>
            Spara incheckning
          </button>

          <div ref={endRef} />

          <p className="copy muted">© Albarone AB 2025</p>
        </form>

        {/* Diagnostik (kan döljas i produktion) */}
        {diag && (
          <details className="debug">
            <summary>Diagnostik</summary>
            <pre>{JSON.stringify(diag, null, 2)}</pre>
          </details>
        )}
      </div>

      {/* -------------------------------------------------
           Stil (ljus). Vi ändrar inte ditt färgtema – använder
           neutrala färger och befintliga klassnamn.
         ------------------------------------------------- */}
      <style jsx>{`
        .page { padding: 16px; background:#f6f7f9; min-height:100vh; }
        .container{ max-width: 720px; margin:0 auto; }
        h1{ font-size: 24px; margin: 0 0 8px; }
        h2{ margin: 20px 0 10px; font-size:18px; }
        .muted{ color:#6b7280; }
        .label{ display:block; font-weight:600; margin:12px 0 6px; }
        .input, .select select{
          width:100%; padding:12px; border:1px solid #d1d5db; border-radius:10px; background:#fff;
        }
        .input.invalid{ border-color:#ef4444; background:#fff7f7; }
        .suffix{ margin-left:8px; }
        .odometer{ display:flex; align-items:center; gap:8px; }
        .card{ background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin:10px 0; }
        .seg{ display:flex; gap:8px; flex-wrap:wrap; }
        .segbtn{
          border:1px solid #d1d5db; background:#fff; border-radius:8px; padding:10px 12px; font-weight:600;
        }
        .segbtn.on{ background:#e8f0ff; border-color:#3b82f6; color:#1d4ed8; }
        .stack-sm{ margin-top:12px; }
        .grid-2{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:8px; }
        .btn{ padding:12px 14px; border-radius:10px; border:1px solid #cfd6e4; background:#fff; width:100%; }
        .btn.primary{ background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
        .btn.primary:disabled{ background:#94a3b8; border-color:#94a3b8; }
        .btn.outline{ background:#fff; }
        .link{ background:none; border:none; padding:0; margin-top:10px; color:#1d4ed8; text-align:left; }
        .link.danger{ color:#b91c1c; }
        .followups{ margin-top:12px; }
        .alert{ margin-top:12px; padding:10px 12px; border-radius:8px; }
        .alert.error{ background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
        .alert.ok{ background:#d1fae5; color:#065f46; border:1px solid #a7f3d0; }
        .debug{ margin-top:16px; }
        .reg-warning{ margin-top:6px; color:#dc2626; font-weight:600; }
        .damage-list{ margin:6px 0 0 16px; }
        .damage{ border-color:#fde68a; background:#fffbeb; }
        .row-head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
        .thumbs{ display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
        .thumb img{ width:96px; height:96px; object-fit:cover; border-radius:8px; border:1px solid #e5e7eb; }
        .copy{ text-align:center; margin:18px 0 8px; }
      `}</style>
    </div>
  );
}
