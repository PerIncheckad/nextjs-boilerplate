// app/check/page.tsx
import FormClient from './form-client';
import LoginGate from '@/components/LoginGate';

export default function Page() {
  return (
    <LoginGate>
      <FormClient />
    </LoginGate>
  );
}
