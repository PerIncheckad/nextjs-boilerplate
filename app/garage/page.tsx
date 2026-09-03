import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import GarageOverviewPanel from './garage-overview-panel';
import GarageClient from './garage-client';
import GarageV2Panel from './garage-v2-panel';
import GarageLegacyEntryPanel from './garage-legacy-entry-panel';
import GarageRentedInIntakePanel from './garage-rented-in-intake-panel';
import GarageWheelChangePanel from './garage-wheel-change-panel';
import GarageVoidPanel from './garage-void-panel';
import GarageAvvecklaPanel from './garage-avveckla-panel';
import GarageAvvecklaTransportBookingPanel from './garage-avveckla-transport-booking-panel';
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
          <a href="#oversikt">0. Översikt</a>
          <a href="#garageobjekt">1. Garage</a>
          <a href="#nybil">2. Ny bil</a>
          <a href="#legacy">2B. Befintlig egen bil</a>
          <a href="#inhyrd">2C. Inhyrd</a>
          <a href="#avveckla">3. Avveckla</a>
          <a href="#kontrollpunkter">4. Kontrollpunkter</a>
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

        <section id="legacy" className={styles.section}>
          <div className={styles.sectionLabel}><strong>02B / BEFINTLIG EGEN BIL / LEGACY</strong><span>Explicit current-state entry utan historisk backfill</span></div>
          <GarageLegacyEntryPanel />
        </section>

        <section id="inhyrd" className={styles.section}>
          <div className={styles.sectionLabel}><strong>02C / INHYRD / SNABBINTAG</strong><span>Externt fordon registreras från intagstidpunkten utan historik bakåt</span></div>
          <GarageRentedInIntakePanel />
        </section>

        <section id="avveckla" className={styles.section}>
          <div className={styles.sectionLabel}><strong>03 / AVVECKLA / UT</strong><span>AVVECKLA-punkter måste vara KLAR / AVSLUTADE innan verklig UT-händelse kan verifieras</span></div>
          <GarageAvvecklaPanel />
          <GarageAvvecklaTransportBookingPanel />
          <OrderWorkflowPanel />
        </section>

        <section id="kontrollpunkter" className={styles.section}>
          <div className={styles.sectionLabel}><strong>04 / KONTROLLPUNKTER</strong><span>Operativ uppföljning i Garaget</span></div>
          <GarageWheelChangePanel />
        </section>
      </div>
    </CoreProductShell>
  );
}
