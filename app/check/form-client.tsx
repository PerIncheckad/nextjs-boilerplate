'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabaseclient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };
type DamageEntry = { skadenr: string | null; skadetyp: string | null; atgardad: string | null };

const BUCKET = 'damage-photos';

function cleanFileName(name: string) {
  // gör ett säkert filnamn
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.\-_]+/g, '')
    .slice(-100);
}

export default function FormClient() {
  // --- fält ---
  const [regnr, setRegnr] = useState('');
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // ny logik
  const [noDamage, setNoDamage] = useState(false);
  const [odometerKm, setOdometerKm] = useState<number | ''>('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);

  // filer
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // metadata / listor
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [existingDamages, setExistingDamages] = useState<DamageEntry[]>([]);
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);

  // UI
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // ---- hämta dropdown-data ----
  useEffect(() => {
    async function loadLists() {
      const [{ data: st }, { data: em }] = await Promise.all([
        supabase.from('stations').select('id,name,email').order('name', { ascending: true }),
        supabase.from('employees').select('id,name,email').order('name', { ascending: true }),
      ]);
      setStations(st ?? []);
      setEmployees(em ?? []);
    }
    loadLists();
  }, []);

  // ---- kolla regnr + befintliga skador när regnr ändras ----
  useEffect(() => {
    const plate = regnr.trim().toUpperCase();
    if (!plate) {
      setRegnrValid(null);
      setExistingDamages([]);
      return;
    }
    let cancelled = false;

    async function run() {
      // kontroll mot allowed_plates (case-insens med ilike utan % ≈ equals)
      const { data: allowRows, error: allowErr } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .ilike('regnr', plate)
        .limit(1);
      if (!cancelled) {
        setRegnrValid(!allowErr && !!allowRows && allowRows.length > 0);
      }

      // hämta befintliga skador
      const { data: dmgRows } = await supabase
        .from('damages_current')
        .select('skadenr, skadetyp, atgardad')
        .ilike('regnr', plate)
        .limit(50);
      if (!cancelled) {
        setExistingDamages(dmgRows ?? []);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [regnr]);

  // ---- filhantering ----
  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) {
      setFiles((prev) => [...prev, ...picked]);
    }
    // möjliggör att välja samma fil igen
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- submit ----
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const plate = regnr.trim().toUpperCase();
    if (!plate) {
      setStatus('error');
      setMessage('Ange ett registreringsnummer.');
      return;
    }
    if (!stationId && !stationOther.trim()) {
      setStatus('error');
      setMessage('Välj station/depå eller fyll i annan plats.');
      return;
    }
    if (!employeeId) {
      setStatus('error');
      setMessage('Välj vem som utfört incheckningen.');
      return;
    }

    // kolla tillåtet regnr (samma logik som i useEffect – men säkra här med)
    let plateOk = false;
    try {
      const { data: allowRows } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .ilike('regnr', plate)
        .limit(1);
      plateOk = !!allowRows && allowRows.length > 0;
      setRegnrValid(plateOk);
    } catch {
      // ignorerar – spara ändå, men flagga
    }

    // 1) skapa checkin-rad
    const { data: inserted, error: insErr } = await supabase
      .from('checkins')
      .insert({
        regnr: plate,
        notes: notes || null,
        station_id: stationId || null,
        station_other: stationId ? null : stationOther || null,
        employee_id: employeeId || null,
        regnr_valid: plateOk,
        no_damage: noDamage,
        odometer_km: odometerKm === '' ? null : Number(odometerKm),
        fuel_full: fuelFull,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      setStatus('error');
      setMessage('Kunde inte spara incheckningen.');
      return;
    }

    const checkinId = inserted.id as string;

    // 2) om bilder finns och inte "Inga nya skador" → ladda upp & uppdatera photo_urls
    let uploadedUrls: string[] = [];
    if (!noDamage && files.length > 0) {
      for (const f of files) {
        const stamp = Date.now();
        const safe = cleanFileName(f.name);
        const path = `${checkinId}/${stamp}-${safe}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f);
        if (upErr) {
          setStatus('error');
          setMessage('Kunde inte ladda upp en eller flera bilder.');
          return;
        }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl);
      }

      // spara URL:er i raden
      const { error: updErr } = await supabase
        .from('checkins')
        .update({ photo_urls: uploadedUrls })
        .eq('id', checkinId);
      if (updErr) {
        setStatus('error');
        setMessage('Incheckning sparad, men bilderna kunde inte kopplas.');
        return;
      }
    }

    // 3) klart – sätt meddelande
    setStatus('done');
    if (plateOk) {
      setMessage('Incheckning sparad.');
    } else {
      setMessage('Incheckning sparad, men registreringsnumret finns inte i listan.');
    }

    // 4) nollställ formuläret för nästa inmatning
    setRegnr('');
    setStationId('');
    setStationOther('');
    setEmployeeId('');
    setNotes('');
    setFiles([]);
    setNoDamage(false);
    setOdometerKm('');
    setFuelFull(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setExistingDamages([]);
    setRegnrValid(null);
  }

  const otherSelected = stationId === 'other';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium">Registreringsnummer *</label>
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="t.ex. ABC123"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value.toUpperCase())}
          autoCapitalize="characters"
        />
        {regnrValid === true && (
          <p className="mt-1 text-sm text-green-400">Numret finns i listan.</p>
        )}
        {regnrValid === false && (
          <p className="mt-1 text-sm text-amber-400">
            Numret hittades inte i listan (du kan spara ändå).
          </p>
        )}
      </div>

      {/* Station / Depå + fritext */}
      <div>
        <label className="block text-sm font-medium">Station / Depå *</label>
        <select
          className="mt-1 w-full rounded border px-3 py-2 bg-black"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          <option value="">Välj station …</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="other">Annat (ange nedan)</option>
        </select>

        {otherSelected && (
          <input
            className="mt-2 w-full rounded border px-3 py-2"
            placeholder="Ange station / plats"
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
          />
        )}
      </div>

      {/* Utförd av */}
      <div>
        <label className="block text-sm font-medium">Utförd av *</label>
        <select
          className="mt-1 w-full rounded border px-3 py-2 bg-black"
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
        <p className="mt-1 text-xs opacity-70">
          (E-post för vald person används senare för notifieringar.)
        </p>
      </div>

      {/* Mätarställning + bränsle */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Mätarställning</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className="w-full rounded border px-3 py-2"
              placeholder="t.ex. 45231"
              value={odometerKm}
              onChange={(e) => {
                const v = e.target.value;
                setOdometerKm(v === '' ? '' : Math.max(0, Number(v)));
              }}
            />
            <span className="opacity-70">km</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Bränsle</label>
          <div className="mt-2 flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="fuel"
                checked={fuelFull === true}
                onChange={() => setFuelFull(true)}
              />
              <span>Fulltankad</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="fuel"
                checked={fuelFull === false}
                onChange={() => setFuelFull(false)}
              />
              <span>Ej fulltankad</span>
            </label>
          </div>
        </div>
      </div>

      {/* Anteckningar */}
      <div>
        <label className="block text-sm font-medium">Anteckningar</label>
        <textarea
          className="mt-1 w-full rounded border px-3 py-2 h-40"
          placeholder="Övrig info…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Inga nya skador */}
      <div className="flex items-center gap-2">
        <input
          id="no-damage"
          type="checkbox"
          checked={noDamage}
          onChange={(e) => setNoDamage(e.target.checked)}
        />
        <label htmlFor="no-damage" className="text-sm">
          Inga nya skador
        </label>
      </div>

      {/* Befintliga skador (från damages_current) */}
      {regnr.trim() && (
        <div className="rounded border px-3 py-2">
          <div className="text-sm opacity-80 mb-2">
            Befintliga skador för <strong>{regnr.trim().toUpperCase()}</strong>
            {existingDamages.length === 0 ? ': (inga träffar)' : ':'}
          </div>
          {existingDamages.length > 0 && (
            <ul className="text-sm space-y-1">
              {existingDamages.map((d, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="rounded bg-zinc-800 px-2 py-0.5">
                    {d.skadenr ?? '—'}
                  </span>
                  <span className="opacity-90">{d.skadetyp ?? 'Okänd typ'}</span>
                  {d.atgardad && (
                    <span className="opacity-60">(Åtgärdad: {d.atgardad})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Bilder / kamera */}
      <div>
        <label className="block text-sm font-medium">
          Välj bilder / Kamera {noDamage ? '(inaktiverat – inga nya skador)' : ''}
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onPickFiles}
          disabled={noDamage}
          className="mt-1 block w-full"
        />
        {files.length > 0 && !noDamage && (
          <div className="mt-3">
            <ul className="space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="underline text-red-400 hover:text-red-300"
                  >
                    Ta bort
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs opacity-70">
              Du kan välja fler bilder flera gånger.
            </p>
          </div>
        )}
      </div>

      {/* Spara */}
      <div>
        <button
          type="submit"
          disabled={status === 'saving'}
          className="inline-block rounded-md border border-white/30 px-4 py-2"
        >
          {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
