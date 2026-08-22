import fs from 'node:fs';

const path = 'lib/vehicle-status.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce(
  'supabase import',
  "import { supabase } from './supabase';",
  "import { fetchStatusReadModelSourceData } from './status-read-model-source';",
);

const fetchStart = '  // Fetch data from all sources concurrently\n';
const fetchEnd = '  // Bygg Map<damage_id, DamageComment[]> — newest-first (data sorterad desc ovan)\n';
const startIndex = source.indexOf(fetchStart);
const endIndex = source.indexOf(fetchEnd);
if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
  throw new Error('Could not locate initial Status data fetch block');
}

const sourceFetch = `  // Read all Status raw data through the authenticated same-origin API boundary.\n  const sourceData = await fetchStatusReadModelSourceData(cleanedRegnr);\n  const vehicleEditsData = sourceData.vehicleEdits as any[];\n  const nybilData = sourceData.nybil as NybilInventeringData | null;\n  const vehicleData = (sourceData.vehicle[0] || null) as any;\n  const damages = sourceData.damages as any[];\n  const legacyDamages = sourceData.legacyDamages as LegacyDamage[];\n  const checkins = sourceData.checkins as any[];\n  const arrivals = sourceData.arrivals as any[];\n  const damageCommentsData: DamageComment[] = sourceData.damageComments.map((dc: any) => ({\n    id: dc.id,\n    damage_id: dc.damage_id,\n    comment: dc.comment,\n    created_by: dc.created_by,\n    created_at: dc.created_at,\n  }));\n  const allCheckinDamages: CheckinDamageData[] = sourceData.checkinDamages\n    .map((cd: any) => cd as CheckinDamageData)\n    .filter(cd =>\n      cd.type === 'documented' || cd.type === 'not_found' || cd.type === 'existing' || cd.type === 'new'\n    );\n\n`;
source = source.slice(0, startIndex) + sourceFetch + source.slice(endIndex);

replaceOnce(
  'duplicate source locals',
  `  const vehicleData = vehicleResponse.data?.[0] || null;\n  const damages = damagesResponse.data || [];\n  const legacyDamages = legacyDamagesResponse.data || [];\n  const checkins = checkinsResponse.data || [];\n  const arrivals = arrivalsResponse.data || [];\n\n`,
  '',
);

const checkinFetchStart = '  // Fetch all checkin_damages for this regnr via server-side API\n';
const checkinFetchEnd = '  // Get saludatum from legacy damages if available\n';
const checkinStartIndex = source.indexOf(checkinFetchStart);
const checkinEndIndex = source.indexOf(checkinFetchEnd);
if (checkinStartIndex === -1 || checkinEndIndex === -1 || checkinEndIndex <= checkinStartIndex) {
  throw new Error('Could not locate checkin damage API block');
}
source = source.slice(0, checkinStartIndex)
  + '  const checkinIds = checkins.map(c => c.id).filter(Boolean);\n  \n'
  + source.slice(checkinEndIndex);

const oldDamageCountBlock = `  if (checkinIds.length > 0) {\n    const { data: damageData } = await supabase\n      .from('checkin_damages')\n      .select('checkin_id')\n      .in('checkin_id', checkinIds)\n      .eq('type', 'new');\n    \n    if (damageData) {\n      for (const damage of damageData) {\n        const count = damageCounts.get(damage.checkin_id) || 0;\n        damageCounts.set(damage.checkin_id, count + 1);\n      }\n    }\n  }`;
const newDamageCountBlock = `  if (checkinIds.length > 0) {\n    for (const damage of allCheckinDamages) {\n      if (damage.type !== 'new' || !damage.checkin_id || !checkinIds.includes(damage.checkin_id)) continue;\n      const count = damageCounts.get(damage.checkin_id) || 0;\n      damageCounts.set(damage.checkin_id, count + 1);\n    }\n  }`;
const countMatches = source.split(oldDamageCountBlock).length - 1;
if (countMatches !== 2) {
  throw new Error(`damage count blocks: expected 2 matches, found ${countMatches}`);
}
source = source.split(oldDamageCountBlock).join(newDamageCountBlock);

if (source.includes("from './supabase'")) throw new Error('Supabase import remains');
if (/\bsupabase\s*\.(from|rpc)\s*\(/.test(source)) throw new Error('Direct Supabase access remains');
if (!source.includes('fetchStatusReadModelSourceData(cleanedRegnr)')) throw new Error('Adapter not wired');

fs.writeFileSync(path, source);
console.log('Migrated lib/vehicle-status.ts to authenticated Status read-model source.');
// Trigger commit after workflow registration.
