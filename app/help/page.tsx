import type { Metadata } from 'next';
import CoreProductShell from '@/components/CoreProductShell';
import HelpClient from './help-client';

export const metadata: Metadata = {
  title: 'Hjälp | INCHECKAD',
  description: 'Intern verifierad hjälp från Knowledge Registry V1',
};

export default function HelpPage() {
  return (
    <CoreProductShell
      active="help"
      title="Hjälp"
      descriptor="Verifierad intern vägledning från current publicerbar knowledge. Inga actions."
      eyebrow="INCHECKAD / HJÄLP-AI V1"
    >
      <HelpClient />
    </CoreProductShell>
  );
}
