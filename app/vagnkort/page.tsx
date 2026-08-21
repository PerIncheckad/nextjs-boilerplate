import type { Metadata } from 'next';
import LoginGate from '@/components/LoginGate';
import VagnkortClient from './vagnkort-client';
import OperationalStateBanner from './operational-state-banner';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vagnkort | Incheckad',
  description: 'Bilens digitala pärm, status och resa',
};

export default function VagnkortPage() {
  return (
    <LoginGate>
      <OperationalStateBanner />
      <VagnkortClient />
    </LoginGate>
  );
}
