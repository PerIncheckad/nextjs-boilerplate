import type { Metadata } from 'next';
import Link from 'next/link';
import FormClient from './form-client';
import GarageNybilPrefillBridge from './garage-prefill-bridge';
import OperationalTopbarMeta from '@/components/OperationalTopbarMeta';
import styles from './nybil-shell.module.css';
import cleanupStyles from '../operational-form-copy-cleanup.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ny bil | Incheckad',
  description: 'Etablera bilens verifierade baslinje',
};

export default function NybilPage() {
  return (
    <main className={styles.shell}>
      <GarageNybilPrefillBridge />

      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/garage">← Garaget</Link>

        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>

        <OperationalTopbarMeta mode="NY BIL">
          <Link className={styles.homeLink} href="/">Startsida</Link>
        </OperationalTopbarMeta>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / NY BIL</span>
          <h1>Etablera bilens baslinje.</h1>
          <p>
            Dokumentera identitet, leverans, utrustning och avvikelser så att bilens fortsatta resa kan jämföras mot ett verifierat utgångsläge.
          </p>
        </div>

        <div className={styles.flow} aria-label="Arbetsgång för ny bil">
          <span className={styles.flowLabel}>ARBETSGÅNG</span>
          <ol>
            <li><span>01</span>Identitet</li>
            <li><span>02</span>Leverans</li>
            <li><span>03</span>Utrustning</li>
            <li><span>04</span>Verifiera</li>
          </ol>
        </div>
      </section>

      <section className={`${styles.formSurface} ${cleanupStyles.newVehicleSurface} ${cleanupStyles.legacyHeaderHidden}`}>
        <FormClient />
      </section>

      <footer className={styles.footer}>
        <span>INCHECKAD / BY INVISTO / IT</span>
        <strong>UTGÅNGSLÄGET SKA KUNNA BEVISAS.</strong>
      </footer>
    </main>
  );
}
