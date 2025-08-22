import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ny incheckning',
};

export default function CheckPage() {
  return (
    <main className="max-w-md mx-auto p-8 text-center">
      <h1 className="text-3xl font-semibold mb-4">Ny incheckning</h1>
      <p>Placeholder – sidan är kopplad. Nästa steg: formulär.</p>
    </main>
  );
}
