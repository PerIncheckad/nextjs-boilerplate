import type { Metadata } from 'next';
import Form from './form-client';

export const metadata: Metadata = {
  title: 'Ny incheckning',
};

export default function CheckPage() {
  return (
    <main className="min-h-screen grid place-items-start p-8">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        <h1 className="text-3xl font-semibold">Ny incheckning</h1>
        <Form />
      </div>
    </main>
  );
}
