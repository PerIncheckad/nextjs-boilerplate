import type { Metadata } from 'next';
import FleetPlanningClient from './planning-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planering | Incheckad',
  description: 'Excel-lik vagnparksplanering med konfigurerbara stationer',
};

export default function PlanningPage() {
  return <FleetPlanningClient />;
}
