'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabaseclient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station  = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

const BUCKET = 'damage-photos';

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(-100);
}

export default function FormClient() {
  // --- fält ---
  const [regnr, setRegnr] = useState('');
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // --- ny logik ---
  const [noDamage, setNoDamage] = useState(false);
  const [odometerKm, setOdometerKm] = useState<number | ''>('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);

  // --- filer ---
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- metadata / listor ---
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // --- status ---
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from('stations')
        .select('id,name')
        .order('name');
      setStations(s ?? []);

      const { data: e } = await supabase
        .from('employees')
        .select('id,name')
        .order('name');
      setEmployees(e ?? []);
    })();
  }, []);

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) {
      setFiles((prev) => [...prev, ...picked]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const upper = regnr.trim().toUpperCase();
    if (!upper) {
      setStatus('error');
      setMessage('Fyll i registreringsnummer.');
      return;
    }

    // Bygg anteckningar tills vi har egna kolumner för mätare/tank
    const composedNotes = [
      notes?.trim() ?? '',
      odometerKm !== '' ? `Mätarställning: ${odometerKm} km` : '',
      fuelFull !== null ? `Tank: ${fuelFull ? 'Fulltankad' : 'Ej fulltankad'}` : '',
      noDamage ? 'Inga nya skador rapporterades.' : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 1) Skapa posten först (tomma photo_urls)
    const { data: created, error: insertErr } = await supabase
      .from('checkins')
      .insert({
        regnr: upper,
        notes: composedNotes,
        station_id: stationId && stationId !== 'other' ? stationId : null,
        station_other: stationId === 'other' ? stationOther || null : null,
        employee_id: employeeId || null,
        photo_urls: [],
      })
      .select('id')
      .single();

    if (insertErr || !created) {
      setStatus('error');
      setMessage(insertErr?.message ?? 'Kunde inte spara.');
      return;
    }

    const checkinId = created.id as string;

    // 2) Ladda ev. upp bilder (skippa om "Inga nya skador")
    const uploadedUrls: string[] = [];
    if (!noDamage && files.length) {
      for (const file of files) {
        const path = `${checkinId}/${Date.now()}-${cleanFileName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false });
        if (upErr) {
          setStatus('error');
          setMessage(`Uppladdning misslyckades: ${upErr.message}`);
          return;
        }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl);
      }

      await supabase
        .from('checkins')
        .update({ photo_urls: uploadedUrls })
        .eq('id', checkinId);
    }

    // 3) Markera om regnr finns i whitelist
    const { data: okPlate } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .eq('regnr', upper)
      .maybeSingle();
    const isValid = !!okPlate;
    await supabase.from('checkins').update({ regnr_valid: isValid }).eq('id', checkinId);

    // 4) Klart
    setStatus('done');
    setMessage(
      isValid
        ? 'Incheckning sparad.'
        : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
    );

    // Nollställ formuläret
    setRegnr('');
    setStationId('');
    setStationOther('');
    setEmployeeId('');
    setNotes('');
    setNoDamage(false);
    setOdometerKm('');
    setFuelFull(null);
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="block text-sm mb-1">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          placeholder="t.ex. ABC123"
          className="w-full rounded-md bg-black/20 border px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Station / Depå *</label>
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="w-full rounded-md bg-black/20 border px-3 py-2"
        >
          <option value="">Välj station …</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="other">Annan…</option>
        </select>
        {stationId === 'other' && (
          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            placeholder="Ange station/depå"
            className="mt-2 w-full rounded-md bg-black/20 border px-3 py-2"
          />
        )}
      </div>

      <div>
        <label className="block text-sm mb-1">Utförd av *</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-md bg-black/20 border px-3 py-2"
        >
          <option value="">Välj person …</option>
          {employees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-xs opacity-70 mt-1">
          (E-post för vald person används senare för notifieringar.)
        </p>
      </div>

      <div>
        <label className="block text-sm mb-1">Anteckningar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Övrig info…"
          className="w-full min-h-[140px] rounded-md bg-black/20 border px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={noDamage}
            onChange={(e) => setNoDamage(e.target.checked)}
          />
          Inga nya skador
        </label>

        <div className="flex items-center gap-2">
          <label className="whitespace-nowrap">Mätarställning</label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={odometerKm}
            onChange={(e) =>
              setOdometerKm(e.target.value === '' ? '' : Number(e.target.value))
            }
            className="w-28 rounded-md bg-black/20 border px-3 py-2"
          />
          <span className="opacity-70">km</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap">Tank</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="fuel"
              checked={fuelFull === true}
              onChange={() => setFuelFull(true)}
            />
            Fulltankad
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="fuel"
              checked={fuelFull === false}
              onChange={() => setFuelFull(false)}
            />
            Ej fulltankad
          </label>
        </div>
      </div>

      {!noDamage && (
        <div>
          <label className="block text-sm mb-1">
            Skador – välj bilder eller ta foto (valfritt)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={onPickFiles}
          />
          {files.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm opacity-80">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="underline"
                  >
                    Ta bort
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs mt-2">
            Du kan välja flera bilder flera gånger.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving'}
        className="inline-block rounded-md border px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {message && (
        <p className={`mt-3 ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
