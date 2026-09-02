export type NybilPreviousRegistration = {
  id: string;
  regnr: string;
  registreringsdatum: string;
  bilmarke: string;
  modell: string;
  duplicate_group_id?: string;
  created_at?: string;
  fullstandigt_namn?: string;
};

export type NybilDuplicateResult = {
  existsInBilkontroll: boolean;
  existsInNybil: boolean;
  previousRegistration: NybilPreviousRegistration | null;
  vehicleInfo: { bilmarke?: string; modell?: string } | null;
  sameDayCount?: number;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
};

async function readJson<T>(response: Response, fallbackError: string): Promise<T> {
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error || fallbackError);
  }
  return payload.data;
}

export async function checkNybilDuplicate(regnr: string): Promise<NybilDuplicateResult> {
  const response = await fetch(`/api/nybil?regnr=${encodeURIComponent(regnr)}`);
  return readJson<NybilDuplicateResult>(response, 'Kunde inte kontrollera tidigare registreringar');
}

export async function countNybilDuplicatesForDate(regnr: string, registrationDate: string): Promise<number> {
  const params = new URLSearchParams({ regnr, registrationDate });
  const response = await fetch(`/api/nybil?${params.toString()}`);
  const data = await readJson<NybilDuplicateResult>(response, 'Kunde inte räkna tidigare registreringar');
  return typeof data.sameDayCount === 'number' ? data.sameDayCount : 0;
}

function loadGarageUpstreamContext(garageItemId: string): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(`nybil-upstream:${garageItemId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function createNybilRegistration(inventoryData: Record<string, unknown>): Promise<string | number | null> {
  const garageItemId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('garage_item_id')?.trim() || null
    : null;
  const payloadInventory = garageItemId
    ? {
        ...loadGarageUpstreamContext(garageItemId),
        ...inventoryData,
        source_garage_item_id: garageItemId,
      }
    : inventoryData;

  const response = await fetch('/api/nybil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventoryData: payloadInventory }),
  });
  const data = await readJson<{ id: string | number | null }>(response, 'Kunde inte spara nybilsregistreringen');
  if (garageItemId && typeof window !== 'undefined') {
    window.sessionStorage.removeItem(`nybil-upstream:${garageItemId}`);
  }
  return data.id;
}

export async function updateNybilDuplicateGroup(id: string | number, duplicateGroupId: string): Promise<void> {
  const response = await fetch('/api/nybil', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, duplicateGroupId }),
  });
  await readJson<{ updated: true }>(response, 'Kunde inte uppdatera dubblettgruppen');
}

export async function createNybilDamage(damage: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/nybil/damages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ damage }),
  });
  await readJson<{ created: true }>(response, 'Kunde inte spara skadan');
}
