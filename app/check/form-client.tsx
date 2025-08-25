'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
// ❗ Viktigt: vi använder RELATIV import (robust mot alias-strul)
import supabase from '../../lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

// Data från vyn public.vehicle_damage_summary
type DamageSummary = { brand_model: string | null; damages: string[] | null };

const BUCKET = 'damage-photos';

// Enkel, säker filnamns-normalisering
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

  // --- auto-hämtning av märke/modell + befintliga skador ---
  const [brandModel, setBrandModel] = useState<string>('');
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [isFetchingDamage, setIsFetchingDamage] = useState(false);

  // Hämta dropdown-data
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('stations').select('id,name,email').order('name');
      setStations(s ?? []);

      const { data: e } = await supabase.from('employees').select('id,name,email').order('name');
      setEmployees(e ?? []);
    })();
  }, []);

  // När regnr ändras: auto-hämta märke/modell + befintliga skador
  useEffect(() => {
    const run = async () => {
      const raw = regnr.trim();
      if (!raw) {
        setBrandModel('');
        setExistingDamages([]);
        return;
      }

      // Låt oss slå när det ser ut som ett rimligt regnr (minst 5 tecken)
      if (raw.length < 5) return;

      setIsFetchingDamage(true);
      const upper = raw.toUpperCase();

      const { data, error } = await supabase
        .from('vehicle_damage_summary')
        .select('brand_model, damages')
        .eq('regnr', upper)
        .maybeSingle<DamageSummary>();

      if (error) {
        // Vi faller tyst – formuläret ska fungera ändå
        setBrandModel('');
        setExistingDamages([]);
      } else {
        setBrandModel((data?.brand_model ?? '').trim());
        setExistingDamages((data?.damages ?? []).filter(Boolean));
      }
      setIsFetchingDamage(false);
    };

    run();
  }, [regnr]);

  // Hantera filval
  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    // nollställ så man kan välja samma fil igen om man vill
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadAllFiles(folder: string) {
    if (files.length === 0) return [] as string[];

    const client = supabase.storage.from(BUCKET);
    const urls: string[] = [];

    for (const f of files) {
      const key = `${folder}/${Date.now()}-${cleanFileName(f.name)}`;
      const up = await client.upload(key, f, { upsert: false });
      if (up.error) throw up.error;

      const pub = client.getPublicUrl(key);
      if (pub.data?.publicUrl) urls.push(pub.data.publicUrl);
    }
    return urls;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'saving') return;

    const upper = regnr.trim().toUpperCase();

    if (!upper) {
      setMessage('Fyll i registreringsnummer.');
      setStatus('error');
      return;
    }
    if (!stationId && !stationOther.trim()) {
      setMessage('Välj station eller fyll i annan station.');
      setStatus('error');
      return;
    }
    if (!employeeId) {
      setMessage('Välj person under "Utförd av".');
      setStatus('error');
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      // Skapa en mapp-nyckel för bildernas paths
      const folder = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const photoUrls = await uploadAllFiles(folder);

      // Kolla om regnr finns i allowed_plates för att kunna sätta budskap efter insert
      const { data: allowed } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .eq('regnr', upper)
        .limit(1);

      const regnrOk = (allowed?.length ?? 0) > 0;

      // Spara incheckningen
      const { error: insErr } = await supabase.from('checkins').insert({
        regnr: upper,
        notes: notes || null,
        photo_urls: photoUrls,
        station_id: stationId || null,
        station_other: stationOther?.trim() || null,
        employee_id: employeeId,
        // nya fält
        odometer_km: odometerKm === '' ? null : Number(odometerKm),
        fuel_full: fuelFull, // true/false/null
        no_new_damage: noDamage, // valfritt fält i DB om du lagt till det
      });

      if (insErr) throw insErr;

      setStatus('done');
      setMessage(
        regnrOk
          ? 'Incheckning sparad.'
          : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
      );

      // Rensa bara bildernas lista – eller allt om du vill
      setFiles([]);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message ?? 'Något gick fel.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-semibold">Ny incheckning</h1>

      {/* Regnr */}
      <div className="space-y-2">
        <label className="block">Registreringsnummer *</label>
        <input
          className="w-full rounded bg-black/20 border border-white/10 p-3"
          placeholder="t.ex. ABC123"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value.toUpperCase())}
        />
        {/* Auto-hämtad info */}
        <div className="text-sm text-white/70">
          {isFetchingDamage ? (
            <span>Hämtar uppgifter…</span>
          ) : (
            <>
              {brandModel ? <div><b>Bil:</b> {brandModel}</div> : <div><b>Bil:</b> –</div>}
              <div className="mt-1">
                <b>Befintliga skador:</b>
                {existingDamages.length ? (
                  <ul className="list-disc ml-6">
                    {existingDamages.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <span> –</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Station / Depå */}
      <div className="space-y-2">
        <label className="block">Station / Depå *</label>
        <select
          className="w-full rounded bg-black/20 border border-white/10 p-3"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          <option value="">Välj station …</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          className="w-full rounded bg-black/20 border border-white/10 p-3"
          placeholder="Ange station som inte i listan…"
          value={stationOther}
          onChange={(e) => setStationOther(e.target.value)}
        />
      </div>

      {/* Utförd av */}
      <div className="space-y-2">
        <label className="block">Utförd av *</label>
        <select
          className="w-full rounded bg-black/20 border border-white/10 p-3"
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
        <div className="text-xs text-white/50">
          (E-post för vald person används senare för notifieringar.)
        </div>
      </div>

      {/* Mätarställning + Tanknivå */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block">Mätarställning</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="w-full rounded bg-black/20 border border-white/10 p-3"
              placeholder="ex. 42 180"
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <span className="px-3 py-2 rounded bg-black/20 border border-white/10">km</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">Tanknivå</label>
          <div className="flex items-center gap-6">
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

      {/* Anteckningar */}
      <div className="space-y-2">
        <label className="block">Anteckningar</label>
        <textarea
          className="w-full min-h-[140px] rounded bg-black/20 border border-white/10 p-3"
          placeholder="Övrig info…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Filer */}
      <div className="space-y-2">
        <label className="block">Skador – bifoga foton (valfritt)</label>
        <input
          ref={fileInputRef}
          type="file"
          // Öppna kamera i mobil: 
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPickFiles}
          className="block"
          aria-label="Välj bilder"
        />
        {files.length > 0 && (
          <div className="text-sm">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <span>{f.name}</span>
                <button
                  type="button"
                  className="text-red-400 underline"
                  onClick={() => removeFile(i)}
                >
                  Ta bort
                </button>
              </div>
            ))}
            <div className="text-xs text-white/50">Du kan välja fler bilder flera gånger.</div>
          </div>
        )}
      </div>

      {/* Spara */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="px-5 py-3 rounded bg-white/10 border border-white/20 hover:bg-white/20 disabled:opacity-50"
        >
          Spara incheckning
        </button>
        {status !== 'idle' && (
          <div
            className={
              status === 'error'
                ? 'text-red-400'
                : status === 'done'
                ? 'text-green-400'
                : 'text-white/70'
            }
          >
            {message}
          </div>
        )}
      </div>
    </form>
  );
}
