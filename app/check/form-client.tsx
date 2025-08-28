'use client';

import React, { useEffect, useMemo, useRef, useState, ChangeEvent, FormEvent } from 'react';
import supabase from '../../lib/supabase';

// --------- Hjälp (UI-färger) ----------
const btnBase =
  'rounded-md border px-4 py-2 text-center transition-colors select-none';
const btnNeutral =
  `${btnBase} bg-white text-zinc-900 border-zinc-300 active:bg-zinc-100`;
const btnOn =
  `${btnBase} bg-green-100 text-green-900 border-green-300`;
const btnOff =
  `${btnBase} bg-red-100 text-red-900 border-red-300`;
const btnIndigo =
  `${btnBase} bg-indigo-100 text-indigo-900 border-indigo-300`;
const box = 'bg-white text-zinc-900 rounded-lg border border-zinc-300';

// --------- Stationsträd (stad → plats) ----------
type StationTree = Record<string, string[]>;
const STATIONS: StationTree = {
  'ÄNGELHOLM': [
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'AIRPORT',
  ],
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
    'Automera',
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
    'Hedin Automotive Holmsgärde',
    'Hedin Automotive',
    'Sällstorps Plåt & Lack',
  ],
  'X (Old) HELSINGBORG': ['Holmgrens Bil'],
};

// --------- Typer ----------
type DamageEntry = { text: string; files: File[]; previews: string[] };

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

const BUCKET = 'damage-photos';

export default function CheckinForm() {
  // “inloggad” användare (placeholder)
  const [username] = useState('Bob');

  // --- formfält ---
  const [regnr, setRegnr] = useState('');
  const [city, setCity] = useState('');
  const [station, setStation] = useState('');
  const [stationOther, setStationOther] = useState('');
  const [odometer, setOdometer] = useState('');

  // --- ja/nej & val ---
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cableCount, setCableCount] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  // --- skador ---
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const addDamage = () =>
    setDamages(d => [...d, { text: '', files: [], previews: [] }]);
  const removeDamage = (i: number) =>
    setDamages(d => d.filter((_, idx) => idx !== i));
  const updateDamageText = (i: number, v: string) =>
    setDamages(d => d.map((row, idx) => (idx === i ? { ...row, text: v } : row)));

  // --- bilinfo (auto) ---
  const [model, setModel] = useState<string | null>(null);
  const [knownDamages, setKnownDamages] = useState<string[]>([]);
  const [wheelStorage, setWheelStorage] = useState<string | null>(null);
  const [plateFound, setPlateFound] = useState<boolean | null>(null);

  // --- status ---
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const stationOptions = useMemo(
    () => (city ? STATIONS[city] ?? [] : []),
    [city]
  );

  // -------- Foto-hantering --------
  const handleFiles = async (rowIndex: number, e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const previews = files.map(f => URL.createObjectURL(f));

    setDamages(d =>
      d.map((row, i) =>
        i === rowIndex
          ? { ...row, files: [...row.files, ...files], previews: [...row.previews, ...previews] }
          : row
      )
    );
    e.target.value = ''; // gör att man kan välja samma fil igen vid behov
  };

  // -------- Supabase: ladda bilinfo vid blur/ändring --------
  const lookupVehicle = async (plateRaw: string) => {
    const plate = plateRaw.trim().toUpperCase();
    if (!plate) return;

    // Nollställ visning innan ny fråga
    setModel(null);
    setKnownDamages([]);
    setWheelStorage(null);
    setPlateFound(null);

    // allowed_plates → finns bilen? + ev. modell
    try {
      const { data: ap, error: apErr } = await supabase
        .from('allowed_plates')
        .select('regnr, model')
        .ilike('regnr', plate)
        .limit(1)
        .maybeSingle();

      setPlateFound(Boolean(ap && ap.regnr));
      if (ap?.model) setModel(ap.model);
      if (apErr) console.log('allowed_plates error:', apErr?.message);
    } catch (e) {
      console.log('allowed_plates exception:', e);
    }

    // public_active_damages → lista skador
    try {
      const { data: ad, error: adErr } = await supabase
        .from('public_active_damages')
        .select('damage')
        .eq('regnr', plate);

      if (!adErr && ad) {
        // ad kan vara { damage: 'Repa' } per rad
        const list = Array.from(new Set(ad.map(r => String((r as any).damage))));
        setKnownDamages(list);
      }
    } catch (e) {
      console.log('active_damages exception:', e);
    }

    // tire_storage_summary (eller tire_storage) → hyllplats
    try {
      // prova summary först
      let storage: string | null = null;
      const { data: ts, error: tsErr } = await supabase
        .from('tire_storage_summary')
        .select('location')
        .eq('regnr', plate)
        .limit(1)
        .maybeSingle();

      if (ts?.location) storage = ts.location as string;
      if (tsErr || !storage) {
        const { data: t2 } = await supabase
          .from('tire_storage')
          .select('location')
          .eq('regnr', plate)
          .limit(1)
          .maybeSingle();
        if (t2?.location) storage = t2.location as string;
      }

      if (storage) setWheelStorage(storage);
    } catch (e) {
      console.log('tire_storage exception:', e);
    }
  };

  // -------- Submit (tillåter “Fel reg.nr”) --------
  const uploadDamagePhotos = async (plate: string) => {
    const out: string[] = [];
    for (let i = 0; i < damages.length; i++) {
      for (const f of damages[i].files) {
        const path = `${plate}/${Date.now()}-${cleanFileName(f.name || 'bild.jpg')}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
          upsert: false,
          contentType: f.type || 'image/jpeg',
        });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) out.push(data.publicUrl);
      }
    }
    return out;
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const plate = regnr.trim().toUpperCase();
    // Grundvalidering (tvingande fält)
    if (!plate) {
      setStatus('error');
      setMessage('Ange registreringsnummer.');
      return;
    }
    if (!city) {
      setStatus('error');
      setMessage('Välj ort.');
      return;
    }
    if (!station) {
      setStatus('error');
      setMessage('Välj station / depå.');
      return;
    }
    if (!odometer.trim() || Number.isNaN(Number(odometer.replace(/\s/g, '')))) {
      setStatus('error');
      setMessage('Ange giltig mätarställning.');
      return;
    }
    // Ja/nej
    if (fuelFull === null) return setStatus('error'), setMessage('Välj tanknivå.');
    if (adblueOk === null) return setStatus('error'), setMessage('Välj AdBlue OK?');
    if (washerOk === null) return setStatus('error'), setMessage('Välj Spolarvätska OK?');
    if (privacyOk === null) return setStatus('error'), setMessage('Välj Insynsskydd OK?');
    if (cableCount === null) return setStatus('error'), setMessage('Välj antal laddsladdar.');
    if (wheelsOn === null) return setStatus('error'), setMessage('Välj hjul som sitter på.');
    if (hasNewDamage === null) return setStatus('error'), setMessage('Svara om nya skador.');

    // Nya skador kräver text på varje rad
    if (hasNewDamage && damages.some(d => !d.text.trim())) {
      setStatus('error');
      setMessage('Skriv text på varje ny skada.');
      return;
    }

    try {
      const photoUrls = hasNewDamage ? await uploadDamagePhotos(plate) : [];

      // Minimal & säkra kolumner – undvik schema-krockar:
      const insertObj: Record<string, any> = {
        regnr: plate,
        regnr_valid: plateFound === true, // flagga men stoppar inte submit
        odometer_km: Number(odometer.replace(/\s/g, '')),
        notes: '', // vi låter fritext fältet nedanför vara “övrig info”
        photo_urls: photoUrls, // text[]
        // Fält som brukar finnas – om kolumnen saknas ignoreras den av Supabase (extra keys droppas).
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk,
        charge_cable_count: cableCount, // om din kolumn heter något annat funkar det ändå – extra key ignoreras.
        wheel_type: wheelsOn,          // samma kommentar
        no_new_damage: !hasNewDamage,
        city,
        station_other: station === '—' ? stationOther : `${city} / ${station}`,
      };

      // Spara
      const { error } = await supabase.from('checkins').insert(insertObj);
      if (error) {
        console.error(error);
        setStatus('error');
        setMessage('Misslyckades att spara. Kontrollera fält och försök igen.');
        return;
      }

      setStatus('done');
      setMessage(`Tack ${username}!`);
      // Nollställ skadelådan
      setDamages([]);
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setMessage('Tekniskt fel vid uppladdning. Försök igen.');
    }
  };

  // --------- Render ---------
  return (
    <div className="min-h-[100dvh] bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-zinc-500">Inloggad: <span className="font-medium text-zinc-800">{username}</span></div>
        </header>

        {/* REG / station */}
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium">Registreringsnummer *</label>
            <input
              value={regnr}
              onChange={(e) => setRegnr(e.target.value.toUpperCase())}
              onBlur={(e) => lookupVehicle(e.target.value)}
              className={`${box} mt-1 w-full px-3 py-2 tracking-widest uppercase`}
              placeholder="ABC123"
              inputMode="text"
              autoCapitalize="characters"
            />
            {plateFound === false && (
              <div className="mt-1 text-sm text-red-600">Fel reg.nr</div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Ort *</label>
              <select
                className={`${box} mt-1 w-full px-3 py-2`}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setStation('');
                }}
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
                className={`${box} mt-1 w-full px-3 py-2`}
                value={station}
                onChange={(e) => setStation(e.target.value)}
                disabled={!city}
              >
                <option value="">— Välj station / depå —</option>
                {stationOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="—">Annat (ange nedan)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Ev. annan inlämningsplats</label>
            <input
              className={`${box} mt-1 w-full px-3 py-2`}
              placeholder="Övrig info…"
              value={stationOther}
              onChange={(e) => setStationOther(e.target.value)}
            />
          </div>

          {/* Bilinfo (automatisk) */}
          {(model || knownDamages.length || wheelStorage) && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              {model && <div><span className="font-medium">Bil:</span> {model}</div>}
              {wheelStorage && <div><span className="font-medium">Hjulförvaring:</span> {wheelStorage}</div>}
              {knownDamages.length > 0 && (
                <div className="mt-1">
                  <div className="font-medium">Befintliga skador:</div>
                  <ul className="list-disc pl-6">
                    {knownDamages.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Odometer */}
          <div>
            <label className="block text-sm font-medium">Mätarställning *</label>
            <div className="flex items-center gap-2">
              <input
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className={`${box} mt-1 w-full px-3 py-2`}
                placeholder="ex. 42 180"
                inputMode="numeric"
              />
              <span className="text-sm text-zinc-500">km</span>
            </div>
          </div>

          {/* Tank */}
          <div>
            <div className="text-sm font-medium">Tanknivå *</div>
            <div className="mt-2 flex gap-3">
              <button type="button" className={fuelFull ? btnOn : btnNeutral} onClick={() => setFuelFull(true)}>Fulltankad</button>
              <button type="button" className={!fuelFull ? btnOff : btnNeutral} onClick={() => setFuelFull(false)}>Ej fulltankad</button>
            </div>
          </div>

          {/* Ja/nej block */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">AdBlue OK? *</div>
              <div className="mt-2 flex gap-3">
                <button type="button" className={adblueOk === true ? btnOn : btnNeutral} onClick={() => setAdblueOk(true)}>Ja</button>
                <button type="button" className={adblueOk === false ? btnOff : btnNeutral} onClick={() => setAdblueOk(false)}>Nej</button>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">Spolarvätska OK? *</div>
              <div className="mt-2 flex gap-3">
                <button type="button" className={washerOk === true ? btnOn : btnNeutral} onClick={() => setWasherOk(true)}>Ja</button>
                <button type="button" className={washerOk === false ? btnOff : btnNeutral} onClick={() => setWasherOk(false)}>Nej</button>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">Insynsskydd OK? *</div>
              <div className="mt-2 flex gap-3">
                <button type="button" className={privacyOk === true ? btnOn : btnNeutral} onClick={() => setPrivacyOk(true)}>Ja</button>
                <button type="button" className={privacyOk === false ? btnOff : btnNeutral} onClick={() => setPrivacyOk(false)}>Nej</button>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">Antal laddsladdar *</div>
              <div className="mt-2 flex gap-3">
                {[0, 1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={cableCount === n ? btnIndigo : btnNeutral}
                    onClick={() => setCableCount(n as 0 | 1 | 2)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hjultyp */}
          <div>
            <div className="text-sm font-medium">Hjul som sitter på *</div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={wheelsOn === 'sommar' ? btnIndigo : btnNeutral}
                onClick={() => setWheelsOn('sommar')}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                className={wheelsOn === 'vinter' ? btnIndigo : btnNeutral}
                onClick={() => setWheelsOn('vinter')}
              >
                Vinterhjul
              </button>
            </div>
          </div>

          {/* Nya skador */}
          <div>
            <div className="text-sm font-medium">Nya skador på bilen? *</div>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={hasNewDamage === true ? btnOn : btnNeutral}
                onClick={() => {
                  setHasNewDamage(true);
                  if (damages.length === 0) addDamage();
                }}
              >
                Ja
              </button>
              <button
                type="button"
                className={hasNewDamage === false ? btnOff : btnNeutral}
                onClick={() => {
                  setHasNewDamage(false);
                  setDamages([]);
                }}
              >
                Nej
              </button>
            </div>
          </div>

          {hasNewDamage && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50/60 p-3">
              {damages.map((dmg, i) => (
                <div key={i} className="mb-4 rounded-md border border-amber-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium text-zinc-700">Skada {i + 1}</div>
                    <button type="button" className="text-sm text-zinc-500 hover:text-zinc-700" onClick={() => removeDamage(i)}>
                      Ta bort
                    </button>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium">Text (obligatorisk)</label>
                    <input
                      className={`${box} mt-1 w-full px-3 py-2`}
                      placeholder="Beskriv skadan kort…"
                      value={dmg.text}
                      onChange={(e) => updateDamageText(i, e.target.value)}
                    />
                  </div>

                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleFiles(i, e)}
                      className={`${box} block w-full cursor-pointer px-3 py-2`}
                      aria-label={dmg.files.length ? 'Lägg till fler foton' : 'Lägg till foto'}
                      title={dmg.files.length ? 'Lägg till fler foton' : 'Lägg till foto'}
                    />
                    {dmg.previews?.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src, j) => (
                          <img key={j} src={src} alt={`Skadefoto ${j + 1}`} className="h-20 w-full rounded-md object-cover border border-zinc-200" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" className={`${btnNeutral} w-full`} onClick={addDamage}>
                {damages.length ? 'Lägg till ytterligare skada' : 'Lägg till skada'}
              </button>
            </div>
          )}

          {/* Övrig anteckning */}
          <div>
            <label className="block text-sm font-medium">Övriga anteckningar</label>
            <textarea className={`${box} mt-1 w-full px-3 py-2`} rows={4} placeholder="Övrig info…"></textarea>
          </div>

          {/* Status */}
          {status === 'error' && (
            <div className="text-sm text-red-600">{message}</div>
          )}
          {status === 'done' && (
            <div className="text-sm text-green-600">{message}</div>
          )}

          <div className="sticky bottom-6 z-10 mt-2">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white shadow transition hover:bg-blue-700 disabled:opacity-60"
            >
              {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
            </button>
          </div>
        </form>

        <footer className="mt-12 text-center text-xs text-zinc-500">
          © Albarone AB 2025
        </footer>
      </div>
    </div>
  );
}
