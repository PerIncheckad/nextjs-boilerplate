import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import GarageOverviewPanel from './garage-overview-panel';
import GarageClient from './garage-client';
import GarageV2Panel from './garage-v2-panel';
import GarageVoidPanel from './garage-void-panel';
import GarageAvvecklaHandoffPanel from './garage-avveckla-handoff-panel';
import OrderWorkflowPanel from './order-workflow-panel';
import styles from './garage-workspace.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Garaget | Incheckad',
  description: 'BK:s arbetsyta för planerade, beställda och omplanerade bilar',
};

export default function GaragePage() {
  return (
    <CoreProductShell
      active="garage"
      title="Garaget"
      descriptor="STAGING / ROUTING / HANDOFF"
      eyebrow="INVISTO CORE / GARAGE CONTROL"
    >
      <div className={styles.workspace}>
        <nav className={styles.flowNav} aria-label="Garaget arbetsflöde">
          <span>ARBETSFLÖDE</span>
          <a href="#oversikt">0. Översikt</a>
          <a href="#garageobjekt">1. Garage</a>
          <a href="#nybil">2. Ny bil</a>
          <a href="#avveckla-handoff">3. Avveckla handoff</a>
          <a href="#bestallning-leverans">4. Beställning / leverans</a>
        </nav>

        <section id="oversikt" className={styles.section}>
          <div className={styles.sectionLabel}><strong>00 / OPERATIV ÖVERSIKT</strong><span>En bil kan bära flera samtidiga signaler och visas i flera arbetsvyer</span></div>
          <GarageOverviewPanel />
        </section>

        <section id="garageobjekt" className={styles.section}>
          <div className={styles.sectionLabel}><strong>01 / GARAGE</strong><span>UTVECKLA / IN börjar här · Planering KLAR skapar objekten automatiskt</span></div>
          <GarageClient />
          <GarageVoidPanel />
        </section>

        <section id="nybil" className={styles.section}>
          <div className={styles.sectionLabel}><strong>02 / NY BIL</strong><span>Överlämna UTVECKLA-bilen när fysisk identitet finns</span></div>
          <GarageV2Panel />
        </section>

        <section id="avveckla-handoff" className={styles.section}>
          <div className={styles.sectionLabel}><strong>03 / AVVECKLA HANDOFF</strong><span>Garage startar manuellt och verifierar att AVVECKLA-case skapats; fortsatt arbete sker i /avveckla</span></div>
          <GarageAvvecklaHandoffPanel />
        </section>

        <section id="bestallning-leverans" className={styles.section}>
          <div className={styles.sectionLabel}><strong>04 / BESTÄLLNING / LEVERANS</strong><span>Transitional yta · slutligt modulägarskap är inte beslutat i PR E</span></div>
          <OrderWorkflowPanel />
        </section>
      </div>
    </CoreProductShell>
  );
}
