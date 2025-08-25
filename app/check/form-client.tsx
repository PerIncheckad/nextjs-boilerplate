'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
import supabase from '@/lib/supabaseclient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

type DamageEntry = {
  skadennr: string | null;
  skadetyp: string | null;
  åtgärdad: string | null;
};

const BUCKET = 'damage-photos';

// Gör ett säkert filnamn
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
        .select('id,name,email')
        .order('name', { ascending: true });
      setStations(s ?? []);

      const { data: e } = await supabase
        .from('employees')
        .select('id,name,email')
        .order('name', { ascending: true });
      setEmployees(e ?? []);
    })();
  }, []);

  // Lägg till nya filer utan att ersätta tidigare val
  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (picked.length) setFiles(prev => [...prev, ...picked]);
    // tömmer inputen så att man kan välja samma fil igen om man vill
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  const UPPER = (s: string) => s.trim().toUpperCase();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const reg = UPPER(regnr);
    const odometer =
      odometerKm === '' || Number.isNaN(Number(odometerKm))
        ? null
        : Number(odometerKm);

    try {
      // 1) Skapa en checkin-rad först (utan bilder)
      const insertPayload: any = {
        regnr: reg,
        notes,
        station_id: stationId || null,
        station_other: stationId ? null : stationOther || null,
        employee_id: employeeId || null,
        odometer_km: odometer,
        fuel_full: fuelFull,
        photo_urls: [], // fylls efter upload
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('checkins')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertErr || !inserted?.id) throw insertErr || new Error('Insert failed');
      const checkinId = inserted.id as string;

      // 2) Ladda upp bilder (om några)
      let photoUrls: string[] = [];
      if (!noDamage && files.length > 0) {
        const uploads = await Promise.all(
          files.map(async file => {
            const path = `${checkinId}/${Date.now()}-${cleanFileName(file.name)}`;
            const { data: up, error: upErr } = await supabase.storage
              .from(BUCKET)
              .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
              });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(up.path);
            return pub.publicUrl;
          })
        );
        photoUrls = uploads;
      }

      // 3) Uppdatera raden med photo_urls
      {
        const { error: upErr } = await supabase
          .from('checkins')
          .update({ photo_urls: photoUrls })
          .eq('id', checkinId);
        if (upErr) throw upErr;
      }

      // 4) Validera regnr mot allowed_plates
      const { data: allowed, error: allowErr } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .eq('regnr', reg)
        .limit(1);

      if (allowErr) throw allowErr;

      const isValid = (allowed?.length ?? 0) > 0;

      // 5) Spara flagga regnr_valid på checkin
      {
        const { error: vErr } = await supabase
          .from('checkins')
          .update({ regnr_valid: isValid })
          .eq('id', checkinId);
        if (vErr) throw vErr;
      }

      // 6) Klart – ge feedback
      setStatus('done');
      setMessage(
        isValid
          ? 'Incheckning sparad.'
          : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
      );

      // återställ formulär
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
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage('Något gick fel. Försök igen.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold">Ny incheckning</h1>

      {/* Registreringsnummer */}
      <div className="space-y-2">
        <label className="block text-sm">Registreringsnummer *</label>
        <input
          type="text"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          placeholder="t.ex. ABC123"
          className="w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none"
          required
        />
      </div>

      {/* Station / Depå */}
      <div className="space-y-2">
        <label className="block text-sm">Station / Depå *</label>
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none"
          required={!stationOther}
        >
          <option value="">Välj station …</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="">— Annan / fritext nedan —</option>
        </select>

        {/* Fritext om “annan” */}
        <input
          type="text"
          value={stationOther}
          onChange={(e) => setStationOther(e.target.value)}
          placeholder="Annan station (fritext)…"
          className="w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none"
          // Kräv detta om ingen station valts
          required={!stationId}
        />
      </div>

      {/* Utförd av */}
      <div className="space-y-2">
        <label className="block text-sm">Utförd av *</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none"
          required
        >
          <option value="">Välj person …</option>
          {employees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-xs opacity-70">
          (E-post för vald person används senare för notifieringar.)
        </p>
      </div>

      {/* Mätarställning + bränsle */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm">Mätarställning</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={odometerKm}
              onChange={(e) => {
                const v = e.target.value;
                setOdometerKm(v === '' ? '' : Number(v));
              }}
              placeholder="0"
              className="w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none"
              min={0}
            />
            <span className="whitespace-nowrap text-sm opacity-80">km</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Bränsle</label>
          <div className="flex gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="fuel"
                checked={fuelFull === true}
                onChange={() => setFuelFull(true)}
              />
              Fulltankad
            </label>
            <label className="inline-flex items-center gap-2">
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
      </div>

      {/* Anteckningar */}
      <div className="space-y-2">
        <label className="block text-sm">Anteckningar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Övrig info…"
          rows={6}
          className="w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none"
        />
      </div>

      {/* Inga nya skador */}
      <div className="space-y-2">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={noDamage}
            onChange={(e) => setNoDamage(e.target.checked)}
          />
          Inga nya skador
        </label>
      </div>

      {/* Bilder */}
      <div className="space-y-2">
        <label className="block text-sm">
          Skador – bifoga bilder (valfritt)
        </label>

        {/* På mobil öppnar detta kameran (capture="environment") */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPickFiles}
          className="block"
        />
        <p className="text-xs opacity-70">
          Du kan välja fler bilder flera gånger.
        </p>

        {files.length > 0 && (
          <div className="mt-2 rounded-md border border-white/10">
            <ul className="divide-y divide-white/10">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between p-2">
                  <span className="truncate pr-4">{f.name}</span>
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
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'saving'}
        className="inline-block rounded-md border border-white/30 px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {message && (
        <p
          className={`mt-3 text-sm ${
            status === 'error'
              ? 'text-red-400'
              : 'text-green-400'
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
