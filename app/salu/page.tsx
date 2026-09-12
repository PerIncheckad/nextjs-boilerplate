import type { Metadata } from 'next';
import Link from 'next/link';
import OperationalNavigation from '@/components/OperationalNavigation';
import OperationalTopbarMeta from '@/components/OperationalTopbarMeta';
import SaluDecisionClient from './salu-decision-client';
import styles from './salu.module.css';
import contractStyles from '../operational-ui-contract-v1.module.css';

export const metadata: Metadata = {
  title: 'SALU | INCHECKAD',
  description: 'Samlad beslutsvy för SALU',
};

export default function SaluPage() {
  return (
    <main className={`${styles.page} ${contractStyles.shell}`}>
      <header className={styles.topbar}>
        <Link className={styles.backLink} href="/">← Startsida</Link>

        <div className={styles.identity}>
          <strong>INCHECKAD</strong>
          <span>BY INVISTO / IT</span>
        </div>

        <OperationalTopbarMeta mode="SALU" />
      </header>

      <OperationalNavigation active="/salu" />

      <section className={`${styles.hero} ${contractStyles.hero}`}>
        <div className={styles.heroCopy}>
          <span>INCHECKAD CORE / SALU</span>
          <h1>En bil. Ett beslut.</h1>
          <p>Öppna bilen, se verkliga blockerare och fatta slutbeslut. Processövergångarna hanteras av systemet.</p>
        </div>

        <div className={`${styles.flow} ${contractStyles.flow}`} aria-label="Arbetsgång för SALU">
          <span className={styles.flowLabel}>ARBETSGÅNG</span>
          <ol>
            <li><span>01</span>Välj bil</li>
            <li><span>02</span>Läs blockerare</li>
            <li><span>03</span>Fatta beslut</li>
            <li><span>04</span>Verifiera</li>
          </ol>
        </div>
      </section>

      <section className={contractStyles.surface}>
        <SaluDecisionClient />
      </section>
    </main>
  );
}
