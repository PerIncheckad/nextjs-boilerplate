"use client";

import { useState } from "react";

export default function CheckinForm() {
  const [regnr, setRegnr] = useState("");
  const [mätarställning, setMätarställning] = useState("");
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynsskyddOk, setInsynsskyddOk] = useState<boolean | null>(null);
  const [laddsladdar, setLaddsladdar] = useState<number>(0);
  const [hjultyp, setHjultyp] = useState<string | null>(null);
  const [nySkada, setNySkada] = useState(false);
  const [skador, setSkador] = useState<{ text: string; file?: string }[]>([]);
  const [anteckning, setAnteckning] = useState("");
  const [plats, setPlats] = useState("");
  const [depå, setDepå] = useState("");
  const [bilder, setBilder] = useState<string[]>([]);
  const [resultat, setResultat] = useState<string | null>(null);

  // stationer/depåer
  const PLATSER = {
    "Malmö Jägersro": [
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
    Helsingborg: [
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
    Ängelholm: ["FORD Ängelholm", "Mekonomen Ängelholm", "Flyget Ängelholm"],
    Halmstad: ["Flyget Halmstad", "KIA Halmstad", "FORD Halmstad"],
    Falkenberg: [],
    Trelleborg: [],
    Varberg: [
      "Ford Varberg",
      "Hedin Automotive Varberg",
      "Sällstorp lack plåt",
      "Finnveden plåt",
    ],
    Lund: ["Ford Lund", "Hedin Lund", "B/S Lund", "P7 Revinge"],
  };

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const fileArray = Array.from(e.target.files).map((file) =>
        URL.createObjectURL(file)
      );
      setBilder((prev) => prev.concat(fileArray));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // dummy: slumpa lyckad/misslyckad
    if (!mätarställning) {
      setResultat("Misslyckades att spara. Kontrollera fält och försök igen.");
    } else {
      setResultat("Incheckning sparad ✔️");
    }
  }

  return (
    <div className="page">
      <h1>Ny incheckning</h1>
      <p>Inloggad: <b>Bob</b></p>

      <form onSubmit={handleSubmit}>
        <label>Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          placeholder="Skriv reg.nr"
        />

        <label>Plats för incheckning *</label>
        <select value={plats} onChange={(e) => setPlats(e.target.value)}>
          <option value="">— Välj ort —</option>
          {Object.keys(PLATSER).map((ort) => (
            <option key={ort} value={ort}>{ort}</option>
          ))}
        </select>

        {plats && (
          <>
            <label>Station / Depå *</label>
            <select value={depå} onChange={(e) => setDepå(e.target.value)}>
              <option value="">— Välj station / depå —</option>
              {PLATSER[plats as keyof typeof PLATSER].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </>
        )}

        <label>Mätarställning *</label>
        <input
          type="number"
          value={mätarställning}
          onChange={(e) => setMätarställning(e.target.value)}
          placeholder="km"
        />

        <label>Tanknivå *</label>
        <div className="seg">
          <button type="button" className={tankFull ? "on" : ""} onClick={() => setTankFull(true)}>Fulltankad</button>
          <button type="button" className={tankFull === false ? "on" : ""} onClick={() => setTankFull(false)}>Ej fulltankad</button>
        </div>

        <label>AdBlue OK? *</label>
        <div className="seg">
          <button type="button" className={adBlueOk ? "on" : ""} onClick={() => setAdBlueOk(true)}>Ja</button>
          <button type="button" className={adBlueOk === false ? "on" : ""} onClick={() => setAdBlueOk(false)}>Nej</button>
        </div>

        <label>Spolarvätska OK? *</label>
        <div className="seg">
          <button type="button" className={spolarOk ? "on" : ""} onClick={() => setSpolarOk(true)}>Ja</button>
          <button type="button" className={spolarOk === false ? "on" : ""} onClick={() => setSpolarOk(false)}>Nej</button>
        </div>

        <label>Insynsskydd OK? *</label>
        <div className="seg">
          <button type="button" className={insynsskyddOk ? "on" : ""} onClick={() => setInsynsskyddOk(true)}>Ja</button>
          <button type="button" className={insynsskyddOk === false ? "on" : ""} onClick={() => setInsynsskyddOk(false)}>Nej</button>
        </div>

        <label>Antal laddsladdar *</label>
        <div className="seg">
          {[0, 1, 2].map((n) => (
            <button
              key={n}
              type="button"
              className={laddsladdar === n ? "on" : ""}
              onClick={() => setLaddsladdar(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <label>Hjul som sitter på *</label>
        <div className="seg">
          <button type="button" className={hjultyp === "sommar" ? "on" : ""} onClick={() => setHjultyp("sommar")}>Sommarhjul</button>
          <button type="button" className={hjultyp === "vinter" ? "on" : ""} onClick={() => setHjultyp("vinter")}>Vinterhjul</button>
        </div>

        <label>Nya skador på bilen? *</label>
        <div className="seg">
          <button type="button" className={nySkada ? "on" : ""} onClick={() => setNySkada(true)}>Ja</button>
          <button type="button" className={!nySkada ? "on" : ""} onClick={() => setNySkada(false)}>Nej</button>
        </div>

        {nySkada && (
          <div className="skada">
            <label>Beskrivning av skada</label>
            <input
              value={skador[0]?.text || ""}
              onChange={(e) => setSkador([{ text: e.target.value }])}
              placeholder="Text (obligatorisk)"
            />
            <input type="file" accept="image/*" capture="environment" multiple onChange={handleFileUpload}/>
            <div className="thumbs">
              {bilder.map((src, i) => (
                <img key={i} src={src} alt="foto" />
              ))}
            </div>
          </div>
        )}

        <label>Övriga anteckningar</label>
        <textarea
          value={anteckning}
          onChange={(e) => setAnteckning(e.target.value)}
          placeholder="Fritt fält"
        />

        <button type="submit" className="btn primary">Spara incheckning</button>
      </form>

      {resultat && <p className="result">{resultat}</p>}

      <style jsx>{`
        .page { background:#f6f7f9; padding:20px; min-height:100vh; }
        form { display:flex; flex-direction:column; gap:12px; }
        label { font-weight:bold; }
        input, select, textarea { padding:8px; border:1px solid #ccc; border-radius:4px; }
        .seg { display:flex; gap:10px; }
        button { padding:8px 12px; border:1px solid #ccc; border-radius:6px; background:#fff; }
        button.on { background:#4a90e2; color:#fff; }
        .btn.primary { background:#0070f3; color:#fff; border:none; padding:12px; border-radius:6px; }
        .skada { border:1px solid #ccc; padding:10px; border-radius:6px; background:#fff8f0; }
        .thumbs img { height:60px; margin:5px; border-radius:4px; border:1px solid #ccc; }
        .result { margin-top:15px; font-weight:bold; }
      `}</style>
    </div>
  );
}
