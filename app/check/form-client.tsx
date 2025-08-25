'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
import supabase from '../../lib/supabaseclient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

const BUCKET = 'damage-photos';

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-._]/g, '')
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

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('stations').select('id,name,email').order('name');
      setStations(s ?? []);
      const { data: e } = await supabase.from('employees').select('id,name,email').order('name');
      setEmployees(e ?? []);
    })();
  }, []);

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
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
      const upper = regnr.trim().toUpperCase();
      if (!upper) throw new Error('Ange registreringsnummer.');

      // kolla tillåtet regnr
      const { data: allowed } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .eq('regnr', upper)
        .limit(1);
      const regnrValid = !!(allowed && allowed.length);

      // skapa ett temporärt checkin-id (för mappnamn i Storage)
      const checkinId = crypto.randomUUID();

      // ladda upp ev. foton
      const photoUrls: string[] = [];
      if (!noDamage && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const key = `${checkinId}/${Date.now()}-${i}-${cleanFileName(f.name)}`;
          const up = await supabase.storage.from(BUCKET).upload(key, f);
          if (up.error) throw up.error;

          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
          if (pub?.publicUrl) photoUrls.push(pub.publicUrl);
        }
      }

      // bygg insert-payload
      const payload: Record<string, any> = {
        regnr: upper,
        notes: notes || null,
        photo_urls: photoUrls,
        regnr_valid: regnrValid,
        odometer_km: odometerKm === '' ? null : Number(odometerKm),
        fuel_full: fuelFull, // true | false | null
        no_new_damage: noDamage,
      };

      if (stationId) payload.station_id = stationId;
      else if (stationOther) payload.station_other = stationOther;

      if (employeeId) payload.employee_id = employeeId;

      const { error: insertErr } = await supabase.from('checkins').insert(payload);
      if (insertErr) throw insertErr;

      setStatus('done');
      setMessage(
        regnrValid
          ? 'Incheckning sparad.'
          : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
      );

      // nollställ formuläret
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
      setMessage(err.message ?? 'Något gick fel.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label className="block mb-1">Registreringsnummer *</label>
        <input
          className="w-full rounded-md border border-white/30 bg-black/20 p-2"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          placeholder="t.ex. ABC123"
          autoCapitalize="characters"
        />
      </div>

      <div>
        <label className="block mb-1">Station / Depå *</label>
        <select
          className="w-full rounded-md border border-white/30 bg-black/20 p-2"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          <option value="">Välj station …</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="">Annan (fritext)</option>
        </select>
        {!stationId && (
          <input
            className="mt-2 w-full rounded-md border border-white/30 bg-black/20 p-2"
            placeholder="Skriv stationsnamn …"
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
          />
        )}
      </div>

      <div>
        <label className="block mb-1">Utförd av *</label>
        <select
          className="w-full rounded-md border border-white/30 bg-black/20 p-2"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1">Mätarställning</label>
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded-md border border-white/30 bg-black/20 p-2"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="t.ex. 45210"
              value={odometerKm}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                setOdometerKm(v === '' ? '' : Number(v));
              }}
            />
            <span className="opacity-70">km</span>
          </div>
        </div>

        <div>
          <label className="block mb-1">Bränsle</label>
          <select
            className="w-full rounded-md border border-white/30 bg-black/20 p-2"
            value={fuelFull === null ? '' : fuelFull ? 'full' : 'notfull'}
            onChange={(e) => {
              const v = e.target.value;
              setFuelFull(v === '' ? null : v === 'full');
            }}
          >
            <option value="">Välj …</option>
            <option value="full">Fulltankad</option>
            <option value="notfull">Ej fulltankad</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="noDamage"
          type="checkbox"
          className="h-4 w-4"
          checked={noDamage}
          onChange={(e) => setNoDamage(e.target.checked)}
        />
        <label htmlFor="noDamage">Inga nya skador</label>
      </div>

      <div>
        <label className="block mb-1">Anteckningar</label>
        <textarea
          className="w-full rounded-md border border-white/30 bg-black/20 p-2 min-h-[120px]"
          placeholder="Övrig info…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label className="block mb-1">Skador – bifoga foton (valfritt)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPickFiles}
          className="block"
        />
        {!!files.length && (
          <ul className="mt-2 space-y-1 text-sm opacity-80">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="underline text-red-400"
                  onClick={() => removeFile(i)}
                >
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs opacity-70 mt-2">
          Du kan välja flera bilder – eller öppna kameran direkt.
        </p>
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="inline-block rounded-md border border-white/30 px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {message && (
        <p className={`mt-3 ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
      )}
    </form>
  );
}
