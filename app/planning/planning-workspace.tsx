'use client';

import { useState } from 'react';
import SaluOverview from './salu-overview';
import FleetPlanningClient from './planning-client';
import OrderExportButton from './order-export-button';
import PlanningGarageHandoff from './planning-garage-handoff';
import styles from './planning-workspace.module.css';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

export default function PlanningWorkspace() {
  const [period, setPeriod] = useState(currentPeriod);

  return (
    <div className={styles.workspace}>
      <nav className={styles.flowNav} aria-label="Planering arbetsflöde">
        <span>ARBETSFLÖDE</span>
        <a href="#beslutsstod">1. Beslutsstöd</a>
        <a href="#beslut">2. Beslut</a>
        <a href="#handslag">3. Handslag</a>
      </nav>

      <section id="beslutsstod" className={styles.section}>
        <div className={styles.sectionLabel}><strong>01 / BESLUTSSTÖD</strong><span>SALU och sparade BESTÄLLT i vald månad</span></div>
        <SaluOverview period={period} onPeriodChange={setPeriod} />
      </section>

      <section id="beslut" className={styles.section}>
        <div className={styles.sectionLabel}><strong>02 / BESLUT</strong><span>Registrera och spara planeringsbeslut</span></div>
        <FleetPlanningClient selectedPeriod={period} onPeriodChange={setPeriod} />
      </section>

      <section id="handslag" className={styles.section}>
        <div className={styles.sectionLabel}><strong>03 / HANDSLAG</strong><span>Export och verifiering mot Garaget</span></div>
        <OrderExportButton period={period} />
        <PlanningGarageHandoff period={period} />
      </section>
    </div>
  );
}
