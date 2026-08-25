// app/nybil/page.tsx
import FormClient from './form-client';
import GarageNybilPrefillBridge from './garage-prefill-bridge';

export const dynamic = 'force-dynamic';

export default function NybilPage() {
  return (
    <>
      <GarageNybilPrefillBridge />
      <FormClient />
    </>
  );
}
