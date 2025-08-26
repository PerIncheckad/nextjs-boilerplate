'use client';

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import supabase from '../../lib/supabase';

// ======== Typer ========
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type VehicleSummary = {
  brand_model: string | null;
  damages: string[]; // från view: array av text
};

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[]; // för UI
};

type WheelKind = 'sommar' | 'vinter';

// ======== Konstanter ========
const BUCKET = 'damage-photos';

// Normalisera reg.nr till A-Z/0-9
const cleanReg = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

// ======== Komponent ========
export default function FormClient() {
  // --- topp / header ---
  const [username] = useState<string>('Bob'); // temporär “inloggad”
  const [thanksTo, setThanksTo] = useState<string>('');

  // --- filt ---
  const [regnr, setRegnr] = useState<string>('');
  const [stationId, setStationId] = useState<string>(''); // val i lista
  const [stationOther, setStationOther] = useState<string>(''); // “Ev. annan inlämningsplats”
  const [notes, setNotes] = useState<string>('');

  // --- krav & frågor ---
  const [odometer, setOdometer] = useState<string>(''); // “12345”
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);

  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);

  const [chargersCount, setChargersCount] = useState<number>(0);

  const [washNeeded, setWashNeeded] = useState<boolean | null>(null);
  const [vacuumNeeded, setVacuumNeeded] = useState<boolean | null>(null);

  // Hjul
  const [wheelOn, setWheelOn] = useState<WheelKind | ''>('');
  const [systemWheelOn, setSystemWheelOn] = useState<WheelKind | null>(null);

  // befintlig bilinfo
  const [brandModel, setBrandModel] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);

  // nya skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  // upload-hjälp
  const cameraInputs = useRef<HTMLInputElement[]>([]);
  const galleryInputs = useRef<HTMLInputElement[]>([]);

  // status
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string>('');

  // ======== Bil-lookup (modell + befintliga skador) ========
  async function lookupVehicle(regRaw: string) {
    const reg = cleanReg(regRaw);
    if (!reg) return;

    // 1) bilmodell + skador från view
    const { data: v, error: ve } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .eq('regnr', reg)
      .maybeSingle<VehicleSummary>();

    if (!ve && v) {
      setBrandModel(v.brand_model ?? null);
      setExistingDamages(Array.isArray(v.damages) ? v.damages : []);
    } else {
      setBrandModel(null);
      setExistingDamages([]);
    }

    // 2) systemets hjul
    await loadSystemWheelOn(reg);
  }

  async function loadSystemWheelOn(reg: string) {
    try {
      const { data, error } = await supabase
        .from('tire_storage_summary')
        .select('wheels_on')
        .eq('regnr', reg)
        .maybeSingle<{ wheels_on: string | null }>();

      if (!error && data?.wheels_on) {
        const v = String(data.wheels_on).toLowerCase();
        setSystemWheelOn(v.includes('vint') ? 'vinter' : 'sommar');
      } else {
        setSystemWheelOn(null);
      }
    } catch {
      setSystemWheelOn(null);
    }
  }

  // ======== Skador – lägg till / ta bort / filer ========
  function addDamage() {
    setDamages((d) => [
      ...d,
      { text: '', files: [], previews: [] },
    ]);
  }

  function removeDamage(idx: number) {
    setDamages((d) => d.filter((_, i) => i !== idx));
  }

  function setDamageText(idx: number, text: string) {
    setDamages((d) => d.map((it, i) => (i === idx ? { ...it, text } : it)));
  }

  function pickFiles(idx: number, e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const previews = files.map((f) => URL.createObjectURL(f));

    setDamages((d) =>
      d.map((it, i) =>
        i === idx
          ? { ...it, files: [...it.files, ...files], previews: [...it.previews, ...previews] }
          : it
      )
    );

    // rensa fältet så att man kan välja samma fil igen om man vill
    e.target.value = '';
  }

  function openCamera(idx: number) {
    cameraInputs.current[idx]?.click();
  }
  function openGallery(idx: number) {
    galleryInputs.current[idx]?.click();
  }
  function deletePreview(idx: number, pIndex: number) {
    setDamages((d) =>
      d.map((it, i) => {
        if (i !== idx) return it;
        const newFiles = it.files.filter((_, j) => j !== pIndex);
        const newPrev = it.previews.filter((_, j) => j !== pIndex);
        return { ...it, files: newFiles, previews: newPrev };
      })
    );
  }

  // ======== Hjulval med “Är du säker?” ========
  function pickWheel(val: WheelKind) {
    if (systemWheelOn && systemWheelOn !== val) {
      const ok = confirm(
        `Systemet indikerar ${systemWheelOn}. Är du säker på att ${val} sitter på bilen?`
      );
      if (!ok) return;
    }
    setWheelOn(val);
  }

  // ======== Upload + Submit ========
  async function uploadDamagePhotos(reg: string): Promise<string[]> {
    const urls: string[] = [];

    for (let i = 0; i < damages.length; i++) {
      const entry = damages[i];
      for (let j = 0; j < entry.files.length; j++) {
        const f = entry.files[j];
        const path = `${reg}/${Date.now()}-${i}-${j}-${f.name.replace(/\s+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          cacheControl: '3600',
          upsert: false,
        });
        if (upErr) continue;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (pub?.publicUrl) urls.push(pub.publicUrl);
      }
    }
    return urls;
  }

  const canSubmit =
    cleanReg(regnr).length >= 3 &&
    odometer.trim() !== '' &&
    fuelFull !== null &&
    adblueOk !== null &&
    washerOk !== null &&
    privacyOk !== null &&
    wheelOn !== '' &&
    washNeeded !== null &&
    vacuumNeeded !== null &&
    (hasNewDamage === false ||
      (hasNewDamage === true &&
        damages.length > 0 &&
        damages.every((d) => d.text.trim().length > 0)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus('saving');
    setMessage('');

    try {
      const reg = cleanReg(regnr);

      // 1) ladda upp foton (om nya skador)
      const photoUrls = hasNewDamage ? await uploadDamagePhotos(reg) : [];

      // 2) bygg rad till checkins — håll den “snäll” för olika scheman
      const insertObj: any = {
        regnr: reg,
        station_other: stationOther || null,
        notes: notes || null,
        odometer: parseInt(odometer, 10),
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk,
        chargers_count: chargersCount,
        wheel_type: wheelOn || null,
        wash_needed: washNeeded,
        vacuum_needed: vacuumNeeded,
        no_new_damage: hasNewDamage === false,
        photo_urls: photoUrls.length ? photoUrls : null,
        created_by: username,
      };

      const { error } = await supabase.from('checkins').insert([insertObj]);
      if (error) {
        console.error(error);
        throw new Error('Kunde inte spara incheckningen.');
      }

      setThanksTo(username);
      setStatus('done');
      setMessage('');

      // nollställ
      setRegnr('');
      setBrandModel(null);
      setExistingDamages([]);
      setStationId('');
      setStationOther('');
      setNotes('');
      setOdometer('');
      setFuelFull(null);
      setAdblueOk(null);
      setWasherOk(null);
      setPrivacyOk(null);
      setChargersCount(0);
      setWheelOn('');
      setSystemWheelOn(null);
      setWashNeeded(null);
      setVacuumNeeded(null);
      setHasNewDamage(null);
      setDamages([]);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Något gick fel.');
    }
  }

  // ======== UI ========
  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Ny incheckning</h1>
        <div className="text-sm text-zinc-500">Inloggad: <strong>{username}</strong></div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Reg.nr */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(cleanReg(e.target.value))}
            onBlur={() => lookupVehicle(regnr)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border-zinc-700 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
          />
          {/* Bilinfo */}
          {brandModel && (
            <p className="mt-2 text-sm text-zinc-300">Bil: <strong>{brandModel}</strong></p>
          )}
          {/* Befintliga skador */}
          {existingDamages.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium">Befintliga skador:</p>
              <ul className="list-disc pl-6 text-sm">
                {existingDamages.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Station / Depå + annan plats */}
        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border-zinc-700 px-3 py-2"
          >
            <option value="">Välj station …</option>
            <option value="MALMO">Malmö</option>
            <option value="HELSINGBORG">Helsingborg</option>
            <option value="HALMSTAD">Halmstad</option>
            <option value="VARBERG">Varberg</option>
            <option value="TRELLEBORG">Trelleborg</option>
            <option value="LUND">Lund</option>
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-2 w-full rounded-lg bg-zinc-900 border-zinc-700 px-3 py-2"
            placeholder="Ev. annan inlämningsplats"
          />
        </div>

        {/* Mätarställning */}
        <div>
          <label className="block text-sm font-medium">Mätarställning (km) *</label>
          <input
            value={odometer}
            onChange={(e) => setOdometer(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg bg-zinc-900 border-zinc-700 px-3 py-2"
            placeholder="ex. 42180"
          />
        </div>

        {/* Tanknivå */}
        <div>
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFuelFull(true)}
              className={`rounded-lg px-3 py-2 border ${fuelFull === true ? 'bg-green-100 border-green-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}
            >
              Fulltankad
            </button>
            <button
              type="button"
              onClick={() => setFuelFull(false)}
              className={`rounded-lg px-3 py-2 border ${fuelFull === false ? 'bg-red-100 border-red-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}
            >
              Ej fulltankad
            </button>
          </div>
        </div>

        {/* J/N-frågor */}
        <div className="grid grid-cols-1 gap-4">
          {/* AdBlue */}
          <div>
            <p className="text-sm font-medium">AdBlue OK? *</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAdblueOk(true)}  className={`rounded-lg px-3 py-2 border ${adblueOk === true  ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Ja</button>
              <button type="button" onClick={() => setAdblueOk(false)} className={`rounded-lg px-3 py-2 border ${adblueOk === false ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Nej</button>
            </div>
          </div>

          {/* Spolarvätska */}
          <div>
            <p className="text-sm font-medium">Spolarvätska OK? *</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setWasherOk(true)}  className={`rounded-lg px-3 py-2 border ${washerOk === true  ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Ja</button>
              <button type="button" onClick={() => setWasherOk(false)} className={`rounded-lg px-3 py-2 border ${washerOk === false ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Nej</button>
            </div>
          </div>

          {/* Insynsskydd */}
          <div>
            <p className="text-sm font-medium">Insynsskydd OK? *</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPrivacyOk(true)}  className={`rounded-lg px-3 py-2 border ${privacyOk === true  ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Ja</button>
              <button type="button" onClick={() => setPrivacyOk(false)} className={`rounded-lg px-3 py-2 border ${privacyOk === false ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Nej</button>
            </div>
          </div>
        </div>

        {/* Antal laddsladdar 0/1/2 */}
        <div>
          <label className="block text-sm font-medium">Antal laddsladdar *</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setChargersCount(n)}
                className={`rounded-lg px-3 py-2 border ${chargersCount === n ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på */}
        <div>
          <label className="block text-sm font-medium">Hjul som sitter på *</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => pickWheel('sommar')}
              className={`rounded-lg px-3 py-2 border ${wheelOn === 'sommar' ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}
            >
              Sommarhjul
            </button>
            <button
              type="button"
              onClick={() => pickWheel('vinter')}
              className={`rounded-lg px-3 py-2 border ${wheelOn === 'vinter' ? 'bg-blue-100 border-blue-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}
            >
              Vinterhjul
            </button>
          </div>
          {systemWheelOn && (
            <p className="mt-1 text-xs text-zinc-400">
              Systemets uppgift: <strong>{systemWheelOn}</strong>
            </p>
          )}
        </div>

        {/* Tvätt / Dammsugning */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <p className="text-sm font-medium">Utvändig tvätt behövs? *</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setWashNeeded(true)}  className={`rounded-lg px-3 py-2 border ${washNeeded === true  ? 'bg-amber-100 border-amber-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Ja</button>
              <button type="button" onClick={() => setWashNeeded(false)} className={`rounded-lg px-3 py-2 border ${washNeeded === false ? 'bg-amber-100 border-amber-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Nej</button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Dammsugning behövs? *</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setVacuumNeeded(true)}  className={`rounded-lg px-3 py-2 border ${vacuumNeeded === true  ? 'bg-amber-100 border-amber-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Ja</button>
              <button type="button" onClick={() => setVacuumNeeded(false)} className={`rounded-lg px-3 py-2 border ${vacuumNeeded === false ? 'bg-amber-100 border-amber-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Nej</button>
            </div>
          </div>
        </div>

        {/* Nya skador? */}
        <div>
          <p className="text-sm font-medium">Nya skador på bilen? *</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setHasNewDamage(true)}  className={`rounded-lg px-3 py-2 border ${hasNewDamage === true  ? 'bg-red-100 border-red-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Ja</button>
            <button type="button" onClick={() => setHasNewDamage(false)} className={`rounded-lg px-3 py-2 border ${hasNewDamage === false ? 'bg-green-100 border-green-400 text-black' : 'bg-zinc-900 border-zinc-700'}`}>Nej</button>
          </div>
        </div>

        {/* Skador – dynamisk lista */}
        {hasNewDamage === true && (
          <div className="rounded-lg border border-zinc-700 p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">Beskriv nya skador</p>
              <button
                type="button"
                onClick={addDamage}
                className="rounded-md px-3 py-1 border border-zinc-600 text-sm"
              >
                {damages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
              </button>
            </div>

            <div className="mt-3 space-y-4">
              {damages.map((dmg, i) => (
                <div key={i} className="rounded-md border border-zinc-700 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Skada #{i + 1}</p>
                    <button type="button" onClick={() => removeDamage(i)} className="text-xs underline">
                      Ta bort
                    </button>
                  </div>

                  <label className="block text-sm">Kommentar (obligatorisk)</label>
                  <textarea
                    value={dmg.text}
                    onChange={(e) => setDamageText(i, e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2"
                    placeholder="Skriv en kort beskrivning…"
                  />

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openCamera(i)}
                      className="rounded-md px-3 py-2 border border-zinc-600"
                    >
                      Ta bilder
                    </button>
                    <button
                      type="button"
                      onClick={() => openGallery(i)}
                      className="rounded-md px-3 py-2 border border-zinc-600"
                    >
                      Välj från galleri
                    </button>

                    {/* dolda inputs */}
                    <input
                      type="file"
                      ref={(el) => (cameraInputs.current[i] = el!)}
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => pickFiles(i, e)}
                    />
                    <input
                      type="file"
                      ref={(el) => (galleryInputs.current[i] = el!)}
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => pickFiles(i, e)}
                    />
                  </div>

                  {dmg.previews.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {dmg.previews.map((src, p) => (
                        <div key={p} className="relative">
                          <img
                            src={src}
                            alt={`Skadefoto ${i + 1}-${p + 1}`}
                            className="h-20 w-full object-cover rounded-md border border-zinc-700"
                          />
                          <button
                            type="button"
                            onClick={() => deletePreview(i, p)}
                            className="absolute -top-2 -right-2 bg-white text-black rounded-full border px-1.5 text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Övriga anteckningar */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg bg-zinc-900 border-zinc-700 px-3 py-2"
            placeholder="Övrig info…"
          />
        </div>

        {/* Status & Submit */}
        {status === 'error' && (
          <div className="text-sm text-red-400">{message}</div>
        )}
        {status === 'done' && (
          <div className="text-sm text-green-400">Tack {thanksTo}!</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || status === 'saving'}
          className="w-full rounded-2xl px-4 py-3 font-semibold shadow bg-blue-600 text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Skickar…' : 'Spara incheckning'}
        </button>

        <p className="text-[11px] text-zinc-500">
          © Albarone AB {new Date().getFullYear()}
        </p>
      </form>
    </div>
  );
}
