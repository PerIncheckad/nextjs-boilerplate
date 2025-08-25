'use client';

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  ChangeEvent,
} from 'react';

// ✅ RELATIV import – funkar utan alias
import supabase from '../../lib/supabaseclient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

const BUCKET = 'damage-photos';

// Hjälpmetod: gör ett säkert filnamn
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')         // mellanrum -> -
    .replace(/[^a-z0-9\-._]/g, '') // ta bort konstiga tecken
    .slice(0, 100);
}

export default function FormClient() {
  // --- fält ---
  const [regnr, setRegnr] = useState('');
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState<string>('');
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

  // Ladda dropdown-data + (om möjligt) välj inloggad som default "utförd av"
  useEffect(() => {
    (async () => {
      // stationer
      const { data: s } = await supabase.from('stations').select('id, name, email').order('name');
      setStations(s ?? []);

      // anställda
      const { data: e } = await supabase.from('employees').select('id, name, email').order('name');
      setEmployees(e ?? []);

      // Förbered: om auth är på plats i framtiden – välj aktuell användare som default
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userEmail = auth.user?.email?.toLowerCase();
        if (userEmail && (e ?? []).length) {
          const me = (e ?? []).find(x => (x.email ?? '').toLowerCase() === userEmail);
          if (me) setEmployeeId(me.id);
        }
      } catch {
        // inget auth – ignorera
      }
    })();
  }, []);

  // Lägg till nya bilder utan att nollställa tidigare val
  function onPickFiles(ev: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(ev.target.files || []);
    if (picked.length) setFiles(prev => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  // Liten hjälpare för att kolla om regnr är godkänt (mot allowed_plates)
  async function isPlateAllowed(plate: string): Promise<boolean> {
    const upper = plate.trim().toUpperCase();
    if (!upper) return false;
    const { data } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .eq('regnr', upper)
      .maybeSingle();
    return !!data;
  }

  // Ladda upp EN fil till Storage och returnera public URL
  async function uploadOne(file: File, folder: string): Promise<string> {
    const safe = cleanFileName(file.name);
    const path = `${folder}/${Date.now()}-${safe}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (up.error) throw up.error;

    const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.data.publicUrl;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    try {
      const upper = regnr.trim().toUpperCase();
      if (!upper) throw new Error('Ange registreringsnummer.');

      // Validera station
      if (!stationId && !stationOther.trim()) {
        throw new Error('Välj station eller ange egen (”Annan”).');
      }
      // Validera ”Utförd av”
      if (!employeeId) {
        throw new Error('Välj vem som utfört incheckningen.');
      }

      // Kolla regnr i listan
      const plateOk = await isPlateAllowed(upper);

      // 1) skapa checkin-rad (få id tillbaka)
      const insertPayload: any = {
        regnr: upper,
        notes: notes.trim(),
        station_id: stationId || null,
        station_other: stationId ? null : stationOther.trim() || null,
        employee_id: employeeId,
        regnr_valid: plateOk,
        // frivilliga fält:
        odometer_km: odometerKm === '' ? null : Number(odometerKm),
        fuel_full: fuelFull,
        no_damage: noDamage,
        photo_urls: [], // fylls efter upload
      };

      // Se till att kolumnerna finns i DB (om du inte redan lagt till dem):
      // alter table public.checkins add column if not exists odometer_km int;
      // alter table public.checkins add column if not exists fuel_full boolean;
      // alter table public.checkins add column if not exists no_damage boolean;

      const { data: created, error: insErr } = await supabase
        .from('checkins')
        .insert(insertPayload)
        .select('id')
        .single();

      if (insErr) throw insErr;
      const checkinId = created!.id as string;

      // 2) ladda upp ev. bilder
      let urls: string[] = [];
      if (files.length) {
        const folder = `${checkinId}`;
        const results = await Promise.all(files.map(f => uploadOne(f, folder)));
        urls = results;
      }

      // 3) uppdatera raden med photo_urls
      if (urls.length) {
        const { error: updErr } = await supabase
          .from('checkins')
          .update({ photo_urls: urls })
          .eq('id', checkinId);
        if (updErr) throw updErr;
      }

      // Snygg feedback
      setStatus('done');
      if (plateOk) {
        setMessage('Incheckning sparad.');
      } else {
        setMessage('Incheckning sparad, men registreringsnumret finns inte i listan.');
      }

      // Rensa formuläret
      setRegnr('');
      setStationId('');
      setStationOther('');
      setEmployeeId(prev => prev); // behåll vald person
      setNotes('');
      setNoDamage(false);
      setOdometerKm('');
      setFuelFull(null);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Något gick fel.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-sm mb-1">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={e => setRegnr(e.target.value)}
          placeholder="t.ex. ABC123"
          className="w-full rounded-md border px-3 py-2 bg-black/20"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Station / Depå *</label>
        <select
          value={stationId}
          onChange={e => setStationId(e.target.value)}
          className="w-full rounded-md border px-3 py-2 bg-black/20"
        >
          <option value="">Välj station …</option>
          {stations.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="">— Annan —</option>
        </select>

        {!stationId && (
          <input
            value={stationOther}
            onChange={e => setStationOther(e.target.value)}
            placeholder="Skriv station om du valde ”Annan”"
            className="mt-2 w-full rounded-md border px-3 py-2 bg-black/20"
          />
        )}
      </div>

      <div>
        <label className="block text-sm mb-1">Utförd av *</label>
        <select
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value)}
          className="w-full rounded-md border px-3 py-2 bg-black/20"
        >
          <option value="">Välj person …</option>
          {employees.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="text-xs opacity-70 mt-1">
          (E-post för vald person används senare för notifieringar.)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={noDamage}
            onChange={e => setNoDamage(e.target.checked)}
          />
          Inga nya skador
        </label>

        <label className="block">
          <span className="block text-sm mb-1">Mätarställning</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={odometerKm}
              onChange={e => setOdometerKm(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 bg-black/20"
            />
            <span className="whitespace-nowrap">km</span>
          </div>
        </label>

        <label className="block">
          <span className="block text-sm mb-1">Tanknivå</span>
          <select
            value={fuelFull === null ? '' : fuelFull ? 'full' : 'notfull'}
            onChange={e =>
              setFuelFull(e.target.value === '' ? null : e.target.value === 'full')
            }
            className="w-full rounded-md border px-3 py-2 bg-black/20"
          >
            <option value="">Välj …</option>
            <option value="full">Fulltankad</option>
            <option value="notfull">Ej fulltankad</option>
          </select>
        </label>
      </div>

      <div>
        <label className="block text-sm mb-1">Anteckningar</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Övrig info…"
          rows={5}
          className="w-full rounded-md border px-3 py-2 bg-black/20"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Skador – bifoga foton (valfritt)</label>

        {/* Viktigt för mobil: accept + capture="environment" öppnar kameran */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          capture="environment"
          onChange={onPickFiles}
          className="block"
        />
        <p className="text-xs opacity-70 mt-1">
          (Knappen öppnar kameran på mobil. Du kan välja flera bilder flera gånger.)
        </p>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
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
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="inline-block rounded-md border border-white/30 px-4 py-2"
      >
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      {message && (
        <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
