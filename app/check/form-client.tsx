'use client';

import { useState } from 'react';
import supabase from '@/lib/supabaseClient';

type Fields = {
  regnr: string;
  reservation?: string;
  email?: string;
  notes?: string;
};

export default function CheckinForm() {
  const [form, setForm] = useState<Fields>({ regnr: '' });
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOk(null);
    setErr(null);

    const regnr = form.regnr.trim();
    if (!regnr) {
      setErr('Ange registreringsnummer');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('checkins').insert([{
      regnr,
      reservation: form.reservation?.trim() || null,
      email: form.email?.trim() || null,
      notes: form.notes?.trim() || null,
    }]);
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk('Tack! Incheckningen är registrerad.');
    setForm({ regnr: '' });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4 mx-auto p-4">
      <div>
        <label className="block mb-1">Registreringsnummer *</label>
        <input
          value={form.regnr}
          onChange={(e) => setForm({ ...form, regnr: e.target.value })}
          className="w-full rounded border px-3 py-2 text-black"
          required
        />
      </div>

      <div>
        <label className="block mb-1">Bokningsnummer</label>
        <input
          value={form.reservation || ''}
          onChange={(e) => setForm({ ...form, reservation: e.target.value })}
          className="w-full rounded border px-3 py-2 text-black"
        />
      </div>

      <div>
        <label className="block mb-1">E-post</label>
        <input
          type="email"
          value={form.email || ''}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded border px-3 py-2 text-black"
        />
      </div>

      <div>
        <label className="block mb-1">Meddelande</label>
        <textarea
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full rounded border px-3 py-2 text-black"
          rows={4}
        />
      </div>

      {err && <p className="text-red-400">{err}</p>}
      {ok && <p className="text-green-400">{ok}</p>}

      <button
        type="submit"
        className="rounded bg-white text-black px-4 py-2 disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Skickar…' : 'Checka in'}
      </button>
    </form>
  );
}

