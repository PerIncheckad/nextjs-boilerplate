import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import OperatorCockpit from './tower-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tower | Incheckad',
  description: 'Operativt kontrollrum för blockerade fordon, ansvar och nästa steg',
};

export default function TowerPage() {
  return (
    <CoreProductShell
      active="tower"
      title="Tower"
      descriptor="UPPMÄRKSAMHET / ANSVAR / DEADLINE / BEVIS"
      eyebrow="INVISTO CORE / OPERATIONAL CONTROL"
    >
      <OperatorCockpit />
    </CoreProductShell>
  );
}
