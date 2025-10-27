import LoginGate from '@/components/LoginGate';
import MediaViewer from './media-viewer';

export const dynamic = 'force-dynamic';

export default function MediaPage() {
  return (
    <LoginGate>
      <MediaViewer />
    </LoginGate>
  );
}
