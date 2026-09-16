import { currentnessFor } from './currentness';
import { matchKnowledgeIds, type HelpbotRoutingContext } from './matcher';
import {
  REGISTRY_V1_ARTIFACT_PROVENANCE,
  REGISTRY_V1_REVISION,
  registryItemById,
  type HelpbotAnswerPolicy,
  type HelpbotRegistryItem,
  type KnowledgeId,
} from './registry-v1';

export type HelpbotOutcome = 'ANSWER' | 'DENIED' | 'REQUIRES_CONTEXT' | 'STALE' | 'NO_VERIFIED_MATCH';

export type HelpbotEvidence = Readonly<{
  knowledgeId: KnowledgeId;
  registryRevision: typeof REGISTRY_V1_REVISION;
  artifactProvenance: typeof REGISTRY_V1_ARTIFACT_PROVENANCE;
  authorityReference: string;
  sourceReference: string;
  registryStatus: string;
  validFrom: string;
  validTo: string;
}>;

export type HelpbotResponse = Readonly<{
  outcome: HelpbotOutcome;
  answer?: string;
  policy?: HelpbotAnswerPolicy;
  knowledgeIds: readonly KnowledgeId[];
  evidence: readonly HelpbotEvidence[];
  requiresContext: readonly string[];
  reasonCode: string;
  message: string;
}>;

const FAIL_CLOSED_MESSAGE = 'Detta kan jag inte verifiera från current knowledge.';

function evidenceFor(item: HelpbotRegistryItem): HelpbotEvidence {
  return {
    knowledgeId: item.knowledgeId as KnowledgeId,
    registryRevision: REGISTRY_V1_REVISION,
    artifactProvenance: REGISTRY_V1_ARTIFACT_PROVENANCE,
    authorityReference: item.authorityReference,
    sourceReference: item.sourceReference,
    registryStatus: item.status,
    validFrom: item.validFrom,
    validTo: item.validTo,
  };
}

function contextRequirementSatisfied(item: HelpbotRegistryItem, context?: HelpbotRoutingContext): boolean {
  if (item.requiredContext === 'NONE') return true;
  if (item.knowledgeId === 'KR-GUIDE-001') return Boolean(context?.processType?.trim());
  if (item.knowledgeId === 'KR-INH-001') {
    const flow = context?.flow?.trim().toLocaleLowerCase('sv-SE');
    return flow === 'intag' || flow === 'retur';
  }
  return false;
}

export function answerHelpbotQuestion(question: string, context?: HelpbotRoutingContext): HelpbotResponse {
  const candidateIds = matchKnowledgeIds(question);

  if (candidateIds.length === 0) {
    return {
      outcome: 'NO_VERIFIED_MATCH',
      knowledgeIds: [],
      evidence: [],
      requiresContext: [],
      reasonCode: 'NO_VERIFIED_MATCH',
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  if (candidateIds.length > 1) {
    return {
      outcome: 'NO_VERIFIED_MATCH',
      knowledgeIds: candidateIds,
      evidence: [],
      requiresContext: [],
      reasonCode: 'AMBIGUOUS_MULTI_MATCH',
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  const knowledgeId = candidateIds[0];
  const item = registryItemById(knowledgeId);
  if (!item) {
    return {
      outcome: 'NO_VERIFIED_MATCH',
      knowledgeIds: [],
      evidence: [],
      requiresContext: [],
      reasonCode: 'REGISTRY_ITEM_NOT_FOUND',
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  const evidence = [evidenceFor(item)];
  const currentness = currentnessFor(knowledgeId);
  if (currentness.state === 'FAIL_CLOSED') {
    return {
      outcome: 'STALE',
      policy: item.answerPolicy,
      knowledgeIds: [knowledgeId],
      evidence,
      requiresContext: [],
      reasonCode: currentness.reasonCode,
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  if (item.status === 'SUPERSEDED' || item.validTo !== 'OPEN' || item.audienceRole === 'AI_NONE') {
    return {
      outcome: 'STALE',
      policy: item.answerPolicy,
      knowledgeIds: [knowledgeId],
      evidence,
      requiresContext: [],
      reasonCode: 'REGISTRY_ITEM_NOT_CURRENT',
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  if (item.answerPolicy === 'DENIED') {
    return {
      outcome: 'DENIED',
      policy: item.answerPolicy,
      knowledgeIds: [knowledgeId],
      evidence,
      requiresContext: [],
      reasonCode: 'ANSWER_POLICY_DENIED',
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  if (!contextRequirementSatisfied(item, context)) {
    return {
      outcome: 'REQUIRES_CONTEXT',
      policy: item.answerPolicy,
      knowledgeIds: [knowledgeId],
      evidence,
      requiresContext: [item.requiredContext],
      reasonCode: 'REQUIRED_CONTEXT_MISSING',
      message: FAIL_CLOSED_MESSAGE,
    };
  }

  return {
    outcome: 'ANSWER',
    answer: item.canonicalHelpText,
    policy: item.answerPolicy,
    knowledgeIds: [knowledgeId],
    evidence,
    requiresContext: [],
    reasonCode: 'REGISTRY_ANSWER_ALLOWED',
    message: item.canonicalHelpText,
  };
}
