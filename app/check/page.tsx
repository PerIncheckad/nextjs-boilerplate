import FormClient from './form-client';

export const metadata = {
  title: 'Ny incheckning',
};

export default function Page() {
  return (
    <main className="p-6">
      <h1 className="text-3xl font-semibold mb-6">Ny incheckning</h1>
      <FormClient />
    </main>
  );
}
