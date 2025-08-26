'use client';

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  ChangeEvent,
} from 'react';
import supabase from '../../lib/supabase';

// === Typer ===
type Station = { id: string; name: string; email?: string | null };
type DamageEntry = { text: string; files: File[]; previews: string[] };

// === Hjälp ===
function cleanName(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

export default function FormClient() {
  // --- Header / “inloggad” (mock) ---
  const [username] = useState<string>('Bob'); // temporärt “inloggad”
  const [thanksTo, setThanksTo] = useState<string>('Bob');

  // --- fält ---
  const [regnr, setRegnr] = useState('');
  const [brandModel, setBrandModel] = useState<string>('');
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorageText, setTireStorageText] = useState<string>('—'); // “Hjulförvaring: …”

  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<string>(''); // obligatorisk
  const [stationOther, setStationOther] = useState<string>('');

  const [odometerKm, setOdometerKm] = useState<string>('');

  // Bränsle:
  const [fuelFull, setFuelFull] = useState<boolean | null>(true);

  // Övriga Ja/Nej:
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<boolean | null>(null);

  // Laddsladdar 0/1/2:
  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(0);

  // Hjul (systemets + användarens val):
  const [systemWheelsOn, setSystemWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [tiresType, setTiresType] = useState<'sommar' | 'vinter' | null>(null);
  const [wheelType, setWheelType] = useState<'sommar' | 'vinter' | null>(null);

  // Behov:
  const [washNeed, setWashNeed] = useState<boolean | null>(null);
  const [vacuumNeed, setVacuumNeed] = useState<boolean | null>(null);

  // Nya skador?
  const [askNewDamage, setAskNewDamage] = useState<boolean | null>(null);
  const [noNewDamage, setNoNewDamage] = useState<boolean>(false);

  // Nya skador – lista (varje rad kräver text + ev. foton)
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const fileInputRefs = useRef<HTMLInputElement[]>([]);

  // Övrigt
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const BUCKET = 'damage-photos';

  // === Ladda stationer ===
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('id,name,email')
        .order('name', { ascending: true });
      if (!error && data) setStations(data as Station[]);
    })();
  }, []);

  // === Hämta bilmodell + befintliga skador + ev. hjul-uppgift ===
  async function lookupVehicle(reg: string) {
    const r = reg.trim().toUpperCase();
    if (!r) return;

    // 1) Vy med modell + skador
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

    // 2) Förvaring / vilka hjul “systemet” tror sitter på just nu
    //    (om du har tire_storage_summary med kolumn wheels_on och ev. location/hyllplats)
    const { data: ts } = await supabase
      .from('tire_storage_summary')
      .select('wheels_on, storage_text') // storage_text = t.ex. “Förråd A, Hylla 12” – lägg till i din vy när du vill
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

  // === Hantera “Är du säker?” om val strider mot systemets hjul ===
  function setWheelsSafely(val: 'sommar' | 'vinter') {
    if (systemWheelsOn && systemWheelsOn !== val) {
      const ok = window.confirm(
        `Systemet anger “${systemWheelsOn}hjul” på bilen, men du valde “${val}hjul”. Är du säker?`,
      );
      if (!ok) return;
    }
    setWheelsOn(val);
    // Sätt även tiresType / wheelType om du vill hålla dem lika
    setTiresType(val);
    setWheelType(val);
  }

  // === Nya skador – radhantering ===
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
          ? { ...x, files: [...x.files, ...fs].slice(0, 12), previews: [...x.previews, ...fs.map((f) => URL.createObjectURL(f))] }
          : x,
      ),
    );
  }
  function removeDamagePhoto(di: number, pi: number) {
    setDamages((d) =>
      d.map((x, idx) =>
        idx === di ? { ...x, files: x.files.filter((_, j) => j !== pi), previews: x.previews.filter((_, j) => j !== pi) } : x,
      ),
    );
  }

  // === Validering ===
  const regnrValid = /^[A-ZÅÄÖ0-9-]{3,}$/.test(regnr.trim().toUpperCase());
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

  const stationChosen = !!stationId;
  const canSubmit =
    regnrValid &&
    stationChosen &&
    odometerKm.trim() !== '' &&
    mustAnswer &&
    (askNewDamage === false || damages.every((d) => d.text.trim() !== ''));

  // === Uppladdning till Storage ===
  async function uploadAllDamagePhotos(reg: string) {
    // Returnerar: listor med URL:er per skaderad
    const perRowUrls: string[][] = [];

    for (let i = 0; i < damages.length; i++) {
      const row = damages[i];
      const urls: string[] = [];

      for (let j = 0; j < row.files.length; j++) {
        const f = row.files[j];
        const name = `${Date.now()}-${j}-${cleanName(f.name || `skada-${i + 1}.jpg`)}`;
        const path = `${reg}/${name}`;

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

  // === Submit ===
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setStatus('saving');
      setMessage('');

      const r = regnr.trim().toUpperCase();
      const odo = parseInt(odometerKm.replace(/\D+/g, ''), 10) || 0;

      // 1) ladda upp foton för varje skaderad (om några)
      const photoUrlsPerRow = askNewDamage ? await uploadAllDamagePhotos(r) : [];

      // 2) skapa checkin
      const insertObj: any = {
        regnr: r,
        regnr_valid: regnrValid,
        station_id: stationId || null,
        station_other: stationOther || null,

        notes: notes || null,
        photo_urls: [], // foton på själva check-in (inte nya skador) – låter stå tomt tills vi ev. separerar

        no_new_damage: askNewDamage === false ? true : false,
        odometer_km: odo,

        fuel_full: fuelFull,
        adblue_ok: adBlueOk,
        washer_ok: washerOk,
        cargo_cover_ok: privacyCoverOk,

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

      // 3) om nya skador: skapa rader i checkin_damages (text + photo_urls)
      if (askNewDamage && damages.length > 0) {
        const rows = damages.map((d, i) => ({
          checkin_id: checkinId,
          text: d.text.trim(),
          photo_urls: photoUrlsPerRow[i] || [],
        }));
        const { error: dErr } = await supabase.from('checkin_damages').insert(rows);
        if (dErr) throw dErr;
      }

      setThanksTo(username);
      setStatus('done');
      setMessage('Incheckningen är sparad. Tack!');

      // Rensa formulär (lagom mycket)
      setExistingDamages([]);
      setBrandModel('');
      setTireStorageText('—');
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
      setNoNewDamage(false);
      setDamages([]);
      setNotes('');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err?.message || 'Kunde inte spara.');
    }
  }

  // === UI ===
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {/* Rubrik + “inloggad” */}
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <span className="text-sm text-zinc-400">Inloggad: {username}</span>
      </div>

      {/* Bilmodell + befintliga skador (döljs tills regnr hämtas) */}
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

        {/* Station */}
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
            className="mt-2 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2"
            placeholder="Ev. annan inlämningsplats"
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
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
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-1 flex gap-3">
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

        {/* Laddsladdar (0/1/2) */}
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

        {/* Hjul som sitter på + typ */}
        <div>
          <div className="text-sm font-medium">Hjul som sitter på *</div>
          <div className="mt-1 flex flex-wrap gap-3">
            <label className="flex items-center gap-2">
              <input type="radio" checked={wheelsOn === 'sommar'} onChange={() => setWheelsSafely('sommar')} /> Sommarhjul
            </label>
            <label className="flex
