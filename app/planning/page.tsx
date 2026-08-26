import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import FleetPlanningClient from './planning-client';
import SaluOverview from './salu-overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planering | Incheckad',
  description: 'Vagnparksplanering med SALU-beslutsstöd och stationsmatris',
};

export default function PlanningPage() {
  return (
    <CoreProductShell
      active="planning"
      title="Planering"
      descriptor="VAGNPARK / FRAMTIDA INTENT / STATIONER"
      eyebrow="INVISTO CORE / FLEET PLANNING"
    >
      <SaluOverview />
      <FleetPlanningClient />
    </CoreProductShell>
  );
}
