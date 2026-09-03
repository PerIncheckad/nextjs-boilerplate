'use client';

import { useState } from 'react';

type Preflight = {
  regnr: string;
  station: string | null;
  intake: { intake_id: string; registered_at: string; registered_by_email: string } | null;
  legacy: { entry_id: string; object_type: string } | null;
  currentPeriod: { period_id: string; period_type: string; started_at: string } | null;
  historicalBackfill: false;
};

type Result = {
  intake_id: string;
  regnr: string;
  object_type: 'INHYRD';
  brand: string;
  model: string;
  odometer_km: number;
  known_damages: string;
  station: string;
  intake_method: 'QUICK_INTAKE';
  registered_at: string;
  registered_by_email: string;
  historical_backfill: false;
};

const shell: React.CSSProperties = { width: '100%', margin: 0, padding: 14, border: '1px solid #d7d7d7', borderRadius: 8, background: '#fff', boxSizing: 'border-box' };
const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' };
const input: React.CSSProperties = { padding: '8px 9px', border: '1px solid #cfcfcf', borderRadius: 6, fontSize: 13, minWidth: 180 };
const button: React.CSSProperties = { padding: '8px 11px', border: '1px solid #b8b8b8', borderRadius: 6, background: '#fff', cursor: 'pointer', fontWeight: 800 };
const primary: React.CSSProperties = { ...button, background: '#111', color: '#fff', borderColor: '#111' };
const card: React.CSSProperties = { marginTop: 10, padding: 10, border: '1px solid #e3e3e3', borderRadius: 7, background: '#fafafa', fontSize: 13 };

function cleanRegnr(value: string) { return value.toUpperCase().replace(/\s+/g, '').slice(0, 6); }

export default function GarageRentedInIntakePanel() {
  const [regnr, setRegnr] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [knownDamages, setKnownDamages] = useState('');
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const normalized = cleanRegnr(regnr);
    setRegnr(normalized); setBusy(true); setError(null); setResult(null);
    try {
      const response = await fetch(`/api/vehicle-journey/rented-in-intake?regnr=${encodeURIComponent(normalized)}`, { cache: 'no-store' });
      const body = await response.json() as { data?: Preflight; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa kontrollbild');
      setPreflight(body.data ?? null);
    } catch (reason) {
      setPreflight(null); setError(reason instanceof Error ? reason.message : 'Kunde inte läsa kontrollbild');
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!preflight) return setError('Läs kontrollbilden först.');
    if (preflight.intake) return setError('INHYRD snabbintag finns redan för bilen.');
    if (preflight.legacy) return setError('Bilen är redan klassificerad som LEGACY_FLEET.');
    if (!preflight.station) return setError('Din aktiva medarbetarprofil saknar station.');
    if (!brand.trim() || !model.trim()) return setError('Märke och modell krävs.');
    if (!odometerKm || !Number.isInteger(Number(odometerKm)) || Number(odometerKm) < 0) return setError('Kilometerställning krävs.');
    if (!knownDamages.trim()) return setError('Kända skador måste anges uttryckligen. Skriv INGA KÄNDA om inga finns.');

    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/vehicle-journey/rented-in-intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regnr: preflight.regnr, brand, model, odometer_km: Number(odometerKm), known_damages: knownDamages }),
      });
      const body = await response.json() as { data?: Result; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'INHYRD snabbintag misslyckades');
      setResult(body.data ?? null);
      if (body.data) setPreflight((current) => current ? { ...current, intake: body.data as Result } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'INHYRD snabbintag misslyckades'); }
    finally { setBusy(false); }
  }

  return <section style={shell} aria-label="INHYRD snabbintag">
    <div>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>GARAGE / EXTERNT FORDON</div>
      <h2 style={{ margin: '2px 0 0', fontSize: 24 }}>INHYRD / SNABBINTAG</h2>
      <p style={{ margin: '4px 0 0', color: '#50565a', fontSize: 14 }}><strong>Objektet registreras från intagstidpunkten. Ingen historik bakåt eller operativ status skapas.</strong></p>
    </div>
    {error ? <div style={{ marginTop: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}
    <div style={{ ...row, marginTop: 10 }}>
      <label><span style={{ display: 'block', fontWeight: 800 }}>Registreringsnummer</span><input style={input} value={regnr} onChange={(e) => setRegnr(cleanRegnr(e.target.value))} placeholder="ABC123" /></label>
      <button type="button" style={button} disabled={busy || regnr.length !== 6} onClick={() => void load()}>Läs kontrollbild</button>
    </div>
    {preflight ? <div style={card}>
      <div><strong>{preflight.regnr}</strong></div>
      <div>Station: <strong>{preflight.station ?? 'SAKNAS I MEDARBETARPROFIL'}</strong> · sätts av systemet</div>
      <div>INHYRD: {preflight.intake ? 'Redan registrerad' : 'Ingen tidigare registrering'}</div>
      <div>LEGACY: {preflight.legacy ? 'Konflikt – redan egen LEGACY' : 'Ingen LEGACY-klassificering'}</div>
      <div>Aktuell Layer1: {preflight.currentPeriod ? `${preflight.currentPeriod.period_type} sedan ${new Date(preflight.currentPeriod.started_at).toLocaleString('sv-SE')}` : 'Ingen öppen period'}</div>
    </div> : null}
    {preflight && !preflight.intake && !preflight.legacy ? <div style={{ ...card, background: '#fff' }}>
      <div style={row}>
        <label><span style={{ display: 'block', fontWeight: 800 }}>Märke</span><input style={input} value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
        <label><span style={{ display: 'block', fontWeight: 800 }}>Modell</span><input style={input} value={model} onChange={(e) => setModel(e.target.value)} /></label>
        <label><span style={{ display: 'block', fontWeight: 800 }}>Km</span><input style={input} type="number" min="0" step="1" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} /></label>
        <label style={{ flex: '1 1 320px' }}><span style={{ display: 'block', fontWeight: 800 }}>Kända skador</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={knownDamages} onChange={(e) => setKnownDamages(e.target.value)} placeholder="Beskriv eller skriv INGA KÄNDA" /></label>
        <button type="button" style={primary} disabled={busy || !preflight.station} onClick={() => void submit()}>Registrera INHYRD</button>
      </div>
    </div> : null}
    {result ? <div style={{ ...card, background: '#f6fff7' }}>
      <strong>INHYRD registrerad</strong>
      <div>{result.regnr} · {result.brand} {result.model} · {result.odometer_km} km</div>
      <div>Station: {result.station}</div>
      <div>Registrerad: {new Date(result.registered_at).toLocaleString('sv-SE')} · {result.registered_by_email}</div>
      <div>Kända skador: {result.known_damages}</div>
      <div>historicalBackfill: false · ingen Layer1-status skapad</div>
    </div> : null}
  </section>;
}
