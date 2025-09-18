// app/check/page.tsx
import FormClient from './form-client';
import LoginGate from '@/components/LoginGate';
const showTestButtons = (process.env.NEXT_PUBLIC_SHOW_TEST_BUTTONS ?? 'false') === 'true';

export default function Page() {
  return (
    <LoginGate>
<FormClient showTestButtons={showTestButtons} />
    </LoginGate>
  );
}
