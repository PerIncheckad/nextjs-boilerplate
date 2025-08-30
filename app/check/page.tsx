'use client';

// Tvinga helt dynamisk client-render (ingen prerender/SSR)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import FormClient from './form-client';

export default function CheckPage() {
  return <FormClient />;
}
