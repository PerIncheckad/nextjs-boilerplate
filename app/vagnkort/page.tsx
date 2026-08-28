import type { Metadata } from 'next';
import Link from 'next/link';
import VagnkortClient from './vagnkort-client-loader';
import OperationalStateBanner from './operational-state-banner';
import styles from './vagnkort-shell.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vagnkort | Incheckad',
  description: 'Bilens digitala pärm, status och resa',
};

export default function VagnkortPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/tower">← Tower</Link>

        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>

        <div className={styles.topActions}>
          <Link className={styles.homeLink} href="/">Startsida</Link>
          <span className={styles.mode}>VAGNKORT</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / VAGNKORT</span>
          <h1>Bilens verifierade historik.</h1>
          <p>
            Samla fordonsidentitet, operativ status, dokumenterade händelser och evidens utan att skriva om källornas verklighet.
          </p>
        </div>

        <div className={styles.flow} aria-label="Vagnkortets läsordning">
          <span className={styles.flowLabel}>LÄSORDNING</span>
          <ol>
            <li><span>01</span>Identitet</li>
            <li><span>02</span>Status</li>
            <li><span>03</span>Historik</li>
            <li><span>04</span>Evidens</li>
          </ol>
        </div>
      </section>

      <section className={styles.stateArea}>
        <div className={styles.sectionLabel}>
          <span>VERIFIERAD STATUS</span>
          <strong>Nuvarande operativt tillstånd</strong>
        </div>
        <OperationalStateBanner />
      </section>

      <section className={styles.contentArea}>
        <div className={styles.sectionLabel}>
          <span>FORDONSRESA</span>
          <strong>Öppna ett registreringsnummer</strong>
        </div>
        <VagnkortClient />
      </section>

      <footer className={styles.footer}>
        <span>INCHECKAD / BY INVISTO / IT</span>
        <strong>FORDONSRESAN SKA KUNNA BEVISAS.</strong>
      </footer>
    </main>
  );
}
