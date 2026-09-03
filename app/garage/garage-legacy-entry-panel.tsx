'use client';

import { useState } from 'react';

type CurrentState = 'AVAILABLE' | 'PREPARATION' | 'DOWNTIME';
type Preflight = {
  regnr: string;
  vehicle: { regnr: string; brand: string | null; model: string | null } | null;
  currentPeriod: { period_id: string; period_type: string; started_at: string } | null;
  legacyEntry: { entry_id: string; object_type: string; current_state: string; verified_at: string; verified_by_email: string; evidence_reference: string } | null;
  vehicleCatalogIsOwnershipProof: false;
  historicalBackfill: false;
};

type CreateResult = {
  entry: {
    entry_id: string;
    regnr: string;
    object_type: 'LEGACY_FLEET';
    current_state: CurrentState;
    verified_at: string;
    verified_by_email: string;
    evidence_reference: string;
    historical_backfill: false;
  };
  period: { period_id: string; period_type: string; started_at: string };
};

const shell: React.CSSProperties = { width: '100%', margin: 0, padding: '14px', border: '1px solid #d7d7d7', borderRadius: 8, background: '#fff', boxSizing: 'border-box' };
const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' };
const input: React.CSSProperties = { padding: '8px 9px', border: '1px solid #cfcfcf', borderRadius: 6, fontSize: 13, minWidth: 180 };
const button: React.CSSProperties = { padding: '8px 11px', border: '1px solid #b8b8b8', borderRadius: 6, background: '#fff', cursor: 'pointer', fontWeight: 800 };
const primary: React.CSSProperties = { ...button, background: '#111', color: '#fff', borderColor: '#111' };
const card: React.CSSProperties = { marginTop: 10, padding: 10, border: '1px solid #e3e3e3', borderRadius: 7, background: '#fafafa', fontSize: 13 };
const reasonOptions = ['DAMAGE', 'WORKSHOP', 'SERVICE', 'WAITING_PARTS', 'MISSING_EQUIPMENT', 'TRANSPORT', 'ADMINISTRATION', 'OTHER'];

function cleanRegnr(value: string) {
  return value.toUpperCase().replace(/\s+/g, '').slice(0, 6);
}

export default function GarageLegacyEntryPanel() {
  const [regnr, setRegnr] = useState('');
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [currentState, setCurrentState] = useState<CurrentState>('AVAILABLE');
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [confirmedOwned, setConfirmedOwned] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const normalized = cleanRegnr(regnr);
    setRegnr(normalized);
    setBusy(true);
    setError(null);
    setResult(null);
    setConfirmedOwned(false);
    try {
      const response = await fetch(`/api/vehicle-journey/legacy-entry?reg=${encodeURIComponent(normalized)}`, { cache: 'no-store' });
      const body = await response.json() as { data?: Preflight; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa kontrollbild');
      setPreflight(body.data ?? null);
    } catch (reason) {
      setPreflight(null);
      setError(reason instanceof Error ? reason.message : 'Kunde inte läsa kontrollbild');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!preflight) return setError('Läs kontrollbilden först.');
    if (preflight.currentPeriod) return setError('Bilen har redan aktuell Layer 1-sanning och får inte LEGACY-etableras.');
    if (preflight.legacyEntry) return setError('LEGACY-entry finns redan för bilen.');
    if (!confirmedOwned) return setError('Verifiera uttryckligen att detta är en befintlig egen flottabil.');
    if (!evidenceReference.trim()) return setError('Evidensreferens krävs.');
    if (currentState === 'DOWNTIME' && !reasonCode) return setError('DOWNTIME kräver orsak.');
    if (currentState === 'DOWNTIME' && reasonCode === 'OTHER' && !reasonText.trim()) return setError('Övrig DOWNTIME kräver kommentar.');

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vehicle-journey/legacy-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regnr: preflight.regnr,
          current_state: currentState,
          reason_code: currentState === 'DOWNTIME' ? reasonCode : null,
          reason_text: currentState === 'DOWNTIME' ? reasonText : null,
          evidence_reference: evidenceReference,
        }),
      });
      const body = await response.json() as { data?: CreateResult; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'LEGACY-verifiering misslyckades');
      setResult(body.data ?? null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'LEGACY-verifiering misslyckades');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={shell} aria-label="Befintlig egen bil LEGACY">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>GARAGE / CURRENT-STATE ENTRY</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 24 }}>BEFINTLIG EGEN BIL / LEGACY</h2>
        <p style={{ margin: '4px 0 0', color: '#50565a', fontSize: 14 }}><strong>Aktuell sanning etableras från verifieringstidpunkten. Ingen historik bakåt skapas.</strong></p>
      </div>

      {error ? <div style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      <div style={row}>
        <label><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Registreringsnummer</span><input style={input} value={regnr} onChange={(event) => setRegnr(cleanRegnr(event.target.value))} placeholder="ABC123" /></label>
        <button type="button" style={button} disabled={busy || regnr.length !== 6} onClick={() => void load()}>Läs kontrollbild</button>
      </div>

      {preflight ? <div style={card}>
        <div><strong>{preflight.regnr}</strong> · {preflight.vehicle ? [preflight.vehicle.brand, preflight.vehicle.model].filter(Boolean).join(' ') || 'Fordonsrad finns' : 'Ingen match i vehicle-katalogen'}</div>
        <div style={{ marginTop: 4, color: '#666' }}>Vehicle-katalogen är endast kontrollbild och är <strong>inte</strong> bevis på egen flotta.</div>
        <div style={{ marginTop: 4 }}><strong>Aktuell Layer 1:</strong> {preflight.currentPeriod ? `${preflight.currentPeriod.period_type} sedan ${new Date(preflight.currentPeriod.started_at).toLocaleString('sv-SE')}` : 'Ingen öppen period'}</div>
        <div style={{ marginTop: 4 }}><strong>LEGACY:</strong> {preflight.legacyEntry ? `Redan verifierad ${new Date(preflight.legacyEntry.verified_at).toLocaleString('sv-SE')}` : 'Ingen tidigare LEGACY-entry'}</div>
      </div> : null}

      {preflight && !preflight.currentPeriod && !preflight.legacyEntry ? <div style={{ ...card, background: '#fff' }}>
        <label style={{ display: 'block', marginBottom: 10 }}><input type="checkbox" checked={confirmedOwned} onChange={(event) => setConfirmedOwned(event.target.checked)} /> <strong>Jag verifierar att detta är en befintlig egen flottabil.</strong></label>
        <div style={row}>
          <label><span style={{ display: 'block', fontWeight: 800, marginBottom: 2 }}>Aktuell status</span><select style={input} value={currentState} onChange={(event) => { setCurrentState(event.target.value as CurrentState); setReasonCode(''); setReasonText(''); }}><option value="AVAILABLE">AVAILABLE</option><option value="PREPARATION">PREPARATION</option><option value="DOWNTIME">DOWNTIME</option></select></label>
          {currentState === 'DOWNTIME' ? <label><span style={{ display: 'block', fontWeight: 800, marginBottom: 2 }}>Orsak</span><select style={input} value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="">Välj orsak</option>{reasonOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
          {currentState === 'DOWNTIME' ? <label style={{ flex: '1 1 260px' }}><span style={{ display: 'block', fontWeight: 800, marginBottom: 2 }}>Kommentar</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={reasonText} onChange={(event) => setReasonText(event.target.value)} placeholder="Krävs för OTHER" /></label> : null}
          <label style={{ flex: '1 1 300px' }}><span style={{ display: 'block', fontWeight: 800, marginBottom: 2 }}>Evidensreferens</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Kontroll / underlag som verifierar aktuell sanning" /></label>
          <button type="button" style={primary} disabled={busy} onClick={() => void submit()}>Verifiera LEGACY current state</button>
        </div>
      </div> : null}

      {result ? <div style={{ ...card, background: '#f6fff7' }}>
        <strong>LEGACY_FLEET etablerad</strong>
        <div>Verifierad: {new Date(result.entry.verified_at).toLocaleString('sv-SE')} · {result.entry.verified_by_email}</div>
        <div>State: {result.entry.current_state} · Layer 1-period: {result.period.period_id}</div>
        <div>Evidens: {result.entry.evidence_reference}</div>
        <div>historicalBackfill: false</div>
      </div> : null}
    </section>
  );
}
