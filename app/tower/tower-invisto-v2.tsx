'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import styles from './tower-invisto-v2.module.css';
import drill from './tower-drilldown-v1.module.css';

type Health = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'EXTERNAL';
type PrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU' | 'OTHER' | 'UNKNOWN';

type FleetRow = {
  identityId: string;
  regnr: string | null;
  operationalPosition: 'VERIFIED' | 'MISSING';
  primaryState: PrimaryState | null;
  startedAt: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  sourceRecordId: string | null;
  activityType: string | null;
  activityStartedAt: string | null;
};

type ExternalRow = {
  regnr: string;
  primaryState: PrimaryState;
  startedAt: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  sourceRecordId: string | null;
};

type GarageRow = {
  garageItemId: string | null;
  regnr: string | null;
  model: string | null;
  plannedStation: string | null;
  confirmationStatus: string | null;
  transportStatus: string | null;
  sourceKind: string | null;
};

type SaluRow = {
  flagId: string | null;
  regnr: string | null;
  status: string | null;
  escalationStatus: string | null;
  ownerFunction: string | null;
  currentSaludatum: string | null;
  createdAt: string | null;
};

type ReadModel = {
  generatedAt: string;
  contractVersion: string;
  fleet: {
    active: number | null;
    health: Health;
    capturedPrimaryStateVehicles: number;
    positionedActive: number | null;
    missingOperationalPosition: number | null;
    primaryStates: Record<PrimaryState, number>;
    workshopCaptured: number;
    reconciliation: {
      outsideActivePrimaryStateVehicles: number;
      outsideActivePrimaryStates: Record<PrimaryState, number>;
      activeIdentityAliasIssues: number;
      ambiguousActiveLayer1Vehicles: number;
      duplicateOpenLayer1Vehicles: number;
    };
    drilldown: {
      active: FleetRow[];
      positioned: FleetRow[];
      missingOperationalPosition: FleetRow[];
      primaryStates: Record<PrimaryState, FleetRow[]>;
      externalLayer1: ExternalRow[];
    };
  };
  processes: {
    salu: { open: number; byStatus: Record<string, number>; byEscalation: Record<string, number>; drilldown: SaluRow[] };
    garage: { owned: number; withRegnr: number; withoutRegnr: number; byConfirmationStatus: Record<string, number>; byTransportStatus: Record<string, number>; drilldown: GarageRow[] };
    plannedPurchases: { remaining: number };
    wheelChange: { openProcessRows: number; canonicalCandidateCount: number | null; byStatus: Record<string, number> };
    avveckla: { count: number | null; health: Health };
  };
  attention: { health: Health; capturedDowntime: number; saluT10: number; saluPassed: number };
  sources: Record<string, { health: Health; reason: string }>;
};

type Focus = 'ACTIVE' | 'POSITIONED' | 'MISSING' | 'EXTERNAL' | 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU_PRIMARY' | 'OTHER' | 'UNKNOWN' | 'WORKSHOP' | 'SALU' | 'GARAGE' | 'PLANNED' | 'WHEEL' | 'AVVECKLA';
type AnyDrillRow = FleetRow | ExternalRow | GarageRow | SaluRow;

type FocusDetail = {
  title: string;
  value: number | null;
  text: string;
  health: Health;
  href?: string;
  details?: Array<[string, number]>;
  rows?: AnyDrillRow[];
  kind?: 'fleet' | 'external' | 'garage' | 'salu';
};

const sv = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('sv-SE');
const healthLabel = (health: Health) => health === 'VERIFIED' ? 'Verifierad' : health === 'PARTIAL' ? 'Delvis verifierad' : health === 'BLOCKED' ? 'Inväntar underlag' : 'Extern källa';
const timeLabel = (value: string) => new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const compactDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

async function loadReadModel(): Promise<ReadModel> {
  const response = await authenticatedApiFetch('/api/tower/read-model', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Tower kunde inte läsas');
  return payload.data as ReadModel;
}

export default function TowerInvistoV2() {
  const [data, setData] = useState<ReadModel | null>(null);
  const [focus, setFocus] = useState<Focus>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectFocus = (next: Focus) => {
    setFocus(next);
    setSearch('');
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try { setData(await loadReadModel()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Tower kunde inte läsas'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    void loadReadModel()
      .then((next) => { if (active) { setData(next); setError(null); } })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Tower kunde inte läsas'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const attentionTotal = data ? data.attention.capturedDowntime + data.attention.saluT10 + data.attention.saluPassed : 0;

  const focusDetail = useMemo<FocusDetail | null>(() => {
    if (!data) return null;
    const primaryHealth = data.sources.primaryOperationalState.health;
    const map: Record<Focus, FocusDetail> = {
      ACTIVE: {
        title: 'Aktiva bilar', value: data.fleet.active,
        text: 'Kanonisk ACTIVE-population. Operativ position redovisas endast när Layer 1 faktiskt matchar denna population.',
        health: data.fleet.health, rows: data.fleet.drilldown.active, kind: 'fleet',
        details: [['Verifierad operativ position', data.fleet.positionedActive ?? 0], ['Saknar verifierad operativ position', data.fleet.missingOperationalPosition ?? 0], ['Layer 1 utanför AKTIVA', data.fleet.reconciliation.outsideActivePrimaryStateVehicles]],
      },
      POSITIONED: { title: 'Verifierad operativ position', value: data.fleet.positionedActive, text: 'Canonical ACTIVE identities med exakt en verifierad open Layer 1-position.', health: primaryHealth, rows: data.fleet.drilldown.positioned, kind: 'fleet' },
      MISSING: { title: 'Saknar verifierad operativ position', value: data.fleet.missingOperationalPosition, text: 'Coverage gap inom canonical ACTIVE. Dessa objekt tilldelas ingen status.', health: primaryHealth, rows: data.fleet.drilldown.missingOperationalPosition, kind: 'fleet' },
      EXTERNAL: { title: 'Layer 1 utanför AKTIVA', value: data.fleet.reconciliation.outsideActivePrimaryStateVehicles, text: 'Reconciliation/integrity-population utanför canonical ACTIVE. Räknas aldrig in i AKTIVA.', health: primaryHealth, rows: data.fleet.drilldown.externalLayer1, kind: 'external' },
      AVAILABLE: { title: 'Lediga', value: data.fleet.primaryStates.AVAILABLE, text: 'Verifierad Layer 1-status AVAILABLE inom canonical ACTIVE.', health: primaryHealth, href: '/status', rows: data.fleet.drilldown.primaryStates.AVAILABLE, kind: 'fleet' },
      RENTAL: { title: 'Uthyrda', value: data.fleet.primaryStates.RENTAL, text: 'Endast verifierad canonical RENTAL-position. Ingen alternativ hyrbilslista infereras.', health: data.sources.rental.health, rows: data.fleet.drilldown.primaryStates.RENTAL, kind: 'fleet' },
      DOWNTIME: { title: 'Stillestånd', value: data.fleet.primaryStates.DOWNTIME, text: 'Verifierad primärstatus DOWNTIME inom canonical ACTIVE.', health: primaryHealth, href: '/status', rows: data.fleet.drilldown.primaryStates.DOWNTIME, kind: 'fleet' },
      PREPARATION: { title: 'Förberedelse', value: data.fleet.primaryStates.PREPARATION, text: 'Verifierad primärstatus PREPARATION inom canonical ACTIVE.', health: primaryHealth, rows: data.fleet.drilldown.primaryStates.PREPARATION, kind: 'fleet' },
      SALU_PRIMARY: { title: 'SALU · primärstatus', value: data.fleet.primaryStates.SALU, text: 'Layer 1 SALU inom canonical ACTIVE. Separat från öppna SALU-processer.', health: primaryHealth, rows: data.fleet.drilldown.primaryStates.SALU, kind: 'fleet' },
      OTHER: { title: 'Övrig status', value: data.fleet.primaryStates.OTHER, text: 'Verifierade Layer 1-perioder inom canonical ACTIVE som inte tillhör namngivna huvudstatusar.', health: primaryHealth, rows: data.fleet.drilldown.primaryStates.OTHER, kind: 'fleet' },
      UNKNOWN: { title: 'Okänd status', value: data.fleet.primaryStates.UNKNOWN, text: 'Endast explicit verifierad Layer 1-status UNKNOWN. Saknad operativ position räknas inte här.', health: primaryHealth, rows: data.fleet.drilldown.primaryStates.UNKNOWN, kind: 'fleet' },
      WORKSHOP: { title: 'Verkstad', value: data.fleet.workshopCaptured, text: 'WORKSHOP visas endast inom canonical ACTIVE DOWNTIME.', health: primaryHealth, href: '/vagnkort', rows: data.fleet.drilldown.primaryStates.DOWNTIME.filter((row) => row.activityType === 'WORKSHOP'), kind: 'fleet' },
      SALU: { title: 'SALU · process', value: data.processes.salu.open, text: 'Exakt samma öppna SALU-processpopulation som Tower summerar.', health: data.sources.salu.health, href: '/salu', details: Object.entries(data.processes.salu.byEscalation), rows: data.processes.salu.drilldown, kind: 'salu' },
      GARAGE: { title: 'Garaget', value: data.processes.garage.owned, text: 'Exakt samma inbound Garage-population som Tower summerar som ägd av Garaget.', health: data.sources.garage.health, href: '/garage', details: [['Med reg.nr', data.processes.garage.withRegnr], ['Utan reg.nr', data.processes.garage.withoutRegnr]], rows: data.processes.garage.drilldown, kind: 'garage' },
      PLANNED: { title: 'Planerade inköp', value: data.processes.plannedPurchases.remaining, text: 'BESTÄLLT som fortfarande återstår upstream före materialisering till Garaget.', health: data.sources.plannedPurchases.health, href: '/planning' },
      WHEEL: { title: 'Hjulskifte · öppna processer', value: data.processes.wheelChange.openProcessRows, text: 'Verifierade öppna processrader. Fleet-wide kandidatantal är fortsatt separat kontrakt.', health: data.sources.wheelChange.health, href: '/hjulskifte' },
      AVVECKLA: { title: 'Avveckla', value: data.processes.avveckla.count, text: 'Drilldown är unavailable tills separat canonical AVVECKLA read-contract finns.', health: data.sources.avveckla.health },
    };
    return map[focus];
  }, [data, focus]);

  const filteredRows = useMemo(() => {
    const rows = focusDetail?.rows ?? [];
    const query = search.trim().toLocaleLowerCase('sv-SE');
    if (!query) return rows;
    return rows.filter((row) => JSON.stringify(row).toLocaleLowerCase('sv-SE').includes(query));
  }, [focusDetail, search]);

  return (
    <main className={styles.wrap}>
      <section className={styles.commandDeck}>
        <div className={styles.commandCopy}>
          <span className={styles.eyebrow}>INVISTO / OPERATIONAL INTELLIGENCE</span>
          <h2>Hur ser min verksamhet ut just nu?</h2>
          <p>Position. Rörelse. Friktion. Ett operativt seende byggt för att förstå helheten före detaljerna.</p>
        </div>
        <div className={styles.commandMeta}>
          <span>{data ? `Uppdaterad ${timeLabel(data.generatedAt)}` : 'Läser verksamheten'}</span>
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Läser…' : 'Uppdatera'}</button>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.position} aria-label="Position just nu">
        <div className={styles.positionLead}>
          <span className={styles.eyebrow}>POSITION</span>
          <button className={styles.activePopulation} onClick={() => selectFocus('ACTIVE')} type="button">
            <span>AKTIVA BILAR</span>
            <strong>{sv(data?.fleet.active)}</strong>
            <small>{data ? healthLabel(data.fleet.health) : 'Läser'}</small>
          </button>
          <div className={styles.coverage}>
            <button type="button" className={drill.coverageButton} onClick={() => selectFocus('POSITIONED')}><span>Verifierad operativ position</span><strong>{sv(data?.fleet.positionedActive)}</strong></button>
            <button type="button" className={drill.coverageButton} onClick={() => selectFocus('MISSING')}><span>Saknar verifierad operativ position</span><strong>{sv(data?.fleet.missingOperationalPosition)}</strong></button>
            <button type="button" className={drill.coverageWide} onClick={() => selectFocus('EXTERNAL')}><small>{sv(data?.fleet.reconciliation.outsideActivePrimaryStateVehicles)} Layer 1 utanför AKTIVA</small></button>
          </div>
        </div>

        <div className={styles.statusCanvas}>
          <StatusCell label="Lediga" value={data?.fleet.primaryStates.AVAILABLE} selected={focus === 'AVAILABLE'} onClick={() => selectFocus('AVAILABLE')} />
          <StatusCell label="Uthyrda" value={data?.fleet.primaryStates.RENTAL} selected={focus === 'RENTAL'} onClick={() => selectFocus('RENTAL')} />
          <StatusCell label="Stillestånd" value={data?.fleet.primaryStates.DOWNTIME} selected={focus === 'DOWNTIME'} onClick={() => selectFocus('DOWNTIME')} emphasis />
          <StatusCell label="Förberedelse" value={data?.fleet.primaryStates.PREPARATION} selected={focus === 'PREPARATION'} onClick={() => selectFocus('PREPARATION')} />
          <StatusCell label="SALU · status" value={data?.fleet.primaryStates.SALU} selected={focus === 'SALU_PRIMARY'} onClick={() => selectFocus('SALU_PRIMARY')} />
          <StatusCell label="Övrig" value={data?.fleet.primaryStates.OTHER} selected={focus === 'OTHER'} onClick={() => selectFocus('OTHER')} />
          <StatusCell label="Okänd" value={data?.fleet.primaryStates.UNKNOWN} selected={focus === 'UNKNOWN'} onClick={() => selectFocus('UNKNOWN')} sublabel="endast explicit Layer 1" />
          <StatusCell label="Verkstad" value={data?.fleet.workshopCaptured} selected={focus === 'WORKSHOP'} onClick={() => selectFocus('WORKSHOP')} sublabel="inom aktivt stillestånd" />
        </div>
      </section>

      <section className={styles.movement}>
        <div className={styles.sectionHead}>
          <div><span className={styles.eyebrow}>RÖRELSE</span><h3>Det som rör sig genom verksamheten</h3></div>
          <p>Processer och inflöde. De överlappar beståndet och ska inte summeras med AKTIVA.</p>
        </div>
        <div className={styles.movementRail}>
          <ProcessNode label="Planerade inköp" value={data?.processes.plannedPurchases.remaining} onClick={() => selectFocus('PLANNED')} selected={focus === 'PLANNED'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="Garaget" value={data?.processes.garage.owned} onClick={() => selectFocus('GARAGE')} selected={focus === 'GARAGE'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="Aktiv drift" value={data?.fleet.active} onClick={() => selectFocus('ACTIVE')} selected={focus === 'ACTIVE'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="SALU · process" value={data?.processes.salu.open} onClick={() => selectFocus('SALU')} selected={focus === 'SALU'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="Avveckla" value={data?.processes.avveckla.count} onClick={() => selectFocus('AVVECKLA')} selected={focus === 'AVVECKLA'} />
        </div>
        <button type="button" className={styles.wheelNode} onClick={() => selectFocus('WHEEL')}>
          <span>HJULSKIFTE</span><strong>{sv(data?.processes.wheelChange.openProcessRows)}</strong><small>öppna processrader</small>
        </button>
      </section>

      <section className={styles.friction}>
        <div className={styles.frictionLead}>
          <span className={styles.eyebrow}>FRIKTION</span>
          <strong>{sv(attentionTotal)}</strong>
          <p>fångade signaler som kräver uppmärksamhet</p>
        </div>
        <div className={styles.frictionSignals}>
          <button type="button" onClick={() => selectFocus('DOWNTIME')}><span>Stillestånd</span><strong>{sv(data?.attention.capturedDowntime)}</strong></button>
          <button type="button" onClick={() => selectFocus('SALU')}><span>SALU T-10</span><strong>{sv(data?.attention.saluT10)}</strong></button>
          <button type="button" onClick={() => selectFocus('SALU')}><span>SALU passerad</span><strong>{sv(data?.attention.saluPassed)}</strong></button>
        </div>
      </section>

      <section className={styles.intelligence} aria-live="polite">
        <div>
          <span className={styles.eyebrow}>FÖRSTÅ</span>
          <h3>{focusDetail?.title ?? 'Verksamheten'}</h3>
          <strong className={styles.detailValue}>{sv(focusDetail?.value)}</strong>
          <p>{focusDetail?.text}</p>
          {focusDetail?.details?.length ? <div className={styles.detailFacts}>{focusDetail.details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{sv(value)}</strong></div>)}</div> : null}
          {focusDetail?.rows ? <DrilldownTable kind={focusDetail.kind} rows={filteredRows} total={focusDetail.rows.length} search={search} onSearch={setSearch} /> : null}
        </div>
        <aside>
          <span className={styles.eyebrow}>EVIDENS</span>
          <strong>{focusDetail ? healthLabel(focusDetail.health) : '—'}</strong>
          <p>Objektlistan kommer från samma population som siffran. Tower skriver inte tillbaka till ägarprocessen.</p>
          {focusDetail?.href ? <Link href={focusDetail.href}>Gå till ansvarig process →</Link> : null}
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>INVISTO / INCHECKAD · TOWER</span>
        <div><Link href="/tower/history">Historik</Link><Link href="/tower/metrics">Periodmått</Link></div>
      </footer>
    </main>
  );
}

function DrilldownTable({ kind, rows, total, search, onSearch }: { kind?: FocusDetail['kind']; rows: AnyDrillRow[]; total: number; search: string; onSearch: (value: string) => void }) {
  return <div className={drill.panel}>
    <div className={drill.toolbar}>
      <span>{rows.length === total ? `${total} objekt` : `${rows.length} av ${total} objekt`}</span>
      {total > 8 ? <input aria-label="Sök i drilldown" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Sök reg.nr / id / källa" /> : null}
    </div>
    <div className={drill.tableWrap}>
      {kind === 'fleet' ? <FleetTable rows={rows as FleetRow[]} /> : null}
      {kind === 'external' ? <ExternalTable rows={rows as ExternalRow[]} /> : null}
      {kind === 'garage' ? <GarageTable rows={rows as GarageRow[]} /> : null}
      {kind === 'salu' ? <SaluTable rows={rows as SaluRow[]} /> : null}
    </div>
  </div>;
}

function FleetTable({ rows }: { rows: FleetRow[] }) {
  if (!rows.length) return <div className={drill.empty}>Ingen canonical population i denna vy.</div>;
  return <table className={drill.table}><thead><tr><th>REG.NR</th><th>IDENTITY</th><th>POSITION</th><th>LAYER 1</th><th>START</th><th>ORSAK</th><th>KÄLLA</th><th>AKTIVITET</th></tr></thead><tbody>{rows.map((row) => <tr key={row.identityId}><td>{row.regnr ?? '—'}</td><td className={drill.mono}>{row.identityId}</td><td>{row.operationalPosition === 'MISSING' ? 'SAKNAR VERIFIERAD OPERATIV POSITION' : 'VERIFIERAD'}</td><td>{row.primaryState ?? '—'}</td><td>{compactDate(row.startedAt)}</td><td>{row.reasonText ?? row.reasonCode ?? '—'}</td><td>{[row.sourceSystem, row.sourceEntity].filter(Boolean).join(' / ') || '—'}</td><td>{row.activityType ?? '—'}</td></tr>)}</tbody></table>;
}

function ExternalTable({ rows }: { rows: ExternalRow[] }) {
  if (!rows.length) return <div className={drill.empty}>Ingen Layer 1-population utanför canonical ACTIVE.</div>;
  return <table className={drill.table}><thead><tr><th>REG.NR</th><th>STATE</th><th>START</th><th>ORSAK</th><th>KÄLLA</th><th>INTEGRITY</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.regnr}-${row.sourceRecordId ?? row.startedAt ?? ''}`}><td>{row.regnr}</td><td>{row.primaryState}</td><td>{compactDate(row.startedAt)}</td><td>{row.reasonText ?? row.reasonCode ?? '—'}</td><td>{[row.sourceSystem, row.sourceEntity].filter(Boolean).join(' / ') || '—'}</td><td>UTANFÖR CANONICAL ACTIVE</td></tr>)}</tbody></table>;
}

function GarageTable({ rows }: { rows: GarageRow[] }) {
  if (!rows.length) return <div className={drill.empty}>Ingen Garage-population i denna vy.</div>;
  return <table className={drill.table}><thead><tr><th>REG.NR</th><th>GARAGE ITEM</th><th>MODELL</th><th>STATION</th><th>BEKRÄFTELSE</th><th>TRANSPORT</th><th>KÄLLA</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.garageItemId ?? `${row.regnr}-${index}`}><td>{row.regnr ?? '—'}</td><td className={drill.mono}>{row.garageItemId ?? '—'}</td><td>{row.model ?? '—'}</td><td>{row.plannedStation ?? '—'}</td><td>{row.confirmationStatus ?? '—'}</td><td>{row.transportStatus ?? '—'}</td><td>{row.sourceKind ?? '—'}</td></tr>)}</tbody></table>;
}

function SaluTable({ rows }: { rows: SaluRow[] }) {
  if (!rows.length) return <div className={drill.empty}>Ingen öppen SALU-processpopulation.</div>;
  return <table className={drill.table}><thead><tr><th>REG.NR</th><th>FLAG</th><th>STATUS</th><th>ESCALATION</th><th>OWNER</th><th>SALUDATUM</th><th>SKAPAD</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.flagId ?? `${row.regnr}-${index}`}><td>{row.regnr ?? '—'}</td><td className={drill.mono}>{row.flagId ?? '—'}</td><td>{row.status ?? '—'}</td><td>{row.escalationStatus ?? '—'}</td><td>{row.ownerFunction ?? '—'}</td><td>{row.currentSaludatum ?? '—'}</td><td>{compactDate(row.createdAt)}</td></tr>)}</tbody></table>;
}

function StatusCell({ label, value, selected, onClick, sublabel, emphasis }: { label: string; value?: number | null; selected: boolean; onClick: () => void; sublabel?: string; emphasis?: boolean }) {
  return <button type="button" onClick={onClick} className={`${styles.statusCell} ${selected ? styles.selected : ''} ${emphasis ? styles.emphasis : ''}`}><span>{label}</span><strong>{sv(value)}</strong>{sublabel ? <small>{sublabel}</small> : null}</button>;
}

function ProcessNode({ label, value, onClick, selected }: { label: string; value?: number | null; onClick: () => void; selected: boolean }) {
  return <button type="button" onClick={onClick} className={`${styles.processNode} ${selected ? styles.selectedDark : ''}`}><span>{label}</span><strong>{sv(value)}</strong></button>;
}
