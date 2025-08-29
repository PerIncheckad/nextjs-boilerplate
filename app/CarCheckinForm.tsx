'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';

/** =======================================================
 *  Typer
 *  ======================================================= */
type RegNr = string;

type DamageEntry = {
  id: string;
  plats: string;       // t.ex. ”Vänster bakdörr”
  typ: string;         // t.ex. ”Repa”, ”Buckla”
  beskrivning?: string;
};

type CarRecord = {
  regnr: RegNr;
  modell: string;          // Bilmodell
  hjulförvaring: string;   // T.ex. ”Däckhotell X” / ”På anläggning – Malmö” / ”Kund”
  skador: DamageEntry[];   // Befintliga skador
};

/** =======================================================
 *  Normalisering (viktig!)
 *  - Gör EXAKT samma normalisering på både input och dataset
 *  - Tar bort mellanslag, bindestreck, underscore, punkt
 *  - Tar bort zero-width tecken och normaliserar unicode
 *  ======================================================= */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\s\-_.]/g, '')              // mellanslag, -, _, .
    .trim();
}

/** =======================================================
 *  Data
 *  - RAW_BILAR kan ersättas med API-svar. Behåll normalisering.
 *  - Jag har lagt in DGF14H för att matcha din skärmdump.
 *  ======================================================= */
const RAW_BILAR: CarRecord[] = [
  {
    regnr: 'DGF14H',
    modell: 'Volvo V60 B4',
    hjulförvaring: 'På anläggning – Malmö',
    skador: [
      { id: 'k1', plats: 'Höger framfångare', typ: 'Repa', beskrivning: 'Ytlig repa ca 3 cm' },
      { id: 'k2', plats: 'Motorhuv', typ: 'Lackskada', beskrivning: 'Stenskott, liten flisa' },
    ],
  },
  {
    regnr: 'ABC123',
    modell: 'Mercedes Sprinter 316 CDI',
    hjulförvaring: 'Däckhotell – Hedins Ford Halmstad',
    skador: [
      { id: 'd1', plats: 'Höger framfångare', typ: 'Repa', beskrivning: 'Ytlig klarlackrepa ca 5 cm' },
      { id: 'd2', plats: 'Baklucka', typ: 'Buckla', beskrivning: 'Liten buckla ovanför registreringsskylten' },
    ],
  },
  {
    regnr: 'XYZ789',
    modell: 'Renault 5 E-Tech (el)',
    hjulförvaring: 'På anläggning – Malmö',
    skador: [],
  },
  {
    regnr: 'MAB111',
    modell: 'Mercedes AMG C43',
    hjulförvaring: 'Kund (återlämnas Q4)',
    skador: [{ id: 'd3', plats: 'Vänster bakdörr', typ: 'Repa' }],
  },
];

/** Pre-indexera med normaliserade nycklar (robust mot bindestreck, mellanslag etc.) */
const BILAR_MAP: Record<string, CarRecord> = Object.fromEntries(
  RAW_BILAR.map((b) => [normalizeReg(b.regnr), b])
);

/** Hitta bil via normaliserad nyckel */
function findCar(regInput: string): CarRecord | null {
  const key = normalizeReg(regInput);
  return BILAR_MAP[key] ?? null;
}

/** =======================================================
 *  Komponent
 *  ======================================================= */
export default function CarCheckinForm() {
  const [regInput, setRegInput] = useState<string>('');
  const [valdBil, setValdBil] = useState<CarRecord | null>(null);
  const [valideringsFel, setValideringsFel] = useState<string>('');

  // Hjälp-dropdown för test (kan tas bort)
  const kandaRegNr = useMemo(() => Object.keys(BILAR_MAP).sort(), []);

  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    setRegInput(e.target.value);
    setValideringsFel('');
    setValdBil(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const bil = findCar(regInput);
    if (!bil) {
      setValdBil(null);
      setValideringsFel('Okänt reg.nr');
      return;
    }
    setValideringsFel('');
    setValdBil(bil);
  }

  function onSelectKnown(e: ChangeEvent<HTMLSelectElement>) {
    const raw = e.target.value;
    setRegInput(raw);
    const bil = findCar(raw);
    if (!bil) {
      setValdBil(null);
      setValideringsFel('Okänt reg.nr');
      return;
    }
    setValideringsFel('');
    setValdBil(bil);
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Titel – inga färger hårdkodade */}
      <h1 className="text-2xl font-semibold tracking-tight mb-4">
        Ny incheckning
      </h1>

      {/* Inloggad-info (mock) */}
      <p className="mb-4">Inloggad: <span className="font-medium">Bob</span></p>

      {/* FORM */}
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl card-base p-4">
        {/* Reg.nr */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] items-end">
          <div>
            <label htmlFor="regnr" className="block text-sm font-medium">
              Registreringsnummer *
            </label>
            <input
              id="regnr"
              type="text"
              value={regInput}
              onChange={onChangeReg}
              placeholder="Skriv reg.nr (t.ex. DGF14H)"
              className="mt-1 w-full input-base"
              autoComplete="off"
              inputMode="text"
            />
            {valideringsFel && (
              <p className="mt-1 error-text" role="alert">{valideringsFel}</p>
            )}
          </div>

          {/* Kända reg.nr för snabbtest */}
          <div className="sm:pl-2">
            <label className="block text-sm font-medium">Kända reg.nr (test)</label>
            <select
              onChange={onSelectKnown}
              className="mt-1 w-full input-base"
              defaultValue=""
            >
              <option value="">— Välj —</option>
              {kandaRegNr.map((key) => (
                <option key={key} value={key}>
                  {BILAR_MAP[key].regnr /* visa originalformatet */}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Befintliga skador – disabled-låda tills bil vald */}
        <fieldset disabled={!valdBil} className="mt-2">
          <legend className="block text-sm font-medium mb-1">Befintliga skador:</legend>
          <div className={`rounded-lg p-3 ${valdBil ? 'panel-base' : 'panel-disabled'}`}>
            {valdBil ? (
              valdBil.skador.length === 0 ? (
                <p>Inga skador registrerade.</p>
              ) : (
                <ul className="list-disc pl-6 space-y-1">
                  {valdBil.skador.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.plats}</span> – {s.typ}
                      {s.beskrivning ? ` (${s.beskrivning})` : ''}
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

        {/* Ort/Station – enbart UI-stubbar här */}
        <div>
          <label className="block text-sm font-medium">Ort *</label>
          <select className="mt-1 w-full input-base" defaultValue="">
            <option value="" disabled>— Välj ort —</option>
            <option>Malmö</option>
            <option>Trelleborg</option>
            <option>Halmstad</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select className="mt-1 w-full input-base" defaultValue="">
            <option value="" disabled>— Välj station / depå —</option>
            <option>Malmö – Central</option>
            <option>Trelleborg – Depå</option>
            <option>Halmstad – Hedbergs</option>
          </select>
        </div>

        <div>
          <button type="submit" className="btn-base">
            Hämta fordonsdata
          </button>
        </div>
      </form>

      {/* Fordonsinfo – visas när bil hittats */}
      {valdBil && (
        <section className="mt-6 space-y-4">
          <div className="rounded-xl card-base p-4">
            <h2 className="text-lg font-semibold mb-3">Fordonsinformation</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm opacity-80">Reg.nr</dt>
                <dd className="font-medium">{valdBil.regnr}</dd>
              </div>
              <div>
                <dt className="text-sm opacity-80">Bilmodell</dt>
                <dd className="font-medium">{valdBil.modell}</dd>
              </div>
              <div>
                <dt className="text-sm opacity-80">Hjulförvaring</dt>
                <dd className="font-medium">{valdBil.hjulförvaring}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {/* ======= Globala util-klasser (ingen hårdkodad färg) ======= */}
      <style jsx global>{`
        /* Dessa tre variabler kan redan finnas i ditt tema.
           Om de finns: ignorera fallback-värdena. */
        :root {
          --color-error: #c00000;
          --input-bg: #ffffff;
          --input-fg: #111111;
          --input-border: #cccccc;
          --panel-bg: #f7f7f7;
          --panel-border: #e5e5e5;
          --btn-bg: #ffffff;
          --btn-fg: #111111;
          --btn-border: #cccccc;
          --radius: 12px;
        }

        .error-text { color: var(--color-error); }

        .input-base {
          background: var(--input-bg);
          color: var(--input-fg);
          border: 1px solid var(--input-border);
          border-radius: var(--radius);
          padding: 0.5rem 0.75rem;
          outline: none;
        }
        .input-base:focus {
          box-shadow: 0 0 0 2px rgba(0,0,0,0.07);
        }

        .btn-base {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 0.875rem;
          border-radius: var(--radius);
          background: var(--btn-bg);
          color: var(--btn-fg);
          border: 1px solid var(--btn-border);
          font-weight: 600;
        }
        .btn-base:hover { filter: brightness(0.98); }
        .btn-base:active { transform: translateY(0.5px); }

        .card-base {
          background: #fff;
          border: 1px solid var(--panel-border);
        }

        .panel-base {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
        }
        .panel-disabled {
          background: var(--panel-bg);
          border: 1px dashed var(--panel-border);
        }
      `}</style>
    </div>
  );
}
