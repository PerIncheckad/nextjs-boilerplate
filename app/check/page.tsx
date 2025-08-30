// INTE 'use client' här – detta ska vara en server component
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// (valfritt extra skydd om du vill) export const fetchCache = 'force-no-store';

import FormClient from './form-client';

export default function CheckPage() {
  return <FormClient />;
}
