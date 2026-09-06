import type { Metadata } from 'next';
import Link from 'next/link';
import OperationalTopbarMeta from '@/components/OperationalTopbarMeta';
import styles from '../status-shell.module.css';
import StatusLocationClient from './location-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Aktuell fysisk plats | Status | Incheckad',
  description: 'Verifiera och korrigera fordonets aktuella fysiska plats i Status',
};

export default function StatusLocationPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/status">← Status</Link>

        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>

        <OperationalTopbarMeta mode="STATUS">
          <Link className={styles.nextLink} href="/vagnkort">Vagnkort</Link>
        </OperationalTopbarMeta>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / STATUS / CURRENT LOCATION</span>
          <h1>Verifiera bilens fysiska plats.</h1>
          <p>
            Korrigeringen blir en ny spårbar Status-observation. Senaste legitima verifierade platsobservation i tid är current fact.
          </p>
        </div>
      </section>

      <section className={styles.formSurface}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.5rem' }}>
            <StatusLocationClient />
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>INCHECKAD / BY INVISTO / IT</span>
        <strong>PLATS ÄNDRAR INTE PROCESSSTATUS.</strong>
      </footer>
    </main>
  );
}
