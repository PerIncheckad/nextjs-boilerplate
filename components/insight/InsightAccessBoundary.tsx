'use client';

import { useEffect, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';

export default function InsightAccessBoundary({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'denied' | 'ok'>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await authenticatedApiFetch('/api/insight/access');
        if (!cancelled) setState(response.ok ? 'ok' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') return <main><p>Kontrollerar INSIGHT-åtkomst…</p></main>;
  if (state === 'denied') return <main><h1>Åtkomst nekad.</h1><p>Kontot saknar giltigt INSIGHT-mandat.</p></main>;
  return <>{children}</>;
}
