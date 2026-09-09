import type { ComparisonResult, MetricMaturity, MetricResultV1 } from './contracts';

const maturityRank: Record<MetricMaturity, number> = { VERIFIED: 0, PARTIAL: 1, NOT_AVAILABLE: 2, BLOCKED: 3 };

function propagatedMaturity(a: MetricMaturity, b: MetricMaturity): MetricMaturity {
  if (a === 'BLOCKED' || b === 'BLOCKED') return 'BLOCKED';
  if (a === 'NOT_AVAILABLE' || b === 'NOT_AVAILABLE') return 'NOT_AVAILABLE';
  if (a === 'PARTIAL' || b === 'PARTIAL') return 'PARTIAL';
  return maturityRank[a] >= maturityRank[b] ? a : b;
}

export function compareMetricResults(a: MetricResultV1, b: MetricResultV1): ComparisonResult {
  const reasons: string[] = [];
  if (a.metricId !== b.metricId || a.metricVersion !== b.metricVersion) reasons.push('INCOMPATIBLE_METRIC');
  if (a.unit !== b.unit) reasons.push('INCOMPATIBLE_UNIT');
  if (JSON.stringify(a.scope.dimensions) !== JSON.stringify(b.scope.dimensions) || JSON.stringify(a.scope.filters) !== JSON.stringify(b.scope.filters) || a.scope.periodCode !== b.scope.periodCode) reasons.push('INCOMPATIBLE_SCOPE');
  if (reasons.length) return { absoluteDifference: null, relativeChangePct: null, maturity: 'BLOCKED', reasons };

  const maturity = propagatedMaturity(a.quality.maturity, b.quality.maturity);
  if (maturity === 'BLOCKED' || maturity === 'NOT_AVAILABLE' || a.value == null || b.value == null) {
    return { absoluteDifference: null, relativeChangePct: null, maturity, reasons };
  }

  const absoluteDifference = a.value - b.value;
  if (b.value === 0) return { absoluteDifference, relativeChangePct: null, maturity, reasons: ['ZERO_COMPARISON_BASE'] };
  return { absoluteDifference, relativeChangePct: ((a.value - b.value) / b.value) * 100, maturity, reasons };
}
