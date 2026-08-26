import type { Metadata } from 'next';
import Link from 'next/link';
import VagnkortClient from './vagnkort-client';
import OperationalStateBanner from './operational-state-banner';
import styles from './vagnkort-shell.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vagnkort | Incheckad',
  description: 'Bilens digitala pärm, status och resa',
};

export default function VagnkortPage() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
          <i />
        </div>
        <nav className={styles.nav} aria-label="Vagnkort navigation">
          <Link href="/">Startsida</Link>
          <Link href="/tower">Tower</Link>
          <Link href="/planning">Planering</Link>
          <Link href="/garage">Garaget</Link>
          <Link href="/ankomst">Ankomst</Link>
          <Link href="/check">Incheckning</Link>
          <Link href="/nybil">Ny bil</Link>
          <Link className={styles.active} href="/vagnkort">Vagnkort</Link>
        </nav>
        <div className={styles.sidebarFoot}>
          <span>INVISTO</span>
          <small>CORE / VEHICLE RECORD</small>
        </div>
      </aside>

      <section className={styles.surface}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <strong>Vagnkort</strong>
            <span>FORDONSIDENTITET / HISTORIK / EVIDENS</span>
          </div>
          <div className={styles.topbarSpacer} />
          <Link className={styles.towerLink} href="/tower">← TOWER</Link>
          <Link className={styles.homeLink} href="/">START</Link>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>INVISTO CORE / VEHICLE DOSSIER</span>
            <h1>Bilens digitala pärm.</h1>
            <p>Verifierad fordonsresa, dokumentation, avvikelser och evidens samlat på en plats. Vagnkortet visar vad som faktiskt har hänt utan att skriva om källornas verklighet.</p>
          </div>
          <div className={styles.heroMeta}>
            <span>PRINCIP</span>
            <strong>IDENTITY → HISTORY → EVIDENCE</strong>
            <span>STATUS</span>
            <strong>READ VERIFIED TRUTH</strong>
          </div>
        </section>

        <div className={styles.state}>
          <OperationalStateBanner />
        </div>

        <div className={styles.content}>
          <VagnkortClient />
        </div>

        <footer className={styles.footer}>
          <span>INCHECKAD / BY INVISTO / IT</span>
          <strong>FORDONSRESAN SKA KUNNA BEVISAS.</strong>
        </footer>
      </section>
    </div>
  );
}
