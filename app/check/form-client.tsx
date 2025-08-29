'use client';

import React, { useEffect, useMemo, useState, ChangeEvent, FormEvent } from 'react';

/* ===================== Typer ===================== */
type RegNr = string;
type DamageEntry = { id: string; plats: string; typ: string; beskrivning?: string };
type CanonicalCar = { regnr: RegNr; model: string; wheelStorage: string; skador: DamageEntry[] };

/* =============== Normalisering av reg.nr =============== */
function normalizeReg(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s\-_.]/g, '')
    .trim();
}

/* =========== Mappa råpost → CanonicalCar (utan påhitt) =========== */
function toCanonicalCar(raw: any): CanonicalCar | null {
  if (!raw) return null;

  // regnr
  const reg =
    raw.regnr ?? raw.reg ?? raw.registration ?? raw.registrationNumber ??
    raw.licensePlate ?? raw.plate ?? raw.regNo ?? raw.reg_no;
  if (!reg || typeof reg !== 'string') return null;

  // modell
  const modelRaw =
    raw.model ?? raw.modell ?? raw.bilmodell ?? raw.vehicleModel ?? raw.vehicle_model ?? '';
  const model = (modelRaw && String(modelRaw).trim()) || '--';

  // hjulförvaring
  const wheelRaw =
    raw.wheelStorage ?? raw.tyreStorage ?? raw.tireStorage ??
    raw['hjulförvaring'] ?? raw.hjulforvaring ?? raw.hjulforvaring_plats ??
    raw['däckhotell'] ?? raw.dackhotell ?? raw.wheels_location ?? '';
  const wheelStorage = (wheelRaw && String(wheelRaw).trim()) || '--';

  // skador
  const damagesArr: any[] =
    raw.skador ?? raw.damages ?? raw.damageList ?? raw.existingDamages ?? [];
  const skador: DamageEntry[] = Array.isArray(damagesArr)
    ? damagesArr.map((d: any, i: number) => ({
        id: String(d?.id ?? `d${i + 1}`),
        plats: String(d?.plats ?? d?.place ?? d?.position ?? '--'),
        typ: String(d?.typ ?? d?.type ?? '--'),
        beskrivning: d?.beskrivning ?? d?.desc ?? d?.description ?? undefined,
      }))
    : [];

  return { regnr: String(reg), model, wheelStorage, skador };
}

/* ================ Komponent ================= */
export default function FormClient() {
  // 1) Läs in cars.json från /public (filer, ej API)
  const [rawCars, setRawCars] = useState<any[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data/cars.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRawCars(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) {
          setRawCars([]); // inga påhitt – tom lista om fil saknas
          setLoadError('Kunde inte läsa /data/cars.json');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Indexera (normaliserad nyckel)
  const CAR_MAP = useMemo(() => {
    const map: Record<string, CanonicalCar> = {};
    for (const item of rawCars ?? []) {
      const car = toCanonicalCar(item);
      if (!car) continue;
      map[normalizeReg(car.regnr)] = car;
    }
    return map;
  }, [rawCars]);

  // 3) Formstate
  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);

  const find = (reg: string) => CAR_MAP[normalizeReg(reg)] ?? null;

  // 4) Händelser
  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    setRegInput(e.target.value);
    setTried(false);
    setCar(null);
  }

  function lookupNow() {
    if (!regInput.trim()) return;
    const found = find(regInput);
    setCar(found ?? null);
    setTried(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    lookupNow(); // Enter i fältet
  }

  // 5) Visningsregler
  const showError = tried && !car && regInput.trim().length > 0;

  return (
    <section className="incheckad-scope">
      <div className="page">
        <div className="container">
          <h1 className="h1">Ny incheckning</h1>
          <p className="p">Inloggad: <strong>Bob</strong></p>

          {/* Huvudkort */}
          <div className="card stack-lg">
            {/* Reg.nr (Enter/blur triggar lookup) */}
            <div className="stack-sm">
              <label htmlFor="regnr" className="label">Registreringsnummer *</label>
              <form onSubmit={onSubmit}>
                <input
                  id="regnr"
                  type="text"
                  value={regInput}
                  onChange={onChangeReg}
                  onBlur={lookupNow}
                  placeholder="Skriv reg.nr (t.ex. DGF14H)"
                  autoComplete="off"
                  inputMode="text"
                  className="input"
                />
              </form>
              {showError && <p className="error" role="alert">Okänt reg.nr</p>}
              {loadError && <p className="muted" aria-live="polite">{loadError}</p>}
            </div>

            {/* Bilinfo + skador – bara när vi har träff */}
            {car && (
              <>
                <div className="info">
                  <div>
                    <div className="muted">Bilmodell</div>
                    <div className="value">{car.model || '--'}</div>
                  </div>
                  <div>
                    <div className="muted">Hjulförvaring</div>
                    <div className="value">{car.wheelStorage || '--'}</div>
                  </div>
                </div>

                <div className="stack-sm">
                  <div className="label">Befintliga skador:</div>
                  <div className="panel">
                    {car.skador.length === 0 ? (
                      <p>--</p>
                    ) : (
                      <ul className="ul">
                        {car.skador.map(s => (
                          <li key={s.id}>
                            <strong>{s.plats || '--'}</strong> – {s.typ || '--'}
                            {s.beskrivning ? ` (${s.beskrivning})` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
            {/* Om ingen träff: vi visar ingenting av bilinfo/skador. */}
          </div>

          {/* Övriga fält (oförändrade) */}
          <div className="mt grid-2">
            <div>
              <label className="label">Ort *</label>
              <select className="input" defaultValue="">
                <option value="" disabled>— Välj ort —</option>
                <option>Malmö</option><option>Trelleborg</option><option>Halmstad</option>
              </select>
            </div>
            <div>
              <label className="label">Station / Depå *</label>
              <select className="input" defaultValue="">
                <option value="" disabled>— Välj station / depå —</option>
                <option>Malmö – Central</option><option>Trelleborg – Depå</option><option>Halmstad – Hedbergs</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Skopad ljus stil (som tidigare) ---------- */}
      <style jsx global>{`
        .incheckad-scope { all: initial; display:block; }
        .incheckad-scope, .incheckad-scope * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif !important; }
        .incheckad-scope .page { min-height: 100dvh; background:#ffffff !important; color:#111111 !important; }
        .incheckad-scope .container { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
        .incheckad-scope .h1 { font-size: 28px; line-height:1.2; margin:0 0 4px; font-weight:700; color:#111 !important; }
        .incheckad-scope .p { margin:0 0 16px; color:#111 !important; }

        .incheckad-scope .card { background:#fff !important; border:1px solid #E5E7EB !important; border-radius:16px !important; padding:16px !important; box-shadow:0 1px 2px rgba(0,0,0,.04) !important; }
        .incheckad-scope .stack-sm > * + * { margin-top:8px; }
        .incheckad-scope .stack-lg > * + * { margin-top:16px; }

        .incheckad-scope .label { font-size:14px; font-weight:600; color:#111 !important; }
        .incheckad-scope .input { width:100%; padding:10px 12px !important; border-radius:12px !important; border:1px solid #D1D5DB !important; background:#ffffff !important; color:#111 !important; outline:none !important; }
        .incheckad-scope .input::placeholder { color:#9CA3AF !important; }
        .incheckad-scope .input:focus { box-shadow:0 0 0 2px rgba(0,0,0,.08) !important; }

        .incheckad-scope .info { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:640px){ .incheckad-scope .info { grid-template-columns:1fr; } }
        .incheckad-scope .muted { font-size:13px; color:#6B7280 !important; }
        .incheckad-scope .value { font-weight:600; color:#111 !important; }

        .incheckad-scope .panel { background:#F9FAFB !important; border:1px solid #E5E7EB !important; border-radius:12px !important; padding:12px !important; }
        .incheckad-scope .ul { margin:0; padding-left:22px; }

        .incheckad-scope .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (max-width:640px){ .incheckad-scope .grid-2 { grid-template-columns:1fr; } }

        .incheckad-scope .error { margin-top:6px; font-size:14px; color:#C00000 !important; }
        .incheckad-scope .mt { margin-top:24px !important; }
      `}</style>
    </section>
  );
}
