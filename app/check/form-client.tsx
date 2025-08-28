'use client';

import React, { useEffect, useMemo, useRef, useState, ChangeEvent, FormEvent } from 'react';
import supabase from '../../lib/supabase';

// -------------------------------
// Stationer i två steg (Ort → Plats)
// -------------------------------
const STATION_TREE: Record<string, string[]> = {
  'ÄNGELHOLM': [
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'AIRPORT',
  ],
  'FALKENBERG': ['—'],
  'HALMSTAD': [
    'Hedin Automotive Ford',
    'Hedin Automotive Kia',
    'Hedin Automotive Mercedes',
    'Hedin Automotive',
    'CITY AIRPORT',
  ],
  'HELSINGBORG': [
    'Bil & Skadeservice',
    'Floretten',
    'Förenade Bil',
    'Hedin Automotive Ford',
    'Hedin Automotive Kia',
    'Hedin Automotive',
    'Hedin Bil Transport',
    'S.Jönsson Bil',
    'Verksta',
    'HBSC',
  ],
  'LUND': [
    'Bil & Skadeservice',
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'Hedin Bil',
    'P7 Revingehed',
  ],
  'MALMÖ': [
    'Automerra',
    'Hedin Automotive Ford',
    'Hedin Automotive Jägersro',
    'Hedin Automotive Mercedes',
    'Mechanum',
    'AIRPORT',
    'BERNSTORP (Verksta)',
    'BURLÖV (Hedin Automotive)',
    'FOSIE (Hedbergs Bil)',
    'HAMN (Verksta)',
    'LÅNGTID',
  ],
  'TRELLEBORG': ['—'],
  'VARBERG': [
    'Finnvedens Bil Skadecenter',
    'Hedin Automotive Ford',
    'Hedin Automotive Holmgärde',
    'Hedin Automotive',
    'Sällstorps Plåt & Lack',
  ],
  'X (Old) HELSINGBORG': ['Holmgrens Bil'],
};

const ORTER = Object.keys(STATION_TREE).sort();

// -------------------------------
// Små hjälp-funktioner
// -------------------------------
const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

const neutralBtn =
  'rounded-md border px-4 py-2 text-sm bg-white text-zinc-900 border-zinc-300';
const yesBtn =
  'rounded-md border px-4 py-2 text-sm bg-green-100 text-green-800 border-green-300';
const noBtn =
  'rounded-md border px-4 py-2 text-sm bg-red-100 text-red-800 border-red-300';
const pickBtn =
  'rounded-md border px-4 py-2 text-sm bg-indigo-100 text-indigo-800 border-indigo-300';

function sanitizeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 100);
}
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ---------------------------------
// Typer
// ---------------------------------
type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

// ---------------------------------
// Komponent
// ---------------------------------
export default function IncheckadApp() {
  // Header
  const [username] = useState('Bob');

  // Formfält
  const [regnr, setRegnr] = useState('');
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);

  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');

  const [odometer, setOdometer] = useState(''); // text → parsas vid submit

  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);

  const [cableCount, setCableCount] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  const [notes, setNotes] = useState('');

  // Bil-info under regnr
  const [vehicleModel, setVehicleModel] = useState<string>('');
  const [vehicleStorage, setVehicleStorage] = useState<string>(''); // Hjulförvaring
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  // Status
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const selectedStations = useMemo(
    () => (city ? STATION_TREE[city] ?? [] : []),
    [city]
  );

  // ---------------------------------
  // Hämtar bilmodell/befintliga skador/hjulförvaring
  // ---------------------------------
  async function lookupVehicle(raw: string) {
    const plate = raw.trim().toUpperCase();
    setVehicleLoading(true);
    setVehicleModel('');
    setExistingDamages([]);
    setVehicleStorage('');
    setRegnrValid(null);

    if (!plate) {
      setVehicleLoading(false);
      return;
    }

    let valid = false;

    // 1) allowed_plates → validera + ev. modell
    try {
      const { data } = await supabase
        .from('allowed_plates')
        .select('*')
        .eq('regnr', plate)
        .maybeSingle();
      if (data) {
        valid = true;
        const modelGuess =
          (data as any).model ??
          (data as any).make_model ??
          (data as any).car_model ??
          (data as any).name ??
          '';
        setVehicleModel(modelGuess || '');
      }
    } catch {
      /* ignorera om view saknas */
    }

    // 2) Skadesammanfattning (summary) → modell & lista
    try {
      const { data } = await supabase
        .from('vehicle_damage_summary')
        .select('*')
        .eq('regnr', plate)
        .maybeSingle();
      if (data) {
        valid = true;
        if (!vehicleModel) {
          const m =
            (data as any).model ??
            (data as any).make_model ??
            (data as any).car_model ??
            '';
          if (m) setVehicleModel(m);
        }
        // Damages kan vara text eller array, hantera båda
        const arr: string[] =
          (Array.isArray((data as any).damages) && (data as any).damages) ||
          ((data as any).damage_summary
            ? String((data as any).damage_summary).split('|').filter(Boolean)
            : []);
        setExistingDamages(arr);
      }
    } catch {
      /* ignorera om view saknas */
    }

    // 3) Fallback: aktiva skador (radlista)
    if (existingDamages.length === 0) {
      try {
        const { data } = await supabase
          .from('active_damages')
          .select('*')
          .eq('regnr', plate);
        if (data && data.length > 0) {
          valid = true;
          const arr = (data as any[]).map(
            (r) =>
              r.damage ??
              r.description ??
              r.type ??
              'Skada'
          );
          setExistingDamages(arr);
        }
      } catch {
        /* ignorera om tabell saknas */
      }
    }

    // 4) Hjulförvaring (summary)
    try {
      const { data } = await supabase
        .from('tire_storage_summary')
        .select('*')
        .eq('regnr', plate)
        .maybeSingle();
      if (data) {
        valid = true;
        const storage =
          [
            (data as any).storage,
            (data as any).place,
            (data as any).hylla,
            (data as any).shelf,
            (data as any).location,
            (data as any).spot,
          ]
            .filter(Boolean)
            .join(', ') || '';
        if (storage) setVehicleStorage(storage);
      }
    } catch {
      /* ignorera om view saknas */
    }

    setRegnrValid(valid ? true : false);
    setVehicleLoading(false);
  }

  // ---------------------------------
  // Skade-hanterare
  // ---------------------------------
  function ensureOneDamage() {
    setDamages((d) => (d.length ? d : [{ text: '', files: [], previews: [] }]));
  }
  function addDamage() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }
  function removeDamage(i: number) {
    setDamages((d) => d.filter((_, idx) => idx !== i));
  }
  function updateDamageText(i: number, value: string) {
    setDamages((d) => d.map((row, idx) => (idx === i ? { ...row, text: value } : row)));
  }
  function onPickDamageFiles(i: number, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) =>
      d.map((row, idx) =>
        idx === i ? { ...row, files: [...row.files, ...files], previews: [...row.previews, ...previews] } : row
      )
    );
    // låt användaren välja kamera ELLER galleri: ingen "capture"-attrib används
    e.currentTarget.value = '';
  }

  // ---------------------------------
  // Spara
  // ---------------------------------
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const errors: string[] = [];
    const plate = regnr.trim().toUpperCase();
    const odo = Number(String(odometer).replace(/\s/g, ''));

    if (!plate) errors.push('registreringsnummer');
    if (!city) errors.push('ort');
    if (!stationId) errors.push('station/depå');
    if (!odo || Number.isNaN(odo)) errors.push('mätarställning');

    if (fuelFull === null) errors.push('tanknivå');
    if (adblueOk === null) errors.push('AdBlue');
    if (washerOk === null) errors.push('spolarvätska');
    if (privacyOk === null) errors.push('insynsskydd');
    if (cableCount === null) errors.push('antal laddsladdar');
    if (wheelsOn === null) errors.push('hjul som sitter på');
    if (hasNewDamage === null) errors.push('nya skador på bilen');

    if (hasNewDamage) {
      if (!damages.length) errors.push('minst en skada');
      damages.forEach((d, idx) => {
        if (!d.text.trim()) errors.push(`text för skada ${idx + 1}`);
      });
    }

    // OBS! Vi stoppar INTE om regnrValid === false,
    // men vi visar en extra hint längst ner.
    if (errors.length) {
      setStatus('error');
      setMessage(
        `Kontrollera följande fält: ${errors.join(', ')}${regnrValid === false ? ' – och dubbelkolla reg.nr' : ''
        }.`
      );
      return;
    }

    // 1) Ladda upp ev. foton
    const photoUrls: string[] = [];
    try {
      for (let i = 0; i < damages.length; i++) {
        for (const f of damages[i].files) {
          const path = `${plate}/${stamp()}-${sanitizeFilename(f.name || 'bild.jpg')}`;
          const { error } = await supabase.storage.from('damage-photos').upload(path, f, {
            upsert: false,
            contentType: f.type || 'image/jpeg',
          });
          if (error) throw error;
          const pub = await supabase.storage.from('damage-photos').getPublicUrl(path);
          if (pub?.data?.publicUrl) photoUrls.push(pub.data.publicUrl);
        }
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(`Kunde inte ladda upp foto: ${err?.message || err}`);
      return;
    }

    // 2) Spara checkin
    const insertObj: any = {
      regnr: plate,
      regnr_valid: regnrValid === true,
      odometer_km: odo,
      city,
      station_id: stationId,
      station_other: stationOther || null,

      fuel_full: fuelFull,
      adblue_ok: adblueOk,
      washer_ok: washerOk,
      privacy_cover_ok: privacyOk,

      charge_cable_count: cableCount,
      wheels_on: wheelsOn, // 'sommar' / 'vinter'

      has_new_damage: !!hasNewDamage,
      damage_texts: hasNewDamage ? damages.map((d) => d.text) : [],
      photo_urls: photoUrls,

      notes: notes || null,
      employee_name: username,
    };

    const { error } = await supabase.from('checkins').insert(insertObj);
    if (error) {
      setStatus('error');
      setMessage(
        `Misslyckades att spara. ${error.message || ''}${regnrValid === false ? ' (Dubbelkolla reg.nr.)' : ''}`
      );
      return;
    }

    setStatus('done');
    setMessage(`Tack ${username}! Incheckningen är sparad.`);
  }

  // När man slår på "nya skador" – se till att man får en första skadebox.
  useEffect(() => {
    if (hasNewDamage) ensureOneDamage();
    if (!hasNewDamage) setDamages([]);
  }, [hasNewDamage]);

  // ---------------------------------
  // UI
  // ---------------------------------
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <div className="text-zinc-500">Inloggad: <span className="font-medium text-zinc-700">Bob</span></div>
      </div>

      <form onSubmit={onSubmit} className="bg-white text-zinc-900 rounded-xl border border-zinc-200 p-4 md:p-6 shadow-sm">
        {/* REGNR */}
        <label className="block text-sm font-medium">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value.toUpperCase())}
          onBlur={(e) => lookupVehicle(e.target.value)}
          placeholder="ABC123"
          className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2 tracking-widest uppercase"
        />
        {regnrValid === false && (
          <p className="mt-1 text-sm text-red-600">Fel reg.nr</p>
        )}

        {/* BIL-INFO */}
        {(vehicleLoading || vehicleModel || existingDamages.length || vehicleStorage) && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            {vehicleLoading && <div className="text-sm text-zinc-500">Hämtar fordonsinfo…</div>}
            {vehicleModel && (
              <div className="text-sm"><span className="font-medium">Bil:</span> {vehicleModel}</div>
            )}
            {vehicleStorage && (
              <div className="text-sm"><span className="font-medium">Hjulförvaring:</span> {vehicleStorage}</div>
            )}
            {existingDamages.length > 0 && (
              <div className="text-sm mt-1">
                <div className="font-medium">Befintliga skador:</div>
                <ul className="list-disc pl-5">
                  {existingDamages.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ORT */}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Ort *</label>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setStationId('');
              }}
              className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
            >
              <option value="">— Välj ort —</option>
              {ORTER.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
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
              className={cx(
                'mt-1 w-full rounded-lg border px-3 py-2',
                city ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-200 text-zinc-500 border-zinc-300'
              )}
            >
              <option value="">— Välj station / depå —</option>
              {selectedStations.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ANNAN PLATS */}
        <label className="mt-3 block text-sm font-medium">Ev. annan inlämningsplats</label>
        <input
          value={stationOther}
          onChange={(e) => setStationOther(e.target.value)}
          placeholder="Övrig info…"
          className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
        />

        {/* ODOMETER */}
        <label className="mt-5 block text-sm font-medium">Mätarställning *</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder="ex. 42 180"
            className="w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
          />
          <span className="text-sm text-zinc-500">km</span>
        </div>

        {/* JA/NEJ / Val-knappar */}
        <div className="mt-6 grid gap-4">
          {/* Tanknivå */}
          <div>
            <div className="text-sm font-medium">Tanknivå *</div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setFuelFull(true)}
                className={cx(fuelFull === true ? yesBtn : neutralBtn)}
              >
                Fulltankad
              </button>
              <button
                type="button"
                onClick={() => setFuelFull(false)}
                className={cx(fuelFull === false ? noBtn : neutralBtn)}
              >
                Ej fulltankad
              </button>
            </div>
          </div>

          {/* AdBlue */}
          <div>
            <div className="text-sm font-medium">AdBlue OK? *</div>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setAdblueOk(true)} className={cx(adblueOk === true ? yesBtn : neutralBtn)}>Ja</button>
              <button type="button" onClick={() => setAdblueOk(false)} className={cx(adblueOk === false ? noBtn : neutralBtn)}>Nej</button>
            </div>
          </div>

          {/* Spolarvätska */}
          <div>
            <div className="text-sm font-medium">Spolarvätska OK? *</div>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setWasherOk(true)} className={cx(washerOk === true ? yesBtn : neutralBtn)}>Ja</button>
              <button type="button" onClick={() => setWasherOk(false)} className={cx(washerOk === false ? noBtn : neutralBtn)}>Nej</button>
            </div>
          </div>

          {/* Insynsskydd */}
          <div>
            <div className="text-sm font-medium">Insynsskydd OK? *</div>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setPrivacyOk(true)} className={cx(privacyOk === true ? yesBtn : neutralBtn)}>Ja</button>
              <button type="button" onClick={() => setPrivacyOk(false)} className={cx(privacyOk === false ? noBtn : neutralBtn)}>Nej</button>
            </div>
          </div>

          {/* Laddsladdar (0/1/2) */}
          <div>
            <div className="text-sm font-medium">Antal laddsladdar *</div>
            <div className="mt-2 flex gap-3">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCableCount(n as 0 | 1 | 2)}
                  className={cx(cableCount === n ? pickBtn : neutralBtn)}
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
              <button type="button" onClick={() => setWheelsOn('sommar')} className={cx(wheelsOn === 'sommar' ? pickBtn : neutralBtn)}>Sommarhjul</button>
              <button type="button" onClick={() => setWheelsOn('vinter')} className={cx(wheelsOn === 'vinter' ? pickBtn : neutralBtn)}>Vinterhjul</button>
            </div>
          </div>
        </div>

        {/* Nya skador? */}
        <div className="mt-6">
          <div className="text-sm font-medium">Nya skador på bilen? *</div>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setHasNewDamage(true)}
              className={cx(hasNewDamage === true ? yesBtn : neutralBtn)}
            >Ja</button>
            <button
              type="button"
              onClick={() => setHasNewDamage(false)}
              className={cx(hasNewDamage === false ? noBtn : neutralBtn)}
            >Nej</button>
          </div>
        </div>

        {/* Skadeområde (avvikande bakgrund) */}
        {hasNewDamage && (
          <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3">
            {damages.map((dmg, i) => (
              <div key={i} className="mb-4 rounded-lg border border-yellow-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">Skada {i + 1}</div>
                  <button type="button" onClick={() => removeDamage(i)} className="text-sm text-zinc-600 underline">Ta bort</button>
                </div>

                <label className="mt-2 block text-sm text-zinc-600">Text (obligatorisk)</label>
                <input
                  value={dmg.text}
                  onChange={(e) => updateDamageText(i, e.target.value)}
                  placeholder="Beskriv skadan kort…"
                  className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
                />

                <div className="mt-3">
                  <label className="block text-sm text-zinc-600">Foto</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => onPickDamageFiles(i, e)}
                    className="mt-1 block w-full cursor-pointer rounded-lg border bg-white px-3 py-2"
                  />
                  {dmg.previews?.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {dmg.previews.map((src, k) => (
                        <img key={k} src={src} alt={`Skadefoto ${k + 1}`} className="h-20 w-full object-cover rounded-md border border-zinc-200" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addDamage}
              className="mt-2 w-full rounded-md border border-yellow-300 bg-white px-4 py-2 text-sm"
            >
              {damages.length ? 'Lägg till ytterligare skada' : 'Lägg till skada'}
            </button>
          </div>
        )}

        {/* Övriga anteckningar */}
        <div className="mt-6">
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Övrig info…"
            rows={4}
            className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
          />
        </div>

        {/* Status */}
        {status === 'error' && message && (
          <div className="mt-4 text-sm text-red-600">{message}</div>
        )}
        {status === 'done' && (
          <div className="mt-4 text-sm text-green-700">{message}</div>
        )}

        {/* Spara */}
        <div className="mt-4">
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700"
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
          </button>
          {regnrValid === false && (
            <div className="mt-2 text-center text-xs text-red-600">Dubbelkolla reg.nr innan du sparar.</div>
          )}
        </div>
      </form>

      <div className="mt-8 text-center text-xs text-zinc-500">© Albarone AB 2025</div>
    </div>
  );
}
