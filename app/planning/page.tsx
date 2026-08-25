import type { Metadata } from 'next';
import FleetPlanningClient from './planning-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planering | Incheckad',
  description: 'Stationsanpassad vagnparksplanering för 166, 170 och 274',
};

export default function PlanningPage() {
  return <FleetPlanningClient />;
}
