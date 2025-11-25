type NotifyCheckinParams = {
  region: 'Syd' | 'Väst' | 'Öst' | 'Norr';
  subjectBase: string;
  meta: any;
};

export const notifyCheckin = async (params: NotifyCheckinParams): Promise<{ success: boolean; error?: string }> => {
  console.log('notifyCheckin called with params:', params);

  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // The API route expects the data to be wrapped in a specific structure.
      // This is the key correction.
      body: JSON.stringify({
        region: params.region,
        subjectBase: params.subjectBase,
        meta: params.meta,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
      console.error(`API response not OK. Status: ${response.status}`, errorData);
      const errorMessage = errorData.error || errorData.message || `Failed to process request. Server responded with status ${response.status}`;
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('API response OK:', result);
    return { success: true };

  } catch (error) {
    console.error('Exception during notifyCheckin fetch:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, error: errorMessage };
  }
};
