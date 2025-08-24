'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type UploadState = 'idle' | 'saving' | 'done' | 'error';

export default function FormClient() {
  const [regnr, setRegnr] = useState('');
  const [reservation, setReservation] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<UploadState>('idle');
  const [message, setMessage] = useState<string>('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      // 1) Skapa checkin-raden
      const { data, error } = await supabase
        .from('checkins')
        .insert([{ regnr, reservation, email, notes }])
        .select('id')
        .single();

      if (error) throw error;
      const checkinId = data.id as string;

      // 2) Ladda upp ev. bilder till bucket "damage-photos"/<checkinId>/
      if (files && files.length > 0) {
        const uploadPromises: Promise<any>[] = [];
        for (const file of Array.from(files)) {
          const path = `${checkinId}/${Date.now()}-${file.name}`;
          uploadPromises.push(
            supabase.storage
              .from('damage-photos')
              .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
              })
          );
        }

        const results = await Promise.allSettled(uploadPromises);
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && 'error' in (r as any).value && (r as any).value.error));
        if (failed.length > 0) {
          throw new Error('Vissa bilder kunde inte laddas upp.');
        }
      }

      setStatus('done');
      setMessage('Incheckningen sparades!');

      // 3) Töm formuläret
      setRegnr('');
      setReservation('');
      setEmail('');
      setNotes('');
      (e.currentTarget as HTMLFormElement).reset();
      setFiles(null);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message ?? 'Något gick fel.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm">Registreringsnummer *</label>
        <input
          required
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          className="w-full rounded-md border bg-transparent p-3"
          placeholder="ABC123"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm">Reservationsnummer</label>
        <input
          value={reservation}
          onChange={(e) => setReservation(e.target.value)}
          className="w-full rounded-md border bg-transparent p-3"
          placeholder="t.ex. 12345"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm">E-post</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border bg-transparent p-3"
          placeholder="namn@exempel.se"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm">Anteckningar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[140px] rounded-md border bg-transparent p-3"
          placeholder="Övrig info…"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm">Skador – bifoga foton (valfritt)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(e.currentTarget.files)}
          className="w-full rounded-md border bg-transparent p-3"
        />
        <p className="text-xs opacity-70">Du kan välja flera bilder samtidigt.</p>
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="rounded-md border px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {message && (
        <p className={status === 'error' ? 'text-red-500' : 'text-green-500'}>
          {message}
        </p>
      )}
    </form>
  );
}
