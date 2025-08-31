"use client";

import { useMemo, useState } from "react";

/** ORTER & DEPÅER – från ”Stationer o Depåer Albarone” */
const ORTER: Record<string, string[]> = {
  "MALMÖ JÄGERSRO": [
    "Ford Malmö",
    "Mechanum",
    "Malmö Automera",
    "Mercedes Malmö",
    "Werksta St Bernstorp",
    "Werksta Malmö Hamn",
    "Hedbergs Malmö",
    "Hedin Automotive Burlöv",
    "Sturup",
  ],
  "HELSINGBORG": [
    "HBSC Helsingborg",
    "Ford Helsingborg",
    "Transport Helsingborg",
    "S. Jönsson",
    "BMW Helsingborg",
    "KIA Helsingborg",
    "Euromaster Helsingborg",
    "B/S Klippan",
    "B/S Munka-Ljungby",
    "B/S Helsingborg",
    "Werksta Helsingborg",
    "Båstad",
  ],
  "ÄNGELHOLM": ["FORD Ängelholm", "Mekonomen Ängelholm", "Flyget Ängelholm"],
  "HALMSTAD": ["Flyget Halmstad", "KIA Halmstad", "FORD Halmstad"],
  "FALKENBERG": [],
  "TRELLEBORG": [],
  "VARBERG": [
    "Ford Varberg",
    "Hedin Automotive Varberg",
    "Sällstorp lack plåt",
    "Finnveden plåt",
  ],
  "LUND": ["Ford Lund", "Hedin Lund", "B/S Lund", "P7 Revinge"],
};

export default function CheckinForm() {
  // Formstate
  const [regnr, setRegnr] = useState("");
  const [ort, setOrt] = useState<string>("");
  const [depa, setDepa] = useState<string>("");

  const [matarstallning, setMatarstallning] = useState<string>("");
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynOk, setInsynOk] = useState<boolean | null>(null);
  const [laddsladdar, setLaddsladdar] = useState<number | null>(null);
  const [hjul, setHjul] = useState<"sommar" | "vinter" | null>(null);
  const [nyaSkador, setNyaSkador] = useState<boolean | null>(null);
  const [skadaText, setSkadaText] = useState("");
  const [bilder, setBilder] = useState<string[]>([]);
  const [anteckning, setAnteckning] = useState("");

  // Feedback
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // Depålista beroende på ort
  const depaLista = useMemo(() => (ort ? ORTER[ort] ?? [] : []), [ort]);

  // Filuppladdning
  function onAddImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const urls = files.map((f) => URL.createObjectURL(f));
    setBilder((prev) => prev.concat(urls));
  }

  // Dummy-submit m. validering + tack
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Minimal validering så vi kan fejk-svara
    if (!regnr || !ort || !depa || !matarstallning) {
      setMsg({
        type: "err",
        text: "Misslyckades att spara. Kontrollera fälten och försök igen.",
      });
      return;
    }

    setMsg({
      type: "ok",
      text: `Tack Bob! Incheckningen för ${regnr.toUpperCase()} är sparad.`,
    });
  }

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">Inloggad: <b>Bob</b></p>

        {msg && (
          <div className={`alert ${msg.type === "ok" ? "success" : "error"}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <section className="card">
            <label className="label" htmlFor="regnr">Registreringsnummer *</label>
            <input
              id="regnr"
              autoCapitalize="characters"
              placeholder="Skriv reg.nr"
              value={regnr}
              onChange={(e) => setRegnr(e.target.value)}
              className="input"
            />

            <label className="label" htmlFor="ort">Plats för incheckning *</label>
            <select
              id="ort"
              className="input"
              value={ort}
              onChange={(e) => {
                setOrt(e.target.value);
                setDepa("");
              }}
            >
              <option value="">— Välj ort —</option>
              {Object.keys(ORTER).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>

            <label className="label" htmlFor="depa">Station / Depå *</label>
            <select
              id="depa"
              className="input"
              value={depa}
              onChange={(e) => setDepa(e.target.value)}
              disabled={!ort}
            >
              <option value="">— Välj station / depå —</option>
              {depaLista.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <label className="label" htmlFor="matar">Mätarställning *</label>
            <div className="with-suffix">
              <input
                id="matar"
                inputMode="numeric"
                placeholder="ex. 42 180"
                className="input"
                value={matarstallning}
                onChange={(e) => setMatarstallning(e.target.value)}
              />
              <span className="suffix">km</span>
            </div>
          </section>

          <section className="card">
            <div className="stack">
              <label className="label">Tanknivå *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${tankFull === true ? "on" : ""}`} onClick={() => setTankFull(true)}>Fulltankad</button>
                <button type="button" className={`segbtn ${tankFull === false ? "on" : ""}`} onClick={() => setTankFull(false)}>Ej fulltankad</button>
              </div>
            </div>

            <div className="grid2">
              <div className="stack">
                <label className="label">AdBlue OK? *</label>
                <div className="seg">
                  <button type="button" className={`segbtn ${adBlueOk === true ? "on" : ""}`} onClick={() => setAdBlueOk(true)}>Ja</button>
                  <button type="button" className={`segbtn ${adBlueOk === false ? "on" : ""}`} onClick={() => setAdBlueOk(false)}>Nej</button>
                </div>
              </div>

              <div className="stack">
                <label className="label">Spolarvätska OK? *</label>
                <div className="seg">
                  <button type="button" className={`segbtn ${spolarOk === true ? "on" : ""}`} onClick={() => setSpolarOk(true)}>Ja</button>
                  <button type="button" className={`segbtn ${spolarOk === false ? "on" : ""}`} onClick={() => setSpolarOk(false)}>Nej</button>
                </div>
              </div>
            </div>

            <div className="stack">
              <label className="label">Insynsskydd OK? *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${insynOk === true ? "on" : ""}`} onClick={() => setInsynOk(true)}>Ja</button>
                <button type="button" className={`segbtn ${insynOk === false ? "on" : ""}`} onClick={() => setInsynOk(false)}>Nej</button>
              </div>
            </div>

            <div className="stack">
              <label className="label">Antal laddsladdar *</label>
              <div className="seg">
                {[0, 1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`segbtn ${laddsladdar === n ? "on" : ""}`}
                    onClick={() => setLaddsladdar(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack">
              <label className="label">Hjul som sitter på *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${hjul === "sommar" ? "on" : ""}`} onClick={() => setHjul("sommar")}>Sommarhjul</button>
                <button type="button" className={`segbtn ${hjul === "vinter" ? "on" : ""}`} onClick={() => setHjul("vinter")}>Vinterhjul</button>
              </div>
            </div>

            <div className="stack">
              <label className="label">Nya skador på bilen? *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${nyaSkador === true ? "on" : ""}`} onClick={() => setNyaSkador(true)}>Ja</button>
                <button type="button" className={`segbtn ${nyaSkador === false ? "on" : ""}`} onClick={() => setNyaSkador(false)}>Nej</button>
              </div>
            </div>

            {nyaSkador === true && (
              <div className="skadakort">
                <h3>Skada 1</h3>
                <label className="label">Text (obligatorisk)</label>
                <input
                  className="input"
                  placeholder="Beskriv skadan…"
                  value={skadaText}
                  onChange={(e) => setSkadaText(e.target.value)}
                />
                <div className="stack">
                  <label className="label">Lägg till bild</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={onAddImages}
                  />
                  <div className="thumbs">
                    {bilder.map((src, i) => (
                      <img key={i} src={src} alt={`foto-${i}`} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="stack">
              <label className="label">Övriga anteckningar</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Fritt fält"
                value={anteckning}
                onChange={(e) => setAnteckning(e.target.value)}
              />
            </div>

            <button type="submit" className="btn primary">Spara incheckning</button>
          </section>
        </form>
      </div>

      {/* Stil – ljust, tydligt, ingen ”intryckt” default */}
      <style jsx>{`
        :global(html, body) { background: #0b0b0b; }
        .page {
          background: #f6f7f9;
          min-height: 100vh;
          padding: 20px 0 60px;
        }
        .container {
          width: 92%;
          max-width: 720px;
          margin: 0 auto;
          color: #111;
        }
        h1 { font-size: 28px; margin: 0 0 4px; }
        .muted { color: #555; margin: 0 0 16px; }
        .alert {
          border-radius: 8px;
          padding: 12px 14px;
          margin: 0 0 16px;
          font-weight: 600;
        }
        .alert.success { background: #ecfdf5; color: #065f46; border: 1px solid #10b981; }
        .alert.error   { background: #fef2f2; color: #7f1d1d; border: 1px solid #ef4444; }

        form { display: block; }
        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          box-shadow: 0 1px 2px rgba(10,10,10,.03);
          padding: 16px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        .label { font-weight: 700; font-size: 14px; color: #111; }
        .input, select, textarea, input[type="file"] {
          width: 100%;
          border: 1px solid #cfd6df;
          border-radius: 8px;
          padding: 10px 12px;
          background: #fff;
          color: #111;
        }
        .with-suffix { position: relative; }
        .with-suffix .suffix {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          color: #6b7280; font-weight: 600;
        }

        .stack { display: grid; gap: 8px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }

        .seg { display: flex; gap: 10px; flex-wrap: wrap; }
        .segbtn {
          background: #fff;
          border: 1px solid #cfd6df;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 600;
          color: #0f172a;
        }
        .segbtn.on {
          background: #d1fae5;
          border-color: #10b981;
          color: #065f46;
        }

        .btn.primary {
          margin-top: 6px;
          background: #1a56db;
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 14px 16px;
          font-weight: 700;
        }

        .skadakort {
          background: #fff8f0;
          border: 1px solid #f59e0b55;
          border-radius: 12px;
          padding: 12px;
          display: grid;
          gap: 10px;
        }
        .skadakort h3 { margin: 0 0 4px; font-size: 16px; }

        .thumbs { display: flex; gap: 8px; flex-wrap: wrap; }
        .thumbs img {
          width: 72px; height: 72px; object-fit: cover;
          border-radius: 8px; border: 1px solid #d1d5db;
        }
      `}</style>
    </div>
  );
}

