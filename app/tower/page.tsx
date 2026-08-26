import type { Metadata } from 'next';
import OperatorCockpit from './tower-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tower | Incheckad',
  description: 'Operativt kontrollrum för blockerade fordon, ansvar och nästa steg',
};

export default function TowerPage() {
  return <OperatorCockpit />;
}
