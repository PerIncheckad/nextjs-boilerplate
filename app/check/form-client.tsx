'use client';

import React, { useEffect, useMemo, useRef, useState, ChangeEvent, FormEvent } from 'react';
import supabase from '../../lib/supabase';

/* ------------------------------- Hjälpdata ------------------------------- */

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

const BUCKET = 'damage-photos';

// Stad -> stationer (tvåstegsväljaren)
const STATIONS: Record<string, { id: string; name: string }[]> = {
  // Lägg gärna till fler senare – jag har kvar det vi använde.
  'ÄNGELHOLM': [
    { id: 'angelholm_ford', name: 'Hedin Automotive Ford' },
    { id: 'angelholm_auto', name: 'Hedin Automotive' },
    { id: 'angelholm_airport', name: 'AIRPORT' },
  ],
  'FALKENBERG': [{ id: 'falkenberg', name: '—' }],
  'HALMSTAD': [
    { id: 'halm_ford', name: 'Hedin Automotive Ford' },
    { id: 'halm_kia', name: 'Hedin Automotive Kia' },
    { id: 'halm_merc', name: 'Hedin Automotive Mercedes' },
    { id: 'halm_auto', name: 'Hedin Automotive' },
    { id: 'halm_city_airport', name: 'CITY AIRPORT' },
  ],
  'HELSINGBORG': [
    { id: 'hbg_bil_skadeservice', name: 'Bil & Skadeservice' },
    { id: 'hbg_floretten', name: 'Floretten' },
    { id: 'hbg_forenade', name: 'Förenade Bil' },
    { id: 'hbg_ford', name: 'Hedin Automotive Ford' },
    { id: 'hbg_kia', name: 'Hedin Automotive Kia' },
    { id: 'hbg_auto', name: 'Hedin Automotive' },
    { id: 'hbg_transport', name: 'Hedin Bil Transport' },
    { id: 'hbg_sjonsson', name: 'S.Jönsson Bil' },
    { id: 'hbg_verkstad', name: 'Verkstad' },
    { id: 'hbg_hbsc', name: 'HBSC' },
  ],
  'LUND': [
    { id: 'lund_bil_skade', name: 'Bil & Skadeservice' },
    { id: 'lund_ford', name: 'Hedin Automotive Ford' },
    { id: 'lund_auto', name: 'Hedin Automotive' },
    { id: 'lund_hedinbil', name: 'Hedin Bil' },
    { id: 'lund_p7', name: 'P7 Revingehed' },
  ],
  'MALMÖ': [
    { id: 'malmo_automera', name: 'Automera' },
    { id: 'malmo_ford', name: 'Hedin Automotive Ford' },
    { id: 'malmo_jagersro', name: 'Hedin Automotive Jägersro' },
    { id: 'malmo_merc', name: 'Hedin Automotive Mercedes' },
    { id: 'malmo_mechanum', name: 'Mechanum' },
    { id: 'malmo_airport', name: 'AIRPORT' },
    { id: 'malmo_bernstorp', name: 'BERNSTORP (Verkstad)' },
    { id: 'malmo_burlov', name: 'BURLÖV (Hedin Automotive)' },
    { id: 'malmo_fosie', name: 'FOSIE (Hedbergs Bil)' },
    { id: 'malmo_hamn', name: 'HAMN (Verkstad)' },
    { id: 'malmo_langtid', name: 'LÅNGTID' },
  ],
  'TRELLEBORG': [{ id: 'trelleborg', name: '—' }],
  'VARBERG': [
    { id: 'varberg_skadecenter', name: 'Finnvedens Bil Skadecenter' },
    { id: 'varberg_ford', name: 'Hedin Automotive Ford' },
    { id: 'varberg_holmgarde', name: 'Hedin Automotive Holmgårde' },
    { id: 'varberg_auto', name: 'Hedin Automotive' },
    { id: 'varberg_sallstorps', name: 'Sällstorps Plåt & Lack' },
  ],
};

const cities = Object.keys(STATIONS);

/* ------------------------------- Komponent ------------------------------- */

export default function CheckinForm() {
  // Header / användare (temporärt hårdkodat)
  const [username] = useState('Bob');

  // Form
  const [regnr, setRegnr] = useState('');
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null); // null = ej kollat, true/false efter koll

  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');

  const [odometer, setOdometer] = useState(''); // endast siffror
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cableCount, setCableCount] = useState<number | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  const [notes, setNotes] = useState('');

  // Uppslag efter regnr
  const [carModel, setCarModel] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);

  // Status
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'done'>('idle');
  const [message, setMessage] = useState('');

  /* ------------------------------ UI-hjälpare ----------------------------- */

  const currentStations = useMemo(() => {
    return city ? STATIONS[city] ?? [] : [];
  }, [city]);

  // Odometer endast siffror
  const onOdoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const onlyDigits = e.target.value.replace(/[^\d]/g, '');
    setOdometer(onlyDigits);
  };

  /* ---------------------------- Regnr -> uppslag -------------------------- */

  useEffect(() => {
    // nollställ vy-info när regnr ändras
    setCarModel(null);
    setStorageInfo(null);
    setExistingDamages([]);
    setRegnrValid(null);
  }, [regnr]);

  const lookupVehicle = async () => {
    const plate = regnr.trim().toUpperCase();
    if (!plate) {
      setRegnrValid(null);
      return;
    }

    try {
      // 1) Befintliga skador – den här har fungerat hos dig, behåll den
      // Försök först 'vehicle_damage_summary', annars 'active_damages' (båda är vanliga hos er)
      let ex: string[] = [];
      {
        const { data, error } = await supabase
          .from('vehicle_damage_summary')
          .select('damage')
          .eq('regnr', plate);
        if (!error && data && data.length) {
          ex = data.map((r: any) => r.damage).filter(Boolean);
        } else {
          const alt = await supabase
            .from('active_damages')
            .select('damage')
            .eq('regnr', plate);
          if (!alt.error && alt.data && alt.data.length) {
            ex = alt.data.map((r: any) => r.damage).filter(Boolean);
          }
        }
      }
      setExistingDamages(ex);

      // 2) Modell + hjulförvaring: prova allowed_plates, annars public_allowed_plates
      const readModelAndStorage = (row: any) => {
        // Försök tolka vanliga fältnamn, men krascha inte om de saknas
        const model = row?.model ?? row?.car_model ?? row?.bilmodell ?? null;
        const place =
          row?.wheel_storage_place ?? row?.hjul_plats ?? row?.hjulförvaring_plats ?? row?.plats ?? null;
        const shelf =
          row?.wheel_storage_shelf ?? row?.hjul_hylla ?? row?.hjulförvaring_hylla ?? row?.hylla ?? null;

        if (model) setCarModel(model as string);
        if (place || shelf) setStorageInfo([place, shelf].filter(Boolean).join(' / ') || null);
      };

      let ok = false;
      {
        const { data, error } = await supabase
          .from('allowed_plates')
          .select('*')
          .eq('regnr', plate)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          readModelAndStorage(data);
          ok = true;
        }
      }
      if (!ok) {
        const { data, error } = await supabase
          .from('public_allowed_plates')
          .select('*')
          .eq('regnr', plate)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          readModelAndStorage(data);
          ok = true;
        }
      }

      // Markera giltigt om vi hittade något i någon av tabellerna
      setRegnrValid(ok);
    } catch {
      // Om uppslaget faller – visa bara "Fel reg.nr" men låt fortfarande spara
      setRegnrValid(false);
    }
  };

  /* ------------------------------ Skade-foton ----------------------------- */

  const updateDamageText = (i: number, value: string) => {
    setDamages((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], text: value };
      return copy;
    });
  };

  const handleDamageFiles = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((prev) => {
      const copy = [...prev];
      const before = copy[i] ?? { text: '', files: [], previews: [] };
      copy[i] = { ...before, files: [...before.files, ...files], previews: [...before.previews, ...previews] };
      return copy;
    });
  };

  const addDamage = () => setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  const removeDamage = (idx: number) =>
    setDamages((d) => d.filter((_, i) => i !== idx));

  /* -------------------------------- Submit -------------------------------- */

  async function uploadDamagePhotos(plate: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of damages) {
      for (const f of entry.files) {
        const path = `${plate}/${Date.now()}-${(f.name || 'bild.jpg')
          .toLowerCase()
          .replace(/\s+/g, '-')}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
          upsert: false,
          contentType: f.type || 'image/jpeg',
        });
        if (error) throw error;
        const { data } = await supabase.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) out.push(data.publicUrl);
      }
    }
    return out;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    // Grundkrav (konkreta feltexter)
    if (!regnr.trim()) return setStatus('error'), setMessage('Ange registreringsnummer.');
    if (!city) return setStatus('error'), setMessage('Välj ort.');
    if (!stationId) return setStatus('error'), setMessage('Välj station / depå.');
    if (!odometer.trim() || Number.isNaN(Number(odometer)))
      return setStatus('error'), setMessage('Ange giltig mätarställning.');
    if (fuelFull === null) return setStatus('error'), setMessage('Välj tanknivå.');
    if (adblueOk === null) return setStatus('error'), setMessage('Välj AdBlue OK?');
    if (washerOk === null) return setStatus('error'), setMessage('Välj Spolarvätska OK?');
    if (privacyOk === null) return setStatus('error'), setMessage('Välj Insynsskydd OK?');
    if (cableCount === null) return setStatus('error'), setMessage('Välj antal laddsladdar.');
    if (wheelsOn === null) return setStatus('error'), setMessage('Välj hjul som sitter på.');
    if (hasNewDamage === null) return setStatus('error'), setMessage('Svara om nya skador finns.');

    if (hasNewDamage) {
      // alla skador måste ha text
      const firstMissing = damages.findIndex((d) => !d.text.trim());
      if (firstMissing >= 0) {
        return setStatus('error'), setMessage(`Skada ${firstMissing + 1}: text är obligatorisk.`);
      }
    }

    try {
      const plate = regnr.trim().toUpperCase();

      const photoUrls = hasNewDamage ? await uploadDamagePhotos(plate) : [];

      // *** Viktigt: mappa till kolumner som finns i din checkins-tabell ***
      // Använder 'chargers_count' (*** inte charge_cable_count ***).
      // tires_type lagrar "sommar"/"vinter".
      const insertObj: any = {
        regnr: plate,
        regnr_valid: regnrValid === true, // en hint, påverkar inte valideringen
        city,
        station_id: stationId,
        station_other: stationOther || null,
        odometer_km: Number(odometer),
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk,
        chargers_count: cableCount, // <- det här var felet i din logg
        tires_type: wheelsOn,
        no_new_damage: !hasNewDamage,
        notes: notes || null,
        photo_urls: photoUrls.length ? photoUrls : null,
      };

      const { error } = await supabase.from('checkins').insert([insertObj]);
      if (error) throw error;

      setStatus('done');
      setMessage(`Tack ${username}! Incheckningen sparades.`);
      // rensa formuläret väldigt försiktigt
      setDamages([]);
      setHasNewDamage(null);
    } catch (err: any) {
      setStatus('error');
      // Lyft fram supabase-fel på ett tydligt sätt
      if (typeof err?.message === 'string') {
        setMessage(err.message);
      } else {
        setMessage('Misslyckades att spara. Kontrollera fälten och försök igen.');
      }
    }
  };

  /* --------------------------------- Render -------------------------------- */

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        {/* Header */}
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-zinc-600">Inloggad: <span className="font-medium text-zinc-800">{username}</span></div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
        >
          {/* REGNR */}
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={lookupVehicle}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 uppercase"
            placeholder="ABC123"
          />
          {regnrValid === false && (
            <div className="mt-1 text-sm text-red-600">Fel reg.nr</div>
          )}

          {/* Ort / Station */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Ort *</label>
              <select
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setStationId('');
                }}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
              >
                <option value="">— Välj ort —</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Station / Depå *</label>
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
                disabled={!city}
              >
                <option value="">— Välj station / depå —</option>
                {currentStations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Annan plats */}
          <label className="mt-4 block text-sm font-medium">Ev. annan inlämningsplats</label>
          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
            placeholder="Övrig info…"
          />

          {/* Bil-info (visas efter uppslag) */}
          {(carModel || existingDamages.length || storageInfo) && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
              {carModel && (
                <div className="mb-1">
                  <span className="font-medium">Bil:</span> {carModel}
                </div>
              )}
              {storageInfo && (
                <div className="mb-1">
                  <span className="font-medium">Hjulförvaring:</span> {storageInfo}
                </div>
              )}
              {!!existingDamages.length && (
                <div>
                  <div className="font-medium">Befintliga skador:</div>
                  <ul className="ml-5 list-disc">
                    {existingDamages.map((d, i) => (
                      <li key={`${d}-${i}`}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Odometer */}
          <label className="mt-6 block text-sm font-medium">Mätarställning *</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={odometer}
              onChange={onOdoChange}
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
              placeholder="ex. 42 180"
            />
            <span className="text-sm text-zinc-500">km</span>
          </div>

          {/* Ja/Nej block */}
          <fieldset className="mt-6">
            <legend className="mb-2 block text-sm font-medium">Tanknivå *</legend>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFuelFull(true)}
                className={`rounded-md px-4 py-2 ${fuelFull === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}
              >
                Fulltankad
              </button>
              <button
                type="button"
                onClick={() => setFuelFull(false)}
                className={`rounded-md px-4 py-2 ${fuelFull === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}
              >
                Ej fulltankad
              </button>
            </div>
          </fieldset>

          {/* Tre Ja/Nej */}
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <YesNo label="AdBlue OK? *" value={adblueOk} onYes={() => setAdblueOk(true)} onNo={() => setAdblueOk(false)} />
            <YesNo label="Spolarvätska OK? *" value={washerOk} onYes={() => setWasherOk(true)} onNo={() => setWasherOk(false)} />
            <YesNo label="Insynsskydd OK? *" value={privacyOk} onYes={() => setPrivacyOk(true)} onNo={() => setPrivacyOk(false)} />
          </div>

          {/* Laddsladdar 0/1/2 */}
          <div className="mt-6">
            <div className="mb-2 text-sm font-medium">Antal laddsladdar *</div>
            <div className="flex gap-3">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCableCount(n)}
                  className={`rounded-md px-4 py-2 ${cableCount === n ? 'bg-blue-100 ring-1 ring-blue-400' : 'bg-white border border-zinc-300'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Hjul på */}
          <div className="mt-6">
            <div className="mb-2 text-sm font-medium">Hjul som sitter på *</div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setWheelsOn('sommar')}
                className={`rounded-md px-4 py-2 ${wheelsOn === 'sommar' ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'bg-white border border-zinc-300'}`}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                onClick={() => setWheelsOn('vinter')}
                className={`rounded-md px-4 py-2 ${wheelsOn === 'vinter' ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'bg-white border border-zinc-300'}`}
              >
                Vinterhjul
              </button>
            </div>
          </div>

          {/* Nya skador? */}
          <div className="mt-6">
            <div className="mb-2 text-sm font-medium">Nya skador på bilen? *</div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setHasNewDamage(true);
                  if (damages.length === 0) setDamages([{ text: '', files: [], previews: [] }]);
                }}
                className={`rounded-md px-4 py-2 ${hasNewDamage === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}
              >
                Ja
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasNewDamage(false);
                  setDamages([]);
                }}
                className={`rounded-md px-4 py-2 ${hasNewDamage === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}
              >
                Nej
              </button>
            </div>
          </div>

          {/* Skade-box (visas bara om Ja) */}
          {hasNewDamage === true && (
            <div className="mt-4 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-3">
              {damages.map((dmg, i) => (
                <div key={i} className="mt-3 rounded-md border border-yellow-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium">Skada {i + 1}</div>
                    <button type="button" onClick={() => removeDamage(i)} className="text-sm text-zinc-500 hover:underline">
                      Ta bort
                    </button>
                  </div>

                  <label className="block text-sm font-medium">Text (obligatorisk)</label>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
                    placeholder="Beskriv skadan kort…"
                  />

                  {/* Foton */}
                  <div className="mt-3">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleDamageFiles(i, e)}
                      className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2"
                    />
                    {dmg.previews?.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src, k) => (
                          <img key={k} src={src} alt={`Skadefoto ${k + 1}`} className="h-20 w-full rounded-md object-cover border border-zinc-200" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addDamage}
                className="mt-3 w-full rounded-md border border-zinc-300 bg-white py-2 text-zinc-800"
              >
                {damages.length > 0 ? 'Lägg till ytterligare skada' : 'Lägg till skada'}
              </button>
            </div>
          )}

          {/* Övriga anteckningar */}
          <label className="mt-6 block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
            placeholder="Övrig info…"
          />

          {/* Status / fel */}
          {status === 'error' && (
            <div className="mt-3 text-sm text-red-600">{message}</div>
          )}
          {status === 'done' && (
            <div className="mt-3 text-sm text-green-700">{message}</div>
          )}

          {/* Spara */}
          <button
            disabled={status === 'saving'}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-white disabled:opacity-60"
          >
            Spara incheckning
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-zinc-500">
          © Albarone AB {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Delkomponent ------------------------------ */

function YesNo({
  label,
  value,
  onYes,
  onNo,
}: {
  label: string;
  value: boolean | null;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{label}</div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onYes}
          className={`rounded-md px-4 py-2 ${value === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}
        >
          Ja
        </button>
        <button
          type="button"
          onClick={onNo}
          className={`rounded-md px-4 py-2 ${value === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}
        >
          Nej
        </button>
      </div>
    </div>
  );
}
