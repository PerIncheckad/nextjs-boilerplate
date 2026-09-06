import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import AvvecklaPanel from './avveckla-panel';
import AvvecklaTransportBookingPanel from './avveckla-transport-booking-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AVVECKLA | Incheckad',
  description: 'Operativ arbetsyta för verifierad avveckling fram till UT',
};

export default function AvvecklaPage() {
  return (
    <CoreProductShell
      active="avveckla"
      title="AVVECKLA"
      descriptor="CASE / PUNKTER / TRANSPORT / VERIFIERAT UT"
      eyebrow="INVISTO CORE / AVVECKLA CONTROL"
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <AvvecklaPanel />
        <AvvecklaTransportBookingPanel />
      </div>
    </CoreProductShell>
  );
}
