export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: 20,
          boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
        }}
      >
        <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Incheckad</h1>
        <p style={{ margin: '0 0 16px', color: '#374151' }}>
          Prototypen är igång. Domän & backend kopplas härnäst.
        </p>

        <a
          href="#"
          style={{
            display: 'inline-block',
            padding: '10px 14px',
            borderRadius: 12,
            background: '#111827',
            color: '#fff',
            textDecoration: 'none'
          }}
        >
          Ny incheckning
        </a>
      </div>
    </main>
  );
}
