import MediaViewer from '@/app/media/[...path]/media-viewer';

export const dynamic = 'force-dynamic';

export default function PublicMediaPage() {
  return <MediaViewer />;
}
