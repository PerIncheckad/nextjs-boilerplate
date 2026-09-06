import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import GarageCorePanel from './garage-core-panel';
import GarageClient from './garage-client';
import GarageNybilHandoffStatusPanel from './garage-nybil-handoff-status-panel';
import GarageVoidPanel from './garage-void-panel';
import GarageAvvecklaHandoffPanel from './garage-avveckla-handoff-panel';
import styles from './garage-workspace.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'GARAGET | Incheckad',
  description: 'Garage staging, routing och verifierade handoff',
};

export default function GaragePage() {
  return (
    <CoreProductShell
      active="garage"
      title="GARAGET"
      descriptor="STAGING / ROUTING / HANDOFF"
      eyebrow="INVISTO CORE / GARAGE CONTROL"
    >
      <div className={styles.workspace}>
        <nav className={styles.flowNav} aria-label="Garaget arbetsflöde">
          <span>GARAGE CORE</span>
          <a href="#core">0. CORE</a>
          <a href="#garageobjekt">1. GARAGE-EPISODER</a>
          <a href="#nybil-handoff">2. NYBIL HANDOFF</a>
          <a href="#avveckla-handoff">3. AVVECKLA HANDOFF</a>
        </nav>

        <section id="core" className={styles.section}>
          <div className={styles.sectionLabel}><strong>00 / GARAGE CORE</strong><span>Vad ligger här, varför, vad väntar det på och vem tar över?</span></div>
          <GarageCorePanel />
        </section>

        <section id="garageobjekt" className={styles.section}>
          <div className={styles.sectionLabel}><strong>01 / GARAGE-EPISODER</strong><span>Garage-ägda staging-, routing- och verifierade informationskompletteringar. Inte andra modulers arbete.</span></div>
          <GarageClient />
          <GarageVoidPanel />
        </section>

        <section id="nybil-handoff" className={styles.section}>
          <div className={styles.sectionLabel}><strong>02 / NYBIL HANDOFF</strong><span>Read-only status för Garage → Nybil. Allt Nybil-arbete sker i /nybil.</span></div>
          <GarageNybilHandoffStatusPanel />
        </section>

        <section id="avveckla-handoff" className={styles.section}>
          <div className={styles.sectionLabel}><strong>03 / AVVECKLA HANDOFF</strong><span>Garage startar manuellt och verifierar att AVVECKLA-case skapats; fortsatt arbete sker i /avveckla</span></div>
          <GarageAvvecklaHandoffPanel />
        </section>
      </div>
    </CoreProductShell>
  );
}
