'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent, useEffect } from 'react';

/* =========================================================
   Typer
   ========================================================= */
type RegNr = string;

type DamageEntry = {
  id: string;
  plats: string;
  typ: string;
  beskrivning?: string;
};

type CanonicalCar = {
  regnr: RegNr;          // originalt reg.nr (oförändrat)
  model: string;         // bilmodell (normaliserat fältnamn)
  wheelStorage: string;  // hjulförvaring (normaliserat fältnamn)
  skador: DamageEntry[];
};

/* =========================================================
   Normalisering av reg.nr
   ========================================================= */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\s\-_.]/g, '')              // mellanslag, bindestreck, underscore, punkt
    .trim();
}

/* =========================================================
   Mappa godtycklig källdata → CanonicalCar
   (fångar vanliga varianter på fältnamn)
   ========================================================= */
function toCanonicalCar(raw: any): CanonicalCar | null {
  if (!raw) return null;

  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationNumber ??
    raw.license ?? raw.licensePlate ?? raw.plate ?? raw.regNo ?? raw.reg_no;
  if (!reg || typeof reg !== 'string') return null;

  const model =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? '';

  const wheelStorage =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? '';

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
   Exempeldata (du kan ersätta med din riktiga lista senare)
   Jag lägger in DGF14H så att din skärmdump fungerar direkt.
   ========================================================= */
const RAW_CARS_FALLBACK: any[] = [
  {
    regnr: 'DGF14H',
    modell: 'Volvo V60 B4',
    hjulförvaring: 'På anläggning – Malmö',
    skador: [
      { id: 'k1', plats: 'Höger framfångare', typ: 'Repa', beskrivning: 'Ytlig repa ca 3 cm' },
      { id: 'k2', plats: 'Motorhuv', typ: 'Lackskada', beskrivning: 'Litet stenskott' },
    ],
  },
];

/* =========================================================
   Bygg index (normaliserad nyckel)
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
   FORM-KOMPONENT (återställd layout med neutrala Tailwind-klasser)
   ========================================================= */
export default function FormClient() {
  // Här kan du koppla in ”äkta källor” senare. För nu använder vi fallback.
  const CAR_MAP = useMemo(() => buildIndex(RAW_CARS_FALLBACK), []);
  const knownKeys = useMemo(() => Object.keys(CAR_MAP).sort(), [CAR_MAP]);

  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);

  // Hjälpfunktion
  function find(reg: string): CanonicalCar | null {
    return CAR_MAP[normalizeReg(reg)] ?? null;
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
    <div className="w-full max-w-3xl mx-auto px-4 py-6">
      {/* Titel / Inloggad */}
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Ny incheckning</h1>
      <p className="mb-4">Inloggad: <span className="font-medium">Bob</span></p>

      {/* KORT: Reg.nr & Skador */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Rad: reg.nr + kända reg.nr */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_minmax(180px,240px)] items-end">
            <div>
              <label htmlFor="regnr" className="block text-sm font-medium text-gray-700">
                Registreringsnummer *
              </label>
              <input
                id="regnr"
                type="text"
                value={regInput}
                onChange={onChangeReg}
                placeholder="Skriv reg.nr (t.ex. DGF14H)"
                autoComplete="off"
                inputMode="text"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-gray-400"
              />
              {showError && (
                <p className="mt-1 text-sm text-red-600" role="alert">Okänt reg.nr</p>
              )}
            </div>

            <div>
              <label htmlFor="known" className="block text-sm font-medium text-gray-700">
                Kända reg.nr (test)
              </label>
              <select
                id="known"
                onChange={onSelectKnown}
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">— Välj —</option>
                {knownKeys.map((k) => (
                  <option key={k} value={CAR_MAP[k].regnr}>
                    {CAR_MAP[k].regnr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Befintliga skador */}
          <fieldset disabled={!car} className="mt-2">
            <legend className="block text-sm font-medium text-gray-700 mb-1">
              Befintliga skador:
            </legend>
            <div className={`rounded-xl ${car ? 'bg-gray-50 border border-gray-200' : 'bg-gray-50 border border-dashed border-gray-200'} p-3`}>
              {car ? (
                car.skador.length === 0 ? (
                  <p>Inga skador registrerade.</p>
                ) : (
                  <ul className="list-disc pl-6 space-y-1">
                    {car.skador.map(s => (
                      <li key={s.id}>
                        <span className="font-medium">{s.plats}</span> – {s.typ}{s.beskrivning ? ` (${s.beskrivning})` : ''}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <ul className="list-disc pl-6 opacity-60">
                  <li>Repa</li>
                  <li>Lackskada</li>
                </ul>
              )}
            </div>
          </fieldset>

          <div>
            <button type="submit" className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Hämta fordonsdata
            </button>
          </div>
        </form>
      </div>

      {/* Fordonsinformation */}
      {car && (
        <section className="mt-6 bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Fordonsinformation</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-600">Reg.nr</dt>
              <dd className="font-medium">{car.regnr}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Bilmodell</dt>
              <dd className="font-medium">{car.model || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Hjulförvaring</dt>
              <dd className="font-medium">{car.wheelStorage || '—'}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* Övriga fält – kvar som neutrala placeholders */}
      <div className="mt-6 grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Ort *</label>
          <select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-gray-400" defaultValue="">
            <option value="" disabled>— Välj ort —</option>
            <option>Malmö</option>
            <option>Trelleborg</option>
            <option>Halmstad</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Station / Depå *</label>
          <select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-gray-400" defaultValue="">
            <option value="" disabled>— Välj station / depå —</option>
            <option>Malmö – Central</option>
            <option>Trelleborg – Depå</option>
            <option>Halmstad – Hedbergs</option>
          </select>
        </div>
      </div>

      {/* Diagnostik (kan tas bort när allt sitter) */}
      <details className="mt-6">
        <summary>Diagnostik</summary>
        <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap">
{JSON.stringify({
  input: regInput,
  normalizedInput: normalizeReg(regInput),
  tried, found: !!car,
  foundKey: car ? normalizeReg(car.regnr) : null,
  sampleKeys: knownKeys.slice(0, 10),
}, null, 2)}
        </pre>
        {car && (
          <>
            <h4 className="mt-3 font-semibold">Matchad bil</h4>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap">
{JSON.stringify(car, null, 2)}
            </pre>
          </>
        )}
      </details>
    </div>
  );
}
