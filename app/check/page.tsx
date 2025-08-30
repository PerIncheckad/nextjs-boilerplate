// app/check/page.tsx
export const dynamic = 'force-dynamic';   // inga prebuild-försök
export const revalidate = 0;

import FormClient from './form-client';

export default function Page() {
  return <FormClient />;
}
