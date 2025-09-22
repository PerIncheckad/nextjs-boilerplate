// /lib/notify.ts
/**
 * Enkel helper som väljer mottagare och anropar /api/notify.
 * Vi håller env-styrningen här för att slippa specialfall i UI.
 */

type Region = 'Syd' | 'Mitt' | 'Norr';
type Target = 'station' | 'quality';

const TEST_MAIL = process.env.NEXT_PUBLIC_TEST_MAIL || 'per@incheckad.se';
const BILKONTROLL_MAIL =
  process.env.NEXT_PUBLIC_BILKONTROLL_MAIL || TEST_MAIL;

const REGION_MAIL: Record<Region, string> = {
  Syd: process.env.NEXT_PUBLIC_MAIL_REGION_SYD || TEST_MAIL,
  Mitt: process.env.NEXT_PUBLIC_MAIL_REGION_MITT || TEST_MAIL,
  Norr: process.env.NEXT_PUBLIC_MAIL_REGION_NORR || TEST_MAIL,
};

function parseList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function recipientsFor(region: Region, target: Target): string[] {
  if (target === 'quality') return parseList(BILKONTROLL_MAIL);
  return parseList(REGION_MAIL[region]);
}

export async function notifyCheckin(args: {
  region: Region;
  subjectBase: string;
  htmlBody: string;
  target: Target; // 'station' eller 'quality'
}) {
  const to = recipientsFor(args.region, args.target);
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      region: args.region,
      subjectBase: args.subjectBase,
      htmlBody: args.htmlBody,
    }),
  });
  const json = await res.json();
  if (!res.ok || json?.ok === false) {
    // bubbla upp fel så UI kan visa kvittens
    throw new Error(
      `MAIL_${args.target.toUpperCase()}_FAILED: ${JSON.stringify(json)}`
    );
  }
  return json;
}

/** Minimal HTML – fyll på med det ni vill visa i mailet */
export function renderCheckinEmail(input: {
  regnr: string;
  station: string;
  region: Region;
}) {
  return `
    <p><b>Incheckning</b></p>
    <p>Reg.nr: <b>${input.regnr}</b><br/>
       Station: ${input.station}<br/>
       Region: ${input.region}</p>
  `;
}
