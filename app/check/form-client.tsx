'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string };
type Employee = { id: string; name: string; email: string | null };

export default function FormClient() {
  // fält
  const [regnr, setRegnr] = useState('');
  const [notes, setNotes] = useState('');
  const [stationId, setStationId] = useState<string>(''); // '' | uuid | 'other'
  const [stationOther, setStationOther] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');

  // listor för dropdowns
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // filer
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // status/UI
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string>('');

  // hämta stationer & anställda för dropdowns
  useEffect(() => {
    (async () => {
      const { data: st, error: stErr } = await supabase
        .from('stations')
        .select('id,name')
        .order('name', { ascending: true });

      if (!stErr && st) setStations(st as Station[]);

      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('id,name,email')
        .order('name', { ascending: true });

      if (!empErr && emp) setEmployees(emp as Employee[]);
    })();
  }, []);

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (picked.length) {
      // lägg till nya utan att ersätta tidigare val
      setFiles(prev => [...prev, ...picked]);
    }
    // tillåt att välja samma fil igen om man vill
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function cleanFileName(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      // enkel validering i UI
      const reg = regnr.trim().toUpperCase();
      if (!reg) throw new Error('Ange registreringsnummer.');
      const usingOther = stationId === 'other';
      if (!usingOther && !stationId) throw new Error('Välj station.');
      if (usingOther && !stationOther.trim())
        throw new Error('Ange station under "Annan plats".');
      if (!employeeId) throw new Error('Välj vem som utfört incheckningen.');

      // 1) validera regnr mot allowed_plates (om online)
      let isValid = false;
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (online) {
        const { data: hit, error: plateErr } = await supabase
          .from('allowed_plates')
          .select('regnr')
          .eq('regnr', reg)
          .maybeSingle();
        if (plateErr) throw plateErr;
        isValid = !!hit;
      } else {
        // offline => markera som ogiltigt så vi kan ta hand om det på server senare
        isValid = false;
      }

      // 2) skapa checkin‐raden
      const insertPayload = {
        regnr: reg,
        notes: notes || null,
        photo_urls: [] as string[],
        station_id: usingOther ? null : stationId,
        station_other: usingOther ? stationOther.trim() : null,
        employee_id: employeeId,
        regnr_valid: isValid,
      };

      const { data: insertData, error: insertErr } = await supabase
        .from('checkins')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertErr) throw insertErr;
      const checkinId = insertData!.id as string;

      // 3) ladda upp ev. bilder
      const uploadedUrls: string[] = [];
      if (files.length) {
        for (const f of files) {
          const path = `${checkinId}/${Date.now()}-${cleanFileName(f.name)}`;
          const { error: upErr } = await supabase
            .storage
            .from('damage-photos')
            .upload(path, f, { upsert: false });
          if (upErr) throw upErr;

          const { data: pub } = supabase
            .storage
            .from('damage-photos')
            .getPublicUrl(path);
          uploadedUrls.push(pub.publicUrl);
        }

        const { error: updErr } = await supabase
          .from('checkins')
          .update({ photo_urls: uploadedUrls })
          .eq('id', checkinId);
        if (updErr) throw updErr;
      }

      // 4) klar
      setStatus('done');
      setMessage(
        isValid
          ? 'Incheckning sparad.'
          : online
          ? 'Incheckning sparad, men registreringsnumret finns inte i listan.'
          : 'Incheckning sparad i offline-läge — regnr kunde inte valideras just nu.'
      );

      // nollställ formuläret
      setRegnr('');
      setNotes('');
      setStationId('');
      setStationOther('');
      setEmployeeId('');
      setFiles([]);

    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message ?? 'Kunde inte spara.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Registreringsnummer */}
      <div>
        <label className="block text-sm mb-1">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={e => setRegnr(e.target.value)}
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
          placeholder="t.ex. ABC123"
          autoCapitalize="characters"
          autoCorrect="off"
        />
      </div>

      {/* Station */}
      <div>
        <label className="block text-sm mb-1">Station / Depå *</label>
        <select
          value={stationId}
          onChange={e => setStationId(e.target.value)}
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
        >
          <option value="">Välj station …</option>
          {stations.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="other">Annan plats …</option>
        </select>
      </div>

      {/* Annan plats */}
      {stationId === 'other' && (
        <div>
          <label className="block text-sm mb-1">Annan plats (fritext) *</label>
          <input
            value={stationOther}
            onChange={e => setStationOther(e.target.value)}
            className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
            placeholder="Ange platsnamn"
          />
        </div>
      )}

      {/* Utförd av */}
      <div>
        <label className="block text-sm mb-1">Utförd av *</label>
        <select
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value)}
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
        >
          <option value="">Välj person …</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <p className="text-xs opacity-60 mt-1">
          (E-post för vald person används senare för notifieringar.)
        </p>
      </div>

      {/* Anteckningar */}
      <div>
        <label className="block text-sm mb-1">Anteckningar</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={6}
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
          placeholder="Övrig info…"
        />
      </div>

      {/* Bilder */}
      <div>
        <label className="block text-sm mb-1">
          Skador – bifoga foton (valfritt)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPickFiles}
        />
        {files.length > 0 && (
          <div className="mt-3 space-y-1">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="text-sm flex items-center gap-3">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="underline text-red-400"
                >
                  Ta bort
                </button>
              </div>
            ))}
            <p className="text-xs opacity-70 mt-2">
              Du kan välja fler bilder flera gånger.
            </p>
          </div>
        )}
      </div>

      {/* Spara */}
      <button
        type="submit"
        disabled={status === 'saving'}
        className="inline-block rounded-md border border-white/30 px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {/* Meddelanden */}
      {message && (
        <p
          className={`mt-2 ${
            status === 'error'
              ? 'text-red-400'
              : status === 'done'
              ? 'text-green-400'
              : 'opacity-80'
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
