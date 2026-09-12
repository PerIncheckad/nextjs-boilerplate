import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import RentedInIntakePanel from './rented-in-intake-panel';
import RentedInReturnPanel from './rented-in-return-panel';
import styles from './inhyrd.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'INHYRD | Incheckad',
  description: 'Operativ arbetsyta för externt inhyrda fordon',
};

export default function RentedInPage() {
  return (
    <CoreProductShell
      active="inhyrd"
      title="INHYRD"
      descriptor="EXTERNT FORDON / INTAG / ÅTERLÄMNING"
      eyebrow="INVISTO CORE / RENTED-IN CONTROL"
    >
      <div className={styles.workspace}>
        <section className={styles.section}>
          <div className={styles.label}><strong>01 / INHYRD IN</strong><span>Verifierat snabbintag från aktuell tidpunkt</span></div>
          <RentedInIntakePanel />
        </section>
        <section className={styles.section}>
          <div className={styles.label}><strong>02 / INHYRD UT</strong><span>Återlämning till extern part utan ordinarie AVVECKLA</span></div>
          <RentedInReturnPanel />
        </section>
      </div>
    </CoreProductShell>
  );
}
