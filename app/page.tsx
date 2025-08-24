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
          Använd knappen nedan för att göra en ny incheckning.
        </p>
        <a
          href="/check"
          className="inline-block rounded-md border px-4 py-2"
        >
          Ny incheckning
        </a>
      </div>
    </main>
  );
}
