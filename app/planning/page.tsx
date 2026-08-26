import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import FleetPlanningClient from './planning-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planering | Incheckad',
  description: 'Excel-lik vagnparksplanering med konfigurerbara stationer',
};

export default function PlanningPage() {
  return (
    <CoreProductShell
      active="planning"
      title="Planering"
      descriptor="VAGNPARK / FRAMTIDA INTENT / STATIONER"
      eyebrow="INVISTO CORE / FLEET PLANNING"
    >
      <FleetPlanningClient />
    </CoreProductShell>
  );
}
