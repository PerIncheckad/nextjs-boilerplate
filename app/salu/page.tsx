import type { Metadata } from 'next';
import SaluDecisionClient from './salu-decision-client';
import styles from './salu.module.css';

export const metadata: Metadata = {
  title: 'SALU | INCHECKAD',
  description: 'Samlad beslutsvy för SALU',
};

export default function SaluPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SALU / BESLUT</span>
          <h1>En bil. Ett beslut.</h1>
          <p>Öppna bilen, se verkliga blockerare och fatta slutbeslut. Processövergångarna hanteras av systemet.</p>
        </div>
        <a href="/" className={styles.back}>Till startsidan</a>
      </header>
      <SaluDecisionClient />
    </main>
  );
}
