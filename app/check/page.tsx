export default function CheckPage() {
  return (
    <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', gap: 12 }}>
      <h1>Mini-check ✅</h1>
      <p>
        API health: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
