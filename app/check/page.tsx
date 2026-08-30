// app/check/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import FormClient from './form-client';
import OperationalTopbarMeta from '@/components/OperationalTopbarMeta';
import styles from './check-shell.module.css';
import cleanupStyles from '../operational-form-copy-cleanup.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Incheckning | Incheckad',
  description: 'Kontrollera bilen, dokumentera avvikelser och verifiera verkligt utfall',
};

export default function CheckPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.backLink}>← Startsida</Link>
        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>
        <OperationalTopbarMeta mode="OPERATIV KONTROLL" />
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / CHECK-IN</span>
          <h1>Incheckning</h1>
          <p>Kontrollera bilen, dokumentera avvikelser och verifiera verkligt utfall.</p>
        </div>

        <div className={styles.flow} aria-label="Arbetsgång för incheckning">
          <span className={styles.flowLabel}>ARBETSGÅNG</span>
          <ol>
            <li><span>01</span>Fordon</li>
            <li><span>02</span>Kontroll</li>
            <li><span>03</span>Avvikelser</li>
            <li><span>04</span>Verifiera</li>
          </ol>
        </div>
      </section>

      <section className={`${styles.formSurface} ${cleanupStyles.checkSurface} ${cleanupStyles.legacyHeaderHidden}`}>
        <FormClient />
      </section>
    </main>
  );
}
