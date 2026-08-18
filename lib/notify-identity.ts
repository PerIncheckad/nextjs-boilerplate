import type { VerifiedApiUser } from './server-auth';

type NotifyMeta = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function withVerifiedNotifyIdentity(
  rawMeta: unknown,
  user: VerifiedApiUser
): NotifyMeta {
  const meta: NotifyMeta =
    rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
      ? { ...(rawMeta as NotifyMeta) }
      : {};

  meta.verified_user_id = user.id;
  meta.user_email = user.email;
  meta.email = user.email;

  const receipt = meta.tankning_receipt;
  if (receipt && typeof receipt === 'object' && !Array.isArray(receipt)) {
    meta.tankning_receipt = {
      ...(receipt as NotifyMeta),
      uploaded_by_email: user.email,
    };
  }

  return meta;
}

export function getServerVerifiedCompletedBy(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const verifiedUserId = (payload as NotifyMeta).verified_user_id;
  return typeof verifiedUserId === 'string' && UUID_PATTERN.test(verifiedUserId)
    ? verifiedUserId
    : null;
}
