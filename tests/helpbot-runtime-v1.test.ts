import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerHelpbotQuestion } from '../lib/helpbot/runtime';
import { currentnessFor } from '../lib/helpbot/currentness';
import {
  KNOWLEDGE_REGISTRY_V1,
  KNOWLEDGE_REGISTRY_V1_ID_SET,
  registryItemById,
} from '../lib/helpbot/registry-v1';
import { POST as helpbotPOST } from '../app/api/helpbot/query/route';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const EXPECTED_IDS = [
  'KR-GUIDE-001',
  'KR-PLAN-001',
  'KR-GAR-001',
  'KR-NYB-001',
  'KR-CHECK-001',
  'KR-STATUS-001',
  'KR-STATUS-002',
  'KR-SALU-001',
  'KR-AVV-001',
  'KR-AVV-002',
  'KR-INH-001',
  'KR-ORDER-001',
  'KR-ORDER-002',
  'KR-HIST-604-PRE',
] as const;

const EXPECTED_REGISTRY_FINGERPRINT = '223466c7f8fdadaf322a6c7bc7b7303bf7b5d83a36afec96790cfd483ff172d9';

function registryFingerprint(): string {
  const payload = KNOWLEDGE_REGISTRY_V1.map((item) => [
    item.knowledgeId,
    item.topicModule,
    item.sourceOwner,
    item.sourcePrecedence,
    item.authorityReference,
    item.sourceReference,
    item.validFrom,
    item.validTo,
    item.status,
    item.supersedes,
    item.supersededBy,
    item.audienceRole,
    item.answerPolicy,
    item.requiredContext,
    item.canonicalFact,
    item.canonicalHelpText,
    item.prohibitedClaims,
  ]);
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

test('Knowledge Registry V1 exact 14-item baseline and text/policy fingerprint stay locked', () => {
  assert.deepEqual(KNOWLEDGE_REGISTRY_V1_ID_SET, EXPECTED_IDS);
  assert.equal(KNOWLEDGE_REGISTRY_V1.length, 14);
  assert.equal(registryFingerprint(), EXPECTED_REGISTRY_FINGERPRINT);
  assert.equal(registryItemById('KR-SALU-001')?.supersedes, 'NONE');
  assert.equal(registryItemById('KR-HIST-604-PRE')?.supersededBy, 'KR-AVV-001');
  assert.equal(registryItemById('KR-ORDER-002')?.status, 'ACTIVE_DENIAL_RULE');
  assert.equal(registryItemById('KR-ORDER-002')?.answerPolicy, 'DENIED');
});

test('currentness is block-only and SALU V1 is fail-closed after later SALU V2 decisions', () => {
  const source = read('lib/helpbot/currentness.ts');
  assert.equal(currentnessFor('KR-SALU-001').state, 'FAIL_CLOSED');
  assert.equal(currentnessFor('KR-GAR-001').state, 'PUBLICERBAR');
  assert.doesNotMatch(source, /canonicalFact|canonicalHelpText|canonical_fact|canonical_help_text/);
  assert.doesNotMatch(source, /SISTA INCHECKNING.*BUHS.*AVVECKLA/i);
});

test('Garage regnr acceptance question answers only from KR-GAR-001', () => {
  const result = answerHelpbotQuestion('måste en Garage-post ha regnr?');
  assert.equal(result.outcome, 'ANSWER');
  assert.deepEqual(result.knowledgeIds, ['KR-GAR-001']);
  assert.equal(result.answer, registryItemById('KR-GAR-001')?.canonicalHelpText);
});

test('Check-in AVAILABLE acceptance question answers only from KR-CHECK-001', () => {
  const result = answerHelpbotQuestion('Är Check-in klar samma sak som AVAILABLE?');
  assert.equal(result.outcome, 'ANSWER');
  assert.deepEqual(result.knowledgeIds, ['KR-CHECK-001']);
  assert.equal(result.answer, registryItemById('KR-CHECK-001')?.canonicalHelpText);
});

test('active DENIED rule is enforced and never leaks canonical_fact', () => {
  const denied = registryItemById('KR-ORDER-002');
  assert.ok(denied);
  const result = answerHelpbotQuestion('Har vi state machine BESTÄLLD → BEKRÄFTAD → PÅ VÄG?');
  assert.equal(result.outcome, 'DENIED');
  assert.deepEqual(result.knowledgeIds, ['KR-ORDER-002']);
  assert.equal(result.answer, undefined);
  assert.equal(JSON.stringify(result).includes(denied.canonicalFact), false);
});

test('superseded pre-604 knowledge can never answer current', () => {
  const result = answerHelpbotQuestion('Vilka gamla gap hade vi pre-604?');
  assert.equal(result.outcome, 'STALE');
  assert.deepEqual(result.knowledgeIds, ['KR-HIST-604-PRE']);
  assert.equal(result.answer, undefined);
});

test('required_context fails closed until explicit context is supplied', () => {
  const missing = answerHelpbotQuestion('Vad gör jag nu?');
  assert.equal(missing.outcome, 'REQUIRES_CONTEXT');
  assert.deepEqual(missing.requiresContext, ['process_type OR equivalent minimum routing context']);

  const supplied = answerHelpbotQuestion('Vad gör jag nu?', { processType: 'garage' });
  assert.equal(supplied.outcome, 'ANSWER');
  assert.deepEqual(supplied.knowledgeIds, ['KR-GUIDE-001']);
});

test('SALU V2 acceptance question fails closed and is not reconstructed from AVVECKLA or Production', () => {
  const result = answerHelpbotQuestion('hur går SALU V2 från SISTA INCHECKNING via BUHS till AVVECKLA?');
  assert.equal(result.outcome, 'STALE');
  assert.deepEqual(result.knowledgeIds, ['KR-SALU-001']);
  assert.equal(result.answer, undefined);
  assert.equal(result.message, 'Detta kan jag inte verifiera från current knowledge.');
});

test('unknown question and ambiguous multi-match both fail closed', () => {
  const unknown = answerHelpbotQuestion('Hur fungerar månens faser?');
  assert.equal(unknown.outcome, 'NO_VERIFIED_MATCH');
  assert.equal(unknown.reasonCode, 'NO_VERIFIED_MATCH');

  const ambiguous = answerHelpbotQuestion('måste en Garage-post ha regnr och är Check-in klar samma sak som AVAILABLE?');
  assert.equal(ambiguous.outcome, 'NO_VERIFIED_MATCH');
  assert.equal(ambiguous.reasonCode, 'AMBIGUOUS_MULTI_MATCH');
  assert.equal(ambiguous.knowledgeIds.length, 2);
});

test('HelpBot API requires existing auth and contains no knowledge DB or AI fallback', async () => {
  const response = await helpbotPOST(new Request('http://localhost/api/helpbot/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'måste en Garage-post ha regnr?' }),
  }));
  assert.equal(response.status, 401);

  const route = read('app/api/helpbot/query/route.ts');
  const runtime = read('lib/helpbot/runtime.ts');
  const matcher = read('lib/helpbot/matcher.ts');
  const combined = `${route}\n${runtime}\n${matcher}`;
  assert.match(route, /verifyApiUser\(request\)/);
  assert.doesNotMatch(combined, /createClient|SUPABASE_SERVICE_ROLE_KEY|\.from\(|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(combined, /\b(?:openai|anthropic|embedding|vector|rag)\b|ai sdk/i);
  assert.doesNotMatch(combined, /fetch\s*\(/);
});

test('HJÄLP is support/utility navigation, never an OPERATIV process object', () => {
  const support = read('components/product-navigation-contract.ts');
  const operationalContract = read('components/operational-navigation-contract.ts');
  const operationalNavigation = read('components/OperationalNavigation.tsx');
  assert.match(support, /href:\s*['"]\/help['"],\s*label:\s*['"]HJÄLP['"],\s*key:\s*['"]help['"]/);
  assert.doesNotMatch(operationalContract, /\/help|HJÄLP|help/);
  assert.match(operationalNavigation, /aria-label="Stöd"/);
  assert.match(operationalNavigation, /href="\/help">HJÄLP/);
});
