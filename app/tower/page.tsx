import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import TowerInvistoV2 from './tower-invisto-v2';

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
      <TowerInvistoV2 />
    </CoreProductShell>
  );
}