import type { Metadata } from 'next';
import FormClient from './form-client';

export const metadata: Metadata = {
  title: 'Ny incheckning',
};

export default function CheckPage() {
  return (
    <main className="min-h-screen grid place-items-start p-8">
      <div className="max-w-2xl w-full space-y-8">
        <h1 className="text-3xl font-semibold text-center">Ny incheckning</h1>
        <FormClient />
      </div>
    </main>
  );
}
