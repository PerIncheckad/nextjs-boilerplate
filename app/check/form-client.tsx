'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';

// ===== Typer =====
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';
type Station = { id: string; name: string };
type DamageEntry = { text: string; files: File[]; previews: string[] };

// ===== Stationsträd (Ort -> Station/depå) =====
// Säg bara till om du vill lägga till/ta bort – jag fixar!
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
    { id: 'malmo-automerna', name: 'Automerna' },
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
  'X (Old)': [{ id: 'x-old-helsingborg-holmgrens', name: 'HELSINGBORG (Holmgrens Bil)' }],
};

// ===== Färghelpers (inline styles så dark mode inte “äter upp” dem) =====
const yesNoClass = 'w-full rounded-lg border px-4 py-3 text-center';
const chipClass = 'rounded-md border px-4 py-2';
const choiceClass = 'rounded-lg border px-4 py-2';

const yesNoStyle = (sel: boolean | null) =>
  sel === true
    ? { backgroundColor: '#D1FAE5', color: '#065F46', borderColor: '#6EE7B7' } // grön
    : { backgroundColor: '#FFFFFF', color: '#111827', borderColor: '#52525B' };

const chipStyle = (on: boolean) =>
  on
    ? { backgroundColor: '#DBEAFE', color: '#1E3A8A', borderColor: '#93C5FD' } // blå ljus
    : { backgroundColor: '#FFFFFF', color: '#111827', borderColor: '#52525B' };

const choiceStyle = (on: boolean) =>
  on
    ? { backgroundColor: '#2563EB', color: '#FFFFFF', borderColor: '#2563EB' } // blå mörk
    : { backgroundColor: '#FFFFFF', color: '#111827', borderColor: '#52525B' };

// ===== Utils =====
function cleanFileName(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/g, '').slice(0, 100);
}
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(
    d.getMinutes(),
  ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

// ===== Komponent =====
export default function CheckinFormClient() {
  const [username] = useState('Bob');

  // Regnr + bilinfo
  const [regnr, setRegnr] = useState('');
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorage, setTireStorage] = useState<string | null>(null);

  // Stationer
  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');

  // Mätarställning
  const [odometer, setOdometer] = useState('');

  // Ja/nej
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyOk] = useState<boolean | null>(null);

  // Laddsladdar
  const [chargeCableCount, setChargeCableCount] = useState<number | null>(null);

  // Hjul
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  // Skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const fileInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Anteckningar + status
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // ===== Regnr-uppslag (tillåter submit även vid “Fel reg.nr”) =====
  async function lookupVehicle(plateRaw: string) {
    const plate = (plateRaw || '').trim().toUpperCase();
    if (!plate) return;

    try {
      const ap = await supabase
        .from('allowed_plates')
        .select('*')
        .eq('regnr', plate)
        .maybeSingle();

      if (ap?.data) {
        setRegnrValid(true);
        const row: any = ap.data;
        const model =
          row.model ||
          row.car_model ||
          row.vehicle ||
          row.name ||
          row.modell ||
          [row.make, row.model].filter(Boolean).join(' ') ||
          null;
        setVehicleInfo(model ? String(model) : '—');
        setTireStorage('—');
      } else {
        setRegnrValid(false);
        setVehicleInfo(null);
        setExistingDamages([]);
      }

      const ad = await supabase.from('active_damages').select('text').eq('regnr', plate);
      if (ad?.data) setExistingDamages((ad.data as any[]).map((r) => r.text).filter(Boolean));
      else setExistingDamages([]);
    } catch (e) {
      console.error(e);
      setRegnrValid(false);
      setVehicleInfo(null);
      setExistingDamages([]);
    }
  }

  // ===== Skade-hanterare =====
  function addDamage() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }
  function removeDamage(i: number) {
    setDamages((d) => d.filter((_, idx) => idx !== i));
  }
  function updateDamageText(i: number, text: string) {
    setDamages((d) => {
      const copy = [...d];
      copy[i] = { ...copy[i], text };
      return copy;
    });
  }
  function handleDamageFiles(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) => {
      const copy = [...d];
      const old = copy[i];
      copy[i] = { ...old, files: [...old.files, ...files], previews: [...old.previews, ...previews] };
      return copy;
    });
  }

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
        if (error) throw error;
        const { data } = supabase.storage.from('damage-photos').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
      results.push(urls);
    }
    return results;
  }

  // ===== Submit (tillåter “Fel reg.nr”) =====
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    // Grundvalidering (tillåter regnrValid === false)
    if (!regnr.trim()) return setStatus('error'), setMessage('Ange registreringsnummer.');
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
      let photoGroups: string[][] = [];
      if (hasNewDamage && damages.length) photoGroups = await uploadAllDamagePhotos();

      // OBS: Byt kolumnnamn här om din checkins-tabell heter lite annorlunda.
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
        charge_cable_count: chargeCableCount,
        wheels_on: wheelsOn, // 'sommar' | 'vinter'
        no_new_damage: !hasNewDamage,
        photo_urls: photoGroups.flat(), // text[] i Supabase
      };

      const { error } = await supabase.from('checkins').insert(insertObj).select().single();
      if (error) throw error;

      setStatus('done');
      setMessage(`Tack ${username}! Incheckning sparad.${regnrValid === false ? ' (Dubbelkolla reg.nr.)' : ''}`);
      setDamages([]);
      setHasNewDamage(null);
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage(err?.message ?? 'Kunde inte spara. Försök igen.');
    }
  }

  // ===== UI-data =====
  const stationOptions = useMemo(() => (city ? STATIONS[city] ?? [] : []), [city]);

  // ===== Render =====
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <div className="text-sm">Inloggad: <span className="font-medium">Bob</span></div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* REGNR */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => lookupVehicle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-600 bg-white px-3 py-2 text-zinc-900 tracking-widest uppercase"
            placeholder="ABC123"
          />
          {regnr && regnrValid === false && (
            <div className="mt-1 text-sm text-red-600">Fel reg.nr</div>
          )}

          {(vehicleInfo || existingDamages.length > 0 || tireStorage) && (
            <div className="mt-4 rounded-lg border border-zinc-300 bg-zinc-50 p-4">
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
                    {existingDamages.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ORT */}
        <div>
          <label className="block text-sm font-medium">Ort *</label>
          <select
            value={city}
            onChange={(e) => { setCity(e.target.value); setStationId(''); }}
            className="mt-1 w-full rounded-lg border border-zinc-600 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">— Välj ort —</option>
            {Object.keys(STATIONS).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* STATION */}
        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!city}
            className="mt-1 w-full rounded-lg border border-zinc-600 bg-white px-3 py-2 text-zinc-900 disabled:opacity-60"
          >
            <option value="">{city ? '— Välj station / depå —' : 'Välj ort först'}</option>
            {stationOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-600 bg-white px-3 py-2 text-zinc-900"
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
              className="w-full rounded-lg border border-zinc-600 bg-white px-3 py-2 text-zinc-900"
              placeholder="ex. 42 180"
            />
            <span>km</span>
          </div>
        </div>

        {/* Tanknivå */}
        <div>
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoClass} style={yesNoStyle(fuelFull === true)} onClick={() => setFuelFull(true)}>Fulltankad</button>
            <button type="button" className={yesNoClass} style={yesNoStyle(fuelFull === false)} onClick={() => setFuelFull(false)}>Ej fulltankad</button>
          </div>
        </div>

        {/* AdBlue */}
        <div>
          <label className="block text-sm font-medium">AdBlue OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoClass} style={yesNoStyle(adblueOk === true)} onClick={() => setAdblueOk(true)}>Ja</button>
            <button type="button" className={yesNoClass} style={yesNoStyle(adblueOk === false)} onClick={() => setAdblueOk(false)}>Nej</button>
          </div>
        </div>

        {/* Spolarvätska */}
        <div>
          <label className="block text-sm font-medium">Spolarvätska OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoClass} style={yesNoStyle(washerOk === true)} onClick={() => setWasherOk(true)}>Ja</button>
            <button type="button" className={yesNoClass} style={yesNoStyle(washerOk === false)} onClick={() => setWasherOk(false)}>Nej</button>
          </div>
        </div>

        {/* Insynsskydd */}
        <div>
          <label className="block text-sm font-medium">Insynsskydd OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoClass} style={yesNoStyle(privacyCoverOk === true)} onClick={() => setPrivacyOk(true)}>Ja</button>
            <button type="button" className={yesNoClass} style={yesNoStyle(privacyCoverOk === false)} onClick={() => setPrivacyOk(false)}>Nej</button>
          </div>
        </div>

        {/* Laddsladdar */}
        <div>
          <label className="block text-sm font-medium">Antal laddsladdar *</label>
          <div className="mt-2 flex gap-2">
            {[0, 1, 2].map((n) => (
              <button key={n} type="button" className={chipClass} style={chipStyle(chargeCableCount === n)} onClick={() => setChargeCableCount(n)}>{n}</button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på */}
        <div>
          <label className="block text-sm font-medium">Hjul som sitter på *</label>
          <div className="mt-2 flex gap-3">
            <button type="button" className={choiceClass} style={choiceStyle(wheelsOn === 'sommar')} onClick={() => setWheelsOn('sommar')}>Sommarhjul</button>
            <button type="button" className={choiceClass} style={choiceStyle(wheelsOn === 'vinter')} onClick={() => setWheelsOn('vinter')}>Vinterhjul</button>
          </div>
        </div>

        {/* Nya skador */}
        <div>
          <label className="block text-sm font-medium">Nya skador på bilen? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={yesNoClass} style={yesNoStyle(hasNewDamage === true)} onClick={() => { setHasNewDamage(true); if (damages.length === 0) addDamage(); }}>Ja</button>
            <button type="button" className={yesNoClass} style={yesNoStyle(hasNewDamage === false)} onClick={() => { setHasNewDamage(false); setDamages([]); }}>Nej</button>
          </div>

          {hasNewDamage === true && (
            <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4">
              <div className="space-y-6">
                {damages.map((dmg, i) => (
                  <div key={i} className="rounded-md border border-amber-300 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-amber-900">Skada {i + 1}</div>
                      <button type="button" onClick={() => removeDamage(i)} className="text-sm underline decoration-amber-400 underline-offset-4">Ta bort</button>
                    </div>

                    <label className="mt-3 block text-sm font-medium text-amber-900">Text (obligatorisk)</label>
                    <input
                      value={dmg.text}
                      onChange={(e) => updateDamageText(i, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
                      placeholder="Beskriv skadan kort…"
                    />

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
                            <img key={j} src={src} alt={`Skadefoto ${j + 1}`} className="h-20 w-full rounded-md border border-zinc-300 object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addDamage} className="mt-4 w-full rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-amber-900">
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
            className="mt-1 w-full rounded-lg border border-zinc-600 bg-white px-3 py-2 text-zinc-900"
            placeholder="Övrig info…"
          />
        </div>

        {/* Status */}
        {(status === 'error' || regnrValid === false) && (
          <div className="text-sm text-red-600">
            {status === 'error' ? message : 'Dubbelkolla reg.nr'}
          </div>
        )}
        {status === 'done' && <div className="text-sm text-emerald-600">{message}</div>}

        <div>
          <button type="submit" disabled={status === 'saving'} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
          </button>
        </div>
      </form>

      <footer className="mt-12 text-center text-sm text-zinc-500">© Albarone AB 2025</footer>
    </div>
  );
}
