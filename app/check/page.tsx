// app/check/page.tsx
import FormClient from './form-client';

export default function Page() {
  const currentUserName = 'Bob'; // placeholder tills riktig inloggning finns

  return (
    <main className="min-h-screen px-4 py-6 md:py-8">
      <header className="mb-6 md:mb-8 flex items-baseline justify-between">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Ny incheckning</h1>
        <div className="text-sm md:text-base text-neutral-400">
          Inloggad: <span className="text-neutral-200">{currentUserName}</span>
        </div>
      </header>

      <FormClient currentUserName={currentUserName} />
    </main>
  );
}
