// app/check/page.tsx
import Link from 'next/link';
import FormClient from './form-client';
import styles from './check-shell.module.css';

export const dynamic = 'force-dynamic';

export default function CheckPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.backLink}>← Startsida</Link>
        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>
        <span className={styles.mode}>OPERATIV KONTROLL</span>
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

      <section className={styles.formSurface}>
        <FormClient />
      </section>
    </main>
  );
}
