'use client';

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../../lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type City = { name: string; stations: { id?: string; name: string }[] };

type DamageEntry = { text: string; files: File[]; previews: string[] };

type VehicleInfo = { model?: string | null; damages?: string[]; tireStorage?: string | null };

const debounce = (fn: (...a: any[]) => void, ms = 350) => {
  let t: any;
  return (...a: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const cleanFileName = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '').slice(0, 100);

/* ——— Din ort → station-lista (oförändrad/placeholder, använd din fulla lista) ——— */
const CITIES: City[] = [
  { name: 'FALKENBERG', stations: [{ name: '--' }] },
  // … din fulla lista finns redan i projektet
];

export default function CheckinForm() {
  const [username] = useState('Bob');

  /* regnr + bilinfo */
  const [regnr, setRegnr] = useState('');
  const [regValid, setRegValid] = useState<boolean | null>(null);
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);

  /* ort / station */
  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState<string | null>(null);
  const [stationOther, setStationOther] = useState('');

  /* övriga fält */
  const [odometer, setOdometer] = useState('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cableCount, setCableCount] = useState<number | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommarhjul' | 'vinterhjul' | null>(null);
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');

  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const addDamage = () => setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  const removeDamageAt = (i: number) => setDamages((d) => d.filter((_, idx) => idx !== i));
  const updateDamageText = (i: number, text: string) =>
    setDamages((d) => { const x = [...d]; x[i] = { ...x[i], text }; return x; });
  const handleDamageFiles = (i: number, files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const previews = arr.map((f) => URL.createObjectURL(f));
    setDamages((d) => { const x = [...d]; x[i] = { ...x[i], files: [...x[i].files, ...arr], previews: [...x[i].previews, ...previews] }; return x; });
  };
  const removeOnePhoto = (i: number, idx: number) =>
    setDamages((d) => { const x = [...d]; const p = [...x[i].previews]; const f = [...x[i].files]; p.splice(idx, 1); f.splice(idx, 1); x[i] = { ...x[i], previews: p, files: f }; return x; });

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  /* ——— helpers för att plocka rätt fältnamn oavsett vad tabellen råkar heta ——— */
  const pickModel = (row: any): string | null =>
    row?.model ?? row?.modell ?? row?.bilmodell ?? row?.car_model ?? row?.vehicle_model ?? null;

  const pickTireStorage = (row: any): string | null =>
    row?.tire_storage ?? row?.storage ?? row?.place ?? row?.plats ?? row?.hylla ?? row?.shelf ?? row?.location ?? null;

  const orPlateFilter = (plate: string) =>
    // matcha mot både regnr/plate/reg – exakt (case-insensitivt via ilike utan %)
    `regnr.ilike.${plate},plate.ilike.${plate},reg.ilike.${plate}`;

  /* ——— Lookup för regnr (validering + hämtning av modell/hjulförvaring/skador) ——— */
  const doLookup = useMemo(
    () =>
      debounce(async (plateUpper: string) => {
        if (!plateUpper) {
          setRegValid(null);
          setVehicle(null);
          return;
        }
        const plate = plateUpper.trim();

        // 1) Validering mot allowed_plates (OR över möjliga kolumner)
        let isValid = false;
        {
          const { data, error } = await supabase
            .from('allowed_plates')
            .select('regnr,plate,reg', { head: false })
            .or(orPlateFilter(plate))
            .limit(1);
          if (!error && data && data.length > 0) isValid = true;
        }
        setRegValid(isValid);

        // 2) Modell (från allowed_plates – plockar första match & första vettiga fältnamnet)
        let model: string | null = null;
        {
          const { data } = await supabase
            .from('allowed_plates')
            .select('*')
            .or(orPlateFilter(plate))
            .limit(1)
            .maybeSingle();
          if (data) model = pickModel(data);
        }

        // 3) Hjulförvaring (tire_storage_summary → fallback tire_storage)
        let tireStorage: string | null = null;
        {
          const { data } = await supabase
            .from('tire_storage_summary')
            .select('*')
            .or(orPlateFilter(plate))
            .limit(1)
            .maybeSingle();
          if (data) {
            tireStorage = pickTireStorage(data);
          } else {
            const f2 = await supabase
              .from('tire_storage')
              .select('*')
              .or(orPlateFilter(plate))
              .limit(1)
              .maybeSingle();
            if (f2.data) tireStorage = pickTireStorage(f2.data);
          }
        }

        // 4) Befintliga skador (vehicle_damage_summary → fallback active_damages)
        let damagesList: string[] = [];
        {
          const { data } = await supabase
            .from('vehicle_damage_summary')
            .select('*')
            .or(orPlateFilter(plate));
          if (data && data.length) {
            for (const row of data) {
              const arr: any =
                row?.summary ?? row?.damage_list ?? row?.damages ?? null;
              if (Array.isArray(arr)) damagesList.push(...arr.map((s) => String(s)));
              else if (typeof row?.damage === 'string') damagesList.push(row.damage);
            }
          } else {
            const f2 = await supabase
              .from('active_damages')
              .select('*')
              .or(orPlateFilter(plate));
            if (f2.data && f2.data.length) {
              for (const row of f2.data) {
                const t = row?.text ?? row?.title ?? row?.description ?? null;
                if (t) damagesList.push(String(t));
              }
            }
          }
        }

        setVehicle({
          model,
          damages: damagesList.length ? Array.from(new Set(damagesList)) : undefined,
          tireStorage,
        });
      }, 350),
    []
  );

  useEffect(() => {
    const p = regnr.trim().toUpperCase();
    doLookup(p);
  }, [regnr, doLookup]);

  const stationsForCity = useMemo(() => {
    const c = CITIES.find((c) => c.name === city);
    return c ? c.stations : [];
  }, [city]);

  async function uploadPhotos(plate: string, dmg: DamageEntry): Promise<string[]> {
    const urls: string[] = [];
    for (const f of dmg.files) {
      const path = `${plate}/${Date.now()}-${cleanFileName(f.name || 'bild.jpg')}`;
      const { error: upErr } = await supabase.storage.from('damage-photos')
        .upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
      if (upErr) continue;
      const { data } = await supabase.storage.from('damage-photos').getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'saving' || status === 'done') return;

    const plate = regnr.trim().toUpperCase();
    if (!plate) { setStatus('error'); setMessage('Ange registreringsnummer.'); return; }
    if (!city) { setStatus('error'); setMessage('Välj ort.'); return; }
    if (!stationId) { setStatus('error'); setMessage('Välj station / depå.'); return; }
    if (!odometer.trim() || Number.isNaN(Number(odometer))) {
      setStatus('error'); setMessage('Ange giltig mätarställning (endast siffror).'); return;
    }
    if (fuelFull === null) { setStatus('error'); setMessage('Välj tanknivå.'); return; }
    if (adblueOk === null) { setStatus('error'); setMessage('Välj AdBlue OK?'); return; }
    if (washerOk === null) { setStatus('error'); setMessage('Välj Spolarvätska OK?'); return; }
    if (privacyOk === null) { setStatus('error'); setMessage('Välj Insynsskydd OK?'); return; }
    if (cableCount === null) { setStatus('error'); setMessage('Välj antal laddsladdar.'); return; }
    if (wheelsOn === null) { setStatus('error'); setMessage('Välj hjul som sitter på.'); return; }
    if (hasNewDamage === null) { setStatus('error'); setMessage('Svara om nya skador finns.'); return; }

    setStatus('saving'); setMessage('');

    let photoUrls: string[] = [];
    if (hasNewDamage) {
      for (const dmg of damages) {
        if (!dmg.text.trim() && dmg.files.length === 0) continue;
        const urls = await uploadPhotos(plate, dmg);
        photoUrls.push(...urls);
      }
    }

    const insertObj: Record<string, any> = {
      regnr: plate,
      regnr_valid: regValid ?? false,        // tillåter sparning även om ”Fel reg.nr”
      station_id: stationId,
      station_other: stationOther || null,
      odometer_km: Number(odometer.replace(/\s/g, '')),
      fuel_full: fuelFull,
      adblue_ok: adblueOk,
      washer_ok: washerOk,
      privacy_cover_ok: privacyOk,
      chargers_count: cableCount,
      wheel_type: wheelsOn === 'sommarhjul' ? 'sommar' : 'vinter',
      photo_urls: photoUrls.length ? photoUrls : null,
      notes: notes || null,
    };

    const { error } = await supabase.from('checkins').insert([insertObj]);
    if (error) { setStatus('error'); setMessage(`Misslyckades att spara. ${error.message}`); return; }

    setStatus('done'); setMessage(`Tack ${username}! Incheckningen sparades.`);
  };

  const resetAll = () => {
    setRegnr(''); setRegValid(null); setVehicle(null);
    setCity(''); setStationId(null); setStationOther('');
    setOdometer(''); setFuelFull(null); setAdblueOk(null);
    setWasherOk(null); setPrivacyOk(null); setCableCount(null);
    setWheelsOn(null); setHasNewDamage(null); setDamages([]);
    setNotes(''); setStatus('idle'); setMessage('');
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-xl mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <p className="text-sm text-zinc-500">
            Inloggad: <span className="font-medium text-zinc-700">Bob</span>
          </p>
        </header>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow p-4 sm:p-6">
          {/* REGNR */}
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => doLookup(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
          />
          {regValid === false && <p className="mt-1 text-sm text-red-600">Fel reg.nr</p>}

          {/* BILINFO */}
          {vehicle && (vehicle.model || vehicle.tireStorage || vehicle.damages?.length) && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
              {vehicle.model && (<p><span className="font-medium">Bil:</span> {vehicle.model}</p>)}
              {vehicle.tireStorage && (<p><span className="font-medium">Hjulförvaring:</span> {vehicle.tireStorage}</p>)}
              {vehicle.damages && vehicle.damages.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Befintliga skador:</p>
                  <ul className="list-disc list-inside">
                    {vehicle.damages.map((d, i) => (<li key={i}>{d}</li>))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ORT */}
          <div className="mt-5">
            <label className="block text-sm font-medium">Ort *</label>
            <select
              value={city}
              onChange={(e) => { setCity(e.target.value); setStationId(null); }}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              <option value="">— Välj ort —</option>
              {CITIES.map((c) => (<option key={c.name} value={c.name}>{c.name}</option>))}
            </select>
          </div>

          {/* STATION */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Station / Depå *</label>
            <select
              value={stationId ?? ''}
              onChange={(e) => setStationId(e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              disabled={!city}
            >
              <option value="">— Välj station / depå —</option>
              {stationsForCity.map((s, i) => (
                <option key={`${s.name}-${i}`} value={s.id ?? s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* ANNAN PLATS */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Ev. annan inlämningsplats</label>
            <input
              value={stationOther}
              onChange={(e) => setStationOther(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              placeholder="Övrig info…"
            />
          </div>

          {/* MÄTARSTÄLLNING – endast siffror */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Mätarställning *</label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ''))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              placeholder="ex. 42 180"
            />
          </div>

          {/* Tanknivå */}
          <div className="mt-6">
            <p className="text-sm font-medium">Tanknivå *</p>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setFuelFull(true)}
                className={`rounded-md px-4 py-2 ${fuelFull === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border'}`}>Fulltankad</button>
              <button type="button" onClick={() => setFuelFull(false)}
                className={`rounded-md px-4 py-2 ${fuelFull === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border'}`}>Ej fulltankad</button>
            </div>
          </div>

          {/* AdBlue / Spolarvätska / Insynsskydd */}
          {[
            { label: 'AdBlue OK? *', value: adblueOk, set: setAdblueOk },
            { label: 'Spolarvätska OK? *', value: washerOk, set: setWasherOk },
            { label: 'Insynsskydd OK? *', value: privacyOk, set: setPrivacyOk },
          ].map((grp, idx) => (
            <div className="mt-5" key={idx}>
              <p className="text-sm font-medium">{grp.label}</p>
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => grp.set(true)}
                  className={`rounded-md px-6 py-2 ${grp.value === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border'}`}>Ja</button>
                <button type="button" onClick={() => grp.set(false)}
                  className={`rounded-md px-6 py-2 ${grp.value === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border'}`}>Nej</button>
              </div>
            </div>
          ))}

          {/* Laddsladdar */}
          <div className="mt-6">
            <p className="text-sm font-medium">Antal laddsladdar *</p>
            <div className="mt-2 flex gap-3">
              {[0, 1, 2].map((n) => (
                <button key={n} type="button" onClick={() => setCableCount(n)}
                  className={`rounded-md px-4 py-2 ${cableCount === n ? 'bg-blue-100 ring-1 ring-blue-400' : 'bg-white border'}`}>{n}</button>
              ))}
            </div>
          </div>

          {/* Hjul på */}
          <div className="mt-6">
            <p className="text-sm font-medium">Hjul som sitter på *</p>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setWheelsOn('sommarhjul')}
                className={`rounded-md px-4 py-2 ${wheelsOn === 'sommarhjul' ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'bg-white border'}`}>Sommarhjul</button>
              <button type="button" onClick={() => setWheelsOn('vinterhjul')}
                className={`rounded-md px-4 py-2 ${wheelsOn === 'vinterhjul' ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'bg-white border'}`}>Vinterhjul</button>
            </div>
          </div>

          {/* Nya skador? */}
          <div className="mt-6">
            <p className="text-sm font-medium">Nya skador på bilen? *</p>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => { setHasNewDamage(true); if (damages.length === 0) addDamage(); }}
                className={`rounded-md px-6 py-2 ${hasNewDamage === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border'}`}>Ja</button>
              <button type="button" onClick={() => { setHasNewDamage(false); setDamages([]); }}
                className={`rounded-md px-6 py-2 ${hasNewDamage === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border'}`}>Nej</button>
            </div>
          </div>

          {/* Skadebox */}
          {hasNewDamage && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
              {damages.map((dmg, i) => (
                <div key={i} className="mb-3 rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Skada {i + 1}</p>
                    <button type="button" className="text-sm text-zinc-500 underline" onClick={() => removeDamageAt(i)}>Ta bort</button>
                  </div>

                  <label className="mt-2 block text-sm">Text (obligatorisk)</label>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                    placeholder="Beskriv skadan kort…"
                  />

                  <div className="mt-3">
                    <label className="block text-sm">
                      {dmg.files.length > 0 ? 'Lägg till fler bilder' : 'Lägg till bilder'}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleDamageFiles(i, e.target.files)}
                      className="mt-1 block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2"
                    />

                    {dmg.previews.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src, idx) => (
                          <div key={idx} className="relative">
                            <img src={src} alt={`Skadefoto ${idx + 1}`} className="h-24 w-full rounded-md object-cover border" />
                            <button type="button" onClick={() => removeOnePhoto(i, idx)}
                              className="absolute -right-2 -top-2 rounded-full bg-white/90 px-2 text-xs shadow border" aria-label="Ta bort bild">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" onClick={addDamage} className="mt-2 w-full rounded-md border bg-white px-3 py-2">
                Lägg till ytterligare skada
              </button>
            </div>
          )}

          {/* Övrigt */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Övriga anteckningar</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" rows={4} placeholder="Övrig info…" />
          </div>

          {/* Status */}
          {status === 'error' && message && (<p className="mt-3 text-sm text-red-600">{message}</p>)}
          {status === 'done' && message && (<p className="mt-3 text-sm text-green-600">{message}</p>)}

          {/* Knappar */}
          <div className="mt-6 flex flex-col gap-3">
            <button type="submit" disabled={status === 'saving' || status === 'done'}
              className={`w-full rounded-xl px-4 py-3 text-white ${status === 'saving' || status === 'done' ? 'bg-zinc-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
              Spara incheckning
            </button>
            {status === 'done' && (
              <button type="button" onClick={resetAll}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-800">
                Ny incheckning
              </button>
            )}
          </div>
        </form>

        <footer className="mt-6 text-center text-xs text-zinc-500">© Albarone AB {new Date().getFullYear()}</footer>
      </div>
    </div>
  );
}
