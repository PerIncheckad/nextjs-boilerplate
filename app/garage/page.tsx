import type { Metadata } from 'next';
import GarageClient from './garage-client';
import GarageV2Panel from './garage-v2-panel';
import GarageWheelChangePanel from './garage-wheel-change-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Garaget | Incheckad',
  description: 'BK:s arbetsyta för planerade, beställda och omplanerade bilar',
};

export default function GaragePage() {
  return (
    <>
      <GarageV2Panel />
      <GarageWheelChangePanel />
      <GarageClient />
    </>
  );
}
