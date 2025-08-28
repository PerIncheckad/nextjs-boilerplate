'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';

// ===============================
// Hjälptyper
// ===============================
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string };
type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

// ===============================
// Tvåstegs-stationer: Ort -> Station/depå
// Fyll på/ändra fritt (id är det som sparas i databasen)
// ===============================
const STATIONS: Record<string, Station[]> = {
  'Ängelholm': [
    { id: 'angelholm-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'angelholm-hedin', name: 'Hedin Automotive' },
    { id: 'angelholm-airport', name: 'Ängelholm Airport' },
  ],
  'Falkenberg': [{ id: 'falkenberg', name: 'Falkenberg' }],
  'Halmstad': [
    { id: 'halmstad-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'halmstad-hedin-kia', name: 'Hedin Automotive Kia' },
    { id: 'halmstad-hedin-mercedes', name: 'Hedin Automotive Mercedes' },
    { id: 'halmstad-hedin', name: 'Hedin Automotive' },
    { id: 'halmstad-city-airport', name: 'Halmstad City Airport' },
  ],
  'Helsingborg': [
    { id: 'helsingborg-bilskadeservice', name: 'Bil & Skadeservice' },
    { id: 'helsingborg-floretten', name: 'Floretten' },
    { id: 'helsingborg-forenade-bil', name: 'Förenade Bil' },
    { id: 'helsingborg-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'helsingborg-hedin-kia', name: 'Hedin Automotive Kia' },
    { id: 'helsingborg-hedin', name: 'Hedin Automotive' },
    { id: 'helsingborg-hedin-transport', name: 'Hedin Bil Transport' },
    { id: 'helsingborg-sjonsson', name: 'S.Jönsson Bil' },
    { id: 'helsingborg-verkstad', name: 'Verkstad' },
    { id: 'helsingborg-hbsc', name: 'HBSC' },
  ],
  'Lund': [
    { id: 'lund-bilskadeservice', name: 'Bil & Skadeservice' },
    { id: 'lund-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'lund-hedin', name: 'Hedin Automotive' },
    { id: 'lund-hedin-bil', name: 'Hedin Bil' },
    { id: 'lund-p7-revingehed', name: 'P7 Revingehed' },
  ],
  'Malmö': [
    { id: 'malmo-automer', name: 'Automerna' },
    { id: 'malmo-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'malmo-hedin-jagersro', name: 'Hedin Automotive Jägersro' },
    { id: 'malmo-hedin-mercedes', name: 'Hedin Automotive Mercedes' },
    { id: 'malmo-mechanum', name: 'Mechanum' },
    { id: 'malmo-airport', name: 'Malmö Airport' },
    { id: 'malmo-bernstorp-verkstad', name: 'BERNSTORP (Verkstad)' },
    { id: 'malmo-burlov-hedin', name: 'BURLÖV (Hedin Automotive)' },
    { id: 'malmo-fosie-hedbergs', name: 'FOSIE (Hedbergs Bil)' },
    { id: 'malmo-hamn-verkstad', name: 'HAMN (Verkstad)' },
    { id: 'malmo-langtid', name: 'LÅNGTID' },
  ],
  'Trelleborg': [{ id: 'trelleborg', name: 'Trelleborg' }],
  'Varberg': [
    { id: 'varberg-finnvedens-skadecenter', name: 'Finnvedens Bil Skadecenter' },
    { id: 'varberg-hedin-ford', name: 'Hedin Automotive Ford' },
    { id: 'varberg-hedin-holmgarde', name: 'Hedin Automotive Holmgärde' },
    { id: 'varberg-hedin', name: 'Hedin Automotive' },
    { id: 'varberg-sallstorps-plat-lack', name: 'Sällstorps Plåt & Lack' },
  ],
};

// ===============================
// UI helpers
// ===============================
const yesNoBtn = (active: boolean | null) =>
  `w-full rounded-lg border px-4 py-3 text-center ${active === true
    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
    : active === false
      ? 'bg-white text-zinc-900 border-zinc-600'
      : 'bg-white text-zinc-900 border-zinc-600'}`;

const choiceBtn = (active: boolean) =>
  `rounded-lg border px-4 py-2 ${active
    ? 'bg-blue-600 text-white border-blue-600'
    : 'bg-white text-zinc-900 border-zinc-600'}`;

const chipBtn = (active: boolean) =>
  `rounded-md border px-4 py-2 ${active
    ? 'bg-blue-100 text-blue-900 border-blue-300'
    : 'bg-white text-zinc-900 border-zinc-600'}`;

// ===============================
// Utils
// ===============================
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(
    d.getMinutes(),
  ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

// ===============================
// Komponent
// ===============================
export default function CheckinFormClient() {
  // --- header / mock user ---
  const [username] = useState('Bob');

  // --- regnr & bilinfo ---
  const [regnr, setRegnr] = useState('');
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorage, setTireStorage] = useState<string | null>(null);

  // --- stationer ---
  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');

  // --- mätarställning ---
  const [odometer, setOdometer] = useState<string>('');

  // --- ja/nej ---
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyOk] = useState<boolean | null>(null);

  // --- laddsladdar 0/1/2 ---
  const [chargeCableCount, setChargeCableCount] = useState<number | null>(null);

  // --- hjultyp (obligatorisk) ---
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  // --- nya skador ---
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const fileInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // --- anteckningar ---
  const [notes, setNotes] = useState('');

  // --- status ---
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string>('');

  // ===============================
  // Regnr-uppslag: modell + befintliga skador + “Fel reg.nr”
  // ===============================
  async function lookupVehicle(plate: string) {
    const p = plate.trim().toUpperCase();
    if (!p) return;
    try {
      // 1) Försök i "allowed_plates"
      const ap = await supabase
        .from('allowed_plates')
        .select('*')
        .eq('regnr', p)
        .maybeSingle();

      if (ap?.data) {
        setRegnrValid(true);
        // Försök hitta modellnamn i tänkbara fält
        const row = ap.data as any;
        const model =
          row.model ||
          row.car_model ||
          row.vehicle ||
          row.name ||
          row.modell ||
          [row.make, row.model].filter(Boolean).join(' ') ||
          null;
        setVehicleInfo(model ? String(model) : '—');

        // “hjulförvaring” finns inte än – placeholder
        setTireStorage('—');
      } else {
        setRegnrValid(false);
        setVehicleInfo(null);
        setExistingDamages([]);
      }

      // 2) Befintliga skador i ev. tabell
      const ad = await supabase
        .from('active_damages')
        .select('text')
        .eq('regnr', p);

      if (ad?.data) {
        const texts = (ad.data as any[]).map((r) => r.text).filter(Boolean);
        setExistingDamages(texts.length ? texts : []);
      } else {
        setExistingDamages([]);
      }
    } catch (e) {
      console.error('lookupVehicle error', e);
      setRegnrValid(false);
      setVehicleInfo(null);
      setExistingDamages([]);
    }
  }

  // ===============================
  // Skade-hanterare
  // ===============================
  function addDamage() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }
  function removeDamage(index: number) {
    setDamages((d) => d.filter((_, i) => i !== index));
  }
  function updateDamageText(index: number, text: string) {
    setDamages((d) => {
      const copy = [...d];
      copy[index] = { ...copy[index], text };
      return copy;
    });
  }
  function handleDamageFiles(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const previews = files.map((f) => URL.createObjectURL(f));

    setDamages((prev) => {
      const copy = [...prev];
      const old = copy[index];
      copy[index] = {
        ...old,
        files: [...(old.files || []), ...files],
        previews: [...(old.previews || []), ...previews],
      };
      return copy;
    });
  }

  // ===============================
  // Upload av alla skadefoton
  // ===============================
  async function uploadAllDamagePhotos(): Promise<string[][]> {
    const results: string[][] = [];
    const plate = regnr.trim().toUpperCase() || 'NO-PLATE';
    for (let i = 0; i < damages.length; i++) {
      const dmg = damages[i];
      const urls: string[] = [];
      for (const f of dmg.files) {
        const safe = cleanFileName(f.name || 'bild.jpg');
        const path = `${plate}/${nowStamp()}-${safe}`;
        const { error } = await supabase.storage.from('damage-photos').upload(path, f, {
          upsert: false,
          contentType: f.type || 'image/jpeg',
        });
        if (error) {
          console.error('upload error', error);
          throw error;
        }
        const { data } = supabase.storage.from('damage-photos').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
      results.push(urls);
    }
    return results;
  }

  // ===============================
  // Submit
  // ===============================
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    // Validering
    if (!regnr.trim()) return setStatus('error'), setMessage('Ange registreringsnummer.');
    if (!regnrValid) return setStatus('error'), setMessage('Fel reg.nr');
    if (!city) return setStatus('error'), setMessage('Välj ort.');
    if (!stationId) return setStatus('error'), setMessage('Välj station / depå.');
    if (!odometer.trim() || Number.isNaN(Number(odometer.replace(/\s/g, ''))))
      return setStatus('error'), setMessage('Ange giltig mätarställning.');
    if (fuelFull === null) return setStatus('error'), setMessage('Välj tanknivå.');
    if (adblueOk === null) return setStatus('error'), setMessage('Välj AdBlue OK?.');
    if (washerOk === null) return setStatus('error'), setMessage('Välj Spolarvätska OK?.');
    if (privacyCoverOk === null) return setStatus('error'), setMessage('Välj Insynsskydd OK?.');
    if (chargeCableCount === null) return setStatus('error'), setMessage('Välj antal laddsladdar.');
    if (!wheelsOn) return setStatus('error'), setMessage('Välj hjul som sitter på.');
    if (hasNewDamage === null) return setStatus('error'), setMessage('Svara om nya skador finns.');
    if (hasNewDamage && damages.some((d) => !d.text.trim()))
      return setStatus('error'), setMessage('Text krävs för varje ny skada.');

    try {
      // Ladda upp foton om nya skador
      let photoGroups: string[][] = [];
      if (hasNewDamage && damages.length) {
        photoGroups = await uploadAllDamagePhotos();
      }

      // Bygg insert-objekt – anpassa kolumnnamn vid behov
      const insertObj: any = {
        regnr: regnr.trim().toUpperCase(),
        notes: notes || null,
        station_id: stationId || null,
        station_other: stationOther || null,

        odometer_km: Number(odometer.replace(/\s/g, '')),

        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyCoverOk,

        charge_cable_count: chargeCableCount, // ev. "charging_cables" i din tabell

        wheels_on: wheelsOn, // text 'sommar'/'vinter' – ändra om din kolumn heter 'tires_type' eller 'wheel_type'

        no_new_damage: !hasNewDamage,
        // photo_urls: lägga som "platta" lista eller gruppvis. Här sparar vi platt:
        photo_urls: photoGroups.flat(), // kolumnen bör vara text[] i Supabase
      };

      // Spara
      const { error } = await supabase.from('checkins').insert(insertObj).select().single();
      if (error) {
        console.error('DB insert error:', error);
        setStatus('error');
        setMessage(error.message ?? 'Kunde inte spara. Försök igen.');
        return;
      }

      setStatus('done');
      setMessage(`Tack ${username}! Incheckning sparad.`);
      // Nollställ rimliga fält
      setDamages([]);
      setHasNewDamage(null);
    } catch (err: any) {
      console.error('submit error', err);
      setStatus('error');
      setMessage(err?.message ?? 'Kunde inte spara. Försök igen.');
    }
  }

  // ===============================
  // UI
  // ===============================
  const stationOptions = useMemo<Station[]>(
    () => (city ? STATIONS[city] ?? [] : []),
    [city],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 text-zinc-100">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Ny incheckning</h1>
        <div className="text-sm text-zinc-300">Inloggad: <span className="font-medium">{username}</span></div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* REGNR */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => lookupVehicle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-white px-3 py-2 text-zinc-900 tracking-widest uppercase"
            placeholder="ABC123"
          />
          {regnr && regnrValid === false && (
            <div className="mt-1 text-sm text-red-400">Fel reg.nr</div>
          )}

          {/* Bilinfo */}
          {(vehicleInfo || existingDamages.length > 0 || tireStorage) && (
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 text-zinc-200">
              {vehicleInfo && (
                <div className="mb-2">
                  <span className="font-semibold">Bil:</span> {vehicleInfo}
                </div>
              )}
              {tireStorage && (
                <div className="mb-2">
                  <span className="font-semibold">Hjulförvaring:</span> {tireStorage}
                </div>
              )}
              {existingDamages.length > 0 && (
                <div>
                  <div className="font-semibold">Befintliga skador:</div>
                  <ul className="list-disc pl-5">
                    {existingDamages.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STATION / DEPO */}
        <div>
          <label className="block text-sm font-medium">Ort *</label>
          <select
            value={city}
            onChange={(e) => { setCity(e.target.value); setStationId(''); }}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">— Välj ort —</option>
            {Object.keys(STATIONS).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!city}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-white px-3 py-2 text-zinc-900 disabled:opacity-60"
          >
            <option value="">{city ? '— Välj station / depå —' : 'Välj ort först'}</option>
            {stationOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-white px-3 py-2 text-zinc-900"
            placeholder="Ev. annan inlämningsplats"
          />
        </div>

        {/* MÄTARSTÄLLNING */}
        <div>
          <label className="block text-sm font-medium">Mätarställning *</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/[^\d\s]/g, ''))}
              inputMode="numeric"
              className="w-full rounded-lg border border-zinc-700 bg-white px-3 py-2 text-zinc-900"
              placeholder="ex. 42 180"
            />
            <span className="text-zinc-300">km</span>
          </div>
        </div>

        {/* Tanknivå */}
        <div>
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoBtn(fuelFull === true)} onClick={() => setFuelFull(true)}>Fulltankad</button>
            <button type="button" className={yesNoBtn(fuelFull === false)} onClick={() => setFuelFull(false)}>Ej fulltankad</button>
          </div>
        </div>

        {/* AdBlue */}
        <div>
          <label className="block text-sm font-medium">AdBlue OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoBtn(adblueOk === true)} onClick={() => setAdblueOk(true)}>Ja</button>
            <button type="button" className={yesNoBtn(adblueOk === false)} onClick={() => setAdblueOk(false)}>Nej</button>
          </div>
        </div>

        {/* Spolarvätska */}
        <div>
          <label className="block text-sm font-medium">Spolarvätska OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoBtn(washerOk === true)} onClick={() => setWasherOk(true)}>Ja</button>
            <button type="button" className={yesNoBtn(washerOk === false)} onClick={() => setWasherOk(false)}>Nej</button>
          </div>
        </div>

        {/* Insynsskydd */}
        <div>
          <label className="block text-sm font-medium">Insynsskydd OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoBtn(privacyCoverOk === true)} onClick={() => setPrivacyOk(true)}>Ja</button>
            <button type="button" className={yesNoBtn(privacyCoverOk === false)} onClick={() => setPrivacyOk(false)}>Nej</button>
          </div>
        </div>

        {/* Laddsladdar */}
        <div>
          <label className="block text-sm font-medium">Antal laddsladdar *</label>
          <div className="mt-2 flex gap-2">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                className={chipBtn(chargeCableCount === n)}
                onClick={() => setChargeCableCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på */}
        <div>
          <label className="block text-sm font-medium">Hjul som sitter på *</label>
          <div className="mt-2 flex gap-3">
            <button type="button" className={choiceBtn(wheelsOn === 'sommar')} onClick={() => setWheelsOn('sommar')}>Sommarhjul</button>
            <button type="button" className={choiceBtn(wheelsOn === 'vinter')} onClick={() => setWheelsOn('vinter')}>Vinterhjul</button>
          </div>
        </div>

        {/* Nya skador */}
        <div>
          <label className="block text-sm font-medium">Nya skador på bilen? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoBtn(hasNewDamage === true)} onClick={() => { setHasNewDamage(true); if (damages.length === 0) addDamage(); }}>Ja</button>
            <button type="button" className={yesNoBtn(hasNewDamage === false)} onClick={() => { setHasNewDamage(false); setDamages([]); }}>Nej</button>
          </div>

          {hasNewDamage === true && (
            <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50/70 p-4 text-amber-900">
              {/* Skador */}
              <div className="space-y-6">
                {damages.map((dmg, i) => (
                  <div key={i} className="rounded-md border border-amber-300 bg-white/80 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-amber-900">Skada {i + 1}</div>
                      <button
                        type="button"
                        onClick={() => removeDamage(i)}
                        className="text-sm underline decoration-amber-400 underline-offset-4"
                      >
                        Ta bort
                      </button>
                    </div>

                    {/* Text obligatorisk */}
                    <label className="mt-3 block text-sm font-medium text-amber-900">
                      Text (obligatorisk)
                    </label>
                    <input
                      value={dmg.text}
                      onChange={(e) => updateDamageText(i, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
                      placeholder="Beskriv skadan kort…"
                    />

                    {/* FOTO-knapp + gömd input */}
                    <div className="mt-3">
                      <input
                        ref={(el) => (fileInputsRef.current[i] = el)}
                        id={`damage-file-${i}`}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleDamageFiles(i, e)}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputsRef.current[i]?.click()}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-800"
                      >
                        {dmg.previews?.length > 0 ? 'Lägg till fler foton' : 'Lägg till foto'}
                      </button>

                      {dmg.previews?.length > 0 && (
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {dmg.previews.map((src, j) => (
                            <img
                              key={j}
                              src={src}
                              alt={`Skadefoto ${j + 1}`}
                              className="h-20 w-full rounded-md object-cover border border-zinc-300"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Primär knappen längst NER i skadeområdet */}
              <button
                type="button"
                onClick={addDamage}
                className="mt-4 w-full rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-amber-900"
              >
                {damages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
              </button>
            </div>
          )}
        </div>

        {/* Anteckningar */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-white px-3 py-2 text-zinc-900"
            placeholder="Övrig info…"
          />
        </div>

        {/* Status */}
        {status === 'error' && (
          <div className="text-sm text-red-400">{message}</div>
        )}
        {status === 'done' && (
          <div className="text-sm text-emerald-400">{message}</div>
        )}

        <div>
          <button
            type="submit"
            disabled={status === 'saving'}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
          </button>
        </div>
      </form>

      {/* Footer */}
      <footer className="mt-12 text-center text-sm text-zinc-400">
        © Albarone AB 2025
      </footer>
    </div>
  );
}
