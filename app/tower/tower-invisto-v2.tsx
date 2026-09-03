'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './tower-invisto-v2.module.css';

type Health = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'EXTERNAL';
type PrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'OTHER' | 'UNKNOWN';

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
    garage: { owned: number; withRegnr: number; withoutRegnr: number };
    plannedPurchases: { remaining: number };
    wheelChange: { openProcessRows: number; canonicalCandidateCount: number | null };
    avveckla: { count: number | null; health: Health };
  };
  attention: {
    health: Health;
    capturedDowntime: number;
    saluT10: number;
    saluPassed: number;
  };
  sources: Record<string, { health: Health; reason: string }>;
};

type Focus = 'ACTIVE' | 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'WORKSHOP' | 'SALU' | 'GARAGE' | 'PLANNED' | 'WHEEL' | 'AVVECKLA';

const sv = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('sv-SE');

function healthLabel(health: Health) {
  if (health === 'VERIFIED') return 'Verifierad';
  if (health === 'PARTIAL') return 'Delvis verifierad';
  if (health === 'BLOCKED') return 'Inväntar underlag';
  return 'Extern källa';
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

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
    try {
      setData(await loadReadModel());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tower kunde inte läsas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const attentionTotal = data ? data.attention.capturedDowntime + data.attention.saluT10 + data.attention.saluPassed : 0;

  const focusDetail = useMemo(() => {
    if (!data) return null;
    const map: Record<Focus, { title: string; value: number | null; text: string; health: Health; href?: string }> = {
      ACTIVE: {
        title: 'Aktiva bilar', value: data.fleet.active,
        text: 'Hela den operativa flottan som fortfarande befinner sig i verksamheten.',
        health: data.fleet.health,
      },
      AVAILABLE: {
        title: 'Lediga', value: data.fleet.primaryStates.AVAILABLE,
        text: 'Verifierade primärstatusar som just nu är AVAILABLE. Full flottsanning inväntar AKTIVA-baseline.',
        health: data.sources.primaryOperationalState.health,
        href: '/status',
      },
      RENTAL: {
        title: 'Uthyrda', value: data.fleet.primaryStates.RENTAL,
        text: 'UTHYRDA får bara komma från verifierad rental-källa och infereras aldrig från andra signaler.',
        health: data.sources.rental.health,
      },
      DOWNTIME: {
        title: 'Stillestånd', value: data.fleet.primaryStates.DOWNTIME,
        text: 'Fordon med verifierad primärstatus DOWNTIME inom nuvarande datatäckning.',
        health: data.sources.primaryOperationalState.health,
        href: '/status',
      },
      WORKSHOP: {
        title: 'Verkstad', value: data.fleet.workshopCaptured,
        text: 'WORKSHOP är en aktivitet inom stillestånd och räknas aldrig som en separat primärstatus.',
        health: data.sources.primaryOperationalState.health,
        href: '/vagnkort',
      },
      SALU: {
        title: 'SALU', value: data.processes.salu.open,
        text: 'Öppna SALU-processer. En process-overlay ovanpå fordonsverksamheten.',
        health: data.sources.salu.health,
        href: '/planning',
      },
      GARAGE: {
        title: 'Garaget', value: data.processes.garage.owned,
        text: 'Inbound-objekt som fortfarande ägs av Garaget och ännu inte är avslutade eller överlämnade.',
        health: data.sources.garage.health,
        href: '/garage',
      },
      PLANNED: {
        title: 'Planerade inköp', value: data.processes.plannedPurchases.remaining,
        text: 'Beställda enheter som fortfarande återstår upstream före materialisering till Garaget.',
        health: data.sources.plannedPurchases.health,
        href: '/planning',
      },
      WHEEL: {
        title: 'Hjulskifte', value: data.processes.wheelChange.canonicalCandidateCount,
        text: 'Fleet-wide kandidatantal visas först när hjuldata kan korsas mot kanoniska AKTIVA.',
        health: data.sources.wheelChange.health,
        href: '/garage',
      },
      AVVECKLA: {
        title: 'Avveckla', value: data.processes.avveckla.count,
        text: 'Tower väntar på färdigt read-kontrakt från den separata AVVECKLA-processen.',
        health: data.sources.avveckla.health,
      },
    };
    return map[focus];
  }, [data, focus]);

  return (
    <main className={styles.wrap}>
      <section className={styles.statement}>
        <div>
          <span className={styles.eyebrow}>TOWER / OPERATIV LEDNINGSBILD</span>
          <h2>Hur ser min verksamhet ut just nu?</h2>
          <p>Helhet först. Avvikelse därefter. Fördjupning när du behöver den.</p>
        </div>
        <div className={styles.freshness}>
          <span>{data ? `Uppdaterad ${timeLabel(data.generatedAt)}` : 'Läser verksamheten'}</span>
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Läser…' : 'Uppdatera'}</button>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.nowGrid} aria-label="Verksamheten just nu">
        <button className={`${styles.heroMetric} ${focus === 'ACTIVE' ? styles.active : ''}`} onClick={() => setFocus('ACTIVE')} type="button">
          <span>AKTIVA BILAR</span>
          <strong>{sv(data?.fleet.active)}</strong>
          <small>{data ? healthLabel(data.fleet.health) : 'Läser'}</small>
        </button>

        <div className={styles.stateStrip}>
          <Metric label="Lediga" value={data?.fleet.primaryStates.AVAILABLE} active={focus === 'AVAILABLE'} onClick={() => setFocus('AVAILABLE')} />
          <Metric label="Uthyrda" value={data?.fleet.primaryStates.RENTAL} active={focus === 'RENTAL'} onClick={() => setFocus('RENTAL')} />
          <Metric label="Stillestånd" value={data?.fleet.primaryStates.DOWNTIME} active={focus === 'DOWNTIME'} onClick={() => setFocus('DOWNTIME')} />
          <Metric label="Verkstad" value={data?.fleet.workshopCaptured} active={focus === 'WORKSHOP'} onClick={() => setFocus('WORKSHOP')} />
          <Metric label="Förberedelse" value={data?.fleet.primaryStates.PREPARATION} muted />
          <Metric label="Okänd" value={data?.fleet.primaryStates.UNKNOWN} muted />
        </div>
      </section>

      <section className={styles.band}>
        <header>
          <div>
            <span>VERKSAMHETEN I RÖRELSE</span>
            <h3>Pågående processer och inflöde</h3>
          </div>
          <p>Processer kan överlappa flottan och ska inte summeras med AKTIVA.</p>
        </header>
        <div className={styles.processGrid}>
          <Process label="SALU" value={data?.processes.salu.open} active={focus === 'SALU'} onClick={() => setFocus('SALU')} />
          <Process label="Garaget" value={data?.processes.garage.owned} active={focus === 'GARAGE'} onClick={() => setFocus('GARAGE')} />
          <Process label="Planerade inköp" value={data?.processes.plannedPurchases.remaining} active={focus === 'PLANNED'} onClick={() => setFocus('PLANNED')} />
          <Process label="Hjulskifte" value={data?.processes.wheelChange.canonicalCandidateCount} active={focus === 'WHEEL'} onClick={() => setFocus('WHEEL')} />
          <Process label="Avveckla" value={data?.processes.avveckla.count} active={focus === 'AVVECKLA'} onClick={() => setFocus('AVVECKLA')} />
        </div>
      </section>

      <section className={styles.attention}>
        <div className={styles.attentionLead}>
          <span>KRÄVER UPPMÄRKSAMHET</span>
          <strong>{sv(attentionTotal)}</strong>
          <small>fångade operativa signaler</small>
        </div>
        <div className={styles.attentionList}>
          <div><span>Stillestånd</span><strong>{sv(data?.attention.capturedDowntime)}</strong></div>
          <div><span>SALU T-10</span><strong>{sv(data?.attention.saluT10)}</strong></div>
          <div><span>SALU passerad</span><strong>{sv(data?.attention.saluPassed)}</strong></div>
        </div>
      </section>

      <section className={styles.detail} aria-live="polite">
        <div className={styles.detailMain}>
          <span className={styles.eyebrow}>FÖRDJUPNING</span>
          <h3>{focusDetail?.title ?? 'Verksamheten'}</h3>
          <strong className={styles.detailValue}>{sv(focusDetail?.value)}</strong>
          <p>{focusDetail?.text}</p>
        </div>
        <aside>
          <span className={styles.eyebrow}>STATUS</span>
          <strong>{focusDetail ? healthLabel(focusDetail.health) : '—'}</strong>
          {focusDetail?.href ? <Link href={focusDetail.href}>Gå till ansvarig process →</Link> : null}
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>INVISTO / INCHECKAD</span>
        <div>
          <Link href="/tower/history">Historik</Link>
          <Link href="/tower/metrics">Periodmått</Link>
        </div>
      </footer>
    </main>
  );
}

function Metric({ label, value, active, muted, onClick }: { label: string; value?: number | null; active?: boolean; muted?: boolean; onClick?: () => void }) {
  return <button type="button" disabled={!onClick} onClick={onClick} className={`${styles.metric} ${active ? styles.active : ''} ${muted ? styles.muted : ''}`}><span>{label}</span><strong>{sv(value)}</strong></button>;
}

function Process({ label, value, active, onClick }: { label: string; value?: number | null; active?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`${styles.process} ${active ? styles.active : ''}`}><span>{label}</span><strong>{sv(value)}</strong><small>Visa</small></button>;
}
