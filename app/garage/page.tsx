import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import GarageClient from './garage-client';
import GarageV2Panel from './garage-v2-panel';
import GarageWheelChangePanel from './garage-wheel-change-panel';
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
      descriptor="DISPOSITION / IN / UT / OPERATIV HANTERING"
      eyebrow="INVISTO CORE / GARAGE CONTROL"
    >
      <div className={styles.workspace}>
        <nav className={styles.flowNav} aria-label="Garaget arbetsflöde">
          <span>ARBETSFLÖDE</span>
          <a href="#overlamningar">1. Överlämningar</a>
          <a href="#orderflode">2. Orderflöde</a>
          <a href="#kontrollpunkter">3. Kontrollpunkter</a>
          <a href="#garageobjekt">4. Garage-objekt</a>
        </nav>

        <section id="overlamningar" className={styles.section}>
          <div className={styles.sectionLabel}><strong>01 / ÖVERLÄMNINGAR</strong><span>In i Garaget och vidare till Ny bil</span></div>
          <GarageV2Panel />
        </section>

        <section id="orderflode" className={styles.section}>
          <div className={styles.sectionLabel}><strong>02 / ORDERFLÖDE</strong><span>Beställning, bekräftelse och transport</span></div>
          <OrderWorkflowPanel />
        </section>

        <section id="kontrollpunkter" className={styles.section}>
          <div className={styles.sectionLabel}><strong>03 / KONTROLLPUNKTER</strong><span>Operativ uppföljning i Garaget</span></div>
          <GarageWheelChangePanel />
        </section>

        <section id="garageobjekt" className={styles.section}>
          <div className={styles.sectionLabel}><strong>04 / GARAGE-OBJEKT</strong><span>Detaljerad hantering och källdata</span></div>
          <GarageClient />
        </section>
      </div>
    </CoreProductShell>
  );
}
