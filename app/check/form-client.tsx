'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEvent,
  FormEvent,
} from 'react';
import supabase from '../../lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[]; // för UI
};

const BUCKET = 'damage-photos';

// små hjälp-funktioner
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

export default function FormClient() {
  // top / header …
  const [username] = useState<string>('Bob'); // temporär “inloggad”
  const [thanksTo, setThanksTo] = useState<string>('Bob');

  // reg mm …
  const [regnr, setRegnr] = useState('');
  const [regKnown, setRegKnown] = useState<boolean | null>(null);
  const [brandModel, setBrandModel] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [wheelStorage, setWheelStorage] = useState<string>('--'); // fylls på senare från rätt fil/källa

  // station
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState<string>('');

  // krav & frågor …
  const [odometerKm, setOdometerKm] = useState<string>(''); // "12345"
  const [fuelFull, setFuelFull] = useState<boolean | null>(null); // ❗️ingen default
  const [adblueOK, setAdblueOK] = useState<boolean | null>(null);
  const [washerOK, setWasherOK] = useState<boolean | null>(null);
  const [privacyCoverOK, setPrivacyCoverOK] = useState<boolean | null>(null);

  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(
    null
  );
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  // nya skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  // notes
  const [notes, setNotes] = useState('');

  // status
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string>('');

  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);

  // stationer – enkel statisk lista tills vidare
  const stations: Station[] = useMemo(
    () => [
      { id: 'MAL', name: 'Malmö', email: 'malmo@mabi.se' },
      { id: 'HEL', name: 'Helsingborg', email: 'helsingborg@mabi.se' },
      { id: 'HAL', name: 'Halmstad', email: 'halmstad@mabi.se' },
      { id: 'VAR', name: 'Varberg', email: 'varberg@mabi.se' },
      { id: 'TRE', name: 'Trelleborg', email: 'trelleborg@mabi.se' },
      { id: 'LUN', name: 'Lund', email: 'lund@mabi.se' },
    ],
    []
  );

  // --------------------------------------------------------------------------
  // 1) Hämtar modell + bef skador när regnr lämnas (blur) eller via Enter
  //    Försöker läsa från view: vehicle_damage_summary (regnr, brand_model, damages[])
  // --------------------------------------------------------------------------
  async function lookupVehicle(raw?: string) {
    const r = (raw ?? regnr).trim().toUpperCase();
    if (r.length < 3) return;

    try {
      // försök hämta modell + skador
      const { data, error } = await supabase
        .from('vehicle_damage_summary') // <-- finns i din DB (skapad tidigare)
        .select('regnr, brand_model, damages')
        .eq('regnr', r)
        .maybeSingle();

      if (error) {
        // Om vyn saknas eller annat fel – nollställ men låt formen funka
        setRegKnown(null);
        setBrandModel(null);
        setExistingDamages([]);
      } else if (data) {
        setRegKnown(true);
        setBrandModel(data.brand_model ?? null);
        setExistingDamages(Array.isArray(data.damages) ? data.damages : []);
      } else {
        // ej hittad – varning
        setRegKnown(false);
        setBrandModel(null);
        setExistingDamages([]);
      }

      // Hjulförvaring – placeholder tills vi kopplar på
      setWheelStorage('--');
    } catch {
      setRegKnown(null);
      setBrandModel(null);
      setExistingDamages([]);
      setWheelStorage('--');
    }
  }

  // --------------------------------------------------------------------------
  // 2) Hantera filer (per skaderad)
  // --------------------------------------------------------------------------
  function pickPhotos(i: number) {
    fileInputs.current[i]?.click();
  }

  function onPickFiles(i: number, e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const previews = files.map((f) => URL.createObjectURL(f));

    setDamages((prev) => {
      const clone = [...prev];
      clone[i] = {
        ...clone[i],
        files: [...clone[i].files, ...files].slice(0, 12),
        previews: [...clone[i].previews, ...previews].slice(0, 12),
      };
      return clone;
    });
  }

  function removePhoto(i: number, pIndex: number) {
    setDamages((prev) => {
      const d = { ...prev[i] };
      d.files.splice(pIndex, 1);
      d.previews.splice(pIndex, 1);
      const clone = [...prev];
      clone[i] = d;
      return clone;
    });
  }

  function addDamageRow() {
    setDamages((prev) => [...prev, { text: '', files: [], previews: [] }]);
  }

  function removeDamageRow(i: number) {
    setDamages((prev) => prev.filter((_, idx) => idx !== i));
  }

  // --------------------------------------------------------------------------
  // 3) Validering & Submit
  // --------------------------------------------------------------------------
  const requiredPicked =
    regnr.trim().length >= 3 &&
    stationId.trim().length > 0 &&
    odometerKm.trim().length > 0 &&
    fuelFull !== null &&
    adblueOK !== null &&
    washerOK !== null &&
    privacyCoverOK !== null &&
    chargeCableCount !== null &&
    wheelsOn !== null &&
    hasNewDamage !== null &&
    // om “nya skador: ja” kräver vi minst en rad + text
    (hasNewDamage === false ||
      (damages.length > 0 && damages.every((d) => d.text.trim().length > 0)));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!requiredPicked) return;

    setStatus('saving');
    setMessage('');

    // 1) ladda upp ev. foton
    const photoUrls: string[] = [];

    try {
      for (let di = 0; di < damages.length; di++) {
        const d = damages[di];
        for (let fi = 0; fi < d.files.length; fi++) {
          const f = d.files[fi];
          const key = `${regnr}/${Date.now()}-${di}-${fi}-${cleanFileName(
            f.name || `skada-${di + 1}-${fi + 1}.jpg`
          )}`;
          const up = await supabase.storage.from(BUCKET).upload(key, f, {
            cacheControl: '3600',
            upsert: false,
          });
          if (up.error) throw up.error;
          const pub = supabase.storage.from(BUCKET).getPublicUrl(key);
          const url = pub.data.publicUrl;
          photoUrls.push(url);
        }
      }

      // 2) skriv till checkins
      const station = stations.find((s) => s.id === stationId);
      const insertObj: any = {
        regnr: regnr.trim().toUpperCase(),
        notes,
        photo_urls: photoUrls,
        station_id: stationId || null,
        station_other: stationOther || null,

        odometer_km: odometerKm ? parseInt(odometerKm, 10) : null,
        fuel_full: fuelFull,
        adblue_ok: adblueOK,
        washer_ok: washerOK,
        privacy_cover_ok: privacyCoverOK,
        charge_cables_count: chargeCableCount,
        wheels_on: wheelsOn,

        // metadata
        regnr_valid: regKnown === true, // bara info
        no_new_damage: hasNewDamage === false,
        created_at: new Date().toISOString(),
      };

      const { error: insertErr } = await supabase
        .from('checkins')
        .insert([insertObj]);

      if (insertErr) throw insertErr;

      setStatus('done');
      setThanksTo(username);
      setMessage('Incheckningen är sparad.');
      // rensa form
      setRegnr('');
      setRegKnown(null);
      setBrandModel(null);
      setExistingDamages([]);
      setWheelStorage('--');
      setStationId('');
      setStationOther('');
      setOdometerKm('');
      setFuelFull(null);
      setAdblueOK(null);
      setWasherOK(null);
      setPrivacyCoverOK(null);
      setChargeCableCount(null);
      setWheelsOn(null);
      setHasNewDamage(null);
      setDamages([]);
      setNotes('');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage('Kunde inte spara, försök igen.');
    }
  }

  // --------------------------------------------------------------------------
  // UI helpers
  // --------------------------------------------------------------------------
  function radioBtn(
    active: boolean,
    label: string,
    onClick: () => void,
    extra?: string
  ) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg border px-4 py-3 ${
          active ? 'bg-green-100 border-green-400' : 'bg-white'
        } ${extra || ''}`}
      >
        {label}
      </button>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ny incheckning</h1>
        <div className="text-sm text-zinc-500">Inloggad: {username}</div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* REGNR */}
        <label className="block text-sm font-medium">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value.toUpperCase())}
          onBlur={() => lookupVehicle()}
          className="mt-1 w-full rounded-lg border bg-white px-3 py-3 tracking-widest uppercase"
          placeholder="ABC123"
          autoCapitalize="characters"
        />
        {regKnown === false && (
          <div className="mt-1 text-sm font-medium text-rose-600">
            Fel reg.nr
          </div>
        )}

        {/* BILINFO (direkt under regnr) */}
        {(brandModel || existingDamages.length > 0) && (
          <div className="mt-3 rounded-lg border bg-white p-3 text-sm">
            {brandModel && (
              <div className="mb-1">
                <span className="font-medium">Bil:</span> {brandModel}
              </div>
            )}
            <div className="mb-1">
              <span className="font-medium">Hjulförvaring:</span> {wheelStorage}
            </div>

            {existingDamages.length > 0 && (
              <>
                <div className="font-medium">Befintliga skador:</div>
                <ul className="ml-5 list-disc">
                  {existingDamages.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* STATION */}
        <div className="mt-5">
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-3"
          >
            <option value="">— Välj station / depå —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className="mt-2 w-full rounded-lg border bg-white px-3 py-3"
            placeholder="Ev. annan inlämningsplats"
          />
        </div>

        {/* MÄTARSTÄLLNING */}
        <div className="mt-5">
          <label className="block text-sm font-medium">Mätarställning *</label>
          <div className="flex items-center gap-2">
            <input
              value={odometerKm}
              onChange={(e) =>
                setOdometerKm(e.target.value.replace(/[^0-9]/g, ''))
              }
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border bg-white px-3 py-3"
              placeholder="ex. 42 180"
            />
            <span className="text-sm text-zinc-500">km</span>
          </div>
        </div>

        {/* TANKNIVÅ */}
        <div className="mt-5">
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {radioBtn(fuelFull === true, 'Fulltankad', () => setFuelFull(true))}
            {radioBtn(
              fuelFull === false,
              'Ej fulltankad',
              () => setFuelFull(false)
            )}
          </div>
        </div>

        {/* ADBLUE / SPOLARVÄTSKA / INSYNSSKYDD */}
        <div className="mt-5 space-y-4">
          <div>
            <div className="text-sm font-medium">AdBlue OK? *</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {radioBtn(adblueOK === true, 'Ja', () => setAdblueOK(true))}
              {radioBtn(adblueOK === false, 'Nej', () => setAdblueOK(false))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Spolarvätska OK? *</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {radioBtn(washerOK === true, 'Ja', () => setWasherOK(true))}
              {radioBtn(washerOK === false, 'Nej', () => setWasherOK(false))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Insynsskydd OK? *</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {radioBtn(
                privacyCoverOK === true,
                'Ja',
                () => setPrivacyCoverOK(true)
              )}
              {radioBtn(
                privacyCoverOK === false,
                'Nej',
                () => setPrivacyCoverOK(false)
              )}
            </div>
          </div>
        </div>

        {/* LADDKABLAR */}
        <div className="mt-5">
          <div className="text-sm font-medium">Antal laddsladdar *</div>
          <div className="mt-2 flex gap-3">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                className={`rounded-lg border px-4 py-3 ${
                  chargeCableCount === n ? 'bg-blue-100 border-blue-400' : ''
                }`}
                onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* HJUL SOM SITTER PÅ */}
        <div className="mt-5">
          <div className="text-sm font-medium">Hjul som sitter på *</div>
          <div className="mt-2 flex gap-3">
            {radioBtn(
              wheelsOn === 'sommar',
              'Sommarhjul',
              () => setWheelsOn('sommar')
            )}
            {radioBtn(
              wheelsOn === 'vinter',
              'Vinterhjul',
              () => setWheelsOn('vinter')
            )}
          </div>
        </div>

        {/* NYA SKADOR? */}
        <div className="mt-6">
          <div className="text-sm font-medium">Nya skador på bilen? *</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {radioBtn(hasNewDamage === true, 'Ja', () => {
              setHasNewDamage(true);
              if (damages.length === 0) addDamageRow();
            })}
            {radioBtn(hasNewDamage === false, 'Nej', () => {
              setHasNewDamage(false);
              setDamages([]);
            })}
          </div>
        </div>

        {/* SKADEBLOCK – avvikande bakgrund, visas endast om Ja */}
        {hasNewDamage === true && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            {/* ingen rubrik längre */}
            <div className="mb-2">
              <button
                type="button"
                onClick={addDamageRow}
                className="rounded-lg border bg-white px-3 py-2 text-sm"
              >
                {damages.length ? 'Lägg till ytterligare skada' : 'Lägg till skada'}
              </button>
            </div>

            {damages.map((dmg, i) => (
              <div key={i} className="mb-4 rounded-lg border bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium">Skada {i + 1}</div>
                  <button
                    type="button"
                    className="text-sm text-zinc-600 underline"
                    onClick={() => removeDamageRow(i)}
                  >
                    Ta bort
                  </button>
                </div>

                <label className="block text-sm">Text (obligatorisk)</label>
                <input
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
                  placeholder="Beskriv skadan kort"
                  value={dmg.text}
                  onChange={(e) =>
                    setDamages((prev) => {
                      const clone = [...prev];
                      clone[i] = { ...clone[i], text: e.target.value };
                      return clone;
                    })
                  }
                />

                <div className="mt-3">
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm"
                    onClick={() => pickPhotos(i)}
                  >
                    Välj / Ta bilder
                  </button>
                  <input
                    ref={(el) => (fileInputs.current[i] = el)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(i, e)}
                  />
                </div>

                {dmg.previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {dmg.previews.map((src, p) => (
                      <div key={p} className="relative">
                        <img
                          src={src}
                          className="h-20 w-full rounded-md border object-cover"
                          alt=""
                        />
                        <button
                          type="button"
                          className="absolute -right-2 -top-2 rounded-full border bg-white px-2 text-xs"
                          onClick={() => removePhoto(i, p)}
                          aria-label="Ta bort foto"
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
        )}

        {/* ÖVRIGA ANTECKNINGAR – vanlig bakgrund */}
        <div className="mt-6">
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-3"
            placeholder="Övrig info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* status */}
        {status === 'error' && (
          <div className="mt-3 text-sm text-red-600">{message}</div>
        )}
        {status === 'done' && (
          <div className="mt-3 text-sm text-green-600">Tack {thanksTo}!</div>
        )}

        {/* submit */}
        <button
          type="submit"
          disabled={!requiredPicked || status === 'saving'}
          className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
        </button>

        <div className="mt-6 text-center text-xs text-zinc-500">
          © Albarone AB 2025
        </div>
      </form>
    </div>
  );
}
