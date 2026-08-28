import type { Metadata } from 'next';
import Link from 'next/link';
import FormClient from './form-client';
import styles from './status-shell.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Status | Incheckad',
  description: 'Läs och verifiera fordonets aktuella läge och historik',
};

export default function StatusPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/">← Startsida</Link>

        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>

        <div className={styles.topActions}>
          <Link className={styles.nextLink} href="/vagnkort">Vagnkort</Link>
          <span className={styles.mode}>STATUS</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / STATUS</span>
          <h1>Läs bilens verifierade läge.</h1>
          <p>
            Sök ett fordon och läs aktuell information, avvikelser, historik och evidens utan att skapa en ny verklighet.
          </p>
        </div>

        <div className={styles.flow} aria-label="Läsordning för status">
          <span className={styles.flowLabel}>LÄSORDNING</span>
          <ol>
            <li><span>01</span>Sök</li>
            <li><span>02</span>Aktuellt läge</li>
            <li><span>03</span>Avvikelser</li>
            <li><span>04</span>Historik</li>
          </ol>
        </div>
      </section>

      <section className={styles.formSurface}>
        <FormClient />
      </section>

      <footer className={styles.footer}>
        <span>INCHECKAD / BY INVISTO / IT</span>
        <strong>STATUS SKA BYGGA PÅ VERIFIERAD VERKLIGHET.</strong>
      </footer>
    </main>
  );
}
