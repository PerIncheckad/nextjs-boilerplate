'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import styles from './fuel-evidence.module.css';

type FuelEvidenceRow = {
  checkinId: string;
  regnr: string;
  completedAt: string;
  station: string | null;
  liters: number | null;
  pricePerLiter: number | null;
  currency: string;
  calculatedTotal: number | null;
  hasReceipt: boolean;
  receipt: { url: string; uploadedAt: string | null } | null;
  receiptStatus: 'DOCUMENTED' | 'MISSING_WITH_REASON' | null;
  receiptMissingReason: string | null;
  classification: 'VERIFIED_EVIDENCE' | 'VERIFIED_DEVIATION' | 'LEGACY_UNCLASSIFIED';
  vagnkort: string;
};

type FuelEvidenceData = {
  generatedAt: string;
  hours: number;
  since: string;
  summary: {
    tankedCheckins: number;
    withReceipt: number;
    withoutReceipt: number;
    documentedEvidence: number;
    verifiedDeviations: number;
    legacyUnclassified: number;
    coveragePercent: number | null;
  };
  interpretation: {
    receiptRequiredForNewTankings: boolean;
    missingReceiptRequiresReason: boolean;
    monetaryInterpretation: boolean;
    message: string;
  };
  rows: FuelEvidenceRow[];
};

const WINDOWS = [
  { hours: 24, label: '24 timmar' },
  { hours: 72, label: '72 timmar' },
  { hours: 168, label: '7 dagar' },
] as const;

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

function money(value: number | null, currency: string) {
  if (value == null) return '—';
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} ${currency}`;
}

function evidenceLabel(row: FuelEvidenceRow) {
  if (row.classification === 'VERIFIED_EVIDENCE') return 'Verifierad evidens';
  if (row.classification === 'VERIFIED_DEVIATION') return 'Verifierad avvikelse';
  return 'Historisk / oklassificerad';
}

function evidenceClass(row: FuelEvidenceRow) {
  if (row.classification === 'VERIFIED_EVIDENCE') return styles.evidenceOk;
  if (row.classification === 'VERIFIED_DEVIATION') return styles.evidenceDeviation;
  return styles.evidenceLegacy;
}

async function fetchEvidence(hours: number): Promise<FuelEvidenceData> {
  const response = await fetch(`/api/operator-fuel-evidence?hours=${hours}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa tankningsevidens');
  return payload.data as FuelEvidenceData;
}

export default function FuelEvidenceClient() {
  const [hours, setHours] = useState(168);
  const [data, setData] = useState<FuelEvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowHours: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEvidence(windowHours));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa tankningsevidens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchEvidence(168)
      .then((next) => {
        if (!active) return;
        setData(next);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa tankningsevidens');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / DRIFT & EVIDENS</div>
          <h1>Tankningsevidens</h1>
          <p>Tankad → kvitto finns = verifierad evidens. Tankad → kvitto saknas + orsak = verifierad avvikelse.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/tower">Tower</Link>
          <Link href="/tower/metrics">Driftmätning</Link>
          <Link href="/tower/history">Drifthistorik</Link>
          <Link href="/">Startsida</Link>
        </div>
      </header>

      <section className={styles.notice}>
        Read-only uppföljning. För nya registrerade tankningar krävs kvittobild eller uttryckligt “Kvitto saknas” med obligatorisk orsak. Äldre data skrivs inte om. Ingen bedömning av kostnadsansvar, ersättning eller monetärt utfall görs här.
      </section>

      {error ? <section className={styles.error}>{error}</section> : null}

      <section className={styles.controls}>
        <label>
          <span>Tidsfönster</span>
          <select value={hours} onChange={(event) => {
            const next = Number(event.target.value);
            setHours(next);
            void load(next);
          }}>
            {WINDOWS.map((window) => <option key={window.hours} value={window.hours}>{window.label}</option>)}
          </select>
        </label>
        <div className={styles.generated}>
          <span>Senast läst</span>
          <strong>{formatDate(data?.generatedAt ?? null)}</strong>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Tankningsevidens summering">
        <Metric title="Tankad nu" value={data?.summary.tankedCheckins ?? 0} />
        <Metric title="Verifierad evidens" value={data?.summary.documentedEvidence ?? 0} />
        <Metric title="Verifierad avvikelse" value={data?.summary.verifiedDeviations ?? 0} />
        <Metric title="Historisk / oklassificerad" value={data?.summary.legacyUnclassified ?? 0} />
        <Metric title="Kvittotäckning" value={data?.summary.coveragePercent == null ? '—' : `${data.summary.coveragePercent}%`} />
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeading}>
          <div>
            <span>REGISTRERAD EVIDENS</span>
            <h2>Registrerade tankningar</h2>
          </div>
          <strong>{data?.rows.length ?? 0} rader</strong>
        </div>
        {loading && !data ? <div className={styles.empty}>Läser tankningsevidens…</div> : null}
        {!loading && data?.rows.length === 0 ? <div className={styles.empty}>Inga registrerade tankningar i valt tidsfönster.</div> : null}
        {(data?.rows.length ?? 0) > 0 ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Tid</th>
                  <th>Fordon</th>
                  <th>Station</th>
                  <th>Tankning</th>
                  <th>Evidensstatus</th>
                  <th>Kvitto</th>
                  <th>Vagnkort</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((row) => (
                  <tr key={row.checkinId}>
                    <td>{formatDate(row.completedAt)}</td>
                    <td><strong className={styles.regnr}>{row.regnr}</strong></td>
                    <td>{row.station ?? '—'}</td>
                    <td>
                      {row.liters ?? '—'} L · {row.pricePerLiter ?? '—'} /L
                      <span className={styles.subtle}>Beräknat: {money(row.calculatedTotal, row.currency)}</span>
                    </td>
                    <td>
                      <strong className={evidenceClass(row)}>{evidenceLabel(row)}</strong>
                      {row.receiptMissingReason ? <div className={styles.reason}>Orsak: {row.receiptMissingReason}</div> : null}
                    </td>
                    <td>
                      {row.receipt ? <a className={styles.openLink} href={row.receipt.url} target="_blank" rel="noreferrer">Visa kvitto →</a> : '—'}
                    </td>
                    <td><Link className={styles.openLink} href={row.vagnkort}>Öppna →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.interpretation}>
        <span>TOLKNING</span>
        <h2>Vad evidensen säger — och inte säger</h2>
        <p>{data?.interpretation.message ?? 'Tankningsevidens beskriver endast registrerad evidens och avvikelse.'}</p>
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: number | string }) {
  return (
    <div className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
