'use client';

import { useSearchParams } from 'next/navigation';
import FormClient from './form-client';

export default function NybilFormGate() {
  const searchParams = useSearchParams();
  const garageItemId = searchParams.get('garage_item_id')?.trim() || '';

  if (!garageItemId) {
    return (
      <div role="status" style={{ padding: '18px 20px', border: '1px solid #d7d7d7', borderRadius: 10, background: '#fff' }}>
        <strong>Välj först bilen under “Hämta bilen från Garaget”.</strong>
        <p style={{ margin: '7px 0 0', color: '#555' }}>
          Ny bil kan inte startas manuellt. Om bilen inte finns i Garage-listan ska Planering/Garaget redas ut innan mottagningen fortsätter.
        </p>
      </div>
    );
  }

  return <FormClient />;
}
