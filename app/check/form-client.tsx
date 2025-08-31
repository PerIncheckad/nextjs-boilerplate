'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* -------------------------------------------------------
   Hjälptyper
-------------------------------------------------------- */
type CarLookup = {
  regnr: string;
  model: string | null;
  wheelstorage: string | null;
  car_id: string | null;
};

type DamageRow = {
  plats?: string | null;
  typ?: string | null;
  beskrivning?: string | null;
};

/* -------------------------------------------------------
   Platser och depåer
-------------------------------------------------------- */
const ORTER = [
  'MALMÖ JÄGERSRO',
  'HELSINGBORG',
  'ÄNGELHOLM',
  'HALMSTAD',
  'FALKENBERG',
  'TRELLEBORG',
  'VARBERG',
  'LUND',
] as const;

const DEPÅER: Record<string, string[]> = {
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
  LUND: ['Huvudstation Lund', 'Ford Lund', 'Hedin Lund', 'B/S Lund', 'P7 Revinge'],
};

/* -------------------------------------------------------
   Hjälpfunktion
-------------------------------------------------------- */
const normalizeReg = (input: string) =>
  input.toUpperCase().replace(/[^A-Z0-9ÅÄÖ]/gi, '').trim();

/* -------------------------------------------------------
   Komponent
-------------------------------------------------------- */
export default function CheckInForm() {
  const [regInput, setRegInput] = useState('');
  const [regKnown, setRegKnown] = useState<boolean | null>(null);
  const [car, setCar] = useState<CarLookup | null>(null);
  const [damages, setDamages] = useState<DamageRow[]>([]);

  const [ort, setOrt] = useState('');
  const [depa, setDepa] = useState('');
  const [showOtherPlace, setShowOtherPlace] = useState(false);
  const [otherPlace, setOtherPlace] = useState('');

  const depaOptions = useMemo(() => (ort ? DEPÅER[ort] ?? [] : []), [ort]);

  const [odo, setOdo] = useState('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState('');
  const [fuelType, setFuelType] = useState<'Bensin' | 'Diesel' | ''>('');
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynOk, setInsynOk] = useState<boolean | null>(null);
  const [sladd, setSladd] = useState<0 | 1 | 2 | null>(null);
  const [hjul, setHjul] = useState<'Sommarhjul' | 'Vinterhjul' | ''>('');

  const [submitTried, setSubmitTried] = useState(false);
  const [submitOk, setSubmitOk] = useState<boolean | null>(null);

  // Dummy lookup
  useEffect(() => {
    const raw = regInput.trim();
    if (!raw) {
      setRegKnown(null);
      setCar(null);
      setDamages([]);
      return;
    }
    const norm = normalizeReg(raw);
    if (norm === 'DGF14H') {
      setRegKnown(true);
      setCar({ regnr: 'DGF14H', model: 'Volvo V90', wheelstorage: 'Malmö Jägersro', car_id: '1' });
      setDamages([{ plats: 'Vänster dörr', typ: 'Repa', beskrivning: 'Liten repa' }]);
    } else {
      setRegKnown(false);
      setCar(null);
      setDamages([]);
    }
  }, [regInput]);

  const fieldInvalid = (cond: boolean) => submitTried && cond;

  const canSubmit =
    (!!regInput &&
      (showOtherPlace ? !!otherPlace : !!ort && !!depa) &&
      !!odo &&
      tankFull !== null &&
      (tankFull ? true : !!liters && !!fuelType) &&
      adBlueOk !== null &&
      spolarOk !== null &&
      insynOk !== null &&
      sladd !== null &&
      !!hjul);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitTried(true);
    if (!canSubmit) {
      setSubmitOk(false);
      return;
    }
    setSubmitOk(true);
    setTimeout(() => setSubmitOk(null), 3000);
  };

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <b>Bob</b></p>

        <form onSubmit={onSubmit} noValidate>
          <section className="card">
            <label className="label">Registreringsnummer *</label>
            <input
              className={`input ${fieldInvalid(!regInput) ? 'invalid' : ''}`}
              value={regInput}
              onChange={(e) => setRegInput(e.target.value)}
              placeholder="Skriv reg.nr"
            />
            {regKnown === false && <p className="reg-warning">Okänt reg.nr</p>}

            <div className="info">
              <div><b>Bilmodell:</b> {car?.model ?? '--'}</div>
              <div><b>Hjulförvaring:</b> {car?.wheelstorage ?? '--'}</div>
              <div><b>Befintliga skador:</b>
                {damages.length === 0 ? ' –' : (
                  <ul className="damage-list">
                    {damages.map((d, i) => (
                      <li key={i}>{d.plats} – {d.typ} {d.beskrivning && `(${d.beskrivning})`}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <h2>Plats för incheckning</h2>
          <section className="card">
            <label className="label">Ort *</label>
            <select
              className={`select ${fieldInvalid(!showOtherPlace && !ort) ? 'invalid' : ''}`}
              value={ort}
              onChange={(e) => { setOrt(e.target.value); setDepa(''); }}
              disabled={showOtherPlace}
            >
              <option value="">— Välj ort —</option>
              {ORTER.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>

            <label className="label">Station / Depå *</label>
            <select
              className={`select ${fieldInvalid(!showOtherPlace && !depa) ? 'invalid' : ''}`}
              value={depa}
              onChange={(e) => setDepa(e.target.value)}
              disabled={showOtherPlace || !ort}
            >
              <option value="">— Välj station / depå —</option>
              {depaOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            {!showOtherPlace ? (
              <button type="button" className="linkbtn"
                onClick={() => { setShowOtherPlace(true); setOrt(''); setDepa(''); }}>
                + Annan plats (fritext)
              </button>
            ) : (
              <>
                <label className="label">Annan plats *</label>
                <input
                  className={`input ${fieldInvalid(showOtherPlace && !otherPlace) ? 'invalid' : ''}`}
                  value={otherPlace}
                  onChange={(e) => setOtherPlace(e.target.value)}
                  placeholder="Beskriv platsen"
                />
                <button type="button" className="linkbtn"
                  onClick={() => { setShowOtherPlace(false); setOtherPlace(''); }}>
                  Använd ort/station i stället
                </button>
              </>
            )}
          </section>

          <h2>Fordonsstatus</h2>
          <section className="card">
            <label className="label">Mätarställning *</label>
            <input
              className={`input ${fieldInvalid(!odo) ? 'invalid' : ''}`}
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
              placeholder="ex. 42 180"
              inputMode="numeric"
            />

            <label className="label">Tanknivå *</label>
            <div className="seg">
              <button type="button" className={`segbtn ${tankFull === true ? 'on' : ''}`} onClick={() => setTankFull(true)}>Fulltankad</button>
              <button type="button" className={`segbtn ${tankFull === false ? 'on' : ''}`} onClick={() => setTankFull(false)}>Ej fulltankad</button>
            </div>

            {tankFull === false && (
              <div className="followup">
                <label className="label">Antal liter påfyllda *</label>
                <input
                  className={`input narrow ${fieldInvalid(!liters) ? 'invalid' : ''}`}
                  value={liters}
                  onChange={(e) => setLiters(e.target.value.replace('.', ','))}
                  placeholder="ex. 7,5"
                />
                <label className="label">Bränsletyp *</label>
                <div className="seg">
                  <button type="button" className={`segbtn ${fuelType === 'Bensin' ? 'on' : ''}`} onClick={() => setFuelType('Bensin')}>Bensin</button>
                  <button type="button" className={`segbtn ${fuelType === 'Diesel' ? 'on' : ''}`} onClick={() => setFuelType('Diesel')}>Diesel</button>
                </div>
              </div>
            )}

            <label className="label">AdBlue OK? *</label>
            <div className="seg">
              <button type="button" className={`segbtn ${adBlueOk === true ? 'on' : ''}`} onClick={() => setAdBlueOk(true)}>Ja</button>
              <button type="button" className={`segbtn ${adBlueOk === false ? 'on' : ''}`} onClick={() => setAdBlueOk(false)}>Nej</button>
            </div>

            <label className="label">Spolarvätska OK? *</label>
            <div className="seg">
              <button type="button" className={`segbtn ${spolarOk === true ? 'on' : ''}`} onClick={() => setSpolarOk(true)}>Ja</button>
              <button type="button" className={`segbtn ${spolarOk === false ? 'on' : ''}`} onClick={() => setSpolarOk(false)}>Nej</button>
            </div>

            <label className="label">Insynsskydd OK? *</label>
            <div className="seg">
              <button type="button" className={`segbtn ${insynOk === true ? 'on' : ''}`} onClick={() => setInsynOk(true)}>Ja</button>
              <button type="button" className={`segbtn ${insynOk === false ? 'on' : ''}`} onClick={() => setInsynOk(false)}>Nej</button>
            </div>

            <label className="label">Antal laddsladdar *</label>
            <div className="seg">
              {[0, 1, 2].map((n) => (
                <button key={n} type="button" className={`segbtn ${sladd === n ? 'on' : ''}`} onClick={() => setSladd(n as 0 | 1 | 2)}>{n}</button>
              ))}
            </div>

            <label className="label">Hjul som sitter på *</label>
            <div className="seg">
              <button type="button" className={`segbtn ${hjul === 'Sommarhjul' ? 'on' : ''}`} onClick={() => setHjul('Sommarhjul')}>Sommarhjul</button>
              <button type="button" className={`segbtn ${hjul === 'Vinterhjul' ? 'on' : ''}`} onClick={() => setHjul('Vinterhjul')}>Vinterhjul</button>
            </div>
          </section>

          {submitOk === false && <div className="banner error">Vänligen fyll i all obligatorisk information först.</div>}
          {submitOk === true && <div className="banner ok">Tack Bob! Incheckningen sparades.</div>}

          <button type="submit" className="btn primary" disabled={!canSubmit}>Spara incheckning</button>
        </form>
      </div>

      <style jsx>{`
        .page { background:#f6f7f9; min-height:100vh; padding:20px; }
        .container { max-width:720px; margin:0 auto; }
        h1 { font-size:28px; margin:0 0 8px; }
        h2 { font-size:18px; margin:24px 0 12px; }
        .muted { color:#6b7280; }
        .card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin-bottom:16px; }
        .label { font-weight:600; margin-top:8px; }
        .input, .select { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:10px; }
        .invalid { border-color:#ef4444; background:#fef2f2; }
        .reg-warning { color:#dc2626; font-weight:600; margin-top:6px; }
        .seg { display:flex; gap:10px; flex-wrap:wrap; margin:6px 0; }
        .segbtn { padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; }
        .segbtn.on { background:#e0edff; border-color:#2563eb; color:#1d4ed8; }
        .btn.primary { width:100%; margin-top:12px; background:#1d4ed8; color:#fff; border:none; border-radius:10px; padding:12px; font-weight:700; }
        .btn.primary:disabled { background:#9ca3af; }
        .banner { padding:10px; border-radius:8px; margin:10px 0; font-weight:600; }
        .banner.ok { background:#ecfdf5; color:#065f46; }
        .banner.error { background:#fef2f2; color:#991b1b; }
        .info { margin-top:10px; }
        .damage-list { margin:6px 0 0 20px; list-style:disc; }
        .linkbtn { background:none; border:none; color:#1d4ed8; font-weight:600; margin-top:10px; cursor:pointer; }
        .suffix { margin-left:6px; color:#6b7280; }
        .narrow { max-width:120px; }
      `}</style>
    </div>
  );
}
