'use client';

type ApiEnvelope<T> = { data?: T; error?: string };

const handoffRequests = new Map<string, Promise<Record<string, unknown>>>();

export function loadGarageNybilHandoff(garageItemId: string): Promise<Record<string, unknown>> {
  const existing = handoffRequests.get(garageItemId);
  if (existing) return existing;

  const request = fetch(`/api/garage/nybil-handoff?garage_item_id=${encodeURIComponent(garageItemId)}`, { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json() as ApiEnvelope<Record<string, unknown>>;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? 'Kunde inte läsa Garage-bilen');
      return payload.data;
    })
    .catch((error) => {
      handoffRequests.delete(garageItemId);
      throw error;
    });

  handoffRequests.set(garageItemId, request);
  return request;
}
