'use client';

import React, { useMemo, useState, ChangeEvent, FormEvent } from 'react';

/** -------------------------------
 *  Typer
 *  ------------------------------*/
type RegNr = string;

type CarRecord = {
  regnr: RegNr;
  modell: string;            // Bilmodell
  hjulförvaring: string;     // T.ex. ”På anläggning X / Kund / Däckhotell Y”
  skador: DamageEntry[];     // Befintliga skador (lista)
};

type DamageEntry = {
  id: string;
  plats: string;             // t.ex. ”Vänster bakdörr”
  typ: string;               // t.ex. ”Repa”, ”Buckla”
  beskrivning?: string;
};

/** -------------------------------
 *  Dummydata (ersätt med skarp data/sökning)
 *  ------------------------------*/
const BILAR: Record<RegNr, CarRecord> = {
  'ABC123': {
    regnr: 'ABC123',
    modell: 'Mercedes Sprinter 316 CDI',
    hjulförvaring: 'Däckhotell – Hedins Ford Halmstad',
    skador: [
      { id: 'd1', plats: 'Höger framfångare', typ: 'Repa', beskrivning: 'Ytlig klarlackrepa ca 5 cm' },
      { id: 'd2', plats: 'Baklucka', typ: 'Buckla', beskrivning: 'Liten buckla ovanför registreringsskylten' },
    ],
  },
  'XYZ789': {
    regnr: 'XYZ789',
    modell: 'Renault 5 E-Tech (el)',
    hjulförvaring: 'På anläggningen – Malmö',
    skador: [],
  },
  'MAB111': {
    regnr: 'MAB111',
    modell: 'Mercedes AMG C43',
    hjulförvaring: 'Kund (återlämnas Q4)',
    skador: [{ id: 'd3', plats: 'Vänster bakdörr', typ: 'Repa' }],
  },
};

/** -------------------------------
 *  Hjälpfunktioner
 *  ------------------------------*/
function normalizeReg(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9ÅÄÖ]/g, '');
}

/** -------------------------------
 *  Komponent
 *  ------------------------------*/
export default function CarCheckinForm() {
  const [regInput, setRegInput] = useState<string>('');
  const [valideringsFel, setValideringsFel] = useState<string>('');
  const [valdBil, setValdBil] = useState<CarRecord | null>(null);

  // För en snabb ”dropdown” med kända reg.nr (frivilligt – hjälper test)
  const kandaRegNr = useMemo(() => Object.keys(BILAR).sort(), []);

  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setRegInput(raw);
    setValideringsFel('');
    // Live-validera om du vill (valfritt). Jag validerar först vid submit.
  }

  function onSelectKnown(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setRegInput(value);
    setValideringsFel('');
    if (value) {
      const bil = BILAR[normalizeReg(value)];
      setValdBil(bil ?? null);
      if (!bil) setValideringsFel('Okänt reg.nr');
    } else {
      setValdBil(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeReg(regInput);
    const bil = BILAR[normalized];
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
      {/* Rubrik – behåller neutral stil, ingen färgforcering */}
      <h1 className="text-2xl font-semibold tracking-tight mb-4">
        Incheckad – {valdBil?.regnr ?? '{REGNR}'} – {valdBil ? 'Aktiv ärendevy' : '{ÄRENDE-ID}'}
      </h1>

      {/* Reg.nr -sektion */}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] items-end">
          <div>
            <label htmlFor="regnr" className="block text-sm font-medium">
              Reg.nr
            </label>
            <input
              id="regnr"
              type="text"
              value={regInput}
              onChange={onChangeReg}
              placeholder="Skriv reg.nr (t.ex. ABC123)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-400"
              autoComplete="off"
              inputMode="text"
            />
            {valideringsFel && (
              <p className="mt-1 text-sm" role="alert">
                {valideringsFel}
              </p>
            )}
          </div>

          {/* Frivillig "kända reg.nr" – bra för test/stöd */}
          <div className="sm:pl-2">
            <label className="block text-sm font-medium">Kända reg.nr (test)</label>
            <select
              onChange={onSelectKnown}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-400"
              defaultValue=""
            >
              <option value="">— Välj —</option>
              {kandaRegNr.map((nr) => (
                <option key={nr} value={nr}>
                  {nr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 active:scale-[0.99]"
          >
            Hämta fordonsdata
          </button>
        </div>
      </form>

      {/* Resultatvy – visas endast när reg.nr är känt */}
      {valdBil && (
        <section className="mt-6 space-y-6">
          {/* Bilinfo */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-3">Fordonsinformation</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-gray-600">Reg.nr</dt>
                <dd className="font-medium">{valdBil.regnr}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">Bilmodell</dt>
                <dd className="font-medium">{valdBil.modell}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">Hjulförvaring</dt>
                <dd className="font-medium">{valdBil.hjulförvaring}</dd>
              </div>
            </dl>
          </div>

          {/* Befintliga skador */}
          <div className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-3">Befintliga skador</h2>
            {valdBil.skador.length === 0 ? (
              <p>Inga skador registrerade.</p>
            ) : (
              <ul className="space-y-2">
                {valdBil.skador.map((s) => (
                  <li key={s.id} className="rounded-md border border-gray-200 p-3">
                    <p className="font-medium">
                      {s.plats} – {s.typ}
                    </p>
                    {s.beskrivning && <p className="text-sm text-gray-700">{s.beskrivning}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
