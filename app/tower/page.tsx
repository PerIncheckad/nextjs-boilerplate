import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import TowerCockpitV2 from './tower-cockpit-v2';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tower | Incheckad',
  description: 'Operativ helhetsbild av verksamheten med nedborrning till rätt process.',
};

export default function TowerPage() {
  return (
    <CoreProductShell
      active="tower"
      title="Tower"
      descriptor="HELHET / STATUS / PROCESS / UPPMÄRKSAMHET"
      eyebrow="INCHECKAD / OPERATIONAL COCKPIT"
    >
      <TowerCockpitV2 />
    </CoreProductShell>
  );
}
