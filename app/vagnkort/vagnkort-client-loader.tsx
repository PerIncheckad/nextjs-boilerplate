'use client';

import dynamic from 'next/dynamic';

const ClientVagnkort = dynamic(() => import('./vagnkort-client'), {
  ssr: false,
  loading: () => null,
});

export default function VagnkortClient() {
  return <ClientVagnkort />;
}
