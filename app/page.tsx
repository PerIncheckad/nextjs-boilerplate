import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

export default function HomePage() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      backgroundColor: '#f8fafc',
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '1.875rem',
          fontWeight: '600',
          marginBottom: '8px',
        }}>
          Välkommen
        </h1>
        <p style={{ opacity: 0.8, marginBottom: '24px' }}>
          Välj ett alternativ nedan.
        </p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}>
          <a
            href="/ankomst"
            style={{
              display: 'block',
              width: '220px',
              padding: '12px 24px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '16px',
              textAlign: 'center',
            }}
          >
            Inkommen
          </a>
          <a
            href="/check"
            style={{
              display: 'block',
              width: '220px',
              padding: '12px 24px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '500',
              fontSize: '16px',
              color: '#111827',
              textAlign: 'center',
            }}
          >
            Ny incheckning
          </a>
        </div>

        <a
          href="/check/drafts"
          style={{
            display: 'inline-block',
            marginTop: '24px',
            padding: '8px 14px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            textDecoration: 'none',
            color: '#9ca3af',
            fontSize: '14px',
          }}
        >
          Fortsätt påbörjad incheckning
        </a>
      </div>
    </main>
  );
}
