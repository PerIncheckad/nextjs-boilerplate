import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import RentedInIntakePanel from './rented-in-intake-panel';
import RentedInReturnPanel from './rented-in-return-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'INHYRD | Incheckad',
  description: 'Operativ arbetsyta för externt inhyrda fordon',
};

const workspace: React.CSSProperties = { display: 'grid', gap: 18 };
const section: React.CSSProperties = { display: 'grid', gap: 8 };
const label: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, letterSpacing: '.04em', color: '#50565a' };

export default function RentedInPage() {
  return (
    <CoreProductShell
      active="inhyrd"
      title="INHYRD"
      descriptor="EXTERNT FORDON / INTAG / ÅTERLÄMNING"
      eyebrow="INVISTO CORE / RENTED-IN CONTROL"
    >
      <div style={workspace}>
        <section style={section}>
          <div style={label}><strong>01 / INHYRD IN</strong><span>Verifierat snabbintag från aktuell tidpunkt</span></div>
          <RentedInIntakePanel />
        </section>
        <section style={section}>
          <div style={label}><strong>02 / INHYRD UT</strong><span>Återlämning till extern part utan ordinarie AVVECKLA</span></div>
          <RentedInReturnPanel />
        </section>
      </div>
    </CoreProductShell>
  );
}
