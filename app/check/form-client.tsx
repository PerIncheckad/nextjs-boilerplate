'use client';

import { FormEvent, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

export default function FormClient() {
  const [regnr, setRegnr] = useState('');
  const [reservation, setReservation] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lägg till nya filer utan att ersätta tidigare val
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (picked.length) {
      setFiles(prev => [...prev, ...picked]);
    }
    // tömmer inputen så att man kan välja samma fil igen om man vill
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  const cleanFileName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9.\-]+/g, '-').replace(/-+/g, '-').slice(0, 80);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      // 1) Skapa ett id på klienten så vi kan använda det i filvägar och INSERT
      const checkinId = crypto.randomUUID();

      // 2) Ladda upp ev. bilder först och samla publika URL:er
      const photoUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${checkinId}/${Date.now()}-${i}-${cleanFileName(f.name)}`;

        const { error: upErr } = await supabase.storage
          .from('damage-photos')
          .upload(path, f, { upsert: false });

        if (upErr) throw upErr;

        const { data } = supabase.storage.from('damage-photos').getPublicUrl(path);
        photoUrls.push(data.publicUrl);
      }

      // 3) Spara själva incheckningen (inklusive id + photo_urls)
      const { error: insErr } = await supabase.from('checkins').insert([
        { id: checkinId, regnr, reservation, email, notes, photo_urls: photoUrls },
      ]);

      if (insErr) throw insErr;

      setStatus('done');
      setMessage('Klart! Incheckningen är sparad.');
      setRegnr('');
      setReservation('');
      setEmail('');
      setNotes('');
      setFiles([]);
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err?.message ?? 'Något gick fel.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="block mb-2">Registreringsnummer *</label>
        <input
          className="w-full rounded-md bg-black/20 p-3 border border-white/20"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block mb-2">Reservationsnummer</label>
        <input
          className="w-full rounded-md bg-black/20 p-3 border border-white/20"
          value={reservation}
          onChange={(e) => setReservation(e.target.value)}
        />
      </div>

      <div>
        <label className="block mb-2">E-post</label>
        <input
          type="email"
          className="w-full rounded-md bg-black/20 p-3 border border-white/20"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="block mb-2">Anteckningar</label>
        <textarea
          className="w-full rounded-md bg-black/20 p-3 border border-white/20 min-h-[160px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label className="block mb-2">Skador – bifoga foton (valfritt)</label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={onPickFiles}
          className="block"
        />
        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm opacity-80">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="underline text-red-400"
                >
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm opacity-70">Du kan välja flera bilder flera gånger.</p>
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="inline-block rounded-md border border-white/30 px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {message && (
        <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
