// INTE 'use client' här – server component som bara renderar klientkomponenten
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import FormClient from './form-client';

export default function CheckPage() {
  return <FormClient />;
}

