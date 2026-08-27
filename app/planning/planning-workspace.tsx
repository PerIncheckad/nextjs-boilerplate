'use client';

import { useState } from 'react';
import SaluOverview from './salu-overview';
import FleetPlanningClient from './planning-client';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

export default function PlanningWorkspace() {
  const [period, setPeriod] = useState(currentPeriod);

  return (
    <>
      <SaluOverview period={period} onPeriodChange={setPeriod} />
      <FleetPlanningClient selectedPeriod={period} onPeriodChange={setPeriod} />
    </>
  );
}
