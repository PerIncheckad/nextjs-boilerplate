'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';

/* =========================================================
   1) Typer
   ========================================================= */
type RegNr = string;

type DamageEntry = {
  id: string;
  plats: string;
  typ: string;
  beskrivning?: string;
};

type CanonicalCar = {
  regnr: RegNr;          // original-format
  model: string;         // normaliserat fältnamn (bilmodell)
  wheelStorage: string;  // normaliserat fältnamn (hjulförvaring)
  skador: DamageEntry[]; // befintliga skador
};

/* =========================================================
   2) Normalisering – MÅSTE användas på både input och lista
   ========================================================= */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\s\-_.]/g, '')              // mellanslag, -, _, .
    .trim();
}

/* =========================================================
   3) Mappning från "godtyckligt råformat" → CanonicalCar
      (täcker vanliga varianter på fältnamn)
   ========================================================= */
function toCanonicalCar(raw: any): CanonicalCar | null {
  if (!raw) return null;

  // --- regnr ---
  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationNumber ??
    raw.license ?? raw.licensePlate ?? raw.plate ?? raw.regNo ?? raw.reg_no;
  if (!reg || typeof reg !== 'string') return null;

  // --- modell ---
  const model =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? '';

  // --- hjulförvaring ---
  const wheelStorage =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? '';

  // --- skador ---
  const damagesArr: any[] =
    raw.skador ?? raw.damages ?? raw.damageList ?? raw.existingDamages ?? [];
  const skador: DamageEntry[] = Array.isArray(damagesArr)
    ? damagesArr.map((d: any, i: number) => ({
        id: String(d?.id ?? `d${i + 1}`),
        plats: String(d?.plats ?? d?.place ?? d?.position ?? 'Okänd plats'),
        typ: String(d?.typ ?? d?.type ?? 'Skada'),
        beskrivning: d?.beskrivning ?? d?.desc ?? d?.description ?? undefined,
      }))
    : [];

  return {
    regnr: String(reg),
    model: String(model ?? ''),
    wheelStorage: String(wheelStorage ?? ''),
    skador,
  };
}

/* =========================================================
   4) Din fordonslista
   ---------------------------------------------------------
   VIKTIGT:
   - Om du redan har en lista i projektet: lägg in den här
     (som array med dina poster), så mappar koden upp den.
   - Exempel nedan innehåller DGF14H (från din skärmdump).
   - Du kan fylla på, eller ersätta helt med din riktiga lista.
   ========================================================= */
const RAW_CARS: any[] = [
  {
    regnr: 'DGF14H',
    modell: 'Volvo V60 B4',
    hjulförvaring: 'På anläggning – Malmö',
    skador: [
      { id: 'k1', plats: 'Höger framfångare', typ: 'Repa', beskrivning: 'Ytlig repa ca 3 cm' },
      { id: 'k2', plats: 'Motorhuv', typ: 'Lackskada', beskrivning: 'Litet stenskott' },
    ],
  },
  // --- Lägg till fler bilar här (eller byt till din lista) ---
];

/* =========================================================
   5) Indexera listan på normaliserat reg.nr
   ========================================================= */
function buildIndex(rawList: any[]): Record<string, CanonicalCar> {
  const map: Record<string, CanonicalCar> = {};
  for (const item of rawList ?? []) {
    const car = toCanonicalCar(item);
    if (!car) continue;
    map[normalizeReg(car.regnr)] = car;
  }
  return map;
}

/* =========================================================
   6) Själva FORMULÄRET (klientkomponent)
   - Inga färger sätts här. All styling ärver från din CSS.
   ========================================================= */
export default function FormClient() {
  const CAR_MAP = useMemo(() => buildIndex(RAW_CARS), []);
  const knownKeys = useMemo(() => Object.keys(CAR_MAP).sort(), [CAR_MAP]);

  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);

  function find(reg: string): CanonicalCar | null {
    return CAR_MAP[normalizeReg(reg)] ?? null;
    // OBS: Om du vill byta till fetch/API senare är det bara
    // att ersätta raden ovan med ett anrop som returnerar samma struktur.
  }

  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    setRegInput(e.target.value);
    setTried(false);
    setCar(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = find(regInput);
    setCar(found ?? null);
    setTried(true);
  }

  function onSelectKnown(e: ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value;
    setRegInput(raw);
    const found = find(raw);
    setCar(found ?? null);
    setTried(true);
  }

  const showError = tried && !car && regInput.trim().length > 0;

  return (
    <div>
      <h1>Ny incheckning</h1>
      <p>Inloggad: <strong>Bob</strong></p>

      {/* ===== Reg.nr och snabbval ===== */}
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="regnr">Registreringsnummer *</label>
          <input
            id="regnr"
            type="text"
            value={regInput}
            onChange={onChangeReg}
            placeholder="Skriv reg.nr (t.ex. DGF14H)"
            autoComplete="off"
            inputMode="text"
          />
          {showError && <p role="alert">Okänt reg.nr</p>}
        </div>

        <div>
          <label htmlFor="known">Kända reg.nr (test)</label>
          <select id="known" onChange={onSelectKnown} defaultValue="">
            <option value="">— Välj —</option>
            {knownKeys.map((k) => (
              <option key={k} value={CAR_MAP[k].regnr}>
                {CAR_MAP[k].regnr}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button type="submit">Hämta fordonsdata</button>
        </div>

        {/* ===== Befintliga skador (låst tills bil vald) ===== */}
        <fieldset disabled={!car}>
          <legend>Befintliga skador:</legend>
          <div>
            {car ? (
              car.skador.length === 0 ? (
                <p>Inga skador registrerade.</p>
              ) : (
                <ul>
                  {car.skador.map((s) => (
                    <li key={s.id}>
                      <strong>{s.plats}</strong> – {s.typ}
                      {s.beskrivning ? ` (${s.beskrivning})` : ''}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <ul>
                <li>Repa</li>
                <li>Lackskada</li>
              </ul>
            )}
          </div>
        </fieldset>
      </form>

      {/* ===== Fordonsinformation – visas när bilen hittas ===== */}
      {car && (
        <section>
          <h2>Fordonsinformation</h2>
          <dl>
            <div>
              <dt>Reg.nr</dt>
              <dd><strong>{car.regnr}</strong></dd>
            </div>
            <div>
              <dt>Bilmodell</dt>
              <dd><strong>{car.model || '—'}</strong></dd>
            </div>
            <div>
              <dt>Hjulförvaring</dt>
              <dd><strong>{car.wheelStorage || '—'}</strong></dd>
            </div>
          </dl>
        </section>
      )}

      {/* ===== Övriga fält – placeholders för att inte bryta din sida ===== */}
      <div>
        <label>Ort *</label>
        <select defaultValue="">
          <option value="" disabled>— Välj ort —</option>
          <option>Malmö</option>
          <option>Trelleborg</option>
          <option>Halmstad</option>
        </select>
      </div>

      <div>
        <label>Station / Depå *</label>
        <select defaultValue="">
          <option value="" disabled>— Välj station / depå —</option>
          <option>Malmö – Central</option>
          <option>Trelleborg – Depå</option>
          <option>Halmstad – Hedbergs</option>
        </select>
      </div>
    </div>
  );
}
