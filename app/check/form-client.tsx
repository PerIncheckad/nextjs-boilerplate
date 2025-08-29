'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';

/* ===================== Typer ===================== */
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

/* ================== Normalisering ================= */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\s\-_.]/g, '')              // mellanslag, -, _, .
    .trim();
}

/* ======= Mappa godtycklig källdata → CanonicalCar ======= */
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

/* ============ Fallbacklista (ersätt senare) ============ */
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

/* ================ Index (normaliserad nyckel) ================ */
function buildIndex(rawList: any[]): Record<string, CanonicalCar> {
  const map: Record<string, CanonicalCar> = {};
  for (const item of rawList ?? []) {
    const car = toCanonicalCar(item);
    if (!car) continue;
    map[normalizeReg(car.regnr)] = car;
  }
  return map;
}

/* ===================== Komponent ===================== */
export default function FormClient() {
  // Byt RAW_CARS_FALLBACK till din riktiga lista när vi kopplar på källan
  const CAR_MAP = useMemo(() => buildIndex(RAW_CARS_FALLBACK), []);
  const knownKeys = useMemo(() => Object.keys(CAR_MAP).sort(), [CAR_MAP]);

  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);

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
    <div className="incheckad-scope">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Titel / Inloggad */}
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Ny incheckning</h1>
        <p className="mb-4">Inloggad: <span className="font-medium">Bob</span></p>

        {/* Kort 1: Reg.nr + Skador */}
        <div className="card p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Rad: reg.nr + kända reg.nr */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_minmax(180px,240px)] items-end">
              <div>
                <label htmlFor="regnr" className="label">Registreringsnummer *</label>
                <input
                  id="regnr"
                  type="text"
                  value={regInput}
                  onChange={onChangeReg}
                  placeholder="Skriv reg.nr (t.ex. DGF14H)"
                  autoComplete="off"
                  inputMode="text"
                  className="input mt-1 w-full"
                />
                {showError && (
                  <p className="mt-1 text-error" role="alert">Okänt reg.nr</p>
                )}
              </div>

              <div>
                <label htmlFor="known" className="label">Kända reg.nr (test)</label>
                <select
                  id="known"
                  onChange={onSelectKnown}
                  defaultValue=""
                  className="input mt-1 w-full"
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
              <legend className="label mb-1">Befintliga skador:</legend>
              <div className={`panel ${car ? '' : 'panel-disabled'}`}>
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
              <button type="submit" className="btn">Hämta fordonsdata</button>
            </div>
          </form>
        </div>

        {/* Kort 2: Fordonsinformation */}
        {car && (
          <section className="card p-4 mt-6">
            <h2 className="text-lg font-semibold mb-3">Fordonsinformation</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="muted">Reg.nr</dt>
                <dd className="font-medium">{car.regnr}</dd>
              </div>
              <div>
                <dt className="muted">Bilmodell</dt>
                <dd className="font-medium">{car.model || '—'}</dd>
              </div>
              <div>
                <dt className="muted">Hjulförvaring</dt>
                <dd className="font-medium">{car.wheelStorage || '—'}</dd>
              </div>
            </dl>
          </section>
        )}

        {/* Övriga fält – placeholders */}
        <div className="mt-6 grid grid-cols-1 gap-4">
          <div>
            <label className="label">Ort *</label>
            <select className="input mt-1 w-full" defaultValue="">
              <option value="" disabled>— Välj ort —</option>
              <option>Malmö</option>
              <option>Trelleborg</option>
              <option>Halmstad</option>
            </select>
          </div>

          <div>
            <label className="label">Station / Depå *</label>
            <select className="input mt-1 w-full" defaultValue="">
              <option value="" disabled>— Välj station / depå —</option>
              <option>Malmö – Central</option>
              <option>Trelleborg – Depå</option>
              <option>Halmstad – Hedbergs</option>
            </select>
          </div>
        </div>
      </div>

      {/* ======== Skopad reset så dark-mode/global CSS inte målar över ======== */}
      <style jsx global>{`
        .incheckad-scope {
          --bg: #ffffff;
          --fg: #111111;
          --muted: #6b7280;       /* gray-500 */
          --input-bg: #ffffff;
          --input-border: #d1d5db; /* gray-300 */
          --panel-bg: #f9fafb;     /* gray-50 */
          --panel-border: #e5e7eb; /* gray-200 */
          --card-border: #e5e7eb;  /* gray-200 */
          --btn-bg: #ffffff;
          --btn-border: #d1d5db;
          --error: #c00000;
        }
        /* Nollställ ALLT inom scopet till ljus standard */
        .incheckad-scope, .incheckad-scope * {
          color-scheme: light;
          box-sizing: border-box;
        }
        .incheckad-scope .card {
          background: var(--bg);
          color: var(--fg);
          border: 1px solid var(--card-border);
          border-radius: 1rem;       /* 16px */
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .incheckad-scope .label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--fg);
        }
        .incheckad-scope .muted {
          font-size: 0.875rem;
          color: var(--muted);
        }
        .incheckad-scope .input {
          background: var(--input-bg);
          color: var(--fg);
          border: 1px solid var(--input-border);
          border-radius: 0.75rem;    /* 12px */
          padding: 0.5rem 0.75rem;
          outline: none;
        }
        .incheckad-scope .input:focus {
          box-shadow: 0 0 0 2px rgba(0,0,0,0.08);
        }
        .incheckad-scope .panel {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          border-radius: 0.75rem;
          padding: 0.75rem;
        }
        .incheckad-scope .panel-disabled {
          border-style: dashed;
          opacity: 0.75;
        }
        .incheckad-scope .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--btn-bg);
          color: var(--fg);
          border: 1px solid var(--btn-border);
          border-radius: 0.75rem;
          padding: 0.5rem 0.875rem;
          font-weight: 600;
        }
        .incheckad-scope .text-error { color: var(--error); }
      `}</style>
    </div>
  );
}
