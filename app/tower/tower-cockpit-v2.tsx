'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './tower-cockpit-v2.module.css';

type Health = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'EXTERNAL';
type PrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'OTHER' | 'UNKNOWN';

type SourceStatus = { health: Health; reason: string };

type TowerReadModel = {
  generatedAt: string;
  contractVersion: string;
  semantics: {
    purpose: string;
    rule: string;
    noHeuristicFleetTruth: boolean;
  };
  fleet: {
    active: number | null;
    health: Health;
    capturedPrimaryStateVehicles: number;
    primaryStates: Record<PrimaryState, number>;
    workshopCaptured: number;
  };
  processes: {
    salu: {
      open: number;
      byStatus: Record<string, number>;
      byEscalation: Record<string, number>;
    };
    garage: {
      owned: number;
      byConfirmationStatus: Record<string, number>;
      byTransportStatus: Record<string, number>;
      withRegnr: number;
      withoutRegnr: number;
    };
    plannedPurchases: { remaining: number };
    wheelChange: {
      openProcessRows: number;
      byStatus: Record<string, number>;
      canonicalCandidateCount: number | null;
    };
    avveckla: { count: number | null; health: Health };
  };
  attention: {
    health: Health;
    capturedDowntime: number;
    saluT10: number;
    saluPassed: number;
    note: string;
  };
  sources: Record<string, SourceStatus>;
};

type Selection =
  | 'ACTIVE'
  | PrimaryState
  | 'WORKSHOP'
  | 'SALU'
  | 'GARAGE'
  | 'PLANNED'
  | 'WHEEL'
  | 'AVVECKLA'
  | 'ATTENTION_DOWNTIME'
  | 'ATTENTION_T10'
  | 'ATTENTION_PASSED';

type Detail = {
  title: string;
  value: number | null;
  health: Health;
  subtitle: string;
  sourceReason: string;
  rows?: Array<[string, string | number]>;
};

const PRIMARY_LABELS: Record<PrimaryState, string> = {
  AVAILABLE: 'Lediga',
  RENTAL: 'Uthyrda',
  DOWNTIME: 'Stillestånd',
  PREPARATION: 'Förberedelse',
  OTHER: 'Övrigt',
  UNKNOWN: 'Okänd',
};

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function healthLabel(health: Health) {
  if (health === 'VERIFIED') return 'VERIFIERAD';
  if (health === 'PARTIAL') return 'PARTIELL';
  if (health === 'BLOCKED') return 'BLOCKERAD';
  return 'EXTERN';
}

function valueLabel(value: number | null) {
  return value == null ? '—' : value.toLocaleString('sv-SE');
}

function rowsFromRecord(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

async function fetchReadModel(): Promise<TowerReadModel> {
  const response = await fetch('/api/tower/read-model', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Tower');
  return payload.data as TowerReadModel;
}

export default function TowerCockpitV2() {
  const [data, setData] = useState<TowerReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection>('ACTIVE');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchReadModel());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Tower');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchReadModel()
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Tower');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const detail = useMemo<Detail | null>(() => {
    if (!data) return null;
    const source = data.sources;

    if (selected === 'ACTIVE') {
      return {
        title: 'Aktiv flotta',
        value: data.fleet.active,
        health: data.fleet.health,
        subtitle: 'Hela flottan som fortfarande tillhör verksamheten.',
        sourceReason: source.fleetMembership.reason,
        rows: [
          ['Fångade primärstatusar', data.fleet.capturedPrimaryStateVehicles],
          ['Verifierad baseline', 'Saknas'],
        ],
      };
    }

    if (selected === 'WORKSHOP') {
      return {
        title: 'Verkstad',
        value: data.fleet.workshopCaptured,
        health: source.primaryOperationalState.health,
        subtitle: 'Öppen WORKSHOP-aktivitet inom fångad DOWNTIME.',
        sourceReason: source.primaryOperationalState.reason,
      };
    }

    if (selected in PRIMARY_LABELS) {
      const state = selected as PrimaryState;
      return {
        title: PRIMARY_LABELS[state],
        value: data.fleet.primaryStates[state],
        health: state === 'RENTAL' ? source.rental.health : source.primaryOperationalState.health,
        subtitle: 'Fångad primärstatus. Detta är inte full flottsanning innan AKTIVA-baseline finns.',
        sourceReason: state === 'RENTAL' ? source.rental.reason : source.primaryOperationalState.reason,
      };
    }

    if (selected === 'SALU') {
      return {
        title: 'SALU',
        value: data.processes.salu.open,
        health: source.salu.health,
        subtitle: 'Öppna SALU-processer. SALU är en process-overlay och adderas inte till AKTIVA.',
        sourceReason: source.salu.reason,
        rows: [
          ...rowsFromRecord(data.processes.salu.byStatus).map(([label, value]) => [`Status · ${label}`, value] as [string, number]),
          ...rowsFromRecord(data.processes.salu.byEscalation).map(([label, value]) => [`Eskalering · ${label}`, value] as [string, number]),
        ],
      };
    }

    if (selected === 'GARAGE') {
      return {
        title: 'Garaget',
        value: data.processes.garage.owned,
        health: source.garage.health,
        subtitle: 'Inbound-objekt som Garaget fortfarande äger.',
        sourceReason: source.garage.reason,
        rows: [
          ['Med reg.nr', data.processes.garage.withRegnr],
          ['Utan reg.nr', data.processes.garage.withoutRegnr],
          ...rowsFromRecord(data.processes.garage.byConfirmationStatus).map(([label, value]) => [`Bekräftelse · ${label}`, value] as [string, number]),
          ...rowsFromRecord(data.processes.garage.byTransportStatus).map(([label, value]) => [`Transport · ${label}`, value] as [string, number]),
        ],
      };
    }

    if (selected === 'PLANNED') {
      return {
        title: 'Planerade inköp',
        value: data.processes.plannedPurchases.remaining,
        health: source.plannedPurchases.health,
        subtitle: 'Beställda enheter som fortfarande återstår före materialisering till Garaget.',
        sourceReason: source.plannedPurchases.reason,
      };
    }

    if (selected === 'WHEEL') {
      return {
        title: 'Hjulskifte',
        value: data.processes.wheelChange.canonicalCandidateCount,
        health: source.wheelChange.health,
        subtitle: 'Kanoniskt kandidatantal väntar på korsning mot AKTIVA. Befintliga processrader kan läsas separat.',
        sourceReason: source.wheelChange.reason,
        rows: [
          ['Öppna processrader', data.processes.wheelChange.openProcessRows],
          ...rowsFromRecord(data.processes.wheelChange.byStatus).map(([label, value]) => [`Status · ${label}`, value] as [string, number]),
        ],
      };
    }

    if (selected === 'AVVECKLA') {
      return {
        title: 'Avveckla',
        value: data.processes.avveckla.count,
        health: source.avveckla.health,
        subtitle: 'Läskontraktet kommer från separat AVVECKLA-arbete.',
        sourceReason: source.avveckla.reason,
      };
    }

    if (selected === 'ATTENTION_DOWNTIME') {
      return {
        title: 'Stillestånd som kräver uppmärksamhet',
        value: data.attention.capturedDowntime,
        health: data.attention.health,
        subtitle: data.attention.note,
        sourceReason: source.primaryOperationalState.reason,
      };
    }

    if (selected === 'ATTENTION_T10') {
      return {
        title: 'SALU T-10',
        value: data.attention.saluT10,
        health: source.salu.health,
        subtitle: data.attention.note,
        sourceReason: source.salu.reason,
      };
    }

    return {
      title: 'SALU passerad',
      value: data.attention.saluPassed,
      health: source.salu.health,
      subtitle: data.attention.note,
      sourceReason: source.salu.reason,
    };
  }, [data, selected]);

  return (
    <div className={styles.cockpit}>
      <div className={styles.toolbar}>
        <div>
          <span className={styles.kicker}>OPERATIV HELHETSBILD</span>
          <strong>Verksamheten just nu</strong>
          <small>{data ? `Senast läst ${formatGeneratedAt(data.generatedAt)}` : 'Läser Production…'}</small>
        </div>
        <div className={styles.toolbarActions}>
          <Link href="/tower/history">Drifthistorik</Link>
          <Link href="/tower/metrics">Periodmått</Link>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'UPPDATERAR…' : 'UPPDATERA'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.fleetSurface} aria-label="Aktiv flotta">
        <button type="button" className={`${styles.activeMetric} ${selected === 'ACTIVE' ? styles.selected : ''}`} onClick={() => setSelected('ACTIVE')}>
          <span>AKTIVA</span>
          <strong>{valueLabel(data?.fleet.active ?? null)}</strong>
          <em className={styles[data?.fleet.health.toLowerCase() ?? 'blocked']}>{data ? healthLabel(data.fleet.health) : 'LÄSER'}</em>
          <small>{data?.fleet.active == null ? 'Väntar verifierad fleet-baseline' : 'Fordon i verksamheten'}</small>
        </button>

        <div className={styles.primaryGrid}>
          {(Object.keys(PRIMARY_LABELS) as PrimaryState[]).map((state) => (
            <button
              type="button"
              key={state}
              className={`${styles.primaryMetric} ${selected === state ? styles.selected : ''}`}
              onClick={() => setSelected(state)}
            >
              <span>{PRIMARY_LABELS[state]}</span>
              <strong>{data ? data.fleet.primaryStates[state].toLocaleString('sv-SE') : '—'}</strong>
              <small>{state === 'RENTAL' ? 'Källa blockerad' : 'Fångad Layer-1'}</small>
            </button>
          ))}
          <button type="button" className={`${styles.primaryMetric} ${selected === 'WORKSHOP' ? styles.selected : ''}`} onClick={() => setSelected('WORKSHOP')}>
            <span>Verkstad</span>
            <strong>{data ? data.fleet.workshopCaptured.toLocaleString('sv-SE') : '—'}</strong>
            <small>varav stillestånd</small>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>PROCESSER & INFLÖDE</span>
          <small>Överlappar flottan eller ligger före den — ska inte summeras med AKTIVA.</small>
        </div>
        <div className={styles.processGrid}>
          <ProcessMetric label="SALU" value={data?.processes.salu.open ?? null} health={data?.sources.salu.health ?? 'VERIFIED'} selected={selected === 'SALU'} onClick={() => setSelected('SALU')} />
          <ProcessMetric label="GARAGET" value={data?.processes.garage.owned ?? null} health={data?.sources.garage.health ?? 'VERIFIED'} selected={selected === 'GARAGE'} onClick={() => setSelected('GARAGE')} />
          <ProcessMetric label="HJULSKIFTE" value={data?.processes.wheelChange.canonicalCandidateCount ?? null} health={data?.sources.wheelChange.health ?? 'PARTIAL'} selected={selected === 'WHEEL'} onClick={() => setSelected('WHEEL')} />
          <ProcessMetric label="PLANERADE INKÖP" value={data?.processes.plannedPurchases.remaining ?? null} health={data?.sources.plannedPurchases.health ?? 'VERIFIED'} selected={selected === 'PLANNED'} onClick={() => setSelected('PLANNED')} />
          <ProcessMetric label="AVVECKLA" value={data?.processes.avveckla.count ?? null} health={data?.processes.avveckla.health ?? 'EXTERNAL'} selected={selected === 'AVVECKLA'} onClick={() => setSelected('AVVECKLA')} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>KRÄVER UPPMÄRKSAMHET</span>
          <small>Ett lager ovanpå verksamheten — inte Towers huvudpopulation.</small>
        </div>
        <div className={styles.attentionGrid}>
          <AttentionMetric label="STILLESTÅND" value={data?.attention.capturedDowntime ?? 0} selected={selected === 'ATTENTION_DOWNTIME'} onClick={() => setSelected('ATTENTION_DOWNTIME')} />
          <AttentionMetric label="SALU T-10" value={data?.attention.saluT10 ?? 0} selected={selected === 'ATTENTION_T10'} onClick={() => setSelected('ATTENTION_T10')} />
          <AttentionMetric label="SALU PASSERAD" value={data?.attention.saluPassed ?? 0} selected={selected === 'ATTENTION_PASSED'} onClick={() => setSelected('ATTENTION_PASSED')} />
        </div>
      </section>

      <section className={styles.detailPanel} aria-live="polite">
        <div className={styles.detailTop}>
          <div>
            <span>NEDBORRNING / KONTRAKT</span>
            <h2>{detail?.title ?? 'Välj en mätare'}</h2>
          </div>
          {detail ? <strong className={styles[detail.health.toLowerCase()]}>{healthLabel(detail.health)}</strong> : null}
        </div>
        {detail ? (
          <>
            <div className={styles.detailValue}>{valueLabel(detail.value)}</div>
            <p>{detail.subtitle}</p>
            <div className={styles.sourceNote}>
              <span>DATAGRÄNS</span>
              <strong>{detail.sourceReason}</strong>
            </div>
            {detail.rows?.length ? (
              <div className={styles.detailRows}>
                {detail.rows.map(([label, value]) => (
                  <div key={`${label}-${value}`}>
                    <span>{label}</span>
                    <strong>{typeof value === 'number' ? value.toLocaleString('sv-SE') : value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <footer className={styles.footerNote}>
        <span>{data?.contractVersion ?? 'TOWER_READ_MODEL_V1'}</span>
        <strong>Ingen infererad sanning. Tower läser brett; ingripanden sker genom ägande process.</strong>
      </footer>
    </div>
  );
}

function ProcessMetric({ label, value, health, selected, onClick }: {
  label: string;
  value: number | null;
  health: Health;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${styles.processMetric} ${selected ? styles.selected : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{valueLabel(value)}</strong>
      <em className={styles[health.toLowerCase()]}>{healthLabel(health)}</em>
    </button>
  );
}

function AttentionMetric({ label, value, selected, onClick }: {
  label: string;
  value: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${styles.attentionMetric} ${selected ? styles.selected : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value.toLocaleString('sv-SE')}</strong>
    </button>
  );
}
