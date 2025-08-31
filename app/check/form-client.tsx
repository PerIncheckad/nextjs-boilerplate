'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ====== Supabase-klient ====== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

function getSupabaseClient() {
  if (typeof window === 'undefined') return null;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}
const supabase = getSupabaseClient();

/* ====== Typer ====== */
type DamageEntry = { id: string; plats?: string; typ?: string; beskrivning?: string };
type CanonicalCar = { regnr: string; model: string; wheelStorage: string; skador: DamageEntry[] };

type DebugStep = { name: string; ok?: boolean; rows?: number; error?: string; picked?: any };
type DebugLog = { envOk: boolean; steps: DebugStep[]; rawInput: string; normalizedInput: string };

/* ====== Hjälp ====== */
function normalizeReg(s: string) {
  return (s ?? '')
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s\-_.]/g, '')
    .trim();
}

/* ====== Uppslag: bil + skador + hjulförvaring ====== */
async function fetchCarAndDamages(regInput: string): Promise<{ car: CanonicalCar | null; log: DebugLog }> {
  const norm = normalizeReg(regInput);
  const log: DebugLog = { envOk: Boolean(supabase), steps: [], rawInput: regInput, normalizedInput: norm };
  if (!supabase) { log.steps.push({ name:'init', error:'Supabase-nycklar saknas' }); return { car:null, log }; }

  // 1) Bil
  const { data: carRows, error: carErr } = await supabase.rpc('car_lookup_any', { p_reg: regInput });
  if (carErr) { log.steps.push({ name:'rpc:car_lookup_any', error: carErr.message }); return { car:null, log }; }
  const carRow = Array.isArray(carRows) && carRows.length ? carRows[0] : null;
  log.steps.push({ name:'rpc:car_lookup_any', ok: !!carRow, rows: Array.isArray(carRows)?carRows.length:0, picked: carRow || undefined });
  if (!carRow) return { car:null, log };

  // 2) Skador
  const { data: dmgRows, error: dmgErr } = await supabase.rpc('damages_lookup_any', {
    p_car_id: carRow.car_id ?? null,
    p_reg: carRow.regnr ?? regInput,
  });
  if (dmgErr) log.steps.push({ name:'rpc:damages_lookup_any', error: dmgErr.message });

  // 3) Hjulförvaring (kan vara tomt tills vi normaliserat däcklistan)
  let wheelStorage: string =
    (carRow.wheelstorage && String(carRow.wheelstorage).trim()) ||
    (carRow.wheelStorage && String(carRow.wheelStorage).trim()) ||
    '';

  if (!wheelStorage) {
    const { data: wheelRows, error: wheelErr } = await supabase.rpc('wheel_lookup_any', {
      p_car_id: carRow.car_id ?? null,
      p_reg: carRow.regnr ?? regInput,
    });
    if (wheelErr) {
      log.steps.push({ name:'rpc:wheel_lookup_any', error: wheelErr.message });
    } else {
      const w = Array.isArray(wheelRows) && wheelRows.length ? wheelRows[0] : null;
      log.steps.push({ name:'rpc:wheel_lookup_any', ok: !!w, rows: Array.isArray(wheelRows)?wheelRows.length:0, picked: w || undefined });
      wheelStorage = (w && w.wheelstorage && String(w.wheelstorage).trim())
                  || (w && w.wheelStorage && String(w.wheelStorage).trim())
                  || '';
    }
  }

  const skador: DamageEntry[] = (Array.isArray(dmgRows) ? dmgRows : []).map((d:any, i:number) => ({
    id: String(d?.id ?? i + 1),
    plats: d?.plats ? String(d.plats) : undefined,
    typ: d?.typ ? String(d.typ) : undefined,
    beskrivning: d?.beskrivning ? String(d.beskrivning) : undefined,
  }));

  const car: CanonicalCar = {
    regnr: carRow.regnr || regInput,
    model: (carRow.model && String(carRow.model).trim()) || '--',
    wheelStorage: wheelStorage || '--',
    skador,
  };
  return { car, log };
}

/* ====== UI-komponent ====== */
export default function FormClient() {
  // Biluppslag
  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<DebugLog | null>(null);

  // Övriga formfält (99%-läget)
  const [ort, setOrt] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [annanPlats, setAnnanPlats] = useState<string>('');
  const [matarstallning, setMatarstallning] = useState<string>('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynsskyddOk, setInsynsskyddOk] = useState<boolean | null>(null);
  const [laddsladdar, setLaddsladdar] = useState<number>(0);
  const [hjulSomSitterPa, setHjulSomSitterPa] = useState<'Sommarhjul'|'Vinterhjul'|null>(null);
  const [nyaSkador, setNyaSkador] = useState<boolean | null>(null);

  // Dynamiska nya skador (lokalt)
  type LocalSkada = { id: string; text: string; files: File[] };
  const [skador, setSkador] = useState<LocalSkada[]>([]);

  // Dummydata för ort/station – byt till din riktiga lista när den finns
  const ORTER = ['HALMSTAD','MALMÖ','HELSINGBORG','GÖTEBORG','STOCKHOLM'];
  const STATIONER = ['Hedin Automotive Kia','Hedin Bil','MABI Central','Depå Syd','Depå Nord'];

  async function lookupNow() {
    const value = regInput.trim(); if (!value) return;
    setLoading(true);
    const { car: found, log } = await fetchCarAndDamages(value);
    setCar(found); setDebug(log); setTried(true); setLoading(false);
  }

  function onChangeReg(e: ChangeEvent<HTMLInputElement>) {
    setRegInput(e.target.value);
    setTried(false);
    setCar(null);
  }

  function addSkada() { setSkador(v => [...v, { id: crypto.randomUUID(), text: '', files: [] }]); }
  function removeSkada(id: string) { setSkador(v => v.filter(s => s.id !== id)); }
  function changeSkadaText(id: string, text: string) { setSkador(v => v.map(s => s.id===id?{...s,text}:s)); }
  function addSkadaFiles(id: string, files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    setSkador(v => v.map(s => s.id===id?{...s, files:[...s.files, ...arr]}:s));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Här kan vi POST:a till Supabase (checkins/checkin_damages) när du vill
    alert('Formuläret är klart visuellt. Spara-funktion kan kopplas på när tabellnamn/kolumner bekräftas.');
  }

  const showError = tried && !car && regInput.trim().length > 0;

  return (
    <section className="incheckad-scope">
      <div className="page"><div className="container">
        <h1 className="h1">Ny incheckning</h1>
        <p className="p">Inloggad: <strong>Bob</strong></p>

        <form onSubmit={onSubmit} className="stack-xl">

          {/* Kort 1: Biluppslag */}
          <div className="card stack-lg">
            <div className="stack-sm">
              <label htmlFor="regnr" className="label">Registreringsnummer *</label>
              <input
                id="regnr"
                type="text"
                value={regInput}
                onChange={onChangeReg}
                onBlur={lookupNow}
                placeholder="Skriv reg.nr (t.ex. DGF14H)"
                autoComplete="off"
                className="input"
              />
              {loading && <p className="muted">Hämtar…</p>}
              {showError && <p className="error">Okänt reg.nr</p>}
              {!supabase && <p className="error">Supabase ej konfigurerat.</p>}
            </div>

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
                        {car.skador.map(s => {
                          const hasPlats = !!s.plats && s.plats.trim() !== '';
                          const hasTyp = !!s.typ && s.typ.trim() !== '';
                          const hasBes = !!s.beskrivning && s.beskrivning.trim() !== '';
                          return (
                            <li key={s.id}>
                              {hasPlats && <strong>{s.plats!.trim()}</strong>}
                              {hasPlats && hasTyp ? ' – ' : ''}
                              {hasTyp && s.typ!.trim()}
                              {hasBes && (!hasTyp || s.beskrivning!.trim().toLowerCase() !== s.typ!.trim().toLowerCase())
                                ? ` (${s.beskrivning!.trim()})` : ''}
                              {!hasPlats && !hasTyp && hasBes && s.beskrivning}
                              {!hasPlats && !hasTyp && !hasBes && '--'}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Kort 2: Ort / Station */}
          <div className="card stack-lg">
            <div className="stack-sm">
              <label className="label">Ort *</label>
              <select className="select" value={ort} onChange={e => setOrt(e.target.value)}>
                <option value="">— Välj ort —</option>
                {['HALMSTAD','MALMÖ','HELSINGBORG','GÖTEBORG','STOCKHOLM'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="stack-sm">
              <label className="label">Station / Depå *</label>
              <select className="select" value={station} onChange={e => setStation(e.target.value)}>
                <option value="">— Välj station / depå —</option>
                {['Hedin Automotive Kia','Hedin Bil','MABI Central','Depå Syd','Depå Nord'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="stack-sm">
              <label className="label">Ev. annan inlämningsplats</label>
              <input className="input" value={annanPlats} onChange={e=>setAnnanPlats(e.target.value)} placeholder="Övrig info…" />
            </div>
          </div>

          {/* Kort 3: Mätare / Tank / Vätskor */}
          <div className="card stack-lg">
            <div className="stack-sm">
              <label className="label">Mätarställning *</label>
              <div className="row">
                <input className="input" type="number" inputMode="numeric" pattern="[0-9]*"
                  value={matarstallning} onChange={e=>setMatarstallning(e.target.value)} placeholder="ex. 42 180" />
                <span className="suffix muted">km</span>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Tanknivå *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${tankFull===true?'on':''}`} onClick={()=>setTankFull(true)}>Fulltankad</button>
                <button type="button" className={`segbtn ${tankFull===false?'on':''}`} onClick={()=>setTankFull(false)}>Ej fulltankad</button>
              </div>
            </div>

            <div className="grid2">
              <div className="stack-sm">
                <label className="label">AdBlue OK? *</label>
                <div className="seg">
                  <button type="button" className={`segbtn ${adBlueOk===true?'on':''}`} onClick={()=>setAdBlueOk(true)}>Ja</button>
                  <button type="button" className={`segbtn ${adBlueOk===false?'on':''}`} onClick={()=>setAdBlueOk(false)}>Nej</button>
                </div>
              </div>
              <div className="stack-sm">
                <label className="label">Spolarvätska OK? *</label>
                <div className="seg">
                  <button type="button" className={`segbtn ${spolarOk===true?'on':''}`} onClick={()=>setSpolarOk(true)}>Ja</button>
                  <button type="button" className={`segbtn ${spolarOk===false?'on':''}`} onClick={()=>setSpolarOk(false)}>Nej</button>
                </div>
              </div>
            </div>

            <div className="stack-sm">
              <label className="label">Insynsskydd OK? *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${insynsskyddOk===true?'on':''}`} onClick={()=>setInsynsskyddOk(true)}>Ja</button>
                <button type="button" className={`segbtn ${insynsskyddOk===false?'on':''}`} onClick={()=>setInsynsskyddOk(false)}>Nej</button>
              </div>
            </div>
          </div>

          {/* Kort 4: Laddsladdar / Hjul */}
          <div className="card stack-lg">
            <div className="stack-sm">
              <label className="label">Antal laddsladdar</label>
              <input className="input" type="number" value={laddsladdar} onChange={e=>setLaddsladdar(parseInt(e.target.value || '0'))} />
            </div>

            <div className="stack-sm">
              <label className="label">Hjul som sitter på *</label>
              <div className="seg">
                <button type="button" className={`segbtn ${hjulSomSitterPa==='Sommarhjul'?'on':''}`} onClick={()=>setHjulSomSitterPa('Sommarhjul')}>Sommarhjul</button>
                <button type="button" className={`segbtn ${hjulSomSitterPa==='Vinterhjul'?'on':''}`} onClick={()=>setHjulSomSitterPa('Vinterhjul')}>Vinterhjul</button>
              </div>
            </div>
          </div>

          {/* Kort 5: Nya skador */}
          <div className="card stack-lg">
            <div className="stack-sm">
              <label className="label">Nya skador?</label>
              <div className="seg">
                <button type="button" className={`segbtn ${nyaSkador===true?'on':''}`} onClick={()=>setNyaSkador(true)}>Ja</button>
                <button type="button" className={`segbtn ${nyaSkador===false?'on':''}`} onClick={()=>setNyaSkador(false)}>Nej</button>
              </div>
            </div>

            {nyaSkador && (
              <div className="stack-sm">
                <button type="button" onClick={addSkada} className="btn">+ Lägg till skada</button>
                {skador.map(s => (
                  <div key={s.id} className="panel stack-sm">
                    <input className="input" value={s.text} onChange={e=>changeSkadaText(s.id, e.target.value)} placeholder="Beskriv skadan" />
                    <input type="file" multiple onChange={e=>addSkadaFiles(s.id, e.target.files)} />
                    <button type="button" className="link" onClick={()=>removeSkada(s.id)}>Ta bort</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Kort 6: Övrigt + Spara */}
          <div className="card stack-lg">
            <button type="submit" className="btn primary">Spara incheckning</button>
          </div>

          {/* Diagnostik */}
          {debug && (
            <details className="debug">
              <summary>Diagnostik</summary>
              <pre>{JSON.stringify(debug, null, 2)}</pre>
            </details>
          )}
        </form>
      </div></div>

      {/* Minimal styling för 99%-läget */}
      <style jsx>{`
        .page { padding: 16px; }
        .container{ max-width: 720px; margin:0 auto; }
        .h1{ font-size:28px; font-weight:700; margin:8px 0 16px; }
        .p{ margin:0 0 16px; color:#9aa0a6; }
        .stack-xl > * + *{ margin-top:24px; }
        .stack-lg > * + *{ margin-top:16px; }
        .stack-sm > * + *{ margin-top:8px; }
        .card{ background:#111; border:1px solid #2a2a2a; border-radius:12px; padding:16px; }
        .label{ font-weight:600; }
        .input,.select{ width:100%; background:#0c0c0c; color:#fff; border:1px solid #2a2a2a; border-radius:8px; padding:12px; }
        .row{ display:flex; align-items:center; gap:8px; }
        .suffix{ min-width:40px; }
        .seg{ display:flex; gap:8px; }
        .segbtn{ padding:10px 14px; border:1px solid #2a2a2a; border-radius:8px; background:#0c0c0c; color:#fff; }
        .segbtn.on{ background:#d2f4d3; color:#0a0a0a; border-color:#d2f4d3; }
        .btn{ padding:12px 16px; border-radius:10px; border:1px solid #2a2a2a; background:#222; color:#fff; }
        .btn.primary{ background:#1a4bff; border-color:#1a4bff; }
        .link{ background:transparent; color:#7aa7ff; border:none; padding:0; }
        .muted{ color:#9aa0a6; }
        .error{ color:#ef4444; }
        .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .info{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .value{ font-weight:600; }
        .panel{ background:#0c0c0c; border:1px solid #2a2a2a; border-radius:8px; padding:12px; }
        .ul{ margin:0; padding-left:18px; }
        details.debug{ margin-top:16px; }
        pre{ white-space:pre-wrap; word-break:break-word; }
        @media (max-width:640px){ .grid2,.info{ grid-template-columns:1fr; } }
      `}</style>
    </section>
  );
}

