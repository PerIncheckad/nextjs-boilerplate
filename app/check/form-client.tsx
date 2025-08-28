'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';
import { STATIONS, type Station, type StationTree } from '../../lib/stations';

// ---- Typer ----
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

// ---- Hjälpfunktioner (statisk färg, inga dynamiska tailwind-bygg) ----
const baseBtn =
  'rounded-lg border px-4 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-300';
const btnYes = (on: boolean) =>
  `${baseBtn} ${on ? 'bg-green-100 text-green-900 border-green-300' : 'bg-white text-zinc-900 border-zinc-300'}`;
const btnNo = (on: boolean) =>
  `${baseBtn} ${on ? 'bg-red-100 text-red-900 border-red-300' : 'bg-white text-zinc-900 border-zinc-300'}`;
const btnCount = (on: boolean) =>
  `${baseBtn} ${on ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-white text-zinc-900 border-zinc-300'}`;
const btnWheel = (on: boolean) =>
  `${baseBtn} ${on ? 'bg-indigo-100 text-indigo-900 border-indigo-300' : 'bg-white text-zinc-900 border-zinc-300'}`;

const field =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500';
const label = 'block text-sm font-medium text-zinc-800';
const sectionTitle = 'text-lg font-semibold text-zinc-900';
const card = 'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm';

const damageCard =
  'rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm';

const primaryBtn =
  'w-full rounded-xl bg-blue-600 px-4 py-3 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 active:bg-blue-800';

function stamp() {
  return Date.now().toString();
}
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

// ---- Komponent ----
export default function CheckinForm() {
  // Header / “inloggad”
  const [username] = useState('Bob'); // temporär visning

  // Status / feedback
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // Regnr + uppslag
  const [regnr, setRegnr] = useState('');
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);
  const [carModel, setCarModel] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorage, setTireStorage] = useState<string | null>(null);

  // Station hierarchy
  const cities = useMemo(() => Object.keys(STATIONS), []);
  const [city, setCity] = useState('');
  const [place, setPlace] = useState('');
  const places: Station[] = useMemo(
    () => (city ? STATIONS[city] ?? [] : []),
    [city]
  );
  const [stationOther, setStationOther] = useState('');

  // Km
  const [odometer, setOdometer] = useState('');

  // Ja/Nej
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adBlueOk, setAdBlueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);

  // laddsladdar
  const [cableCount, setCableCount] = useState<0 | 1 | 2 | null>(null);

  // hjul
  const [wheelType, setWheelType] = useState<'sommar' | 'vinter' | null>(null);

  // Nya skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([
    // tom lista – knappen visas när man svarat "Ja"
  ]);

  // Övriga anteckningar
  const [notes, setNotes] = useState('');

  // ---- Uppslag på regnr (validering + ev. bilinfo/befintliga skador) ----
  async function lookupVehicle(r: string) {
    const plate = r.trim().toUpperCase();
    if (!plate) {
      setRegnrValid(null);
      setCarModel(null);
      setExistingDamages([]);
      setTireStorage(null);
      return;
    }
    setRegnr(plate);

    // 1) Finns i “total-lista”?
    try {
      const { data, error } = await supabase
        .from('public_allowed_plates')
        .select('regnr')
        .eq('regnr', plate)
        .maybeSingle();

      setRegnrValid(!error && !!data);
    } catch {
      setRegnrValid(null); // okänt
    }

    // 2) Hämta modell + befintliga skador (bäst-effort)
    try {
      // Modell (om du har tabell för det – byt mot korrekt)
      const { data: modelRow } = await supabase
        .from('vehicle_damage_summary')
        .select('model')
        .eq('regnr', plate)
        .maybeSingle();

      setCarModel(modelRow?.model ?? null);
    } catch {
      setCarModel(null);
    }

    try {
      // Lista skador (justera kolumnnamn om dina heter annat)
      const { data: dmgRows } = await supabase
        .from('active_damages')
        .select('type')
        .eq('regnr', plate);

      setExistingDamages(
        Array.isArray(dmgRows) ? dmgRows.map((r: any) => r.type) : []
      );
    } catch {
      setExistingDamages([]);
    }

    try {
      const { data: tireRow } = await supabase
        .from('tire_storage_summary')
        .select('location')
        .eq('regnr', plate)
        .maybeSingle();

      setTireStorage(tireRow?.location ?? null);
    } catch {
      setTireStorage(null);
    }
  }

  // ---- Skadehantering ----
  function ensureOneDamage() {
    setDamages((list) => {
      if (list.length === 0) {
        return [{ text: '', files: [], previews: [] }];
      }
      return list;
    });
  }
  useEffect(() => {
    if (hasNewDamage === true && damages.length === 0) {
      ensureOneDamage();
    }
    if (hasNewDamage === false) {
      setDamages([]);
    }
  }, [hasNewDamage]); // eslint-disable-line

  function updateDamageText(i: number, v: string) {
    setDamages((list) => {
      const next = [...list];
      next[i] = { ...next[i], text: v };
      return next;
    });
  }

  function removeDamage(i: number) {
    setDamages((list) => list.filter((_, idx) => idx !== i));
  }

  async function handleDamageFiles(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((list) => {
      const next = [...list];
      const cur = next[i];
      next[i] = {
        ...cur,
        files: [...cur.files, ...files],
        previews: [...cur.previews, ...previews],
      };
      return next;
    });
    // Rensa input så samma fil kan väljas igen
    e.target.value = '';
  }

  // ---- Spara ----
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    // Grundvalidering (regnr kan vara “Fel reg.nr” men får ej vara tomt)
    if (!regnr.trim()) {
      setStatus('error');
      setMessage('Ange registreringsnummer.');
      return;
    }
    if (!city) {
      setStatus('error');
      setMessage('Välj ort.');
      return;
    }
    if (!place) {
      setStatus('error');
      setMessage('Välj station / depå.');
      return;
    }
    if (!odometer.trim() || Number.isNaN(Number(odometer.replace(/\s/g, '')))) {
      setStatus('error');
      setMessage('Ange giltig mätarställning.');
      return;
    }
    if (fuelFull === null) {
      setStatus('error');
      setMessage('Välj tanknivå.');
      return;
    }
    if (adBlueOk === null) {
      setStatus('error');
      setMessage('Välj AdBlue OK?.');
      return;
    }
    if (washerOk === null) {
      setStatus('error');
      setMessage('Välj Spolarvätska OK?.');
      return;
    }
    if (privacyOk === null) {
      setStatus('error');
      setMessage('Välj Insynsskydd OK?.');
      return;
    }
    if (cableCount === null) {
      setStatus('error');
      setMessage('Välj antal laddsladdar.');
      return;
    }
    if (wheelType === null) {
      setStatus('error');
      setMessage('Välj hjul som sitter på.');
      return;
    }
    if (hasNewDamage === null) {
      setStatus('error');
      setMessage('Svara om nya skador.');
      return;
    }
    if (hasNewDamage && damages.length === 0) {
      setStatus('error');
      setMessage('Lägg till minst en skada.');
      return;
    }
    if (hasNewDamage && damages.some((d) => !d.text.trim())) {
      setStatus('error');
      setMessage('Text krävs på varje skada.');
      return;
    }

    // 1) Ladda upp alla skadebilder
    const photoUrls: string[] = [];
    for (let i = 0; i < damages.length; i++) {
      for (const f of damages[i].files) {
        const path = `${regnr}/${stamp()}-${cleanFileName(f.name || 'bild.jpg')}`;
        const { error: upErr } = await supabase.storage
          .from('damage-photos')
          .upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
        if (upErr) {
          setStatus('error');
          setMessage('Kunde inte ladda upp bild(er). Försök igen.');
          return;
        }
        const { data } = supabase.storage.from('damage-photos').getPublicUrl(path);
        if (data?.publicUrl) photoUrls.push(data.publicUrl);
      }
    }

    // 2) Bygg insert-objekt — håll det försiktigt (bara vanliga kolumner)
    const insertObj: Record<string, any> = {
      regnr,
      regnr_valid: regnrValid ?? false,
      city,
      station_other: place ? `${city} / ${place}` : null,
      odometer_km: Number(odometer.replace(/\s/g, '')),
      fuel_full: fuelFull,
      adblue_ok: adBlueOk,
      washer_ok: washerOk,
      privacy_cover_ok: privacyOk, // (din kolumn kan ev. heta cargo_cover_ok – säg till så justerar jag)
      chargers_count: cableCount,   // om din kolumn heter charge_cable_count istället, säg till så byter jag
      wheel_type: wheelType,
      no_new_damage: !hasNewDamage,
      photo_urls: photoUrls.length ? photoUrls : null,
      notes: notes || null,
    };

    // 3) Skicka in
    const { error: insErr } = await supabase.from('checkins').insert([insertObj]);
    if (insErr) {
      setStatus('error');
      setMessage('Misslyckades att spara. (Kontakta mig så mappar jag exakt mot kolumnerna.)');
      return;
    }

    setStatus('done');
    setMessage(`Tack ${username}!`);
    // ev. reset av formulär kan göras här om du vill
  }

  // ---- UI ----
  return (
    <div className="min-h-screen w-full bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-sm text-zinc-600">Inloggad: <span className="font-medium text-zinc-900">{username}</span></div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Regnr */}
          <div className={card}>
            <label className={label}>Registreringsnummer *</label>
            <input
              className={field + ' uppercase tracking-widest'}
              value={regnr}
              onChange={(e) => setRegnr(e.target.value.toUpperCase())}
              onBlur={(e) => lookupVehicle(e.target.value)}
              placeholder="ABC123"
              inputMode="latin"
              autoCapitalize="characters"
              autoComplete="off"
            />
            {regnrValid === false && (
              <p className="mt-2 text-sm font-medium text-red-600">Fel reg.nr</p>
            )}

            {/* Bilinfo */}
            {(carModel || existingDamages.length > 0 || tireStorage) && (
              <div className="mt-4 space-y-2 rounded-lg bg-zinc-50 p-3">
                {carModel && (
                  <div className="text-sm"><span className="font-medium">Bil:</span> {carModel}</div>
                )}
                {tireStorage && (
                  <div className="text-sm"><span className="font-medium">Hjulförvaring:</span> {tireStorage}</div>
                )}
                {existingDamages.length > 0 && (
                  <div className="text-sm">
                    <div className="font-medium">Befintliga skador:</div>
                    <ul className="ml-5 list-disc">
                      {existingDamages.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Station / Depå */}
          <div className={card}>
            <div className={sectionTitle}>Station / Depå *</div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Ort *</label>
                <select
                  className={field}
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setPlace('');
                  }}
                >
                  <option value="">— Välj ort —</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Station / Depå *</label>
                <select
                  className={field}
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  disabled={!city}
                >
                  <option value="">— Välj station / depå —</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <input
              className={field + ' mt-3'}
              placeholder="Ev. annan inlämningsplats"
              value={stationOther}
              onChange={(e) => setStationOther(e.target.value)}
            />
          </div>

          {/* Mätarställning */}
          <div className={card}>
            <label className={label}>Mätarställning *</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                className={field}
                placeholder="ex. 42 180"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <span className="text-sm text-zinc-600">km</span>
            </div>
          </div>

          {/* Ja/Nej-grupper */}
          <div className={card}>
            <div className={sectionTitle}>Tanknivå *</div>
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnYes(fuelFull === true)} onClick={() => setFuelFull(true)}>Fulltankad</button>
              <button type="button" className={btnNo(fuelFull === false)} onClick={() => setFuelFull(false)}>Ej fulltankad</button>
            </div>
          </div>

          <div className={card}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <div className={label}>AdBlue OK? *</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={btnYes(adBlueOk === true)} onClick={() => setAdBlueOk(true)}>Ja</button>
                  <button type="button" className={btnNo(adBlueOk === false)} onClick={() => setAdBlueOk(false)}>Nej</button>
                </div>
              </div>
              <div>
                <div className={label}>Spolarvätska OK? *</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={btnYes(washerOk === true)} onClick={() => setWasherOk(true)}>Ja</button>
                  <button type="button" className={btnNo(washerOk === false)} onClick={() => setWasherOk(false)}>Nej</button>
                </div>
              </div>
              <div>
                <div className={label}>Insynsskydd OK? *</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={btnYes(privacyOk === true)} onClick={() => setPrivacyOk(true)}>Ja</button>
                  <button type="button" className={btnNo(privacyOk === false)} onClick={() => setPrivacyOk(false)}>Nej</button>
                </div>
              </div>
            </div>
          </div>

          {/* Laddsladdar + hjul */}
          <div className={card}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className={label}>Antal laddsladdar *</div>
                <div className="mt-2 flex gap-2">
                  {[0, 1, 2].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={btnCount(cableCount === n)}
                      onClick={() => setCableCount(n as 0 | 1 | 2)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className={label}>Hjul som sitter på *</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className={btnWheel(wheelType === 'sommar')}
                    onClick={() => setWheelType('sommar')}
                  >
                    Sommarhjul
                  </button>
                  <button
                    type="button"
                    className={btnWheel(wheelType === 'vinter')}
                    onClick={() => setWheelType('vinter')}
                  >
                    Vinterhjul
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Nya skador */}
          <div className={card}>
            <div className={label}>Nya skador på bilen? *</div>
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnYes(hasNewDamage === true)} onClick={() => setHasNewDamage(true)}>Ja</button>
              <button type="button" className={btnNo(hasNewDamage === false)} onClick={() => setHasNewDamage(false)}>Nej</button>
            </div>

            {hasNewDamage && (
              <div className="mt-4 space-y-4">
                {damages.map((dmg, i) => (
                  <div key={i} className={damageCard}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-medium text-zinc-900">Skada {i + 1}</div>
                      <button
                        type="button"
                        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 underline"
                        onClick={() => removeDamage(i)}
                      >
                        Ta bort
                      </button>
                    </div>

                    {/* Texten först */}
                    <div className="mb-3">
                      <label className={label}>Text (obligatorisk)</label>
                      <input
                        className={field}
                        placeholder="Beskriv skadan kort..."
                        value={dmg.text}
                        onChange={(e) => updateDamageText(i, e.target.value)}
                      />
                    </div>

                    {/* Bilder */}
                    <div className="mb-2">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleDamageFiles(i, e)}
                        className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                      <div className="mt-2 text-xs text-zinc-600">
                        {dmg.previews.length === 0 ? 'Lägg till foto' : 'Lägg till fler foton'}
                      </div>
                    </div>

                    {dmg.previews.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt={`Skadefoto ${idx + 1}`}
                            className="h-24 w-full rounded-md border border-zinc-200 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Lägg till skada-knappen alltid UNDER listan */}
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  onClick={() =>
                    setDamages((list) => [...list, { text: '', files: [], previews: [] }])
                  }
                >
                  {damages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
                </button>
              </div>
            )}
          </div>

          {/* Övriga anteckningar – samma bakgrund som övrigt (vit) */}
          <div className={card}>
            <label className={label}>Övriga anteckningar</label>
            <textarea
              className={field}
              rows={4}
              placeholder="Övrig info…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Status */}
          {status === 'error' && (
            <div className="text-sm font-medium text-red-600">{message}</div>
          )}
          {status === 'done' && (
            <div className="text-sm font-medium text-green-600">{message}</div>
          )}

          {/* Spara */}
          <button type="submit" className={primaryBtn} disabled={status === 'saving'}>
            {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
          </button>

          <div className="pt-6 text-center text-xs text-zinc-500">
            © Albarone AB 2025
          </div>
        </form>
      </div>
    </div>
  );
}
