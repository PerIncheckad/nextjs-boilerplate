import { createHash } from 'node:crypto';
import type { MetricContractV1 } from './contracts';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function semanticDefinitionPayload(contract: MetricContractV1) {
  return canonicalize(contract);
}

export function definitionFingerprint(contract: MetricContractV1): string {
  const json = JSON.stringify(semanticDefinitionPayload(contract));
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}
