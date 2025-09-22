// Enkelt anrop till vårt API som skickar två testmejl till Per
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

/**
 * Kompatibilitets-wrapper för gammal kod.
 * Tar *vilket objekt som helst* och skickar ett testmejl till Per.
 * Om din gamla kod skickar in recipients/payload så ignorerar vi
 * det mesta och använder ämne + enkel html.
 */
export async function notifyCheckin(input: any) {
  const subject = input?.subjectBase || input?.subject || 'Incheckning';
  const reg = input?.regnr || input?.payload?.regnr || '';
  const region =
    input?.region === 'Mitt' || input?.region === 'Norr' ? input.region : 'Syd';
  const html =
    input?.htmlBody ||
    `<p>Automatiskt testmeddelande.</p><p>Reg.nr: <b>${reg || 'okänt'}</b></p>`;

  return sendTestEmails({
    to: TEST_MAIL, // <= använd env-variabeln du redan har
    region,
    subjectBase: reg ? `${subject} ${reg}` : subject,
    htmlBody: html,
  });
}
