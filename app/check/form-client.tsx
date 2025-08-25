'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import supabase from '../../lib/supabaseclient';


type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

type DamageEntry = {
  text: string;
  files: File[];
  localPreviews: string[];
};

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
  const [stationOther, setStationOther] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // --- fordon/utrustning ---
  const [odometerKm, setOdometerKm] = useState<number | ''>('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<boolean | null>(null);
  const [wheelMounted, setWheelMounted] = useState<'sommar' | 'vinter' | ''>('');
  const [chargersCount, setChargersCount] = useState<0 | 1 | 2>(0);

  // --- skador ---
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damageEntries, setDamageEntries] = useState<DamageEntry[]>([]);

  // --- listor ---
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // --- status ---
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string>('');

  // --- auto-info (bil + befintliga skador + hjulförvaring) ---
  const [autoBrandModel, setAutoBrandModel] = useState<string>('');
  const [autoDamages, setAutoDamages] = useState<string[]>([]);
  const [autoTireStorage, setAutoTireStorage] = useState<string>('');

  // refs för dynamiska filinputs (kamera/galleri) per skada
  const cameraRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const galleryRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('stations').select('id,name');
      setStations(s ?? []);
      const { data: e } = await supabase.from('employees').select('id,name,email');
      setEmployees(e ?? []);
    })();
  }, []);

  useEffect(() => {
    const run = async () => {
      const plate = regnr.trim().toUpperCase();
      if (!plate) {
        setAutoBrandModel('');
        setAutoDamages([]);
        setAutoTireStorage('');
        return;
      }

      // 1) märke + befintliga skador
      const { data: dsum } = await supabase
        .from('vehicle_damage_summary')
        .select('brand_model, damages')
        .eq('regnr', plate)
        .maybeSingle();

      setAutoBrandModel(dsum?.brand_model || '');
      setAutoDamages(Array.isArray(dsum?.damages) ? dsum!.damages.filter(Boolean) : []);

      // 2) hjulförvaring (om tabellen/view finns – se SQL nedan)
      const { data: tstore } = await supabase
        .from('tire_storage_summary')
        .select('site, shelf')
        .eq('regnr', plate)
        .maybeSingle();

      if (tstore?.site || tstore?.shelf) {
        setAutoTireStorage([tstore?.site, tstore?.shelf].filter(Boolean).join(', '));
      } else {
        setAutoTireStorage('');
      }
    };
    run();
  }, [regnr]);

  // --- skade-hjälpare ---
  const addDamageEntry = () =>
    setDamageEntries((prev) => [...prev, { text: '', files: [], localPreviews: [] }]);

  const removeDamageEntry = (index: number) =>
    setDamageEntries((prev) => prev.filter((_, i) => i !== index));

  const updateDamageText = (index: number, text: string) =>
    setDamageEntries((prev) => prev.map((it, i) => (i === index ? { ...it, text } : it)));

  const addFilesToDamage = (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setDamageEntries((prev) =>
      prev.map((it, i) =>
        i === index
          ? {
              ...it,
              files: [...it.files, ...Array.from(files)],
              localPreviews: [...it.localPreviews, ...Array.from(files).map((f) => f.name)],
            }
          : it,
      ),
    );
  };

  // --- validering ---
  const validate = (): string | null => {
    if (!regnr.trim()) return 'Ange registreringsnummer.';
    if (!stationId && !stationOther.trim())
      return 'Välj station eller ange specifik plats.';
    if (!employeeId) return 'Välj person.';
    if (odometerKm === '' || Number.isNaN(odometerKm)) return 'Ange mätarställning (km).';
    if (fuelFull === null) return 'Välj tanknivå.';
    if (adBlueOk === null) return 'Välj AdBlue OK?';
    if (washerOk === null) return 'Välj Spolarvätska OK?';
    if (privacyCoverOk === null) return 'Välj Insynsskydd OK?';
    if (!wheelMounted) return 'Välj vilka hjul som sitter på.';
    if (chargersCount === undefined || chargersCount === null)
      return 'Välj antal laddsladdar.';
    if (hasNewDamage === null) return 'Välj om det finns nya skador.';
    if (hasNewDamage) {
      if (damageEntries.length === 0) return 'Lägg till minst en skada.';
      for (const [i, d] of damageEntries.entries()) {
        if (!d.text.trim()) return `Beskriv skada #${i + 1}.`;
      }
    }
    return null;
  };

  // --- submit ---
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const err = validate();
    if (err) {
      setStatus('error');
      setMessage(err);
      return;
    }

    try {
      const plate = regnr.trim().toUpperCase();

      const allFiles: File[] = damageEntries.flatMap((d) => d.files);
      const checkinKey = crypto.randomUUID();

      const uploadedUrls: string[] = [];
      for (const file of allFiles) {
        const key = `${checkinKey}/${cleanFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, file, {
          upsert: false,
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
        });
        if (!upErr) {
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
          if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl);
        }
      }

      const damageSummary =
        hasNewDamage && damageEntries.length
          ? `\n\nNya skador (${damageEntries.length}):\n` +
            damageEntries
              .map(
                (d, i) =>
                  `${i + 1}) ${d.text}${
                    d.files.length ? ` [${d.files.map((f) => f.name).join(', ')}]` : ''
                  }`,
              )
              .join('\n')
          : '';

      const finalNotes =
        (notes || '').trim() +
        `\n\n— Standardfrågor —\n` +
        `Tanknivå: ${fuelFull ? 'Fulltankad' : 'Ej fulltankad'}\n` +
        `AdBlue OK: ${adBlueOk ? 'Ja' : 'Nej'}\n` +
        `Spolarvätska OK: ${washerOk ? 'Ja' : 'Nej'}\n` +
        `Insynsskydd OK: ${privacyCoverOk ? 'Ja' : 'Nej'}\n` +
        `Hjul som sitter på: ${wheelMounted === 'sommar' ? 'Sommarhjul' : 'Vinterhjul'}\n` +
        `Antal laddsladdar: ${chargersCount}` +
        damageSummary;

      const payload: any = {
        regnr: plate,
        station_id: stationId || null,
        station_other: stationOther || null,
        employee_id: employeeId,
        notes: finalNotes,
        photo_urls: uploadedUrls,
        odometer_km: odometerKm === '' ? null : Number(odometerKm),
        fuel_full: fuelFull,
        adblue_ok: adBlueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyCoverOk,
        wheel_type: wheelMounted || null,
        chargers_count: chargersCount,
      };

      const { error: insertErr } = await supabase.from('checkins').insert(payload);
      if (insertErr) throw insertErr;

      setStatus('done');
      setMessage('Incheckning sparad.');
      // återställ delar
      setHasNewDamage(null);
      setDamageEntries([]);
      setNotes('');
      setOdometerKm('');
      setFuelFull(null);
      setAdBlueOk(null);
      setWasherOk(null);
      setPrivacyCoverOk(null);
      setWheelMounted('');
      setChargersCount(0);
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.message || 'Kunde inte spara.');
    }
  };

  // ===== UI =====
  const addBtnLabel = damageEntries.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada';

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* REGNR + auto-info */}
      <div className="space-y-2">
        <label className="block text-sm">Registreringsnummer *</label>
        <input
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          placeholder="t.ex. ABC123"
          value={regnr}
          onChange={(e) => setRegnr(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        {autoBrandModel && (
          <p className="text-sm text-neutral-300">
            <span className="font-medium">Bil:</span> {autoBrandModel}
          </p>
        )}
        {autoDamages.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Befintliga skador:</p>
            <ul className="list-disc ml-5">
              {autoDamages.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
        {!!autoTireStorage && (
          <p className="text-sm text-neutral-300">
            <span className="font-medium">Hjulförvaring:</span> {autoTireStorage}
          </p>
        )}
      </div>

      {/* STATION */}
      <div className="space-y-2">
        <label className="block text-sm">Station / Depå *</label>
        <select
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
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
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          placeholder="Ange specifik plats ifall bilen INTE lämnats på angiven station."
          value={stationOther}
          onChange={(e) => setStationOther(e.target.value)}
        />
      </div>

      {/* PERSON */}
      <div className="space-y-2">
        <label className="block text-sm">Utförd av *</label>
        <select
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          <option value="">Välj person …</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-400">
          (E-post för vald person används senare för notifieringar.)
        </p>
      </div>

      {/* MÄTARSTÄLLNING + TANK */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm">Mätarställning *</label>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              placeholder="ex. 42 180"
              value={odometerKm}
              onChange={(e) => {
                const v = e.target.value.replace(/\s/g, '');
                setOdometerKm(v === '' ? '' : Number(v));
              }}
            />
            <span className="text-sm text-neutral-400">km</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Tanknivå *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={fuelFull === true} onChange={() => setFuelFull(true)} />
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

      {/* ADBLUE / SPOLAR / INSYN */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="block text-sm">AdBlue OK? *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={adBlueOk === true} onChange={() => setAdBlueOk(true)} />
              Ja
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={adBlueOk === false} onChange={() => setAdBlueOk(false)} />
              Nej
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Spolarvätska OK? *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={washerOk === true} onChange={() => setWasherOk(true)} />
              Ja
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={washerOk === false} onChange={() => setWasherOk(false)} />
              Nej
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Insynsskydd OK? *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={privacyCoverOk === true}
                onChange={() => setPrivacyCoverOk(true)}
              />
              Ja
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={privacyCoverOk === false}
                onChange={() => setPrivacyCoverOk(false)}
              />
              Nej
            </label>
          </div>
        </div>
      </div>

      {/* HJUL + LADDSLADDAR (bytt ordning – hjul först) */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm">Hjul som sitter på *</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={wheelMounted === 'sommar'}
                onChange={() => setWheelMounted('sommar')}
              />
              Sommarhjul
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={wheelMounted === 'vinter'}
                onChange={() => setWheelMounted('vinter')}
              />
              Vinterhjul
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm">Antal laddsladdar *</label>
          <select
            className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
            value={String(chargersCount)}
            onChange={(e) => setChargersCount(Number(e.target.value) as 0 | 1 | 2)}
          >
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>

      {/* NYA SKADOR? */}
      <div className="space-y-2">
        <label className="block text-sm">Nya skador på bilen? *</label>
        <div className="flex items-center gap-6">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={hasNewDamage === true} onChange={() => setHasNewDamage(true)} />
            Ja
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={hasNewDamage === false} onChange={() => setHasNewDamage(false)} />
            Nej
          </label>
        </div>
      </div>

      {hasNewDamage === true && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={addDamageEntry}
            className="rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 px-3 py-2 text-sm"
          >
            {addBtnLabel}
          </button>

          {damageEntries.map((dmg, idx) => (
            <div key={idx} className="rounded-xl border border-neutral-700 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Skada #{idx + 1}</p>
                <button
                  type="button"
                  onClick={() => removeDamageEntry(idx)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Ta bort
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-sm">Beskriv nya skador *</label>
                <textarea
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
                  placeholder="Kort men tydlig beskrivning …"
                  value={dmg.text}
                  onChange={(e) => updateDamageText(idx, e.target.value)}
                  rows={3}
                />
              </div>

              {/* Kamera/Galleri – endast när Ja är valt */}
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={() => cameraRefs.current[idx]?.click()}
                  className="rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 px-3 py-2 text-sm"
                >
                  Ta bilder
                </button>
                <button
                  type="button"
                  onClick={() => galleryRefs.current[idx]?.click()}
                  className="rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 px-3 py-2 text-sm"
                >
                  Välj från galleri
                </button>

                {/* Dolda inputs */}
                <input
                  ref={(el) => (cameraRefs.current[idx] = el)}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  hidden
                  onChange={(e) => addFilesToDamage(idx, e.target.files)}
                />
                <input
                  ref={(el) => (galleryRefs.current[idx] = el)}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => addFilesToDamage(idx, e.target.files)}
                />
              </div>

              {dmg.localPreviews.length > 0 && (
                <div className="text-xs text-neutral-400">
                  Valda filer: {dmg.localPreviews.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ÖVRIGA ANTECKNINGAR */}
      <div className="space-y-2">
        <label className="block text-sm">Övriga anteckningar</label>
        <textarea
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          placeholder="Övrig info…"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* SUBMIT */}
      <div className="space-y-2">
        <button
          disabled={status === 'saving'}
          className="rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 px-4 py-2"
        >
          Spara incheckning
        </button>
        {message && (
          <p
            className={
              status === 'error'
                ? 'text-red-400 text-sm'
                : status === 'done'
                ? 'text-emerald-400 text-sm'
                : 'text-neutral-300 text-sm'
            }
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
