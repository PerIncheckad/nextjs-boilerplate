// lib/notify.ts
export type NotifyTarget = 'quality' | 'station';

export async function notifyCheckin(params: {
  region: 'Syd' | 'Mitt' | 'Norr';
  subjectBase: string;
  htmlBody: string;
  target: NotifyTarget;
  meta?: Record<string, any>;
}) {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    console.error('notifyCheckin error:', e);
    return { ok: false, error: String(e) };
  }
}
