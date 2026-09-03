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

type StoredGarageContext = {
  source_garage_updated_at: string;
  values: Record<string, unknown>;
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

function loadGarageUpstreamContext(garageItemId: string): StoredGarageContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`nybil-upstream:${garageItemId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGarageContext>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.source_garage_updated_at !== 'string' || !parsed.source_garage_updated_at.trim()) return null;
    if (!parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values)) return null;
    return {
      source_garage_updated_at: parsed.source_garage_updated_at,
      values: parsed.values as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export async function createNybilRegistration(inventoryData: Record<string, unknown>): Promise<string | number | null> {
  const garageItemId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('garage_item_id')?.trim() || null
    : null;
  if (!garageItemId) {
    throw new Error('Ny bil måste startas genom Hämta bilen från Garaget. Välj bilen i Garage-listan och försök igen.');
  }

  const garageContext = loadGarageUpstreamContext(garageItemId);
  if (!garageContext) {
    throw new Error('Garage-informationen kunde inte läsas eller saknar versionsstämpel. Ladda om Ny bil och hämta bilen från Garaget igen.');
  }
  const payloadInventory = {
    ...garageContext.values,
    ...inventoryData,
    source_garage_item_id: garageItemId,
    source_garage_updated_at: garageContext.source_garage_updated_at,
  };

  const response = await fetch('/api/nybil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventoryData: payloadInventory }),
  });
  const data = await readJson<{ id: string | number | null }>(response, 'Kunde inte spara nybilsregistreringen');
  if (typeof window !== 'undefined') {
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
