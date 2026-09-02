'use client';

import { useEffect, useMemo, useState } from 'react';

type GarageItem = {
  garage_item_id: string;
  regnr: string | null;
  model: string;
  planned_station: string | null;
  supplier: string | null;
};

type AvvecklaCase = {
  avveckla_case_id: string;
  garage_item_id: string;
  regnr: string;
  reason: string;
  status: 'OPEN' | 'COMPLETED';
  started_at: string;
};

type AvvecklaPoint = {
  point_id: string;
  avveckla_case_id: string;
  point_kind: 'STANDARD' | 'OVRIGT';
  title: string;
  status: 'OPEN' | 'CLOSED';
  outcome_code: string | null;
  outcome_comment: string | null;
  completed_at: string | null;
  completed_by_email: string | null;
};

type Detail = { case: AvvecklaCase | null; points: AvvecklaPoint[] };
type UtMethod = 'EGEN_LEVERANS' | 'EXTERN_TRANSPORT' | 'AVSTALLNING';

const shell: React.CSSProperties = { width: '100%', margin: 0, padding: '12px 14px', border: '1px solid #d7d7d7', borderRadius: 8, background: '#fff', boxSizing: 'border-box' };
const input: React.CSSProperties = { padding: '7px 9px', border: '1px solid #cfcfcf', borderRadius: 6, fontSize: 13, minWidth: 180 };
const button: React.CSSProperties = { padding: '7px 10px', border: '1px solid #b8b8b8', borderRadius: 6, background: '#fff', cursor: 'pointer', fontWeight: 700 };
const primaryButton: React.CSSProperties = { ...button, background: '#111', color: '#fff', borderColor: '#111' };
const card: React.CSSProperties = { border: '1px solid #e1e1e1', borderRadius: 7, padding: '9px 10px', background: '#fff' };

function localNowInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export default function GarageAvvecklaPanel() {
  const [items, setItems] = useState<GarageItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail>({ case: null, points: [] });
  const [reason, setReason] = useState('');
  const [pointTitle, setPointTitle] = useState('');
  const [pointKind, setPointKind] = useState<'STANDARD' | 'OVRIGT'>('STANDARD');
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [utMethod, setUtMethod] = useState<UtMethod>('EGEN_LEVERANS');
  const [utOccurredAt, setUtOccurredAt] = useState(localNowInput);
  const [evidenceReference, setEvidenceReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActiveItems = async () => {
    const response = await fetch('/api/garage?direction=UT', { cache: 'no-store' });
    const body = await response.json() as { data?: GarageItem[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa AVVECKLA-bilar');
    return body.data ?? [];
  };

  useEffect(() => {
    let active = true;
    void fetch('/api/garage?direction=UT', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: GarageItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa AVVECKLA-bilar');
        if (!active) return;
        const next = body.data ?? [];
        setItems(next);
        setSelectedId((current) => current || next[0]?.garage_item_id || '');
      })
      .catch((reasonValue: unknown) => { if (active) setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte läsa AVVECKLA-bilar'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void fetch(`/api/garage/avveckla?garage_item_id=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: Detail; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa AVVECKLA-ärendet');
        if (!active) return;
        setError(null);
        setDetail(body.data ?? { case: null, points: [] });
      })
      .catch((reasonValue: unknown) => { if (active) setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte läsa AVVECKLA-ärendet'); });
    return () => { active = false; };
  }, [selectedId]);

  const loadDetail = async (garageItemId: string) => {
    if (!garageItemId) return;
    const response = await fetch(`/api/garage/avveckla?garage_item_id=${encodeURIComponent(garageItemId)}`, { cache: 'no-store' });
    const body = await response.json() as { data?: Detail; error?: string };
    if (!response.ok) return setError(body.error ?? 'Kunde inte läsa AVVECKLA-ärendet');
    setError(null);
    setDetail(body.data ?? { case: null, points: [] });
  };

  const selected = useMemo(() => items.find((item) => item.garage_item_id === selectedId) ?? null, [items, selectedId]);
  const openCount = detail.points.filter((point) => point.status === 'OPEN').length;
  const allClosed = detail.case !== null && openCount === 0;

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/garage/avveckla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'AVVECKLA-åtgärden misslyckades');
      await loadDetail(selectedId);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'AVVECKLA-åtgärden misslyckades');
    } finally {
      setBusy(false);
    }
  };

  const startCase = async () => {
    if (!selectedId || !reason.trim()) return setError('Ange orsak för att starta AVVECKLA.');
    await post({ action: 'START_CASE', garage_item_id: selectedId, reason });
    setReason('');
  };

  const addPoint = async () => {
    if (!detail.case || !pointTitle.trim()) return setError('Ange AVVECKLA-punkt.');
    await post({ action: 'ADD_POINT', avveckla_case_id: detail.case.avveckla_case_id, title: pointTitle, point_kind: pointKind });
    setPointTitle('');
    setPointKind('STANDARD');
  };

  const closePoint = async (point: AvvecklaPoint) => {
    const outcome = outcomes[point.point_id]?.trim();
    if (!outcome) return setError('Strukturerat utfall krävs innan punkten kan avslutas.');
    await post({ action: 'CLOSE_POINT', point_id: point.point_id, outcome_code: outcome, outcome_comment: comments[point.point_id] ?? '' });
  };

  const completeUt = async () => {
    if (!selectedId || !detail.case) return;
    if (!allClosed) return setError('Alla AVVECKLA-punkter måste vara KLAR / AVSLUTADE före UT.');
    if (!utOccurredAt || !evidenceReference.trim()) return setError('Verklig tidpunkt och evidensreferens krävs för verifierat UT.');

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/garage/avveckla/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garage_item_id: selectedId,
          method: utMethod,
          occurred_at: utOccurredAt,
          evidence_reference: evidenceReference,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Kunde inte verifiera UT');

      const nextItems = await loadActiveItems();
      setItems(nextItems);
      setDetail({ case: null, points: [] });
      setEvidenceReference('');
      setUtOccurredAt(localNowInput());
      setSelectedId(nextItems[0]?.garage_item_id ?? '');
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte verifiera UT');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={shell} aria-label="AVVECKLA arbetsprocess">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>GARAGE / AVVECKLA / ARBETSPROCESS</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 24 }}>AVVECKLA-punkter</h2>
        <p style={{ margin: '3px 0 0', color: '#50565a', fontSize: 14 }}>AVVECKLA startas manuellt med orsak. Alla öppna punkter måste avslutas innan en senare verifierad UT-händelse får genomföras.</p>
      </div>

      {error ? <div style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>AVVECKLA-bil</span><select style={input} value={selectedId} onChange={(event) => { const nextId = event.target.value; setSelectedId(nextId); if (!nextId) setDetail({ case: null, points: [] }); }}><option value="">Välj bil</option>{items.map((item) => <option key={item.garage_item_id} value={item.garage_item_id}>{item.regnr || 'Regnr saknas'} · {item.model} · {item.planned_station || '—'}</option>)}</select></label>
      </div>

      {!selected ? <div style={{ color: '#666', fontSize: 14 }}>Ingen AVVECKLA / UT-bil vald.</div> : !detail.case ? (
        <div style={card}>
          <strong>{selected.regnr || 'Regnr saknas'} · {selected.model}</strong>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ flex: '1 1 320px' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Orsak</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Varför AVVECKLA startas" /></label>
            <button type="button" style={primaryButton} disabled={busy} onClick={() => void startCase()}>Starta AVVECKLA</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={card}>
            <strong>{detail.case.regnr} · AVVECKLA pågår</strong>
            <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>Orsak: {detail.case.reason}</div>
            <div style={{ fontSize: 13, marginTop: 5 }}><strong>Gate:</strong> {allClosed ? 'Alla AVVECKLA-punkter är KLAR/AVSLUTADE.' : `${openCount} punkt(er) är fortfarande ÖPPEN.`}</div>
          </div>

          {detail.case.status === 'OPEN' ? <div style={card}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ flex: '1 1 300px' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Ny AVVECKLA-punkt</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={pointTitle} onChange={(event) => setPointTitle(event.target.value)} placeholder="Kontroll eller åtgärd" /></label>
              <label><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Typ</span><select style={input} value={pointKind} onChange={(event) => setPointKind(event.target.value as 'STANDARD' | 'OVRIGT')}><option value="STANDARD">Standard</option><option value="OVRIGT">Övrigt</option></select></label>
              <button type="button" style={button} disabled={busy} onClick={() => void addPoint()}>Lägg till punkt</button>
            </div>
          </div> : null}

          <div style={{ display: 'grid', gap: 6 }}>
            {detail.points.length === 0 ? <div style={{ color: '#666', fontSize: 14 }}>Inga AVVECKLA-punkter registrerade.</div> : detail.points.map((point) => (
              <div key={point.point_id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{point.title}</strong><span style={{ fontSize: 12, fontWeight: 900 }}>{point.status === 'OPEN' ? 'ÖPPEN' : 'KLAR / AVSLUTAD'}</span></div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{point.point_kind === 'OVRIGT' ? 'ÖVRIGT' : 'STANDARD'}</div>
                {point.status === 'CLOSED' ? <div style={{ marginTop: 6, fontSize: 13 }}>Utfall: <strong>{point.outcome_code}</strong>{point.outcome_comment ? ` · ${point.outcome_comment}` : ''}{point.completed_by_email ? ` · ${point.completed_by_email}` : ''}</div> : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
                    <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Strukturerat utfall</span><input style={input} value={outcomes[point.point_id] ?? ''} onChange={(event) => setOutcomes((current) => ({ ...current, [point.point_id]: event.target.value }))} placeholder="t.ex. KLAR" /></label>
                    <label style={{ flex: '1 1 260px' }}><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Kompletterande text, frivillig</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={comments[point.point_id] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [point.point_id]: event.target.value }))} /></label>
                    <button type="button" style={primaryButton} disabled={busy} onClick={() => void closePoint(point)}>Markera KLAR / AVSLUTAD</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {detail.case.status === 'OPEN' ? <div style={{ ...card, opacity: allClosed ? 1 : 0.62 }}>
            <strong>Verifiera verkligt UT</strong>
            <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>Terminalen är låst tills den centrala AVVECKLA-gaten är passerad. UT-vägen är den verkliga händelse som avslutar MABISYD:s ansvar för denna fordonsresa.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 8 }}>
              <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>UT-väg</span><select style={input} value={utMethod} onChange={(event) => setUtMethod(event.target.value as UtMethod)}><option value="EGEN_LEVERANS">Vi lämnar bilen · överlämning</option><option value="EXTERN_TRANSPORT">Extern transportör · faktisk hämtning</option><option value="AVSTALLNING">Avställning</option></select></label>
              <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Verklig tidpunkt</span><input type="datetime-local" style={input} value={utOccurredAt} onChange={(event) => setUtOccurredAt(event.target.value)} /></label>
              <label style={{ flex: '1 1 280px' }}><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Evidensreferens</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="t.ex. kvittens, mejl eller avställningsbevis" /></label>
              <button type="button" style={primaryButton} disabled={busy || !allClosed} onClick={() => void completeUt()}>Verifiera UT / AVSLUT</button>
            </div>
          </div> : null}
        </div>
      )}
    </section>
  );
}
