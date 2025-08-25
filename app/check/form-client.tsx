'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
import supabase from '@/lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station  = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

const BUCKET = 'damage-photos';

// Säkert filnamn
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')        // mellanslag -> bindestreck
    .replace(/[^a-z0-9\-_.]/g, '') // ta bort konstiga tecken
    .slice(0, 100);
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

  // Hämta listor + sätt default-person om inloggad användare matchar
  useEffect(() => {
    (async () => {
      const { data: stationsData } =
        await supabase.from('stations').select('id, name, email').order('name', { ascending: true });
      setStations(stationsData ?? []);

      const { data: employeesData } =
        await supabase.from('employees').select('id, name, email').order('name', { ascending: true });
      setEmployees(employeesData ?? []);

      // sätt default employee från inloggad användare (om e-post matchar)
      const { data: userRes } = await supabase.auth.getUser();
      const email = userRes?.user?.email?.toLowerCase();
      if (email && employeesData) {
        const match = employeesData.find(e => (e.email ?? '').toLowerCase() === email);
        if (match) setEmployeeId(match.id);
      }
    })();
  }, []);

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) setFiles(prev => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      const plate = regnr.trim().toUpperCase();

      // 1) Validera mot allowed_plates (utan att stoppa sparandet)
      let regIsAllowed = false;
      if (plate) {
        const { data: allowed } = await supabase
          .from('allowed_plates')
          .select('regnr')
          .eq('regnr', plate)
          .maybeSingle();
        regIsAllowed = Boolean(allowed);
      }

      // 2) Spara incheckningen först (utan foton)
      const insertPayload: any = {
        regnr: plate,
        notes,
        photo_urls: [],
        regnr_valid: regIsAllowed,
      };

      if (stationId) insertPayload.station_id = stationId;
      if (!stationId && stationOther) insertPayload.station_other = stationOther;
      if (employeeId) insertPayload.employee_id = employeeId;

      // Nya fält – tas med om kolumnerna finns
      if (odometerKm !== '') insertPayload.odometer_km = Number(odometerKm);
      if (fuelFull !== null) insertPayload.fuel_full = fuelFull;
      insertPayload.no_damage = noDamage;

      const { data: inserted, error: insertErr } = await supabase
        .from('checkins')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insertErr) throw insertErr;
      const checkinId: string = inserted.id;

      // 3) Ladda upp ev. bilder
      let urls: string[] = [];
      if (files.length) {
        const prefix = `${checkinId}/`;
        const uploads = await Promise.all(
          files.map(async (file, i) => {
            const key = `${prefix}${Date.now()}-${i}-${cleanFileName(file.name)}`;
            const up = await supabase.storage.from(BUCKET).upload(key, file, { upsert: false });
            if (up.error) throw up.error;
            const pub = supabase.storage.from(BUCKET).getPublicUrl(key);
            return pub.data.publicUrl;
          })
        );
        urls = uploads.filter(Boolean) as string[];

        // uppdatera raden med URL:erna
        await supabase.from('checkins').update({ photo_urls: urls }).eq('id', checkinId);
      }

      // 4) Klart – visa meddelande
      setStatus('done');
      setMessage(
        regIsAllowed
          ? 'Incheckning sparad.'
          : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
      );

      // rensa formulär
      setRegnr('');
      setStationId('');
      setStationOther('');
      setNoDamage(false);
      setOdometerKm('');
      setFuelFull(null);
      setEmployeeId(prev => prev); // lämna vald/auto-satt person
      setNotes('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage('Kunde inte spara incheckningen. Försök igen.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="block text-sm mb-1">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={e => setRegnr(e.target.value)}
          placeholder="t.ex. ABC123"
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
          required
        />
      </div>

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
          <option value="">Annan / fritext</option>
        </select>

        {!stationId && (
          <input
            value={stationOther}
            onChange={e => setStationOther(e.target.value)}
            placeholder="Ange station om inte i listan…"
            className="mt-2 w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
          />
        )}
      </div>

      <div>
        <label className="block text-sm mb-1">Utförd av *</label>
        <select
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value)}
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
        >
          <option value="">Välj person …</option>
          {employees.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="text-xs opacity-70 mt-1">(E-post för vald person används senare för notifieringar.)</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Mätarställning</label>
          <div className="relative">
            <input
              type="number"
              min={0}
              value={odometerKm}
              onChange={e => setOdometerKm(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="ex. 42 180"
              className="w-full pr-14 rounded-md bg-black/20 border border-white/20 px-3 py-2"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-70">km</span>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">Tanknivå</label>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={fuelFull === true}
                onChange={() => setFuelFull(true)}
              />
              Fulltankad
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={fuelFull === false}
                onChange={() => setFuelFull(false)}
              />
              Ej fulltankad
            </label>
          </div>
        </div>
      </div>

      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={noDamage}
          onChange={e => setNoDamage(e.target.checked)}
        />
        Inga nya skador
      </label>

      <div>
        <label className="block text-sm mb-1">Anteckningar</label>
        <textarea
          rows={6}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Övrig info…"
          className="w-full rounded-md bg-black/20 border border-white/20 px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Skador – bifoga foton (valfritt)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment" // öppnar kameran på mobil (där det stöds)
          multiple
          onChange={onPickFiles}
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm opacity-80">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="underline text-red-400">
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs opacity-70 mt-1">Du kan välja fler bilder flera gånger.</p>
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
