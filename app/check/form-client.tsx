"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =============================
   ORTER & DEPÅER (vänster/höger kolumnen i din bild)
   ============================= */
const ORTER: Record<string, string[]> = {
  "MALMÖ": [
    "Huvudstation Malmö Jägersro",
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
    "Huvudstation Helsingborg",
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
  "ÄNGELHOLM": [
    "Huvudstation Ängelholm",
    "FORD Ängelholm",
    "Mekonomen Ängelholm",
    "Flyget Ängelholm",
  ],
  "HALMSTAD": [
    "Huvudstation Halmstad",
    "Flyget Halmstad",
    "KIA Halmstad",
    "FORD Halmstad",
  ],
  "FALKENBERG": ["Huvudstation Falkenberg"],
  "TRELLEBORG": ["Huvudstation Trelleborg"],
  "VARBERG": [
    "Huvudstation Varberg",
    "Ford Varberg",
    "Hedin Automotive Varberg",
    "Sällstorp lack plåt",
    "Finnveden plåt",
  ],
  "LUND": ["Ford Lund", "Hedin Lund", "B/S Lund", "P7 Revinge"],
};

/* =============================
   Hjälpfunktioner
   ============================= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function callRpc<T>(fn: string, body: Record<string, any>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function normReg(raw: string) {
  // Normalisera: ta bort mellanslag/streck/punkt, A-Z/0-9
  return (raw || "")
    .toUpperCase()
    .replace(/[^\p{L}0-9]/gu, "");
}

/* =============================
   Typer
   ============================= */
type CarHit = {
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

type Fetched = {
  car: CarHit | null;
  damages: DamageRow[];
  wheel: string | null;
};

/* =============================
   Komponent
   ============================= */
export default function CheckinForm() {
  // Formstate
  const [regnr, setRegnr] = useState("");
  const [regUnknown, setRegUnknown] = useState<boolean>(false);

  const [ort, setOrt] = useState<string>("");
  const [depa, setDepa] = useState<string>("");

  const [matarstallning, setMatarstallning] = useState<string>("");

  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState<string>(""); // en decimal
  const [bransle, setBransle] = useState<"Bensin" | "Diesel" | null>(null);

  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynOk, setInsynOk] = useState<boolean | null>(null);
  const [laddsladdar, setLaddsladdar] = useState<number | null>(null);
  const [hjul, setHjul] = useState<"sommar" | "vinter" | null>(null);

  // Skador (flera)
  type Skada = { text: string; bilder: string[] };
  const [skador, setSkador] = useState<Skada[]>([]);
  const addSkada = () => setSkador((s) => [...s, { text: "", bilder: [] }]);
  const removeSkada = (idx: number) =>
    setSkador((s) => s.filter((_, i) => i !== idx));

  const [anteckning, setAnteckning] = useState("");

  // Uppslagna fordonsdata
  const [fetched, setFetched] = useState<Fetched>({
    car: null,
    damages: [],
    wheel: null,
  });

  // Feedback
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // Depålista beroende på ort
  const depaLista = useMemo(() => (ort ? ORTER[ort] ?? [] : []), [ort]);

  /* ---------- Reg.nr-uppslag ---------- */
  useEffect(() => {
    let alive = true;
    const raw = regnr.trim();
    if (!raw) {
      setFetched({ car: null, damages: [], wheel: null });
      setRegUnknown(false);
      return;
    }

    const n = normReg(raw);
    const run = async () => {
      try {
        // Bil
        const carList = await callRpc<CarHit[]>("car_lookup_any", { regnr: n });
        const car = carList?.[0] ?? null;

        // Hjul
        let w: string | null = null;
        try {
          const wrows = await callRpc<{ wheel_storage: string | null }[]>(
            "wheel_lookup_any",
            { regnr: n }
          );
          w = wrows?.[0]?.wheel_storage ?? null;
        } catch {
          // ignore
        }

        // Skador
        let d: DamageRow[] = [];
        try {
          const drows = await callRpc<DamageRow[]>("damages_lookup_any", {
            regnr: n,
          });
          d = Array.isArray(drows) ? drows : [];
        } catch {
          // ignore
        }

        if (!alive) return;
        setFetched({ car, damages: d, wheel: w });
        setRegUnknown(!car); // visa "Okänt reg.nr" om ingen träff
      } catch {
        if (!alive) return;
        setFetched({ car: null, damages: [], wheel: null });
        setRegUnknown(true);
      }
    };

    const t = setTimeout(run, 350); // lätt debounce
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [regnr]);

  /* ---------- Filuppladdning: ”Lägg till bild” (+ ta bort) ---------- */
  const hiddenInputs = useRef<Record<number, HTMLInputElement | null>>({});

  function triggerAddImage(skadaIx: number) {
    hiddenInputs.current[skadaIx]?.click();
  }
  function onAddImages(skadaIx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const urls = files.map((f) => URL.createObjectURL(f));
    setSkador((prev) =>
      prev.map((s, i) => (i === skadaIx ? { ...s, bilder: s.bilder.concat(urls) } : s))
    );
    e.currentTarget.value = ""; // reset
  }
  function removeImage(skadaIx: number, imgIx: number) {
    setSkador((prev) =>
      prev.map((s, i) =>
        i === skadaIx ? { ...s, bilder: s.bilder.filter((_, j) => j !== imgIx) } : s
      )
    );
  }

  /* ---------- Submit (dummy) + validering + scroll-to-top ---------- */
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const requiredOk =
      !!normReg(regnr) &&
      !!ort &&
      !!depa &&
      !!matarstallning &&
      tankFull !== null &&
      adBlueOk !== null &&
      spolarOk !== null &&
      insynOk !== null &&
      laddsladdar !== null &&
      hjul !== null &&
      skador.every((s) => s.text.trim().length > 0); // varje skada behöver text

    // extra krav när ej fulltankad
    const fuelOk =
      tankFull === true ||
      (tankFull === false &&
        !!liters &&
        !isNaN(Number(liters)) &&
        bransle !== null);

    if (!requiredOk || !fuelOk) {
      setMsg({
        type: "err",
        text: "Vänligen fyll i all information först.",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setMsg({
      type: "ok",
      text: `Tack Bob! Incheckningen för ${normReg(regnr)} är sparad.`,
    });

    // (dummy – ingen faktisk persist här)
  }

  return (
    <div className="page">
      <div className="container">
        <h1>Ny incheckning</h1>
        <p className="muted">
          Inloggad: <b>Bob</b>
        </p>

        {msg && (
          <div className={`alert ${msg.type === "ok" ? "success" : "error"}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={onSubmit}>
          {/* Reg.nr + Fordonsinfo */}
          <section className="card">
            <label className="label" htmlFor="regnr">
              Registreringsnummer *
            </label>
            <input
              id="regnr"
              autoCapitalize="characters"
              placeholder="Skriv reg.nr"
              value={regnr}
              onChange={(e) => setRegnr(e.target.value)}
              className="input"
            />
            {regUnknown && (
              <div className="warn">Okänt reg.nr</div>
            )}

            <div className="infoGrid">
              <div>
                <div className="smallLabel">Bilmodell</div>
                <div className="infoLine">
                  {fetched.car?.model || "--"}
                </div>
              </div>
              <div>
                <div className="smallLabel">Hjulförvaring</div>
                <div className="infoLine">
                  {fetched.wheel || fetched.car?.wheelstorage || "--"}
                </div>
              </div>
            </div>

            <div>
              <div className="smallLabel">Befintliga skador:</div>
              <div className="damageBox">
                {fetched.damages && fetched.damages.length > 0 ? (
                  <ul>
                    {fetched.damages.map((d, i) => (
                      <li key={i}>
                        {[
                          d.plats ? String(d.plats) : undefined,
                          d.typ ? String(d.typ) : undefined,
                          d.beskrivning ? String(d.beskrivning) : undefined,
                        ]
                          .filter(Boolean)
                          .join(" – ")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
          </section>

          {/* Plats för incheckning (rubrik innesluter Ort + Station/depå) */}
          <h2 className="blockTitle">Plats för incheckning</h2>
          <section className="card">
            <label className="label" htmlFor="ort">
              Ort *
            </label>
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
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            <label className="label" htmlFor="depa">
              Station / Depå *
            </label>
            <select
              id="depa"
              className="input"
              value={depa}
              onChange={(e) => setDepa(e.target.value)}
              disabled={!ort}
            >
              <option value="">— Välj station / depå —</option>
              {depaLista.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </section>

          {/* Mätare + fordonstillbehör mm */}
          <section className="card">
            <label className="label" htmlFor="matar">
              Mätarställning *
            </label>
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

            <div className="stack">
              <label className="label">Tanknivå *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${tankFull === true ? "on" : ""}`}
                  onClick={() => {
                    setTankFull(true);
                    setLiters("");
                    setBransle(null);
                  }}
                >
                  Fulltankad
                </button>
                <button
                  type="button"
                  className={`segbtn ${tankFull === false ? "on" : ""}`}
                  onClick={() => setTankFull(false)}
                >
                  Ej fulltankad
                </button>
              </div>
            </div>

            {/* Följdfrågor när ”Ej fulltankad” */}
            {tankFull === false && (
              <div className="grid2">
                <div className="stack">
                  <label className="label" htmlFor="liters">
                    Antal liter påfyllda
                  </label>
                  <input
                    id="liters"
                    className="input"
                    inputMode="decimal"
                    placeholder="ex. 12,5"
                    value={liters}
                    onChange={(e) => {
                      // Ersätt komma med punkt vid inmatning
                      const v = e.target.value.replace(",", ".");
                      // Endast siffror + ett decimaltecken
                      if (/^\d*([.]\d?)?$/.test(v) || v === "") {
                        setLiters(v);
                      }
                    }}
                  />
                </div>
                <div className="stack">
                  <label className="label">Bränsle</label>
                  <div className="seg">
                    <button
                      type="button"
                      className={`segbtn ${bransle === "Bensin" ? "on" : ""}`}
                      onClick={() => setBransle("Bensin")}
                    >
                      Bensin
                    </button>
                    <button
                      type="button"
                      className={`segbtn ${bransle === "Diesel" ? "on" : ""}`}
                      onClick={() => setBransle("Diesel")}
                    >
                      Diesel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid2">
              <div className="stack">
                <label className="label">AdBlue OK? *</label>
                <div className="seg">
                  <button
                    type="button"
                    className={`segbtn ${adBlueOk === true ? "on" : ""}`}
                    onClick={() => setAdBlueOk(true)}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    className={`segbtn ${adBlueOk === false ? "on" : ""}`}
                    onClick={() => setAdBlueOk(false)}
                  >
                    Nej
                  </button>
                </div>
              </div>

              <div className="stack">
                <label className="label">Spolarvätska OK? *</label>
                <div className="seg">
                  <button
                    type="button"
                    className={`segbtn ${spolarOk === true ? "on" : ""}`}
                    onClick={() => setSpolarOk(true)}
                  >
                    Ja
                  </button>
                  <button
                    type="button"
                    className={`segbtn ${spolarOk === false ? "on" : ""}`}
                    onClick={() => setSpolarOk(false)}
                  >
                    Nej
                  </button>
                </div>
              </div>
            </div>

            <div className="stack">
              <label className="label">Insynsskydd OK? *</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${insynOk === true ? "on" : ""}`}
                  onClick={() => setInsynOk(true)}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`segbtn ${insynOk === false ? "on" : ""}`}
                  onClick={() => setInsynOk(false)}
                >
                  Nej
                </button>
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
                <button
                  type="button"
                  className={`segbtn ${hjul === "sommar" ? "on" : ""}`}
                  onClick={() => setHjul("sommar")}
                >
                  Sommarhjul
                </button>
                <button
                  type="button"
                  className={`segbtn ${hjul === "vinter" ? "on" : ""}`}
                  onClick={() => setHjul("vinter")}
                >
                  Vinterhjul
                </button>
              </div>
            </div>
          </section>

          {/* Nya skador */}
          <section className="card">
            <div className="stack">
              <label className="label">Nya skador på bilen?</label>
              <div className="seg">
                <button
                  type="button"
                  className={`segbtn ${skador.length > 0 ? "on" : ""}`}
                  onClick={() => {
                    if (skador.length === 0) addSkada();
                  }}
                >
                  Ja
                </button>
                <button
                  type="button"
                  className={`segbtn ${skador.length === 0 ? "on" : ""}`}
                  onClick={() => setSkador([])}
                >
                  Nej
                </button>
              </div>
            </div>

            {skador.map((s, idx) => (
              <div key={idx} className="skadakort">
                <div className="skadatitle">
                  <h3>Skada {idx + 1}</h3>
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => removeSkada(idx)}
                  >
                    Ta bort
                  </button>
                </div>

                <label className="label">Text (obligatorisk)</label>
                <input
                  className="input"
                  placeholder="Beskriv skadan…"
                  value={s.text}
                  onChange={(e) =>
                    setSkador((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x))
                    )
                  }
                />

                <div className="stack">
                  <label className="label">Bilder</label>
                  <input
                    ref={(el) => (hiddenInputs.current[idx] = el)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => onAddImages(idx, e)}
                    style={{ display: "none" }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => triggerAddImage(idx)}
                  >
                    Lägg till bild
                  </button>

                  <div className="thumbs">
                    {s.bilder.map((src, i) => (
                      <div key={i} className="thumb">
                        <img src={src} alt={`foto-${i}`} />
                        <button
                          type="button"
                          className="del"
                          onClick={() => removeImage(idx, i)}
                          aria-label="Ta bort bild"
                          title="Ta bort bild"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {skador.length > 0 && (
              <button
                type="button"
                className="btn ghost"
                onClick={addSkada}
              >
                Lägg till ytterligare en skada
              </button>
            )}
          </section>

          {/* Övrigt + Spara */}
          <section className="card">
            <label className="label">Övriga anteckningar</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Fritt fält"
              value={anteckning}
              onChange={(e) => setAnteckning(e.target.value)}
            />

            <button type="submit" className="btn primary">
              Spara incheckning
            </button>
          </section>
        </form>
      </div>

      {/* Stil */}
      <style jsx>{`
        :global(html, body) { background:#0b0b0b; }
        .page { background:#f6f7f9; min-height:100vh; padding:20px 0 60px; }
        .container { width:92%; max-width:720px; margin:0 auto; color:#111; }
        h1 { font-size:28px; margin:0 0 4px; }
        .muted { color:#555; margin:0 0 16px; }

        .blockTitle { margin:18px 0 8px; font-size:16px; color:#374151; }

        .alert {
          border-radius: 8px; padding: 12px 14px; margin: 0 0 16px; font-weight:600;
        }
        .alert.success { background:#ecfdf5; color:#065f46; border:1px solid #10b981; }
        .alert.error   { background:#fef2f2; color:#7f1d1d; border:1px solid #ef4444; }

        .card {
          background:#fff; border:1px solid #e5e7eb; border-radius:14px;
          box-shadow:0 1px 2px rgba(10,10,10,.03);
          padding:16px; display:grid; grid-template-columns:1fr; gap:14px; margin-bottom:14px;
        }

        .label { font-weight:700; font-size:14px; color:#111; }
        .input, select, textarea {
          width:100%; border:1px solid #cfd6df; border-radius:8px; padding:10px 12px; background:#fff; color:#111;
        }
        .with-suffix { position:relative; }
        .with-suffix .suffix { position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#6b7280; font-weight:600; }

        .infoGrid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media (max-width:560px){ .infoGrid{ grid-template-columns:1fr; } }

        .smallLabel { font-size:12px; color:#6b7280; margin-bottom:2px; }
        .infoLine { font-weight:700; color:#111; }

        .damageBox { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; }
        .damageBox ul { margin:0; padding-left:18px; }

        .warn { color:#b91c1c; font-weight:700; }

        .stack { display:grid; gap:8px; }
        .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        @media (max-width:560px){ .grid2{ grid-template-columns:1fr; } }

        .seg { display:flex; gap:10px; flex-wrap:wrap; }
        .segbtn {
          background:#fff; border:1px solid #cfd6df; border-radius:10px; padding:10px 14px; font-weight:600; color:#0f172a;
        }
        .segbtn.on { background:#d1fae5; border-color:#10b981; color:#065f46; }

        .btn.primary { margin-top:6px; background:#1a56db; color:#fff; border:none; border-radius:12px; padding:14px 16px; font-weight:700; }
        .btn.ghost { background:#fff; border:1px solid #cfd6df; border-radius:10px; padding:10px 14px; font-weight:600; color:#0f172a; }

        .skadakort {
          background:#fff8f0; border:1px solid #f59e0b55; border-radius:12px; padding:12px; display:grid; gap:10px;
        }
        .skadatitle { display:flex; gap:12px; align-items:center; justify-content:space-between; }
        .linkbtn { background:none; border:none; color:#b91c1c; font-weight:700; }

        .thumbs { display:flex; gap:10px; flex-wrap:wrap; }
        .thumb { position:relative; }
        .thumb img { width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid #d1d5db; }
        .thumb .del {
          position:absolute; top:-8px; right:-8px; width:22px; height:22px;
          border-radius:50%; background:#ef4444; color:#fff; border:none; font-weight:700; line-height:22px;
        }
      `}</style>
    </div>
  );
}
