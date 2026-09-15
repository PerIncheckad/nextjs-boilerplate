'use client';

import { useEffect, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';

type FinalRow = { sista_incheckning_id: string; garage_item_id: string; regnr: string; decision_version: number; final_checkin_completed_at: string };
type BuhsRow = { id: string; damage_date: string | null; damage_type_raw: string | null; note_customer: string | null; note_internal: string | null; vehiclenote: string | null };
type Step4 = {
  final: FinalRow | null;
  buhsSource: BuhsRow[];
  currentBuhsIds: string[];
  verification: null | { buhs_verification_id: string; revision_no: number; source_row_count: number; source_set_hash: string; total_result: 'PASS'; verified_business_function: 'VD' | 'BILKONTROLLCHEF' };
  handoff: null | { salu_v2_handoff_id: string; avveckla_case_id: string };
  archived: null | { terminal_completed_at: string; canonical_exit_fact_id: string; membership_state: 'INACTIVE' };
};

const panel: React.CSSProperties = { border: '1px solid #d8d8d8', borderRadius: 8, padding: '12px 14px', background: '#fff', display: 'grid', gap: 10 };
const card: React.CSSProperties = { border: '1px solid #e4e4e4', borderRadius: 7, padding: 10, display: 'grid', gap: 8 };
const button: React.CSSProperties = { border: '1px solid #111', background: '#111', color: '#fff', borderRadius: 6, padding: '7px 10px', fontWeight: 800, cursor: 'pointer' };

export default function GarageSaluStep4Panel() {
  const [finals, setFinals] = useState<FinalRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState<Step4 | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void authenticatedApiFetch('/api/garage/sista-incheckning', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte läsa SISTA INCHECKNING');
        if (!active) return;
        const rows = (body.data ?? []) as FinalRow[];
        setFinals(rows);
        setSelectedId(rows[0]?.garage_item_id ?? '');
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunde inte läsa SISTA INCHECKNING'); });
    return () => { active = false; };
  }, []);

  const load = async (garageItemId: string) => {
    if (!garageItemId) { setData(null); return; }
    const response = await authenticatedApiFetch(`/api/garage/salu-step4?garage_item_id=${encodeURIComponent(garageItemId)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error ?? 'Kunde inte läsa Step 4');
    const next = body.data as Step4;
    setData(next);
    setChecked(Object.fromEntries((next.currentBuhsIds ?? []).map((id) => [id, true])));
  };

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void load(selectedId).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunde inte läsa Step 4'); });
    return () => { active = false; };
  }, [selectedId]);

  const verifyBuhs = async () => {
    if (!data?.final) return;
    const ids = data.currentBuhsIds ?? [];
    if (ids.some((id) => checked[id] !== true)) return setError('Varje aktuell BUHS-rad måste uttryckligen vara PASS.');
    setBusy(true); setError(null);
    try {
      const response = await authenticatedApiFetch('/api/garage/salu-step4', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VERIFY_BUHS', sista_incheckning_id: data.final.sista_incheckning_id, damage_ids: ids, idempotency_key: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'BUHS-verifiering misslyckades');
      await load(data.final.garage_item_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'BUHS-verifiering misslyckades'); }
    finally { setBusy(false); }
  };

  const startAvveckla = async () => {
    if (!data?.final || !data.verification) return;
    setBusy(true); setError(null);
    try {
      const response = await authenticatedApiFetch('/api/garage/salu-step4', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_AVVECKLA', sista_incheckning_id: data.final.sista_incheckning_id, buhs_verification_id: data.verification.buhs_verification_id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'AVVECKLA-handoff misslyckades');
      await load(data.final.garage_item_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AVVECKLA-handoff misslyckades'); }
    finally { setBusy(false); }
  };

  if (!finals.length) return null;

  return (
    <section style={panel} aria-label="SALU V2 Step 4">
      <div><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em' }}>SALU V2 / STEP 4</div><h3 style={{ margin: '2px 0' }}>BUHS → AVVECKLA</h3><p style={{ margin: 0, fontSize: 13, color: '#555' }}>Explicit BUHS PASS på exakt SISTA INCHECKNING. SALU_PLANERING förblir riktningslös.</p></div>
      <label style={{ fontSize: 13, fontWeight: 800 }}>SISTA INCHECKNING <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ marginLeft: 8, padding: 6 }}>
        {finals.map((row) => <option key={row.sista_incheckning_id} value={row.garage_item_id}>{row.regnr} · V{row.decision_version}</option>)}
      </select></label>
      {data?.final ? <div style={card}>
        <div><strong>{data.final.regnr}</strong> · Step 3 final <code>{data.final.sista_incheckning_id}</code></div>
        <div style={{ fontSize: 13 }}><strong>BUHS source rows:</strong> {data.buhsSource.length}</div>
        {data.buhsSource.length ? data.buhsSource.map((row) => <label key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <input type="checkbox" checked={checked[row.id] === true} disabled={Boolean(data.verification || data.handoff)} onChange={(e) => setChecked((current) => ({ ...current, [row.id]: e.target.checked }))} />
          <span><strong>PASS</strong> · <code>{row.id}</code> · {row.damage_date || 'datum saknas'} · {[row.damage_type_raw,row.note_customer,row.note_internal,row.vehiclenote].filter(Boolean).join(' · ') || 'BUHS-rad'}</span>
        </label>) : <div style={{ fontSize: 13 }}><strong>0 BUHS-rader.</strong> Ett explicit verifierat 0-resultat krävs.</div>}
        {!data.verification ? <button type="button" style={button} disabled={busy} onClick={() => void verifyBuhs()}>VERIFIERA BUHS · ALLA PASS</button> : <div style={{ fontSize: 13 }}><strong>BUHS PASS</strong> · revision {data.verification.revision_no} · {data.verification.verified_business_function}</div>}
        {data.verification && !data.handoff ? <button type="button" style={button} disabled={busy} onClick={() => void startAvveckla()}>STARTA EXAKT AVVECKLA-HANDOFF</button> : null}
        {data.handoff ? <div style={{ fontSize: 13 }}><strong>AVVECKLA HANDOFF VERIFIERAD</strong> · <code>{data.handoff.avveckla_case_id}</code></div> : null}
        {data.archived ? <div style={{ fontSize: 13 }}><strong>AVVECKLAD / ARKIV</strong> · canonical EXIT <code>{data.archived.canonical_exit_fact_id}</code></div> : null}
      </div> : null}
      {error ? <div style={{ color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}
    </section>
  );
}
