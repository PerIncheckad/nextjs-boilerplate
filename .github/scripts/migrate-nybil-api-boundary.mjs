import fs from 'node:fs';

const file = 'app/nybil/form-client.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(from, to);
}

replaceOnce(
  'nybil API import',
  "import { withNybilLegacyAliases } from '@/lib/nybil-aliases';",
  "import { withNybilLegacyAliases } from '@/lib/nybil-aliases';\nimport { checkNybilDuplicate, countNybilDuplicatesForDate, createNybilDamage, createNybilRegistration, updateNybilDuplicateGroup } from '@/lib/nybil-api-client';",
);

const duplicateStart = source.indexOf('  // Check for duplicate registrations\n');
const duplicateEnd = source.indexOf('  const handleRegisterClick = async () => {', duplicateStart);
if (duplicateStart < 0 || duplicateEnd < 0) throw new Error('duplicate-check block not found');
const duplicateBlock = `  // Check for duplicate registrations through the authenticated API boundary.\n  const checkForDuplicate = async (regnr: string) => {\n    const normalizedRegnr = regnr.toUpperCase().replace(/\\s/g, '');\n    console.log('Checking duplicate for:', normalizedRegnr);\n    return checkNybilDuplicate(normalizedRegnr);\n  };\n\n`;
source = source.slice(0, duplicateStart) + duplicateBlock + source.slice(duplicateEnd);

const folderStart = source.indexOf('      // Determine folder suffix for duplicates\n');
const folderEnd = source.indexOf("      console.log('Creating media folder", folderStart);
if (folderStart < 0 || folderEnd < 0) throw new Error('duplicate folder-count block not found');
const folderBlock = `      // Determine folder suffix for duplicates through the authenticated API boundary.\n      let folderSuffix = '';\n      if (isDuplicate) {\n        try {\n          const duplicateCount = await countNybilDuplicatesForDate(normalizedReg, now.toISOString().split('T')[0]);\n          folderSuffix = \`-DUBBLETT-\${duplicateCount}\`;\n        } catch (e) {\n          console.error('Error counting duplicates:', e);\n          folderSuffix = \`-DUBBLETT-\${Math.floor(now.getTime() / 1000)}\`;\n        }\n      }\n      \n`;
source = source.slice(0, folderStart) + folderBlock + source.slice(folderEnd);

replaceOnce(
  'saved Nybil id type',
  '      let savedNybilId: number | null = null;',
  '      let savedNybilId: string | number | null = null;',
);

const insertStart = source.indexOf("      console.log('Attempting to insert inventoryData:', inventoryData);\n");
const insertEnd = source.indexOf('      // If this is a duplicate, update the first registration to have the same duplicate_group_id\n', insertStart);
if (insertStart < 0 || insertEnd < 0) throw new Error('inventory insert block not found');
const insertBlock = `      console.log('Attempting to insert inventoryData:', inventoryData);\n      savedNybilId = await createNybilRegistration(inventoryData as Record<string, unknown>);\n      console.log('Saved nybil ID:', savedNybilId);\n      \n`;
source = source.slice(0, insertStart) + insertBlock + source.slice(insertEnd);

const updateStart = source.indexOf('      // If this is a duplicate, update the first registration to have the same duplicate_group_id\n');
const updateEnd = source.indexOf('      // Upload damage photos and save to damages table\n', updateStart);
if (updateStart < 0 || updateEnd < 0) throw new Error('duplicate update block not found');
const updateBlock = `      // If this is a duplicate, update the first registration to have the same duplicate_group_id.\n      if (isDuplicate && duplicateGroupId && duplicateInfo?.previousRegistration?.id) {\n        if (!duplicateInfo.previousRegistration.duplicate_group_id) {\n          try {\n            await updateNybilDuplicateGroup(duplicateInfo.previousRegistration.id, duplicateGroupId);\n            console.log('Updated first registration with duplicate_group_id:', duplicateGroupId);\n          } catch (updateError) {\n            console.error('Error updating first registration with duplicate_group_id:', updateError);\n          }\n        }\n      }\n      \n`;
source = source.slice(0, updateStart) + updateBlock + source.slice(updateEnd);

const damageStartMarker = '          // Save to damages table with correct column names matching schema\n';
let searchFrom = 0;
let replacedDamageInserts = 0;
while (true) {
  const damageStart = source.indexOf(damageStartMarker, searchFrom);
  if (damageStart < 0) break;
  const damageEnd = source.indexOf('        }\n      }\n      \n      // Send confirmation email notification\n', damageStart);
  if (damageEnd < 0) throw new Error('damage insert end not found');
  const existing = source.slice(damageStart, damageEnd);
  if (!existing.includes("supabase.from('damages').insert")) {
    searchFrom = damageStart + damageStartMarker.length;
    continue;
  }
  const replacement = `          // Save damage through the authenticated API boundary.\n          try {\n            await createNybilDamage({\n              regnr: normalizedReg,\n              damage_date: now.toISOString().split('T')[0],\n              damage_type: damage.damageType,\n              damage_type_raw: damage.damageType,\n              user_type: damage.damageType,\n              description: damage.comment || null,\n              inchecker_name: fullName,\n              status: 'complete',\n              uploads: {\n                photo_urls: damagePhotoUrls,\n                video_urls: [],\n                folder: skadaFolder\n              },\n              user_positions: damage.positions.map(pos => ({\n                carPart: pos.carPart,\n                position: pos.position\n              })),\n              source: 'NYBIL',\n              nybil_inventering_id: savedNybilId,\n              created_at: now.toISOString()\n            });\n          } catch (damageError) {\n            console.error('Error saving damage:', damageError);\n          }\n`;
  source = source.slice(0, damageStart) + replacement + source.slice(damageEnd);
  replacedDamageInserts += 1;
  searchFrom = damageStart + replacement.length;
}
if (replacedDamageInserts !== 1) throw new Error(`damage insert blocks: expected 1, found ${replacedDamageInserts}`);

const appDataCalls = [...source.matchAll(/\bsupabase\s*\.from\s*\(/g)];
if (appDataCalls.length > 0) {
  const lines = appDataCalls.map(match => source.slice(0, match.index).split('\n').length);
  throw new Error(`Direct Nybil app-data Supabase calls remain at lines: ${lines.join(', ')}`);
}
if (!source.includes('supabase.storage.from(')) throw new Error('Intentional browser storage flow disappeared');
if (!source.includes('checkNybilDuplicate(')) throw new Error('Nybil duplicate API helper not wired');
if (!source.includes('createNybilRegistration(')) throw new Error('Nybil registration API helper not wired');
if (!source.includes('createNybilDamage(')) throw new Error('Nybil damage API helper not wired');

fs.writeFileSync(file, source);
console.log('Migrated Nybil app-data access behind authenticated APIs; browser storage retained.');
