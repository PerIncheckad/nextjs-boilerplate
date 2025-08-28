'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Send, LogIn } from 'lucide-react';
import supabase from '../../lib/supabase';

/**
 * Ny incheckning – klientkomponent (körs i browsern)
 *
 * Notera
 * - Vi hämtar stationer från tabellen `stations`
 * - Validerar reg.nr mot `allowed_plates`
 * - Visar bilinfo + befintliga skador från vyn `vehicle_damage_summary`
 * - Försöker även visa "Hjulförvaring" via `tire_storage_summary` om den finns
 * - Laddar upp skadefoton till storage-bucket `damage-photos`
 * - Sparar huvudraden i `checkins` och detaljer i `checkin_damages`
 */

// -- Hjälp: klass för markerade knappar --
function pickBtnClass(selected: boolean) {
  return selected
    ? 'rounded-lg border-2 border-green-500 bg-green-100 text-green-900 px-5 py-3'
    : 'rounded-lg border border-zinc-300 bg-white text-zinc-900 px-5 py-3';
}

// -- Hjälp: neutral input --
const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400';

type Station = { id: string; name: string; email?: string | null };

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

const BUCKET = 'damage-photos';

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 120);
}

export default function CheckinForm() {
  // ---- "inloggad" användare – temporärt hårdkodat ----
  const [username] = useState('Bob');

  // ---- Formfält ----
  const [regnr, setRegnr] = useState('');
  const regnrUpper = useMemo(() => regnr.trim().toUpperCase(), [regnr]);

  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState('');

  const [odometer, setOdometer] = useState(''); // km

  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);

  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(null);

  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  // ---- Bilinfo + validering av reg.nr ----
  const [regValid, setRegValid] = useState<boolean | null>(null);
  const [brandModel, setBrandModel] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorage, setTireStorage] = useState<string | null>(null);

  // ---- Hämta stationer från DB ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('id,name,email')
        .order('name', { ascending: true });

      if (!cancelled) {
        if (!error && data) setStations(data as Station[]);
        // om tom lista – låt dropdownen vara tom; station måste ändå väljas innan submit
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Slå upp bilinfo när man lämnar reg.nr-fältet ----
  async function lookupVehicle(plateRaw?: string) {
    const plate = (plateRaw ?? regnrUpper).trim().toUpperCase();
    if (!plate) return;

    // 1) Validera mot allowed_plates (om tabellen finns)
    const { data: a, error: aErr } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .eq('regnr', plate)
      .limit(1);
    setRegValid(!aErr && !!a && a.length > 0);

    // 2) Hämta brand/modell + befintliga skador
    const { data: vd } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .eq('regnr', plate)
      .limit(1);

    const row = vd?.[0] as any;
    setBrandModel((row?.brand_model as string) ?? null);
    setExistingDamages(((row?.damages as string[]) ?? []).filter(Boolean));

    // 3) Hämta hjulförvaring om det finns någon sammanställd vy
    const { data: ts } = await supabase
      .from('tire_storage_summary')
      .select('*')
      .eq('regnr', plate)
      .limit(1);

    const tr = ts?.[0] as any;
    if (tr) {
      // Försök plocka fram något läsbart – hantera flera möjliga kolumnnamn
      const pieces: string[] = [];
      const cand = [
        tr.location,
        tr.place,
        tr.plats,
        tr.shelf,
        tr.hyllplats,
        tr.storage,
        tr.storage_text,
        tr.info,
      ].filter(Boolean);
      if (cand.length > 0) pieces.push(String(cand[0]));
      if (tr.plats && tr.hyllplats) pieces.push(`${tr.plats}/${tr.hyllplats}`);
      setTireStorage(pieces.join(' ') || null);
    } else {
      setTireStorage(null);
    }
  }

  // ---- Skadefält-hjälpare ----
  function addDamageRow() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }
  function removeDamageRow(index: number) {
    setDamages((d) => d.filter((_, i) => i !== index));
  }
  function updateDamageText(index: number, value: string) {
    setDamages((d) => d.map((x, i) => (i === index ? { ...x, text: value } : x)));
  }
  function handleDamageFiles(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) => d.map((x, i) => (i === index ? { ...x, files, previews } : x)));
  }

  // ---- Upload till Storage och returnera publika URL:er ----
  async function uploadDamagePhotos(prefix: string, files: File[]) {
    const urls: string[] = [];
    for (const file of files) {
      const safe = cleanFileName(file.name);
      const path = `${prefix}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        cacheControl: '3600',
      });
      if (!upErr) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
    }
    return urls;
  }

  // ---- Submit ----
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Grundvalidering
    if (!regnrUpper) return setError('Ange reg.nr');
    if (!stationId) return setError('Välj station/depå');
    if (!odometer || isNaN(Number(odometer))) return setError('Ange mätarställning i km');
    if (fuelFull === null) return setError('Ange tanknivå');
    if (adblueOk === null) return setError('Svara på AdBlue OK?');
    if (washerOk === null) return setError('Svara på Spolarvätska OK?');
    if (privacyOk === null) return setError('Svara på Insynsskydd OK?');
    if (chargeCableCount === null) return setError('Ange antal laddsladdar');
    if (wheelsOn === null) return setError('Ange hjul som sitter på');

    if (hasNewDamage === true) {
      if (damages.length === 0) return setError('Lägg till skada');
      const anyEmptyText = damages.some((d) => !d.text.trim());
      if (anyEmptyText) return setError('Text krävs vid varje ny skada');
    }

    setStatus('saving');
    setMessage('');

    try {
      // 1) Spara huvudraden
      const insertObj: any = {
        regnr: regnrUpper,
        station_id: stationId || null,
        station_other: stationOther || null,
        odometer_km: Number(odometer),
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk,
        charge_cable_count: chargeCableCount,
        wheels_on: wheelsOn, // 'sommar' | 'vinter'
        no_new_damage: hasNewDamage === false,
        notes: notes || null,
        regnr_valid: regValid ?? null,
      };

      const { data: ins, error: insErr } = await supabase
        .from('checkins')
        .insert(insertObj)
        .select('id, regnr')
        .single();

      if (insErr || !ins) throw insErr || new Error('Insert failed');

      // 2) Ladda upp ev. skadefoton + spara i checkin_damages
      if (hasNewDamage && damages.length > 0) {
        for (let i = 0; i < damages.length; i++) {
          const d = damages[i];
          const prefix = `${regnrUpper}/${ins.id}/dmg-${i + 1}`;
          const urls = await uploadDamagePhotos(prefix, d.files || []);
          await supabase.from('checkin_damages').insert({
            checkin_id: ins.id,
            text: d.text,
            photo_urls: urls,
          });
        }
      }

      setStatus('done');
      setMessage(`Tack ${username}!`);
      // Nollställ delar – men lämna reg.nr kvar (upplevs ofta smidigt i praktik)
      setStationId('');
      setStationOther('');
      setOdometer('');
      setFuelFull(null);
      setAdblueOk(null);
      setWasherOk(null);
      setPrivacyOk(null);
      setChargeCableCount(null);
      setWheelsOn(null);
      setHasNewDamage(null);
      setDamages([]);
      setNotes('');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Något gick fel vid sparandet');
    }
  }

  function setError(msg: string) {
    setStatus('error');
    setMessage(msg);
  }

  // -- UI --
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-zinc-900">
      {/* Huvudrubrik + "inloggad" */}
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <div className="text-sm text-zinc-500">Inloggad: <span className="font-medium text-zinc-700">{username}</span></div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Regnr */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={() => lookupVehicle()}
            className={inputClass}
            placeholder="ABC123"
            inputMode="text"
            autoCapitalize="characters"
          />
          {regnrUpper && regValid === false && (
            <div className="mt-1 text-sm text-red-600">Fel reg.nr</div>
          )}
        </div>

        {/* Bilinfo (visas efter lookup) */}
        {(brandModel || existingDamages.length > 0 || tireStorage) && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            {brandModel && (
              <div className="text-sm">
                <span className="font-semibold">Bil:</span> {brandModel}
              </div>
            )}
            {tireStorage && (
              <div className="text-sm">
                <span className="font-semibold">Hjulförvaring:</span> {tireStorage}
              </div>
            )}
            {existingDamages.length > 0 && (
              <div className="mt-2 text-sm">
                <div className="font-semibold">Befintliga skador:</div>
                <ul className="ml-5 list-disc">
                  {existingDamages.map((d, i) => (
                    <li key={`${d}-${i}`}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Station / depå + ev annan plats */}
        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            className={inputClass}
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            <option value="">— Välj station / depå —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            className={`${inputClass} mt-3`}
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
              className={inputClass}
              placeholder="ex. 42 180"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
            <span className="text-sm text-zinc-500">km</span>
          </div>
        </div>

        {/* Tanknivå */}
        <div>
          <div className="text-sm font-medium">Tanknivå *</div>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={pickBtnClass(fuelFull === true)}
              onClick={() => setFuelFull(true)}
            >
              Fulltankad
            </button>
            <button
              type="button"
              className={pickBtnClass(fuelFull === false)}
              onClick={() => setFuelFull(false)}
            >
              Ej fulltankad
            </button>
          </div>
        </div>

        {/* AdBlue/Spolarvätska/Insynsskydd */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <div className="text-sm font-medium">AdBlue OK? *</div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={pickBtnClass(adblueOk === true)}
                onClick={() => setAdblueOk(true)}
              >
                Ja
              </button>
              <button
                type="button"
                className={pickBtnClass(adblueOk === false)}
                onClick={() => setAdblueOk(false)}
              >
                Nej
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Spolarvätska OK? *</div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={pickBtnClass(washerOk === true)}
                onClick={() => setWasherOk(true)}
              >
                Ja
              </button>
              <button
                type="button"
                className={pickBtnClass(washerOk === false)}
                onClick={() => setWasherOk(false)}
              >
                Nej
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Insynsskydd OK? *</div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={pickBtnClass(privacyOk === true)}
                onClick={() => setPrivacyOk(true)}
              >
                Ja
              </button>
              <button
                type="button"
                className={pickBtnClass(privacyOk === false)}
                onClick={() => setPrivacyOk(false)}
              >
                Nej
              </button>
            </div>
          </div>
        </div>

        {/* Antal laddsladdar */}
        <div>
          <div className="text-sm font-medium">Antal laddsladdar *</div>
          <div className="mt-2 flex gap-3">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                className={pickBtnClass(chargeCableCount === n)}
                onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på */}
        <div>
          <div className="text-sm font-medium">Hjul som sitter på *</div>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={pickBtnClass(wheelsOn === 'sommar')}
              onClick={() => setWheelsOn('sommar')}
            >
              Sommarhjul
            </button>
            <button
              type="button"
              className={pickBtnClass(wheelsOn === 'vinter')}
              onClick={() => setWheelsOn('vinter')}
            >
              Vinterhjul
            </button>
          </div>
        </div>

        {/* Nya skador? */}
        <div>
          <div className="text-sm font-medium">Nya skador på bilen? *</div>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className={pickBtnClass(hasNewDamage === true)}
              onClick={() => {
                setHasNewDamage(true);
                if (damages.length === 0) addDamageRow();
              }}
            >
              Ja
            </button>
            <button
              type="button"
              className={pickBtnClass(hasNewDamage === false)}
              onClick={() => {
                setHasNewDamage(false);
                setDamages([]);
              }}
            >
              Nej
            </button>
          </div>
        </div>

        {/* Skadeblock (visas endast om Ja) */}
        {hasNewDamage === true && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            {damages.map((dmg, i) => (
              <div
                key={`dmg-${i}`}
                className="mb-4 rounded-lg border border-amber-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Skada {i + 1}</div>
                  <button
                    type="button"
                    className="text-sm text-zinc-500 underline"
                    onClick={() => removeDamageRow(i)}
                  >
                    Ta bort
                  </button>
                </div>

                {/* Text först (obligatorisk) */}
                <div className="mt-2">
                  <div className="text-xs text-zinc-500">Text (obligatorisk)</div>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    className={inputClass}
                    placeholder="Beskriv skadan kort…"
                  />
                </div>

                {/* Foton – välj eller ta bilder. Ingen 'capture' => iOS visar val (kamera/galleri) */}
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
              </div>
            ))}

            {/* Lägg till-knappen längst ned i skadeområdet */}
            <div className="pt-1">
              <button
                type="button"
                onClick={addDamageRow}
                className="w-full rounded-lg border-2 border-dashed border-amber-400 bg-amber-100 px-4 py-3 text-amber-800"
              >
                {damages.length > 0 ? 'Lägg till ytterligare skada' : 'Lägg till skada'}
              </button>
            </div>
          </div>
        )}

        {/* Övriga anteckningar – vanlig bakgrund */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            className={`${inputClass} min-h-[120px]`}
            placeholder="Övrig info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
          />
        </div>

        {/* Status/meddelanden */}
        {status === 'error' && (
          <div className="text-sm text-red-600">{message}</div>
        )}
        {status === 'done' && (
          <div className="text-sm text-green-700">{message}</div>
        )}

        {/* Spara */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Send className="h-5 w-5" />
            {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
          </button>
          <div className="mt-6 text-center text-xs text-zinc-500">
            © Albarone AB 2025
          </div>
        </div>
      </form>
    </div>
  );
}
