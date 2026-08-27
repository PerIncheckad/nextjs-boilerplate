import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import PlanningWorkspace from './planning-workspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planering | Incheckad',
  description: 'Vagnparksplanering med SALU-beslutsstöd och konfigurerbara stationer',
};

export default function PlanningPage() {
  return (
    <CoreProductShell
      active="planning"
      title="Planering"
      descriptor="VAGNPARK / FRAMTIDA INTENT / STATIONER"
      eyebrow="INVISTO CORE / FLEET PLANNING"
    >
      <PlanningWorkspace />
    </CoreProductShell>
  );
}
