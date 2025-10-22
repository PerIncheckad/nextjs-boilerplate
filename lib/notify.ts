type NotifyCheckinParams = {
  region: 'Syd' | 'Väst' | 'Öst' | 'Norr';
  subjectBase: string;
  meta: any;
};

export async function notifyCheckin(props: NotifyCheckinParams) {
  try {
    // Anropa den befintliga, korrekta API-routen på /api/notify
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Skicka med hela props-objektet, eftersom din API-route förväntar sig det
      body: JSON.stringify(props) 
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Route Error:', errorData);
      throw new Error(errorData.error || 'Failed to process notification via API route.');
    }

    const data = await response.json();
    console.log("Notification processed successfully via API route:", data);
    return { success: true, data };

  } catch (e) {
    console.error("Exception during notifyCheckin:", e);
    throw e;
  }
}
