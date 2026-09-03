'use client';

import { useState } from 'react';

type Preflight = {
  regnr: string;
  intake: { intake_id: string; brand: string; model: string; odometer_km: number; station: string; registered_at: string } | null;
  returnRecord: { return_id: string; returned_at: string; return_station: string; returned_to: string } | null;
  openPeriods: Array<{ period_id: string; period_type: string; started_at: string; source_entity: string | null; source_record_id: string | null }>;
  rentalFacts: Array<{ rental_fact_id: string; agreement_no: string | null; out_at: string | null; in_at: string | null }>;
  station: string | null;
  stationScope: 'SINGLE' | 'ALL' | null;
  allowedStations: string[];
};

type ReturnResult = {
  return_id: string;
  regnr: string;
  return_station: string;
  returned_to: string;
  odometer_km: number;
  damages_at_return: string;
  energy_type: 'FUEL' | 'ELECTRIC' | 'NOT_APPLICABLE';
  energy_level_percent: number | null;
  returned_at: string;
  returned_by_email: string;
  historical_backfill: false;
};

const shell: React.CSSProperties = { width:'100%', padding:14, border:'1px solid #d7d7d7', borderRadius:8, background:'#fff', boxSizing:'border-box' };
const row: React.CSSProperties = { display:'flex', gap:8, flexWrap:'wrap', alignItems:'end' };
const input: React.CSSProperties = { padding:'8px 9px', border:'1px solid #cfcfcf', borderRadius:6, fontSize:13, minWidth:180 };
const button: React.CSSProperties = { padding:'8px 11px', border:'1px solid #b8b8b8', borderRadius:6, background:'#fff', cursor:'pointer', fontWeight:800 };
const primary: React.CSSProperties = { ...button, background:'#111', color:'#fff', borderColor:'#111' };
const card: React.CSSProperties = { marginTop:10, padding:10, border:'1px solid #e3e3e3', borderRadius:7, background:'#fafafa', fontSize:13 };

function cleanRegnr(value: string) { return value.toUpperCase().replace(/\s+/g, '').slice(0,6); }

export default function GarageRentedInReturnPanel() {
  const [regnr,setRegnr] = useState('');
  const [preflight,setPreflight] = useState<Preflight|null>(null);
  const [returnStation,setReturnStation] = useState('');
  const [returnedTo,setReturnedTo] = useState('');
  const [odometerKm,setOdometerKm] = useState('');
  const [damages,setDamages] = useState('');
  const [energyType,setEnergyType] = useState<'FUEL'|'ELECTRIC'|'NOT_APPLICABLE'>('FUEL');
  const [energyLevel,setEnergyLevel] = useState('100');
  const [result,setResult] = useState<ReturnResult|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);

  async function load() {
    const normalized = cleanRegnr(regnr);
    setRegnr(normalized); setBusy(true); setError(null); setResult(null); setReturnStation('');
    try {
      const response = await fetch(`/api/vehicle-journey/rented-in-return?regnr=${encodeURIComponent(normalized)}`, { cache:'no-store' });
      const body = await response.json() as { data?: Preflight; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa returkontroll');
      setPreflight(body.data ?? null);
      if (body.data?.intake) setOdometerKm(String(body.data.intake.odometer_km));
    } catch (reason) {
      setPreflight(null); setError(reason instanceof Error ? reason.message : 'Kunde inte läsa returkontroll');
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!preflight?.intake) return setError('Aktivt INHYRD-intag krävs.');
    if (preflight.returnRecord) return setError('Bilen är redan återlämnad.');
    if (preflight.openPeriods.length > 0) return setError('Öppen Layer1-period måste först stängas av sin ägande källa.');
    const station = preflight.stationScope === 'ALL' ? returnStation : undefined;
    if (preflight.stationScope === 'ALL' && !station) return setError('Välj returstation.');
    if (!returnedTo.trim()) return setError('Ange vem bilen återlämnas till.');
    if (!Number.isInteger(Number(odometerKm)) || Number(odometerKm) < preflight.intake.odometer_km) return setError('Retur-km får inte understiga intags-km.');
    if (!damages.trim()) return setError('Skador vid retur måste anges uttryckligen. Skriv INGA KÄNDA om inga finns.');
    if (energyType !== 'NOT_APPLICABLE' && (!Number.isInteger(Number(energyLevel)) || Number(energyLevel) < 0 || Number(energyLevel) > 100)) return setError('Bränsle/laddningsnivå ska vara 0–100 %.');

    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/vehicle-journey/rented-in-return', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ regnr: preflight.regnr, return_station: station, returned_to: returnedTo, odometer_km: Number(odometerKm), damages_at_return: damages, energy_type: energyType, energy_level_percent: energyType === 'NOT_APPLICABLE' ? null : Number(energyLevel) }),
      });
      const body = await response.json() as { data?: ReturnResult; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'INHYRD återlämning misslyckades');
      setResult(body.data ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'INHYRD återlämning misslyckades'); }
    finally { setBusy(false); }
  }

  const blockedByOpenPeriod = Boolean(preflight?.openPeriods.length);
  return <section style={shell} aria-label="INHYRD återlämning">
    <div style={{ fontSize:13, fontWeight:900, letterSpacing:'.06em' }}>GARAGE / EXTERNT FORDON / UT</div>
    <h2 style={{ margin:'2px 0 0', fontSize:24 }}>INHYRD / ÅTERLÄMNING</h2>
    <p style={{ margin:'4px 0 0', color:'#50565a', fontSize:14 }}><strong>Återlämningen avslutar endast INHYRD-objektets aktiva närvaro. RENTAL och AVVECKLA ägs av sina egna flöden.</strong></p>
    {error ? <div style={{ marginTop:10, padding:9, borderRadius:6, background:'#fff1f1', color:'#a40000', fontWeight:700, fontSize:13 }}>{error}</div> : null}
    <div style={{ ...row, marginTop:10 }}>
      <label><span style={{ display:'block', fontWeight:800 }}>Registreringsnummer</span><input style={input} value={regnr} onChange={(e)=>setRegnr(cleanRegnr(e.target.value))} placeholder="ABC123" /></label>
      <button type="button" style={button} disabled={busy || regnr.length!==6} onClick={()=>void load()}>Läs returkontroll</button>
    </div>
    {preflight ? <div style={card}>
      <div><strong>{preflight.regnr}</strong></div>
      <div>INHYRD: {preflight.intake ? `${preflight.intake.brand} ${preflight.intake.model} · intag ${preflight.intake.odometer_km} km` : 'SAKNAS'}</div>
      <div>Återlämning: {preflight.returnRecord ? 'Redan registrerad' : 'Inte registrerad'}</div>
      <div>Öppen Layer1: {preflight.openPeriods.length ? preflight.openPeriods.map((p)=>p.period_type).join(', ') : 'Ingen'}</div>
      <div>RENTAL-källfakta: {preflight.rentalFacts.length ? `${preflight.rentalFacts.length} träff(ar) – stängs inte här` : 'Ingen träff'}</div>
    </div> : null}
    {preflight?.intake && !preflight.returnRecord ? <div style={{ ...card, background:'#fff' }}>
      {blockedByOpenPeriod ? <div style={{ marginBottom:8, fontWeight:800, color:'#a40000' }}>STOPP: öppen Layer1-period måste stängas av ägande källa före återlämning.</div> : null}
      <div style={row}>
        {preflight.stationScope === 'ALL' ? <label><span style={{ display:'block', fontWeight:800 }}>Returstation</span><select style={input} value={returnStation} onChange={(e)=>setReturnStation(e.target.value)}><option value="">Välj huvudort</option>{preflight.allowedStations.map((station)=><option key={station} value={station}>{station}</option>)}</select></label> : <div>Returstation: <strong>{preflight.station ?? 'SAKNAS'}</strong></div>}
        <label><span style={{ display:'block', fontWeight:800 }}>Återlämnad till</span><input style={input} value={returnedTo} onChange={(e)=>setReturnedTo(e.target.value)} placeholder="Extern part / kontakt" /></label>
        <label><span style={{ display:'block', fontWeight:800 }}>Km vid retur</span><input style={input} type="number" min={preflight.intake.odometer_km} step="1" value={odometerKm} onChange={(e)=>setOdometerKm(e.target.value)} /></label>
        <label><span style={{ display:'block', fontWeight:800 }}>Skador vid retur</span><input style={{ ...input, minWidth:300 }} value={damages} onChange={(e)=>setDamages(e.target.value)} placeholder="Beskriv eller skriv INGA KÄNDA" /></label>
        <label><span style={{ display:'block', fontWeight:800 }}>Energi</span><select style={input} value={energyType} onChange={(e)=>setEnergyType(e.target.value as typeof energyType)}><option value="FUEL">Bränsle</option><option value="ELECTRIC">El</option><option value="NOT_APPLICABLE">Ej relevant</option></select></label>
        {energyType !== 'NOT_APPLICABLE' ? <label><span style={{ display:'block', fontWeight:800 }}>Nivå %</span><input style={input} type="number" min="0" max="100" step="1" value={energyLevel} onChange={(e)=>setEnergyLevel(e.target.value)} /></label> : null}
        <button type="button" style={primary} disabled={busy || blockedByOpenPeriod} onClick={()=>void submit()}>Registrera återlämning</button>
      </div>
    </div> : null}
    {result ? <div style={{ ...card, background:'#f6fff7' }}><strong>INHYRD återlämnad</strong><div>{result.regnr} · {result.odometer_km} km · {result.return_station}</div><div>Återlämnad till: {result.returned_to}</div><div>Skador: {result.damages_at_return}</div><div>Energi: {result.energy_type}{result.energy_level_percent === null ? '' : ` ${result.energy_level_percent}%`}</div><div>Returnerad: {new Date(result.returned_at).toLocaleString('sv-SE')} · {result.returned_by_email}</div><div>historicalBackfill: false</div></div> : null}
  </section>;
}
