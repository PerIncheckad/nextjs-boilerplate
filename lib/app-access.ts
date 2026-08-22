export function isPublicAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === '/public-media' || pathname.startsWith('/public-media/');
}
