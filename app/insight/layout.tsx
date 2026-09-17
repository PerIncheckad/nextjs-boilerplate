import InsightAccessBoundary from '@/components/insight/InsightAccessBoundary';

export const dynamic = 'force-dynamic';

export default function InsightLayout({ children }: { children: React.ReactNode }) {
  return <InsightAccessBoundary>{children}</InsightAccessBoundary>;
}
