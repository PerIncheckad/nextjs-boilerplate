import type { AnalyticsCapability, AnalyticsConsumer, AuthorizationContext } from './contracts';

export function isAnalyticsAccessAllowed(context: AuthorizationContext, capability: AnalyticsCapability, consumer: AnalyticsConsumer): boolean {
  return context.sourceAccessAllowed && context.capabilities.has(capability) && context.consumers.has(consumer);
}

export const AUTHORIZATION_RULE = 'effective access = metric capability ∩ source access ∩ relevant consumer access' as const;
