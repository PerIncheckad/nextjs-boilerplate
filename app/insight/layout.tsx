import type { Metadata } from 'next';
import InsightAccessBoundary from '@/components/insight/InsightAccessBoundary';

export const metadata: Metadata = {
  title: 'Insight | Incheckad',
  description: 'Verifierad analys med spårbarhet till källa.',
};

export default function InsightLayout({ children }: { children: React.ReactNode }) {
  return <InsightAccessBoundary>{children}</InsightAccessBoundary>;
}
