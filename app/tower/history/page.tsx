import type { Metadata } from 'next';
import OperatorHistory from './history-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Drifthistorik | Incheckad',
  description: 'Read-only historik över verifierade operativa händelser',
};

export default function OperatorHistoryPage() {
  return <OperatorHistory />;
}
