'use client';

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  ChangeEvent,
} from 'react';
import supabase from '../../lib/supabase';

// ======= Typer =======
type Station = { id: string; name: string; email?: string | null };
type DamageEntry = { text: string; files: File[]; previews: string[] };

// ======= Hjälp =======
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

export default function FormClient() {
  // --- “inloggad” (mock tills riktig auth finns) ---
  const [username] = useState<string>('Bob');
  const [thanksTo, setThanksTo] = useState<string>('Bob');

  // --- Regnr & bilinfo ---
  const [regnr, setRegnr] = useState('');
  const [brandModel, setBrandModel] = useState<string>('');
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorageText, setTireStorageText] = useState<string>('—'); // “Hjulförvaring: …” (plats/hylla)

  // --- Station ---
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<string>(''); // obligatorisk
  const [stationOther, setStationOther] = useState<string>(''); // Ev. annan inlämningsplats

  // --- Mätare ---
  const [odometerKm, setOdometerKm] = useState<string>('');

  // --- Tank ---
  const [fuelFull, setFuelFull] = useState<boolean | null>(true);

  // --- JA/NEJ-grupp ---
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<boolean | null>(null);

  // --- Laddsladdar 0/1/2 ---
  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(0);

  // --- Hjul (systemets info + användarens val) ---
  const [systemWheelsOn, setSystemWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [tiresType, setTiresType] = useState<'sommar' | 'vinter' | null>(null);
  const [wheelType, setWheelType] = useState<'sommar' | 'vinter' | null>(null);

  // --- Behov ---
  const [washNeed, setWashNeed] = useState<boolean | null>(null);    // Utvändig tvätt behövs
  const [vacuumNeed, setVacuumNeed] = useState<boolean | null>(null);// Dammsugning behövs

  // --- Nya skador ---
  const [askNewDamage, setAskNewDamage] = useState<boolean | null>(null); // JA/NEJ-frågan
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const fileInputs = useRef<HTMLInputElement[]>([]);

  // --- Övriga anteckningar ---
  const [notes, setNotes] = useState('');

  // --- UI-status ---
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const BUCKET = 'damage-photos';

  // ======= Ladda stationer =======
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('id,name,email')
        .order('name', { ascending: true });
      if (!error && data) setStations(data as Station[]);
    })();
  }, []);

  // ======= Hämta bilmodell, befintliga skador och ev. hjulförvaring/hjul =======
  async function lookupVehicle(reg: string) {
    const r = reg.trim().toUpperCase();
    if (!r) return;

    // 1) Bilmodell + befintliga skador
    const { data: v, error: ev } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .eq('regnr', r)
      .maybeSingle();

    if (!ev && v) {
      setBrandModel(v.brand_model ?? '');
      setExistingDamages(Array.isArray(v.damages) ? v.damages : []);
    } else {
      setBrandModel('');
      setExistingDamages([]);
    }

    // 2) Hjulförvaring + “systemets” hjul (om du har en vy som kan svara)
    const { data: ts } = await supabase
      .from('tire_storage_summary')
      .select('wheels_on, storage_text')
      .eq('regnr', r)
      .maybeSingle();

    if (ts?.wheels_on === 'sommar' || ts?.wheels_on === 'vinter') {
      setSystemWheelsOn(ts.wheels_on);
      setTireStorageText(ts.storage_text ?? '—');
    } else {
      setSystemWheelsOn(null);
      setTireStorageText('—');
    }
  }

  function setWheelsSafely(val: 'sommar' | 'vinter') {
    if (systemWheelsOn && systemWheelsOn !== val) {
      const ok = window.confirm(
        `Systemet anger “${systemWheelsOn}hjul” på bilen, men du valde “${val}hjul”. Är du säker?`
      );
      if (!ok) return;
    }
    setWheelsOn(val);
    setTiresType(val);
    setWheelType(val);
  }

  // ======= Nya skador – hantering av rader =======
  function addDamage() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }
  function updateDamageText(i: number, text: string) {
    setDamages((d) => d.map((x, idx) => (idx === i ? { ...x, text } : x)));
  }
  function onPickFiles(i: number, e: ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files || []);
    setDamages((d) =>
      d.map((x, idx) =>
        idx === i
          ? {
              ...x,
              files: [...x.files, ...fs].slice(0, 12),
              previews: [...x.previews, ...fs.map((f) => URL.createObjectURL(f))],
            }
          : x
      )
    );
  }
  function removeDamagePhoto(di: number, pi: number) {
    setDamages((d) =>
      d.map((x, idx) =>
        idx === di
          ? {
              ...x,
              files: x.files.filter((_, j) => j !== pi),
              previews: x.previews.filter((_, j) => j !== pi),
            }
          : x
      )
    );
  }

  // ======= Validering & “kan skicka” =======
  const regnrValid = /^[A-ZÅÄÖ0-9-]{3,}$/.test(regnr.trim().toUpperCase());
  const stationChosen = !!stationId;

  const mustAnswer =
    fuelFull !== null &&
    adBlueOk !== null &&
    washerOk !== null &&
    privacyCoverOk !== null &&
    chargeCableCount !== null &&
    wheelsOn !== null &&
    washNeed !== null &&
    vacuumNeed !== null &&
    askNewDamage !== null;

  const allDamageRowsHaveText =
    !askNewDamage || damages.every((d) => d.text.trim().length > 0);

  const canSubmit =
    regnrValid &&
    stationChosen &&
    odometerKm.trim() !== '' &&
    mustAnswer &&
    allDamageRowsHaveText;

  // ======= Ladda upp foton för varje skaderad =======
  async function uploadAllDamagePhotos(reg: string) {
    const perRowUrls: string[][] = [];

    for (let i = 0; i < damages.length; i++) {
      const row = damages[i];
      const urls: string[] = [];

      for (let j = 0; j < row.files.length; j++) {
        const f = row.files[j];
        const safeName = `${Date.now()}-${j}-${cleanFileName(f.name || `skada-${i + 1}.jpg`)}`;
        const path = `${reg}/${safeName}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
          upsert: false,
        });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (pub?.publicUrl) urls.push(pub.publicUrl);
      }

      perRowUrls.push(urls);
    }

    return perRowUrls;
  }

  // ======= Submit =======
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setStatus('saving');
      setMessage('');

      const r = regnr.trim().toUpperCase();
      const odo = parseInt(odometerKm.replace(/\D+/g, ''), 10) || 0;

      // 1) Ladda upp foton (om nya skador)
      const perRowPhotoUrls = askNewDamage ? await uploadAllDamagePhotos(r) : [];

      // 2) Skapa checkin
      const insertObj: any = {
        regnr: r,
        regnr_valid: regnrValid,
        station_id: stationId || null,
        station_other: stationOther || null,

        notes: notes || null,
        photo_urls: [], // reservfält – vi använder checkin_damages för skador

        no_new_damage: askNewDamage === false ? true : false,
        odometer_km: odo,

        fuel_full: fuelFull,
        adblue_ok: adBlueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyCoverOk,

        charge_cable_count: chargeCableCount,

        tires_type: tiresType,
        wheel_type: wheelType,
        wheels_on: wheelsOn,

        wash_need: washNeed,
        vacuum_need: vacuumNeed,
      };

      const { data: ins, error: insErr } = await supabase
        .from('checkins')
        .insert(insertObj)
        .select('id')
        .single();

      if (insErr) throw insErr;
      const checkinId = ins!.id as string;

      // 3) Skador
      if (askNewDamage && damages.length > 0) {
        const rows = damages.map((d, i) => ({
          checkin_id: checkinId,
          text: d.text.trim(),
          photo_urls: perRowPhotoUrls[i] || [],
        }));

        const { error: dErr } = await supabase.from('checkin_damages').insert(rows);
        if (dErr) throw dErr;
      }

      setThanksTo(username);
      setStatus('done');
      setMessage('Incheckningen är sparad.');

      // Rensa lagom
      setOdometerKm('');
      setFuelFull(true);
      setAdBlueOk(null);
      setWasherOk(null);
      setPrivacyCoverOk(null);
      setChargeCableCount(0);
      setWheelsOn(null);
      setTiresType(null);
      setWheelType(null);
      setWashNeed(null);
      setVacuumNeed(null);
      setAskNewDamage(null);
      setDamages([]);
      setNotes('');
      // Behåll regnr/station om du vill snabb-checka fler – eller nollställ:
      // setRegnr(''); setStationId(''); setStationOther('');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err?.message || 'Kunde inte spara incheckningen.');
    }
  }

  // ======= UI =======
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {/* Rubrik och “inloggad” */}
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <span className="text-sm text-zinc-400">Inloggad: {username}</span>
      </div>

      {/* Bilkort (dyker upp efter regnr-sök) */}
      {brandModel && (
        <div className="mb-4 rounded-lg border border-zinc-700/50 bg-zinc-900 p-3 text-sm">
          <div><span className="opacity-60">Bil:</span> {brandModel}</div>
          <div className="mt-1"><span className="opacity-60">Hjulförvaring:</span> {tireStorageText}</div>
          {existingDamages.length > 0 && (
            <div className="mt-2">
              <div className="opacity-60">Befintliga skador:</div>
              <ul className="list-disc pl-5">
                {existingDamages.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Regnr */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => lookupVehicle(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
          />
        </div>

        {/* Station + ev. annan inlämningsplats */}
        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
            required
          >
            <option value="" hidden>Välj station …</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-2 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
            placeholder="Ev. annan inlämningsplats"
          />
        </div>

        {/* Mätarställning */}
        <div>
          <label className="block text-sm font-medium">Mätarställning *</label>
          <div className="flex items-center gap-2">
            <input
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value.replace(/\D+/g, ''))}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
              placeholder="ex. 42 180"
              inputMode="numeric"
            />
            <span className="text-sm opacity-60">km</span>
          </div>
        </div>

        {/* Tanknivå */}
        <div>
          <span className="block text-sm font-medium">Tanknivå *</span>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={fuelFull === true} onChange={() => setFuelFull(true)} /> Fulltankad
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={fuelFull === false} onChange={() => setFuelFull(false)} /> Ej fulltankad
            </label>
          </div>
        </div>

        {/* JA/NEJ – AdBlue, Spolarvätska, Insynsskydd */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm font-medium">AdBlue OK? *</div>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={adBlueOk === true} onChange={() => setAdBlueOk(true)} /> Ja</label>
              <label className="flex items-center gap-2"><input type="radio" checked={adBlueOk === false} onChange={() => setAdBlueOk(false)} /> Nej</label>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Spolarvätska OK? *</div>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={washerOk === true} onChange={() => setWasherOk(true)} /> Ja</label>
              <label className="flex items-center gap-2"><input type="radio" checked={washerOk === false} onChange={() => setWasherOk(false)} /> Nej</label>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Insynsskydd OK? *</div>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={privacyCoverOk === true} onChange={() => setPrivacyCoverOk(true)} /> Ja</label>
              <label className="flex items-center gap-2"><input type="radio" checked={privacyCoverOk === false} onChange={() => setPrivacyCoverOk(false)} /> Nej</label>
            </div>
          </div>
        </div>

        {/* Antal laddsladdar – tre knappar */}
        <div>
          <div className="text-sm font-medium">Antal laddsladdar *</div>
          <div className="mt-2 flex gap-2">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
                className={`rounded-md border px-4 py-2 ${chargeCableCount === n ? 'bg-white text-black' : 'bg-transparent'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på + typ (kopplas ihop) */}
        <div>
          <div className="text-sm font-medium">Hjul som sitter på *</div>
          <div className="mt-1 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={wheelsOn === 'sommar'} onChange={() => setWheelsSafely('sommar')} /> Sommarhjul
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={wheelsOn === 'vinter'} onChange={() => setWheelsSafely('vinter')} /> Vinterhjul
            </label>
          </div>
        </div>

        {/* Tvätt & Dammsugning */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium">Utvändig tvätt behövs? *</div>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={washNeed === true} onChange={() => setWashNeed(true)} /> Ja</label>
              <label className="flex items-center gap-2"><input type="radio" checked={washNeed === false} onChange={() => setWashNeed(false)} /> Nej</label>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Dammsugning behövs? *</div>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={vacuumNeed === true} onChange={() => setVacuumNeed(true)} /> Ja</label>
              <label className="flex items-center gap-2"><input type="radio" checked={vacuumNeed === false} onChange={() => setVacuumNeed(false)} /> Nej</label>
            </div>
          </div>
        </div>

        {/* Nya skador JA/NEJ */}
        <div>
          <div className="text-sm font-medium">Nya skador på bilen? *</div>
          <div className="mt-1 flex gap-3">
            <label className="flex items-center gap-2"><input type="radio" checked={askNewDamage === true} onChange={() => setAskNewDamage(true)} /> Ja</label>
            <label className="flex items-center gap-2"><input type="radio" checked={askNewDamage === false} onChange={() => setAskNewDamage(false)} /> Nej</label>
          </div>
        </div>

        {/* Skadeblock – visas endast om JA */}
        {askNewDamage && (
          <div className="rounded-lg border border-zinc-700/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Beskriv nya skador</div>
              <button
                type="button"
                onClick={addDamage}
                className="rounded-md border px-3 py-1 text-sm"
              >
                {damages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
              </button>
            </div>

            {damages.length === 0 && (
              <p className="text-sm opacity-60">Inga skador tillagda ännu.</p>
            )}

            {damages.map((dmg, i) => (
              <div key={i} className="mt-3 rounded-md bg-zinc-900/40 p-3">
                <label className="block text-sm font-medium">Text (obligatorisk)</label>
                <textarea
                  value={dmg.text}
                  onChange={(e) => updateDamageText(i, e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2"
                  placeholder="Ex: Repa höger bakskärm"
                />

                <div className="mt-2">
                  <div className="text-sm font-medium">Foton</div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-sm"
                      onClick={() => fileInputs.current?.[i]?.click()}
                    >
                      Kamera / Galleri
                    </button>
                    <input
                      ref={(el) => { if (el) fileInputs.current[i] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => onPickFiles(i, e)}
                    />
                  </div>

                  {dmg.previews.length > 0 && (
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {dmg.previews.map((src, pi) => (
                        <div key={pi} className="relative">
                          <img src={src} alt={`Skadefoto ${i + 1}-${pi + 1}`} className="h-20 w-full rounded-md object-cover border" />
                          <button
                            type="button"
                            onClick={() => removeDamagePhoto(i, pi)}
                            className="absolute -right-2 -top-2 rounded-full border bg-white px-2 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Övriga anteckningar */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
            placeholder="Övrig info…"
          />
        </div>

        {/* Status / fel / tack */}
        {status === 'error' && (
          <div className="text-sm text-red-400">{message}</div>
        )}
        {status === 'done' && (
          <div className="text-sm text-green-400">Tack {thanksTo}! {message}</div>
        )}

        {/* Spara */}
        <button
          type="submit"
          disabled={!canSubmit || status === 'saving'}
          className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-50"
        >
          {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
        </button>

        <div className="pt-2 text-center text-xs opacity-60">
          © Albarone AB {new Date().getFullYear()}
        </div>
      </form>
    </main>
  );
}
