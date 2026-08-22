export type AllowedPlatesResponse = {
  data?: string[];
  error?: string;
};

type AllowedPlatesOptions = {
  excludeSold?: boolean;
};

export async function fetchAllowedPlates(options: AllowedPlatesOptions = {}): Promise<string[]> {
  const params = new URLSearchParams();
  if (options.excludeSold) params.set('excludeSold', 'true');
  const query = params.toString();
  const response = await fetch(`/api/allowed-plates${query ? `?${query}` : ''}`);
  const payload = await response.json() as AllowedPlatesResponse;

  if (!response.ok) {
    throw new Error(payload.error || 'Kunde inte hämta registreringsnummer');
  }

  return Array.isArray(payload.data) ? payload.data : [];
}
