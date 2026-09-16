'use client';

import { useEffect, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';

type Props = { children: React.ReactNode };

export default function InsightAccessBoundary({ children }: Props) {
  const [state, setState] = useState<'checking' | 'denied' | 'ok'>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await authenticatedApiFetch('/api/insight/access');
        if (cancelled) return;
        setState(response.ok ? 'ok' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ letterSpacing: '0.12em', fontSize: 12 }}>INSIGHT · ACCESS</p>
        <h1 style={{ marginTop: 8 }}>Kontrollerar åtkomst.</h1>
      </main>
    );
  }

  if (state === 'denied') {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ letterSpacing: '0.12em', fontSize: 12 }}>INSIGHT · ACCESS</p>
        <h1 style={{ marginTop: 8 }}>Åtkomst nekad.</h1>
        <p>Kontot saknar giltigt GLOBAL ACCESS_INSIGHT-mandat.</p>
      </main>
    );
  }

  return <>{children}</>;
}
