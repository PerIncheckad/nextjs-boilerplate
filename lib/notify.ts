// lib/notify.ts
export type NotifyPayload = {
  regnr: string;
  region?: 'NORR' | 'MITT' | 'SYD';
  station?: string;
  time?: string;                   // t.ex. "14:35"
  hasNewDamages?: boolean;         // true = nya skador finns
  needsRecond?: boolean;           // true = behöver rekond
  recipients?: string[];           // valfritt; default blir din testmail
};

export async function notifyCheckin(p: NotifyPayload) {
  const subject =
    `Incheckning ${p.regnr}` +
    (p.station ? ` – ${p.station}` : '') +
    (p.time ? ` – ${p.time}` : '');

  const lines = [
    `<strong>REG.NR:</strong> ${p.regnr}`,
    p.region ? `Region: ${p.region}` : '',
    p.station ? `Station: ${p.station}` : '',
    p.time ? `Tid: ${p.time}` : '',
    p.hasNewDamages ? '⚠️ Nya skador: JA' : 'Nya skador: NEJ',
    p.needsRecond ? '⚠️ Behöver rekond: JA' : 'Behöver rekond: NEJ',
  ].filter(Boolean);

  const html = `
    <div style="font-family:sans-serif;line-height:1.6">
      <h2>${subject}</h2>
      <p>${lines.join('<br/>')}</p>
    </div>
  `.trim();

  const to = p.recipients ?? [process.env.NEXT_PUBLIC_TEST_MAIL ?? 'per.andersson@mabi.se'];

  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, subject, html }),
  });

  return res.json();
}
