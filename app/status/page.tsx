// app/status/page.tsx
import LoginGate from '@/components/LoginGate';
import FormClient from './form-client';

export const dynamic = 'force-dynamic';

export default function StatusPage() {
  return (
    <LoginGate>
      <FormClient />
    </LoginGate>
  );
}
