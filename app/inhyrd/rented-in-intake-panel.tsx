'use client';

import { useState } from 'react';
import ui from '@/components/inner-ui-contract.module.css';

type Preflight = {
  regnr: string;
  station: string | null;
  stationScope: 'SINGLE' | 'ALL' | null;
  allowedStations: string[];
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

function cleanRegnr(value: string) { return value.toUpperCase().replace(/\s+/g, '').slice(0, 6); }

export default function RentedInIntakePanel() {
  const [regnr, setRegnr] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [knownDamages, setKnownDamages] = useState('');
  const [intakeStation, setIntakeStation] = useState('');
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const normalized = cleanRegnr(regnr);
    setRegnr(normalized); setBusy(true); setError(null); setResult(null); setIntakeStation('');
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
    if (!preflight.stationScope) return setError('Din aktiva medarbetarprofil saknar stationsbehörighet.');
    if (preflight.stationScope === 'SINGLE' && !preflight.station) return setError('Din aktiva medarbetarprofil saknar station.');
    if (preflight.stationScope === 'ALL' && !intakeStation) return setError('Välj den station där bilen tas in.');
    if (!brand.trim() || !model.trim()) return setError('Märke och modell krävs.');
    if (!odometerKm || !Number.isInteger(Number(odometerKm)) || Number(odometerKm) < 0) return setError('Kilometerställning krävs.');
    if (!knownDamages.trim()) return setError('Kända skador måste anges uttryckligen. Skriv INGA KÄNDA om inga finns.');

    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/vehicle-journey/rented-in-intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regnr: preflight.regnr,
          brand,
          model,
          odometer_km: Number(odometerKm),
          known_damages: knownDamages,
          ...(preflight.stationScope === 'ALL' ? { intake_station: intakeStation } : {}),
        }),
      });
      const body = await response.json() as { data?: Result; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'INHYRD snabbintag misslyckades');
      setResult(body.data ?? null);
      if (body.data) setPreflight((current) => current ? { ...current, intake: body.data as Result } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'INHYRD snabbintag misslyckades'); }
    finally { setBusy(false); }
  }

  const stationReady = preflight?.stationScope === 'ALL' ? Boolean(intakeStation) : Boolean(preflight?.station);

  return (
    <section className={ui.panel} aria-label="INHYRD snabbintag">
      <div className={ui.panelHeader}>
        <span className={ui.eyebrow}>INHYRD / EXTERNT FORDON</span>
        <h2 className={ui.title}>INHYRD / SNABBINTAG</h2>
        <p className={ui.description}><strong>Objektet registreras från intagstidpunkten. Ingen historik bakåt eller operativ status skapas.</strong></p>
      </div>

      {error ? <div className={ui.statusError}>{error}</div> : null}

      <div className={ui.formRow}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Registreringsnummer</span>
          <input className={ui.input} value={regnr} onChange={(event) => setRegnr(cleanRegnr(event.target.value))} placeholder="ABC123" />
        </label>
        <button type="button" className={ui.button} disabled={busy || regnr.length !== 6} onClick={() => void load()}>Läs kontrollbild</button>
      </div>

      {preflight ? (
        <div className={ui.card}>
          <div><strong>{preflight.regnr}</strong></div>
          <div>Stationsbehörighet: <strong>{preflight.stationScope ?? 'SAKNAS I MEDARBETARPROFIL'}</strong></div>
          {preflight.stationScope === 'SINGLE' ? <div>Station: <strong>{preflight.station ?? 'SAKNAS'}</strong> · sätts av systemet</div> : null}
          {preflight.stationScope === 'ALL' ? <div>Station: <strong>väljs per intag från godkända huvudorter</strong> · valideras av servern</div> : null}
          <div>INHYRD: {preflight.intake ? 'Redan registrerad' : 'Ingen tidigare registrering'}</div>
          <div>LEGACY: {preflight.legacy ? 'Konflikt – redan egen LEGACY' : 'Ingen LEGACY-klassificering'}</div>
          <div>Aktuell Layer1: {preflight.currentPeriod ? `${preflight.currentPeriod.period_type} sedan ${new Date(preflight.currentPeriod.started_at).toLocaleString('sv-SE')}` : 'Ingen öppen period'}</div>
        </div>
      ) : null}

      {preflight && !preflight.intake && !preflight.legacy ? (
        <div className={`${ui.card} ${ui.cardForm}`}>
          <div className={ui.formRow}>
            {preflight.stationScope === 'ALL' ? (
              <label className={ui.field}>
                <span className={ui.fieldLabel}>Intagsstation</span>
                <select className={ui.select} value={intakeStation} onChange={(event) => setIntakeStation(event.target.value)}>
                  <option value="">Välj huvudort</option>
                  {preflight.allowedStations.map((station) => <option key={station} value={station}>{station}</option>)}
                </select>
              </label>
            ) : null}
            <label className={ui.field}><span className={ui.fieldLabel}>Märke</span><input className={ui.input} value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
            <label className={ui.field}><span className={ui.fieldLabel}>Modell</span><input className={ui.input} value={model} onChange={(event) => setModel(event.target.value)} /></label>
            <label className={ui.field}><span className={ui.fieldLabel}>Km</span><input className={ui.input} type="number" min="0" step="1" value={odometerKm} onChange={(event) => setOdometerKm(event.target.value)} /></label>
            <label className={`${ui.field} ${ui.fieldGrow}`}><span className={ui.fieldLabel}>Kända skador</span><input className={ui.input} value={knownDamages} onChange={(event) => setKnownDamages(event.target.value)} placeholder="Beskriv eller skriv INGA KÄNDA" /></label>
            <button type="button" className={ui.primaryButton} disabled={busy || !stationReady} onClick={() => void submit()}>Registrera INHYRD</button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className={`${ui.card} ${ui.statusSuccess}`}>
          <strong>INHYRD registrerad</strong>
          <div>{result.regnr} · {result.brand} {result.model} · {result.odometer_km} km</div>
          <div>Station: {result.station}</div>
          <div>Registrerad: {new Date(result.registered_at).toLocaleString('sv-SE')} · {result.registered_by_email}</div>
          <div>Kända skador: {result.known_damages}</div>
          <div>historicalBackfill: false · ingen Layer1-status skapad</div>
        </div>
      ) : null}
    </section>
  );
}
