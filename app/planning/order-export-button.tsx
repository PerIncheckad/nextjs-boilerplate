'use client';

import { useState } from 'react';
import { buildPlanningOrderExcelCsv, planningOrderExportFilename, type PlanningOrderExportRow } from '@/lib/planning-order-export';
import styles from './planning.module.css';

type PlanningStation = { station_code: string; display_name: string | null };
type PlanningCell = {
  model: string;
  station: string;
  ordered_count: number;
  note: string | null;
};
type PlanningPayload = {
  data?: PlanningCell[];
  stations?: PlanningStation[];
  error?: string;
};

type Props = { period: string };

export default function OrderExportButton({ period }: Props) {
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const exportOrders = async () => {
    setExporting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/fleet-planning?period=${encodeURIComponent(period)}`, { cache: 'no-store' });
      const payload = await response.json() as PlanningPayload;
      if (!response.ok) throw new Error(payload.error ?? 'Kunde inte läsa sparade BESTÄLLT');

      const stationNames = new Map((payload.stations ?? []).map((station) => [station.station_code, station.display_name]));
      const rows: PlanningOrderExportRow[] = (payload.data ?? []).map((cell) => ({
        period,
        model: cell.model,
        stationCode: cell.station,
        stationName: stationNames.get(cell.station) ?? null,
        orderedCount: cell.ordered_count,
        note: cell.note ?? '',
      }));
      const orderCount = rows.reduce((sum, row) => sum + (row.orderedCount > 0 ? row.orderedCount : 0), 0);
      if (orderCount === 0) {
        setNotice('Inga sparade BESTÄLLT finns för vald månad.');
        return;
      }

      const blob = new Blob([buildPlanningOrderExcelCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = planningOrderExportFilename(period);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`Excel-fil skapad: ${orderCount} beställda bilar.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Kunde inte skapa Excel-exporten.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className={styles.toolbar} aria-label="BESTÄLLT export">
      <button type="button" className={styles.secondaryButton} onClick={() => void exportOrders()} disabled={exporting}>
        {exporting ? 'Skapar Excel…' : 'Exportera BESTÄLLT till Excel'}
      </button>
      <div className={styles.sheetHint}>Exporterar endast sparade BESTÄLLT för {period}. SALU nettas inte.</div>
      {notice ? <div className={styles.periodStatus}><strong>{notice}</strong></div> : null}
    </section>
  );
}
