import type { Metadata } from 'next';
import OperatorCockpit from './tower-client';
import TowerWheelChangePanel from './tower-wheel-change-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tower | Incheckad',
  description: 'Operativ arbetsyta för blockerade fordon, ansvar och nästa steg',
};

export default function TowerPage() {
  return (
    <>
      <OperatorCockpit />
      <TowerWheelChangePanel />
    </>
  );
}
