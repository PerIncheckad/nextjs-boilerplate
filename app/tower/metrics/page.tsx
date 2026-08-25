import type { Metadata } from 'next';
import OperatorMetrics from './metrics-client';

export const metadata: Metadata = {
  title: 'Driftmätning | Incheckad',
  description: 'Read-only driftmätning från verifierad operativ evidens',
};

export default function OperatorMetricsPage() {
  return <OperatorMetrics />;
}
