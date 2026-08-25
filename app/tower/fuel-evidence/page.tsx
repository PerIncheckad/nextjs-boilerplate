import type { Metadata } from 'next';
import FuelEvidenceClient from './fuel-evidence-client';

export const metadata: Metadata = {
  title: 'Tankningsevidens | Incheckad',
  description: 'Read-only uppföljning av tankningar och dokumenterade tankkvitton',
};

export const dynamic = 'force-dynamic';

export default function FuelEvidencePage() {
  return <FuelEvidenceClient />;
}
