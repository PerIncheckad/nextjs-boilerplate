type NotifyCheckinParams = {
  region: 'Syd' | 'Väst' | 'Öst' | 'Norr';
  subjectBase: string;
  meta: any;
};

export const notifyCheckin = async (params: NotifyCheckinParams): Promise<{ success: boolean; error?: string }> => {
  console.log('notifyCheckin called with params:', params);

  try {
    // Detect dryRun from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const dryRun = urlParams.get('dryRun') === '1' || urlParams.get('dryRun') === 'true';
    
    // Build API URL with dryRun query parameter if present
    const apiUrl = dryRun ? '/api/notify?dryRun=1' : '/api/notify';
    
    // Prepare request body with dryRun flags
    const requestBody = {
      region: params.region,
      subjectBase: params.subjectBase,
      meta: {
        ...params.meta,
        dryRun: dryRun || undefined,
      },
      dryRun: dryRun || undefined,
    };
    
    console.log('DryRun mode:', dryRun);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // The API route expects the data to be wrapped in a specific structure.
      // This is the key correction.
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
      console.error(`API response not OK. Status: ${response.status}`, errorData);
      throw new Error(`Failed to process request. Server responded with status ${response.status}`);
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
