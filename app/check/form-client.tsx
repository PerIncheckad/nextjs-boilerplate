'use client';

import { FormEvent, useEffect, useRef, useState, ChangeEvent } from 'react';
import supabase from '../../lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };
type DamageSummary = { brand_model: string | null; damages: string[] | null };

type Draft = {
  regnr: string;
  stationId: string;
  stationOther: string;
  employeeId: string;
  notes: string;

  odometerKm: number | '';
  fuelFull: boolean | null;

  adblueOk: boolean | null;
  washerOk: boolean | null;
  cargoCoverOk: boolean | null;
  chargeCables: 0 | 1 | 2;

  hasNewDamage: boolean | null;
  damagesMeta: { description: string }[]; // endast texter sparas i utkastet
};

const BUCKET = 'damage-photos';
const DRAFT_KEY = 'check-form-draft-v2';

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(-100);
}

function loadDraft(): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveDraft(d: Partial<Draft>) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

export default function FormClient() {
  // --- fält ---
  const [regnr, setRegnr] = useState(loadDraft().regnr ?? '');
  const [stationId, setStationId] = useState<string>(loadDraft().stationId ?? '');
  const [stationOther, setStationOther] = useState<string>(loadDraft().stationOther ?? '');
  const [employeeId, setEmployeeId] = useState<string>(loadDraft().employeeId ?? '');
  const [notes, setNotes] = useState(loadDraft().notes ?? '');

  // --- obligatoriska frågor ---
  const [odometerKm, setOdometerKm] = useState<number | ''>(loadDraft().odometerKm ?? '');
  const [fuelFull, setFuelFull] = useState<boolean | null>(loadDraft().fuelFull ?? null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(loadDraft().adblueOk ?? null);
  const [washerOk, setWasherOk] = useState<boolean | null>(loadDraft().washerOk ?? null);
  const [cargoCoverOk, setCargoCoverOk] = useState<boolean | null>(loadDraft().cargoCoverOk ?? null);
  const [chargeCables, setChargeCables] = useState<0 | 1 | 2>((loadDraft().chargeCables as any) ?? 0);

  // --- nya skador? ---
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(
    loadDraft().hasNewDamage ?? null
  );

  // skade-rader (med filer per rad)
  type DamageRow = { description: string; files: File[] };
  const initialDamageRows: DamageRow[] =
    (loadDraft().damagesMeta ?? []).map((m) => ({ description: m.description, files: [] })) || [];
  const [damageRows, setDamageRows] = useState<DamageRow[]>(initialDamageRows);

  // fil-pickers (en dold kamera + en dold galleri, vi styr vilken rad som är aktiv)
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [activeDamageIndex, setActiveDamageIndex] = useState<number | null>(null);

  // --- metadata / listor ---
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // --- status ---
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // --- auto-hämtning (märke + bef. skador) ---
  const [brandModel, setBrandModel] = useState<string>('');
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [isFetchingDamage, setIsFetchingDamage] = useState(false);
  const [damageInfoMsg, setDamageInfoMsg] = useState<string>('');

  // Hämta drop-down-data
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('stations').select('id,name,email').order('name');
      setStations(s ?? []);
      const { data: e } = await supabase.from('employees').select('id,name,email').order('name');
      setEmployees(e ?? []);
    })();
  }, []);

  // Debounce auto-hämtning
  useEffect(() => {
    const t = setTimeout(async () => {
      const raw = regnr.trim();
      setDamageInfoMsg('');
      if (!raw) {
        setBrandModel('');
        setExistingDamages([]);
        return;
      }
      if (raw.length < 5) return;

      setIsFetchingDamage(true);
      const upper = raw.toUpperCase();

      const { data, error } = await supabase
        .from('vehicle_damage_summary')
        .select('brand_model, damages')
        .eq('regnr', upper)
        .maybeSingle<DamageSummary>();

      if (error) {
        setBrandModel('');
        setExistingDamages([]);
        setDamageInfoMsg('Kunde inte hämta uppgifter just nu.');
      } else if (!data) {
        setBrandModel('');
        setExistingDamages([]);
        setDamageInfoMsg('Hittade inga uppgifter för detta reg.nr.');
      } else {
        setBrandModel((data.brand_model ?? '').trim());
        setExistingDamages((data.damages ?? []).filter(Boolean));
        setDamageInfoMsg('');
      }
      setIsFetchingDamage(false);
    }, 300);
    return () => clearTimeout(t);
  }, [regnr]);

  // Spara utkast kontinuerligt (utan filer)
  useEffect(() => {
    saveDraft({
      regnr,
      stationId,
      stationOther,
      employeeId,
      notes,
      odometerKm,
      fuelFull,
      adblueOk,
      washerOk,
      cargoCoverOk,
      chargeCables,
      hasNewDamage,
      damagesMeta: damageRows.map((d) => ({ description: d.description })),
    });
  }, [
    regnr,
    stationId,
    stationOther,
    employeeId,
    notes,
    odometerKm,
    fuelFull,
    adblueOk,
    washerOk,
    cargoCoverOk,
    chargeCables,
    hasNewDamage,
    damageRows,
  ]);

  // --- filhantering ---
  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || activeDamageIndex === null) return;
    const picked = Array.from(e.target.files);
    setDamageRows((prev) =>
      prev.map((row, i) => (i === activeDamageIndex ? { ...row, files: [...row.files, ...picked] } : row))
    );
    e.currentTarget.value = ''; // tillåt samma fil igen
    setActiveDamageIndex(null);
  }
  function removeFile(rowIdx: number, fileIdx: number) {
    setDamageRows((prev) =>
      prev.map((row, i) =>
        i === rowIdx ? { ...row, files: row.files.filter((_, j) => j !== fileIdx) } : row
      )
    );
  }
  function addDamageRow() {
    setDamageRows((prev) => [...prev, { description: '', files: [] }]);
  }
  function removeDamageRow(idx: number) {
    setDamageRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function openCamera(idx: number) {
    setActiveDamageIndex(idx);
    // spara utkast innan vi öppnar kamera
    saveDraft({
      regnr,
      stationId,
      stationOther,
      employeeId,
      notes,
      odometerKm,
      fuelFull,
      adblueOk,
      washerOk,
      cargoCoverOk,
      chargeCables,
      hasNewDamage,
      damagesMeta: damageRows.map((d) => ({ description: d.description })),
    });
    cameraInputRef.current?.click();
  }
  function openGallery(idx: number) {
    setActiveDamageIndex(idx);
    saveDraft({
      regnr,
      stationId,
      stationOther,
      employeeId,
      notes,
      odometerKm,
      fuelFull,
      adblueOk,
      washerOk,
      cargoCoverOk,
      chargeCables,
      hasNewDamage,
      damagesMeta: damageRows.map((d) => ({ description: d.description })),
    });
    galleryInputRef.current?.click();
  }

  async function uploadFilesForDamage(folder: string, files: File[]) {
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
    if (!upper) return fail('Fyll i registreringsnummer.');
    if (!stationId && !stationOther.trim()) return fail('Välj station eller ange specifik plats.');
    if (!employeeId) return fail('Välj person under "Utförd av".');

    // Obligatoriska frågor
    if (fuelFull === null) return fail('Välj tanknivå.');
    if (adblueOk === null) return fail('Svara på AdBlue OK?');
    if (washerOk === null) return fail('Svara på Spolarvätska OK?');
    if (cargoCoverOk === null) return fail('Svara på Insynsskydd?');

    // Nya skador? måste vara besvarad
    if (hasNewDamage === null) return fail('Svara på "Nya skador på bilen?"');

    // Om Ja – kräver minst en skade-rad med text och minst en bild
    if (hasNewDamage) {
      if (damageRows.length === 0) return fail('Lägg till minst en skada.');
      for (const [i, row] of damageRows.entries()) {
        if (!row.description.trim()) return fail(`Skada ${i + 1}: beskrivning krävs.`);
        if (row.files.length === 0) return fail(`Skada ${i + 1}: minst en bild krävs.`);
      }
    }

    setStatus('saving');
    setMessage('');

    try {
      // se om regnr finns i whitelist
      const { data: allowed } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .eq('regnr', upper)
        .limit(1);
      const regnrOk = (allowed?.length ?? 0) > 0;

      // skapa checkin
      const { data: inserted, error: insErr } = await supabase
        .from('checkins')
        .insert({
          regnr: upper,
          notes: notes || null,
          station_id: stationId || null,
          station_other: stationOther?.trim() || null,
          employee_id: employeeId,

          odometer_km: odometerKm === '' ? null : Number(odometerKm),
          fuel_full: fuelFull,

          adblue_ok: adblueOk,
          washer_ok: washerOk,
          cargo_cover_ok: cargoCoverOk,
          charge_cables_count: chargeCables,

          no_new_damage: !hasNewDamage,
        })
        .select('id')
        .single();

      if (insErr) throw insErr;
      const checkinId = inserted!.id as string;

      // om nya skador => ladda upp filer och skapa rader i checkin_damages
      if (hasNewDamage) {
        for (let i = 0; i < damageRows.length; i++) {
          const row = damageRows[i];
          const folder = `${checkinId}/damage-${i + 1}`;
          const photoUrls = await uploadFilesForDamage(folder, row.files);

          const { error: dErr } = await supabase.from('checkin_damages').insert({
            checkin_id: checkinId,
            description: row.description.trim(),
            photo_urls: photoUrls,
          });
          if (dErr) throw dErr;
        }
      }

      setStatus('done');
      setMessage(
        regnrOk
          ? 'Incheckning sparad.'
          : 'Incheckning sparad, men registreringsnumret finns inte i listan.'
      );

      // rensa
      sessionStorage.removeItem(DRAFT_KEY);
      setDamageRows([]);
    } catch (err: any) {
      fail(err?.message ?? 'Något gick fel.');
    }

    function fail(msg: string) {
      setStatus('error');
      setMessage(msg);
      return false;
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
        <div className="text-sm text-white/70">
          {isFetchingDamage ? (
            <span>Hämtar uppgifter…</span>
          ) : (
            <>
              <div><b>Bil:</b> {brandModel || '–'}</div>
              <div className="mt-1">
                <b>Befintliga skador:</b>{' '}
                {existingDamages.length ? (
                  <ul className="list-disc ml-6">
                    {existingDamages.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                ) : '–'}
              </div>
              {damageInfoMsg && <div className="mt-1 text-amber-300">{damageInfoMsg}</div>}
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
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <input
          className="w-full rounded bg-black/20 border border-white/10 p-3"
          placeholder="Ange specifik plats ifall bilen INTE lämnats på angiven station."
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
          {employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="text-xs text-white/50">(E-post för vald person används senare för notifieringar.)</div>
      </div>

      {/* Mätarställning + Tanknivå */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block">Mätarställning *</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="w-full rounded bg-black/20 border border-white/10 p-3"
              placeholder="ex. 42 180"
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value === '' ? '' : Number(e.target.value))}
              required
            />
            <span className="px-3 py-2 rounded bg-black/20 border border-white/10">km</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">Tanknivå *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={fuelFull === true} onChange={() => setFuelFull(true)} />
              Fulltankad
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={fuelFull === false} onChange={() => setFuelFull(false)} />
              Ej fulltankad
            </label>
          </div>
        </div>
      </div>

      {/* Extra frågor (obligatoriska) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block">AdBlue OK? *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={adblueOk === true} onChange={() => setAdblueOk(true)} /> Ja
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={adblueOk === false} onChange={() => setAdblueOk(false)} /> Nej
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">Spolarvätska OK? *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={washerOk === true} onChange={() => setWasherOk(true)} /> Ja
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={washerOk === false} onChange={() => setWasherOk(false)} /> Nej
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">Finns insynsskydd? *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={cargoCoverOk === true} onChange={() => setCargoCoverOk(true)} /> Ja
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={cargoCoverOk === false} onChange={() => setCargoCoverOk(false)} /> Nej
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">Antal laddsladdar *</label>
          <select
            className="w-full rounded bg-black/20 border border-white/10 p-3"
            value={chargeCables}
            onChange={(e) => setChargeCables(Number(e.target.value) as 0 | 1 | 2)}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>
      </div>

      {/* Nya skador? */}
      <div className="space-y-2">
        <label className="block">Nya skador på bilen? *</label>
        <div className="flex items-center gap-6">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={hasNewDamage === true} onChange={() => setHasNewDamage(true)} /> Ja
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={hasNewDamage === false} onChange={() => setHasNewDamage(false)} /> Nej
          </label>
        </div>
      </div>

      {/* Skade-rader (visas endast vid Ja) */}
      {hasNewDamage && (
        <div className="space-y-4 border border-white/10 rounded p-4">
          <div className="font-semibold">Beskriv nya skador</div>

          {/* dolda inputs för alla rader */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />

          {damageRows.map((row, idx) => (
            <div key={idx} className="space-y-2 rounded bg-black/10 p-3 border border-white/5">
              <div className="flex items-start justify-between gap-3">
                <label className="block w-full">
                  Skada {idx + 1} – beskrivning (obligatoriskt)
                  <textarea
                    className="w-full mt-1 rounded bg-black/20 border border-white/10 p-3"
                    value={row.description}
                    onChange={(e) =>
                      setDamageRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r))
                      )
                    }
                    placeholder="Ex: Buckla vänster framdörr …"
                  />
                </label>
                <button
                  type="button"
                  className="text-red-400 underline shrink-0 mt-1"
                  onClick={() => removeDamageRow(idx)}
                >
                  Ta bort
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded bg-white/10 border border-white/20"
                  onClick={() => openCamera(idx)}
                >
                  Ta bilder
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded bg-white/10 border border-white/20"
                  onClick={() => openGallery(idx)}
                >
                  Välj från galleri
                </button>
              </div>

              {row.files.length > 0 && (
                <div className="text-sm">
                  {row.files.map((f, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <span>{f.name}</span>
                      <button
                        type="button"
                        className="text-red-400 underline"
                        onClick={() => removeFile(idx, j)}
                      >
                        Ta bort
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            className="px-4 py-2 rounded bg-white/10 border border-white/20"
            onClick={addDamageRow}
          >
            Lägg till ytterligare skada
          </button>
        </div>
      )}

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
