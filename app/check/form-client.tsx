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

  // 3) Hjulförvaring
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

/* ====== Platsdata från "Stationer o Depåer Albarone" ====== */
type Stationer = Record<string, string[]>;
const PLATSER: Stationer = {
  'Malmö Jägersro': [
    'Ford Malmö','Mechanum','Malmö Automera','Mercedes Malmö','Werksta St Bernstorp',
    'Werksta Malmö Hamn','Hedbergs Malmö','Hedin Automotive Burlöv','Sturup',
  ],
  'Helsingborg': [
    'HBSC Helsingborg','Ford Helsingborg','Transport Helsingborg','S. Jönsson','BMW Helsingborg',
    'KIA Helsingborg','Euromaster Helsingborg','B/S Klippan','B/S Munka-Ljungby',
    'B/S Helsingborg','Werksta Helsingborg','Båstad',
  ],
  'Ängelholm': ['FORD Ängelholm','Mekonomen Ängelholm','Flyget Ängelholm'],
  'Halmstad': ['Flyget Halmstad','KIA Halmstad','FORD Halmstad'],
  'Falkenberg': [],
  'Trelleborg': [],
  'Varberg': ['Ford Varberg','Hedin Automotive Varberg','Sällstorp lack plåt','Finnveden plåt'],
  'Lund': ['Ford Lund','Hedin Lund','B/S Lund','P7 Revinge'],
};
const ORTER = Object.keys(PLATSER);

/* ====== Komponent ====== */
export default function FormClient() {
  const [regInput, setRegInput] = useState('');
  const [car, setCar] = useState<CanonicalCar | null>(null);
  const [tried, setTried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<DebugLog | null>(null);

  const [ort, setOrt] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [annanPlats, setAnnanPlats] = useState<string>('');
  const [matarstallning, setMatarstallning] = useState<string>('');
  const [tankFull, setTankFull] = useState<boolean | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [spolarOk, setSpolarOk] = useState<boolean | null>(null);
  const [insynsskyddOk, setInsynsskyddOk] = useState<boolean | null>(null);
  const [laddsladdar, setLaddsladdar] = useState<0|1|2>(0);
  const [hjulSomSitterPa, setHjulSomSitterPa] = useState<'Sommarhjul'|'Vinterhjul'|null>(null);
  const [nyaSkador, setNyaSkador] = useState<boolean | null>(null);
  const [simulateFail, setSimulateFail] = useState<boolean>(false);

  type LocalSkada = { id: string; text: string; files: File[]; previews: string[] };
  const [skador, setSkador] = useState<LocalSkada[]>([]);

  async function lookupNow() {
    const value = regInput.trim(); if (!value) return;
    setLoading(true);
    const { car: found, log } = await fetchCarAndDamages(value);
    setCar(found); setDebug(log); setTried(true); setLoading(false);
  }
  function onChangeReg(e: ChangeEvent<HTMLInputElement>) { setRegInput(e.target.value); setTried(false); setCar(null); }
  function onSelectOrt(o: string) { setOrt(o); setStation(''); }
  function addSkada() { setSkador(v => [...v,{id:crypto.randomUUID(),text:'',files:[],previews:[]}]); }
  function removeSkada(id: string){ setSkador(v => v.filter(s=>s.id!==id)); }
  function changeSkadaText(id:string,text:string){ setSkador(v=>v.map(s=>s.id===id?{...s,text}:s)); }
  function addSkadaFiles(id:string,files:FileList|null){
    if(!files) return; const arr=Array.from(files); const withPrev=arr.map(f=>URL.createObjectURL(f));
    setSkador(v=>v.map(s=>s.id===id?{...s,files:[...s.files,...arr],previews:[...s.previews,...withPrev]}:s));
  }

  function onSubmit(e:FormEvent){
    e.preventDefault();
    const errors:string[]=[];
    if(!regInput.trim()) errors.push('Ange reg.nr');
    if(!matarstallning.trim()) errors.push('Ange mätarställning');
    if(!ort) errors.push('Välj ort');
    if(!station) errors.push('Välj station/depå');
    if(simulateFail){ alert('Misslyckades (simulerat fel).'); return; }
    if(errors.length){ alert('Misslyckades. '+errors.join(' · ')); return; }
    alert('Incheckning sparad (demo).');
  }

  const showError = tried && !car && regInput.trim().length > 0;

  return (
    <section className="incheckad-scope">
      <div className="page"><div className="container">
        <h1 className="h1">Ny incheckning</h1>
        <p className="p">Inloggad: <strong>Bob</strong></p>
        {/* ... Resterande markup samma som min senaste version (kort 1–6, stylad ljus design) ... */}
      </div></div>
    </section>
  );
}
