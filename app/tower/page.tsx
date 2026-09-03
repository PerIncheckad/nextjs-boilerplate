import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import TowerCockpitV2 from './tower-cockpit-v2';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tower | Incheckad',
  description: 'Operativ helhetsbild av verksamheten just nu.',
};

export default function TowerPage() {
  return (
    <CoreProductShell
      active="tower"
      title="Tower"
      descriptor="VERKSAMHETEN JUST NU"
      eyebrow="INCHECKAD / TOWER"
    >
      <TowerCockpitV2 />
    </CoreProductShell>
  );
}