'use client';

import SaluOverview from './salu-overview';
import FleetPlanningClient from './planning-client';

export default function PlanningWorkspace() {
  return (
    <>
      <SaluOverview />
      <FleetPlanningClient />
    </>
  );
}
