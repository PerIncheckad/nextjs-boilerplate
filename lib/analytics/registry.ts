import { METRIC_CONTRACTS_V1 } from './definitions';
import { definitionFingerprint } from './fingerprint';
import type { CycleDefinitionContract, MetricContractV1 } from './contracts';

const metricKey = (metricId: string, version: number) => `${metricId}@${version}`;

const metricMap = new Map<string, MetricContractV1>();
for (const contract of METRIC_CONTRACTS_V1) {
  const key = metricKey(contract.metricId, contract.version);
  if (metricMap.has(key)) throw new Error(`Duplicate metric contract: ${key}`);
  metricMap.set(key, contract);
}

export const METRIC_REGISTRY = Object.freeze(METRIC_CONTRACTS_V1.map((contract) => Object.freeze({
  contract,
  definitionFingerprint: definitionFingerprint(contract),
})));

export function getMetricContract(metricId: string, version: number): MetricContractV1 | null {
  return metricMap.get(metricKey(metricId, version)) ?? null;
}

const cycleMap = new Map<string, CycleDefinitionContract>();
export const CYCLE_REGISTRY = Object.freeze([] as readonly CycleDefinitionContract[]);

export function getCycleDefinition(cycleDefinitionId: string, version: number): CycleDefinitionContract | null {
  return cycleMap.get(`${cycleDefinitionId}@${version}`) ?? null;
}
