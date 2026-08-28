import type { Metadata } from 'next';
import Link from 'next/link';
import FormClient from './form-client';
import styles from './ankomst-shell.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ankomst | Incheckad',
  description: 'Verifiera bilens ankomst och aktuella läge',
};

export default function AnkomstPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/">← Startsida</Link>

        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>

        <div className={styles.topActions}>
          <Link className={styles.nextLink} href="/check">Incheckning</Link>
          <span className={styles.mode}>ANKOMST</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / ANKOMST</span>
          <h1>Verifiera bilens ankomst.</h1>
          <p>
            Bekräfta vilket fordon som kommit in, var det står och vilket aktuellt fordonsläge som faktiskt registrerats innan nästa kontroll tar vid.
          </p>
        </div>

        <div className={styles.flow} aria-label="Arbetsgång för ankomst">
          <span className={styles.flowLabel}>ARBETSGÅNG</span>
          <ol>
            <li><span>01</span>Fordon</li>
            <li><span>02</span>Plats</li>
            <li><span>03</span>Status</li>
            <li><span>04</span>Verifiera</li>
          </ol>
        </div>
      </section>

      <section className={styles.formSurface}>
        <FormClient />
      </section>

      <footer className={styles.footer}>
        <span>INCHECKAD / BY INVISTO / IT</span>
        <strong>ANKOMSTEN SKA KUNNA BEVISAS.</strong>
      </footer>
    </main>
  );
}
