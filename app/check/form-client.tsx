// app/check/form-client.tsx
'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
// Använd ALIAS-import – byt till "../../lib/supabaseclient" om det behövs.
import supabase from '@/lib/supabaseclient';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

const BUCKET = 'damage-photos';

// Gör ett säkert filnamn
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-._]/g, '')
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

  // --- auto-hämtning från vehicle_damage_summary ---
  const [brandModel, setBrandModel] = useState<string>('');
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // Hämta stations & employees (för dropdowns)
      const { data: s } = await supabase.from('stations').select('*').order('name');
      const { data: e } = await supabase.from('employees').select('*').order('name');
      setStations(s ?? []);
      setEmployees(e ?? []);
    })();
  }, []);

  // Debounce-lösning som slår upp märke/modell & befintliga skador medan man skriver
  useEffect(() => {
    if (!regnr || regnr.trim().length < 3) {
      setBrandModel('');
      setExistingDamages([]);
      return;
    }

    const handle = setTimeout(async () => {
      const plate = regnr.trim().toUpperCase();
      setLookupBusy(true);

      const { data, error } = await supabase
        .from('vehicle_damage_summary')
        .select('brand_model, damages')
        .eq('regnr', plate)
        .maybeSingle(); // tillåter att den är null om den inte finns

      setLookupBusy(false);

      if (error) {
        // Vi visar inget fel för användaren – bara nollställer vy
        setBrandModel('');
        setExistingDamages([]);
        return;
      }

      setBrandModel(data?.brand_model ?? '');
      setExistingDamages((data?.damages as string[] | null) ?? []);
    }, 450); // ~halv sekunds paus

    return () => clearTimeout(handle);
  }, [regnr]);

  function onFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? []);
    if (newFiles.length) setFiles((prev) => [...prev, ...newFiles]);
    // nollställ input så att man kan välja samma fil igen om man vill
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const plate = regnr.trim().toUpperCase();
    if (!plate) {
      setStatus('error');
      setMessage('Ange registreringsnummer.');
      return;
    }
    if (!stationId && !stationOther.trim()) {
      setStatus('error');
      setMessage('Välj station eller ange egen.');
      return;
    }
    if (!employeeId) {
      setStatus('error');
      setMessage('Välj vem som utfört incheckningen.');
      return;
    }

    try {
      // 1) Skapa incheckning
      const { data: inserted, error: insertErr } = await supabase
        .from('checkins')
        .insert({
          regnr: plate,
          station_id: stationId || null,
          station_other: stationOther || null,
          employee_id: employeeId || null,
          notes: notes || null,
          photo_urls: [], // kommer att uppdateras efter uppladdning
          odometer_km: odometerKm === '' ? null : odometerKm,
          fuel_full: fuelFull,
          no_damage: noDamage,
        })
        .select('id')
        .single();

      if (insertErr || !inserted?.id) throw insertErr ?? new Error('Kunde inte spara incheckning.');

      const checkinId: string = inserted.id;

      // 2) Ladda upp foton (om några) till Supabase Storage
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${checkinId}/${Date.now()}-${i}-${cleanFileName(f.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          cacheControl: '3600',
          upsert: false,
        });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl);
      }

      if (uploadedUrls.length) {
        await supabase.from('checkins').update({ photo_urls: uploadedUrls }).eq('id', checkinId);
      }

      // 3) Validera reg.nr mot allowed_plates → flagga fältet regnr_valid
      const { count } = await supabase
        .from('allowed_plates')
        .select('regnr', { head: true, count: 'exact' })
        .eq('regnr', plate);

      const isValid = (count ?? 0) > 0;
      await supabase.from('checkins').update({ regnr_valid: isValid }).eq('id', checkinId);

      setStatus('done');
      setMessage(
        isValid
          ? 'Incheckning sparad.'
          : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
      );

      // 4) Nollställ formuläret (låt regnr ligga kvar så man ser vad som sparades)
      setFiles([]);
      setNotes('');
      setNoDamage(false);
      setOdometerKm('');
      setFuelFull(null);
      setStationOther('');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message ?? 'Något gick fel när incheckningen skulle sparas.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h1 className="text-3xl font-semibold">Ny incheckning</h1>

      {/* Reg.nr */}
      <div className="space-y-2">
        <label className="block text-sm">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          placeholder="t.ex. ABC123"
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          inputMode="text"
          autoCapitalize="characters"
        />
        {/* Auto-info: märke/modell och befintliga skador */}
        {(lookupBusy || brandModel || existingDamages.length > 0) && (
          <div className="rounded-md border border-neutral-700 bg-neutral-900 p-3 text-sm">
            {lookupBusy && <div>Söker efter bil/aktuella skador …</div>}
            {!lookupBusy && (
              <>
                {brandModel && (
                  <div className="mb-2">
                    <span className="text-neutral-400">Bil:</span> {brandModel}
                  </div>
                )}
                {existingDamages.length > 0 ? (
                  <div>
                    <div className="text-neutral-400 mb-1">Befintliga skador:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {existingDamages.map((d, i) => (
                        <li key={`${d}-${i}`}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  brandModel && <div className="text-neutral-400">Inga kända skador i listan.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Station / Depå */}
      <div className="space-y-2">
        <label className="block text-sm">Station / Depå *</label>
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        >
          <option value="">Välj station …</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={stationOther}
          onChange={(e) => setStationOther(e.target.value)}
          placeholder="Ange station om inte i listan…"
          className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"
        />
      </div>

      {/* Utförd av */}
      <div className="space-y-1">
        <label className="block text-sm">Utförd av *</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        >
          <option value="">Välj person …</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="text-xs text-neutral-500">
          (E-post för vald person används senare för notifieringar.)
        </div>
      </div>

      {/* Mätarställning + Tanknivå */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-2">Mätarställning</label>
          <div className="flex items-center gap-2">
            <input
              value={odometerKm}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setOdometerKm('');
                else if (/^\d{0,7}$/.test(v)) setOdometerKm(Number(v));
              }}
              placeholder="ex. 42 180"
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              inputMode="numeric"
            />
            <span className="text-sm text-neutral-400">km</span>
          </div>
        </div>
        <div>
          <label className="block text-sm mb-2">Tanknivå</label>
          <div className="flex items-center gap-6 text-sm">
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

      {/* Inga nya skador */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={noDamage}
          onChange={(e) => setNoDamage(e.target.checked)}
        />
        <span>Inga nya skador</span>
      </div>

      {/* Anteckningar */}
      <div className="space-y-2">
        <label className="block text-sm">Anteckningar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Övrig info…"
          rows={6}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        />
      </div>

      {/* Filer – med kamera-stöd */}
      <div className="space-y-1">
        <label className="block text-sm">Skador – bifoga foton (valfritt)</label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          capture="environment" /* öppnar kameran på mobil där det stöds */
          onChange={onFilesChange}
          className="block"
        />
        {files.length > 0 && (
          <ul className="text-sm mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-red-400 hover:underline"
                >
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs text-neutral-500">
          Du kan välja fler bilder flera gånger.
        </div>
      </div>

      {/* Knapp + status */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
        >
          {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
        </button>
      </div>

      {message && (
        <div
          className={
            'text-sm mt-2 ' +
            (status === 'done' ? 'text-green-400' : status === 'error' ? 'text-red-400' : '')
          }
        >
          {message}
        </div>
      )}
    </form>
  );
}
