export async function sendTestEmails(args: {
  region?: 'Syd' | 'Mitt' | 'Norr';
  to?: string;
  subjectBase?: string;
  htmlBody?: string;
}) {
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });
  if (!res.ok) throw new Error('Failed to send emails');
  return res.json();
}
