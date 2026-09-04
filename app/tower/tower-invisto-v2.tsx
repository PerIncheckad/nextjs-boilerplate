'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './tower-invisto-v2.module.css';

type Health = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'EXTERNAL';
type PrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU' | 'OTHER' | 'UNKNOWN';

type ReadModel = {
  generatedAt: string;
  contractVersion: string;
  fleet: {
    active: number | null;
    health: Health;
    capturedPrimaryStateVehicles: number;
    primaryStates: Record<PrimaryState, number>;
    workshopCaptured: number;
  };
  processes: {
    salu: { open: number; byStatus: Record<string, number>; byEscalation: Record<string, number> };
    garage: { owned: number; withRegnr: number; withoutRegnr: number; byConfirmationStatus: Record<string, number>; byTransportStatus: Record<string, number> };
    plannedPurchases: { remaining: number };
    wheelChange: { openProcessRows: number; canonicalCandidateCount: number | null; byStatus: Record<string, number> };
    avveckla: { count: number | null; health: Health };
  };
  attention: { health: Health; capturedDowntime: number; saluT10: number; saluPassed: number };
  sources: Record<string, { health: Health; reason: string }>;
};

type Focus = 'ACTIVE' | 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU_PRIMARY' | 'OTHER' | 'UNKNOWN' | 'WORKSHOP' | 'SALU' | 'GARAGE' | 'PLANNED' | 'WHEEL' | 'AVVECKLA';

const sv = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('sv-SE');
const healthLabel = (health: Health) => health === 'VERIFIED' ? 'Verifierad' : health === 'PARTIAL' ? 'Delvis verifierad' : health === 'BLOCKED' ? 'Inväntar underlag' : 'Extern källa';
const timeLabel = (value: string) => new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

async function loadReadModel(): Promise<ReadModel> {
  const response = await fetch('/api/tower/read-model', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Tower kunde inte läsas');
  return payload.data as ReadModel;
}

export default function TowerInvistoV2() {
  const [data, setData] = useState<ReadModel | null>(null);
  const [focus, setFocus] = useState<Focus>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const focusDetail = useMemo(() => {
    if (!data) return null;
    const primaryHealth = data.sources.primaryOperationalState.health;
    const map: Record<Focus, { title: string; value: number | null; text: string; health: Health; href?: string; details?: Array<[string, number]> }> = {
      ACTIVE: { title: 'Aktiva bilar', value: data.fleet.active, text: 'Hela den operativa flottan som fortfarande befinner sig i verksamheten.', health: data.fleet.health },
      AVAILABLE: { title: 'Lediga', value: data.fleet.primaryStates.AVAILABLE, text: 'Verifierad Layer 1-status AVAILABLE inom nuvarande täckning.', health: primaryHealth, href: '/status' },
      RENTAL: { title: 'Uthyrda', value: data.fleet.primaryStates.RENTAL, text: 'Visas endast från verifierad rental-källa. Ingen annan signal får skapa UTHYRD.', health: data.sources.rental.health },
      DOWNTIME: { title: 'Stillestånd', value: data.fleet.primaryStates.DOWNTIME, text: 'Verifierad primärstatus DOWNTIME inom nuvarande datatäckning.', health: primaryHealth, href: '/status' },
      PREPARATION: { title: 'Förberedelse', value: data.fleet.primaryStates.PREPARATION, text: 'Verifierad primärstatus PREPARATION inom nuvarande datatäckning.', health: primaryHealth },
      SALU_PRIMARY: { title: 'SALU · primärstatus', value: data.fleet.primaryStates.SALU, text: 'Layer 1 SALU. Detta är en primär fordonsstatus och är separat från den öppna SALU-processen.', health: primaryHealth },
      OTHER: { title: 'Övrig status', value: data.fleet.primaryStates.OTHER, text: 'Verifierade Layer 1-perioder som inte tillhör de namngivna huvudstatusarna.', health: primaryHealth },
      UNKNOWN: { title: 'Okänd status', value: data.fleet.primaryStates.UNKNOWN, text: 'Aktivt medlemskap med saknad aktuell verifierad Layer 1-status när AKTIVA-baseline finns.', health: primaryHealth },
      WORKSHOP: { title: 'Verkstad', value: data.fleet.workshopCaptured, text: 'WORKSHOP är aktivitet inom stillestånd, aldrig en konkurrerande primärstatus.', health: primaryHealth, href: '/vagnkort' },
      SALU: { title: 'SALU · process', value: data.processes.salu.open, text: 'Öppna SALU-processer. Processen kan överlappa andra primärstatusar.', health: data.sources.salu.health, href: '/planning', details: Object.entries(data.processes.salu.byEscalation) },
      GARAGE: { title: 'Garaget', value: data.processes.garage.owned, text: 'Inbound-objekt som fortfarande ägs av Garaget och inte är avslutade eller överlämnade.', health: data.sources.garage.health, href: '/garage', details: [['Med reg.nr', data.processes.garage.withRegnr], ['Utan reg.nr', data.processes.garage.withoutRegnr]] },
      PLANNED: { title: 'Planerade inköp', value: data.processes.plannedPurchases.remaining, text: 'BESTÄLLT som fortfarande återstår upstream före materialisering till Garaget.', health: data.sources.plannedPurchases.health, href: '/planning' },
      WHEEL: { title: 'Hjulskifte', value: data.processes.wheelChange.canonicalCandidateCount, text: 'Fleet-wide kandidatantal visas först när hjuldata kan korsas mot kanoniska AKTIVA.', health: data.sources.wheelChange.health, href: '/garage', details: [['Öppna processrader', data.processes.wheelChange.openProcessRows]] },
      AVVECKLA: { title: 'Avveckla', value: data.processes.avveckla.count, text: 'Tower väntar på färdigt read-kontrakt från den separata AVVECKLA-processen.', health: data.sources.avveckla.health },
    };
    return map[focus];
  }, [data, focus]);

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
          <button className={styles.activePopulation} onClick={() => setFocus('ACTIVE')} type="button">
            <span>AKTIVA BILAR</span>
            <strong>{sv(data?.fleet.active)}</strong>
            <small>{data ? healthLabel(data.fleet.health) : 'Läser'}</small>
          </button>
          <div className={styles.coverage}>
            <span>Verifierad statusbild</span>
            <strong>{sv(data?.fleet.capturedPrimaryStateVehicles)}</strong>
            <small>fordon med fångad Layer 1-status</small>
          </div>
        </div>

        <div className={styles.statusCanvas}>
          <StatusCell label="Lediga" value={data?.fleet.primaryStates.AVAILABLE} selected={focus === 'AVAILABLE'} onClick={() => setFocus('AVAILABLE')} />
          <StatusCell label="Uthyrda" value={data?.fleet.primaryStates.RENTAL} selected={focus === 'RENTAL'} onClick={() => setFocus('RENTAL')} />
          <StatusCell label="Stillestånd" value={data?.fleet.primaryStates.DOWNTIME} selected={focus === 'DOWNTIME'} onClick={() => setFocus('DOWNTIME')} emphasis />
          <StatusCell label="Förberedelse" value={data?.fleet.primaryStates.PREPARATION} selected={focus === 'PREPARATION'} onClick={() => setFocus('PREPARATION')} />
          <StatusCell label="SALU · status" value={data?.fleet.primaryStates.SALU} selected={focus === 'SALU_PRIMARY'} onClick={() => setFocus('SALU_PRIMARY')} />
          <StatusCell label="Övrig" value={data?.fleet.primaryStates.OTHER} selected={focus === 'OTHER'} onClick={() => setFocus('OTHER')} />
          <StatusCell label="Okänd" value={data?.fleet.primaryStates.UNKNOWN} selected={focus === 'UNKNOWN'} onClick={() => setFocus('UNKNOWN')} />
          <StatusCell label="Verkstad" value={data?.fleet.workshopCaptured} selected={focus === 'WORKSHOP'} onClick={() => setFocus('WORKSHOP')} sublabel="inom stillestånd" />
        </div>
      </section>

      <section className={styles.movement}>
        <div className={styles.sectionHead}>
          <div><span className={styles.eyebrow}>RÖRELSE</span><h3>Det som rör sig genom verksamheten</h3></div>
          <p>Processer och inflöde. De överlappar beståndet och ska inte summeras med AKTIVA.</p>
        </div>
        <div className={styles.movementRail}>
          <ProcessNode label="Planerade inköp" value={data?.processes.plannedPurchases.remaining} onClick={() => setFocus('PLANNED')} selected={focus === 'PLANNED'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="Garaget" value={data?.processes.garage.owned} onClick={() => setFocus('GARAGE')} selected={focus === 'GARAGE'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="Aktiv drift" value={data?.fleet.active} onClick={() => setFocus('ACTIVE')} selected={focus === 'ACTIVE'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="SALU · process" value={data?.processes.salu.open} onClick={() => setFocus('SALU')} selected={focus === 'SALU'} />
          <span className={styles.connector}>→</span>
          <ProcessNode label="Avveckla" value={data?.processes.avveckla.count} onClick={() => setFocus('AVVECKLA')} selected={focus === 'AVVECKLA'} />
        </div>
        <button type="button" className={styles.wheelNode} onClick={() => setFocus('WHEEL')}>
          <span>HJULSKIFTE</span><strong>{sv(data?.processes.wheelChange.canonicalCandidateCount)}</strong><small>tvärgående process</small>
        </button>
      </section>

      <section className={styles.friction}>
        <div className={styles.frictionLead}>
          <span className={styles.eyebrow}>FRIKTION</span>
          <strong>{sv(attentionTotal)}</strong>
          <p>fångade signaler som kräver uppmärksamhet</p>
        </div>
        <div className={styles.frictionSignals}>
          <button type="button" onClick={() => setFocus('DOWNTIME')}><span>Stillestånd</span><strong>{sv(data?.attention.capturedDowntime)}</strong></button>
          <button type="button" onClick={() => setFocus('SALU')}><span>SALU T-10</span><strong>{sv(data?.attention.saluT10)}</strong></button>
          <button type="button" onClick={() => setFocus('SALU')}><span>SALU passerad</span><strong>{sv(data?.attention.saluPassed)}</strong></button>
        </div>
      </section>

      <section className={styles.intelligence} aria-live="polite">
        <div>
          <span className={styles.eyebrow}>FÖRSTÅ</span>
          <h3>{focusDetail?.title ?? 'Verksamheten'}</h3>
          <strong className={styles.detailValue}>{sv(focusDetail?.value)}</strong>
          <p>{focusDetail?.text}</p>
          {focusDetail?.details?.length ? <div className={styles.detailFacts}>{focusDetail.details.map(([label, value]) => <div key={label}><span>{label}</span><strong>{sv(value)}</strong></div>)}</div> : null}
        </div>
        <aside>
          <span className={styles.eyebrow}>EVIDENS</span>
          <strong>{focusDetail ? healthLabel(focusDetail.health) : '—'}</strong>
          <p>Teknisk datagräns finns kvar för spårbarhet, men styr inte första intrycket.</p>
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

function StatusCell({ label, value, selected, onClick, sublabel, emphasis }: { label: string; value?: number | null; selected: boolean; onClick: () => void; sublabel?: string; emphasis?: boolean }) {
  return <button type="button" onClick={onClick} className={`${styles.statusCell} ${selected ? styles.selected : ''} ${emphasis ? styles.emphasis : ''}`}><span>{label}</span><strong>{sv(value)}</strong>{sublabel ? <small>{sublabel}</small> : null}</button>;
}

function ProcessNode({ label, value, onClick, selected }: { label: string; value?: number | null; onClick: () => void; selected: boolean }) {
  return <button type="button" onClick={onClick} className={`${styles.processNode} ${selected ? styles.selectedDark : ''}`}><span>{label}</span><strong>{sv(value)}</strong></button>;
}
