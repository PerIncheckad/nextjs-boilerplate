import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

export default function HomePage() {
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="max-w-xl w-full text-center space-y-6">
        <h1 className="text-3xl font-semibold">Välkommen</h1>
        <p className="opacity-80">
          Välj ett alternativ nedan.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <a
            href="/ankomst"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '16px',
              minWidth: '220px',
            }}
          >
            Inkommen
          </a>
          <a
            href="/check"
            className="inline-block rounded-md border px-4 py-2"
          >
            Ny incheckning
          </a>
        </div>
        <a
          href="/check/drafts"
          style={{
            display: 'inline-block',
            marginTop: 12,
            padding: '8px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            textDecoration: 'none',
            color: '#e5e7eb'
          }}
        >
          Fortsätt påbörjad incheckning
        </a>
      </div>
    </main>
  );
}
