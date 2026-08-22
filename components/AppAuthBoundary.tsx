'use client';

import { usePathname } from 'next/navigation';
import LoginGate from '@/components/LoginGate';
import { isPublicAppPath } from '@/lib/app-access';

type Props = { children: React.ReactNode };

export default function AppAuthBoundary({ children }: Props) {
  const pathname = usePathname();

  if (isPublicAppPath(pathname)) {
    return <>{children}</>;
  }

  return <LoginGate>{children}</LoginGate>;
}
