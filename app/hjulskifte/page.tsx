import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import HjulskiftePanel from './hjulskifte-panel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Hjulskifte | Incheckad',
  description: 'Operativ arbetsyta för verifierade hjulskiften',
};

export default function HjulskiftePage() {
  return (
    <CoreProductShell
      active="hjulskifte"
      title="HJULSKIFTE"
      descriptor="BEHÖVER SKIFTE / BOKAD / KLAR"
      eyebrow="INVISTO CORE / HJULSKIFTE CONTROL"
    >
      <HjulskiftePanel />
    </CoreProductShell>
  );
}
