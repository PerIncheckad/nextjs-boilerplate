'use client';

import { useState } from 'react';
import supabase from '@/lib/supabaseClient';

export default function CheckPage() {
  const [form, setForm] = useState({
    regnr: '',
    reservation: '',
    email: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('checkins')
        .insert([{
          regnr: form.regnr.trim(),
          reservation: form.reservation.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
        }])
        .select()
        .single(); // <-- Ger tillbaka raden (inkl. id)

      if (error) throw error;

      // visa id + nollställ formuläret
      setResult({ id: data.id as string });
      setForm({ regnr: '', reservation: '', email: '', notes: '' });
    } catch (err: any) {
      setError(err.message ?? 'Kunde inte spara incheckningen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-start p-8">
      <div className="max-w-xl w-full space-y-6">
        <h1 className="text-3xl font-semibold">Ny incheckning</h1>

        {result && (
          <div className="rounded-lg border p-4">
            <p className="font-medium">Incheckning skapad!</p>
            <p className="text-sm opacity-80">ID: <code>{result.id}</code></p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Registreringsnummer *</label>
            <input
              required
              value={form.regnr}
              onChange={(e) => setForm({ ...form, regnr: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="ABC123"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Reservationsnummer</label>
            <input
              value={form.reservation}
              onChange={(e) => setForm({ ...form, reservation: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="t.ex. 12345"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">E-post</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="namn@exempel.se"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Anteckningar</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-md border bg-transparent p-2"
              placeholder="Övrig info…"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md border px-4 py-2 disabled:opacity-60"
          >
            {loading ? 'Sparar…' : 'Spara incheckning'}
          </button>
        </form>
      </div>
    </main>
  );
}
