'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FormState = {
  regnr: string;
  reservation: string;
  email: string;
  notes: string;
  file: File | null;
};

export default function CheckInForm() {
  const [state, setState] = useState<FormState>({
    regnr: '',
    reservation: '',
    email: '',
    notes: '',
    file: null,
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    // 1) Spara check-in
    const { data: row, error } = await supabase
      .from('checkins')
      .insert([
        {
          regnr: state.regnr,
          reservation: state.reservation,
          email: state.email,
          notes: state.notes,
        },
      ])
      .select('id')
      .single();

    if (error) {
      setMsg(`Kunde inte spara incheckningen: ${error.message}`);
      setLoading(false);
      return;
    }

    // 2) Ladda upp ev. bild
    if (state.file) {
      const filePath = `checkins/${row.id}/${Date.now()}-${state.file.name}`;
      const { error: upErr } = await supabase
        .storage
        .from('damage-photos')
        .upload(filePath, state.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (upErr) {
        setMsg(`Uppladdning misslyckades: ${upErr.message}`);
        setLoading(false);
        return;
      }
    }

    setMsg('Incheckning skickad!');
    setState({ regnr: '', reservation: '', email: '', notes: '', file: null });
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm mb-1">Registreringsnummer</label>
        <input
          className="w-full rounded border px-3 py-2 bg-black/20"
          value={state.regnr}
          onChange={(e) => setState({ ...state, regnr: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Reservationsnummer</label>
        <input
          className="w-full rounded border px-3 py-2 bg-black/20"
          value={state.reservation}
          onChange={(e) => setState({ ...state, reservation: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm mb-1">E-post</label>
        <input
          type="email"
          className="w-full rounded border px-3 py-2 bg-black/20"
          value={state.email}
          onChange={(e) => setState({ ...state, email: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Meddelande / anteckningar</label>
        <textarea
          className="w-full rounded border px-3 py-2 bg-black/20"
          rows={3}
          value={state.notes}
          onChange={(e) => setState({ ...state, notes: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Skadefoto (valfritt)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) =>
            setState({ ...state, file: e.target.files?.[0] ?? null })
          }
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50"
      >
        {loading ? 'Skickar…' : 'Checka in'}
      </button>

      {msg && <p className="text-sm opacity-80">{msg}</p>}
    </form>
  );
}
