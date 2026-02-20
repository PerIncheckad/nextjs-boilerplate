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
        <div>
          <a
            href="/ankomst"
            className="inline-block rounded-md border px-4 py-2 font-semibold"
            style={{ backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
          >
            Inkommen
          </a>
        </div>
        <div>
          <a
            href="/check"
            className="inline-block rounded-md border px-4 py-2"
          >
            Ny incheckning
          </a>
        </div>
        <div>
          <a
            href="/nybil"
            className="inline-block rounded-md border px-4 py-2"
          >
            Registrera ny bil
          </a>
        </div>
      </div>
    </main>
  );
}
