import type { KnowledgeId } from './registry-v1';

export type HelpbotCurrentnessState = 'PUBLICERBAR' | 'FAIL_CLOSED';

export type HelpbotCurrentnessDecision = Readonly<{
  knowledgeId: KnowledgeId;
  state: HelpbotCurrentnessState;
  reasonCode: string;
  reason: string;
  authorityReference: string;
  effectiveFrom: string;
  revisionReference: string;
}>;

const BLOCKS: Partial<Record<KnowledgeId, Omit<HelpbotCurrentnessDecision, 'knowledgeId'>>> = {
  'KR-SALU-001': {
    state: 'FAIL_CLOSED',
    reasonCode: 'SALU_V2_NOT_PUBLISHED_IN_REGISTRY_V1',
    reason: 'Registry V1 predates the later SALU V2 Production/Master contract. V1 may block this item but must not replace it with new SALU knowledge.',
    authorityReference: 'MASTER:2026-09-16:HELPBOT-RUNTIME-V1-BUILD-ORDER',
    effectiveFrom: '2026-09-16',
    revisionReference: 'KNOWLEDGE_REGISTRY_V1:2026-09-09 + CURRENT_MAIN:29af400d4633df97fe75305acf7e16cb2c63a58e',
  },
};

export function currentnessFor(knowledgeId: KnowledgeId): HelpbotCurrentnessDecision {
  const blocked = BLOCKS[knowledgeId];
  if (blocked) return { knowledgeId, ...blocked };

  return {
    knowledgeId,
    state: 'PUBLICERBAR',
    reasonCode: 'REGISTRY_V1_CURRENT_WITHIN_PUBLISHED_SCOPE',
    reason: 'No later V1 currentness block is registered for this knowledge item.',
    authorityReference: 'KNOWLEDGE_REGISTRY_V1:2026-09-09',
    effectiveFrom: '2026-09-09',
    revisionReference: 'KNOWLEDGE_REGISTRY_V1:2026-09-09',
  };
}
