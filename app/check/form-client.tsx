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

/* =========================================================
   Typer
   ======================================================= */
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

/* =========================================================
   Små utils
   ======================================================= */
const BUCKET = 'damage-photos';

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 100);
}

function stamp() {
  // YYYYMMDD-HHMMSS
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

/* =========================================================
   Stationer (tvåsteg: Ort -> Station)
   (Behåll/utöka listorna om du vill – funktionen i UI ändras ej)
   ======================================================= */
const CITIES = [
  'ÄNGELHOLM',
  'FALKENBERG',
  'HALMSTAD',
  'HELSINGBORG',
  'LUND',
  'MALMÖ',
  'VARBERG',
] as const;

const STATIONS_BY_CITY: Record<(typeof CITIES)[number], string[]> = {
  'ÄNGELHOLM': [
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'Ängelholm Airport',
  ],
  FALKENBERG: ['(Hedin Automotive Ford)'],
  HALMSTAD: [
    'Hedin Automotive Ford',
    'Hedin Automotive Kia',
    'Hedin Automotive Mercedes',
    'Hedin Automotive',
    'City Airport',
  ],
  HELSINGBORG: [
    'Bil & Skadeservice',
    'Floretten',
    'Förenade Bil',
    'Hedin Automotive Ford',
    'Hedin Automotive Kia',
    'Hedin Automotive',
    'Hedin Bil Transport',
    'S.Jönsson Bil',
    'Werksta',
    'HBSC',
  ],
  LUND: [
    'Bil & Skadeservice',
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'Hedin Bil',
    'P7 Revingehed',
  ],
  MALMÖ: [
    'Automera',
    'Hedin Automotive Ford',
    'Hedin Automotive Jägersro',
    'Hedin Automotive Mercedes',
    'Mechanum',
    'Airport',
    'Bernstorp (Werksta)',
    'Burlöv (Hedin Automotive)',
    'Fosie (Hedbergs Bil)',
    'Hamn (Werksta)',
    'Långtid',
  ],
  VARBERG: [
    'Finnvedens Bil Skadecenter',
    'Hedin Automotive Ford',
    'Hedin Automotive Holmgärde',
    'Hedin Automotive',
    'Sällstorps Plåt & Lack',
  ],
};

/* =========================================================
   Komponent
   ======================================================= */
export default function FormClient() {
  /* Header / användare (temporärt) */
  const [username] = useState('Bob');

  /* Formvärden */
  const [regnr, setRegnr] = useState('');
  const [regOk, setRegOk] = useState<boolean | null>(null); // null = ej kontrollerat, true/false = ok/okänt

  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');

  const [odometer, setOdometer] = useState('');

  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [cableCount, setCableCount] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const [notes, setNotes] = useState('');

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  /* ---- Metadata under reg.nr (modell, hjulförvaring, skador) ---- */
  const [vehicleModel, setVehicleModel] = useState<string | null>(null);
  const [tireStorage, setTireStorage] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);

  const stations = useMemo(
    () => (city ? STATIONS_BY_CITY[city as (typeof CITIES)[number]] ?? [] : []),
    [city]
  );

  /* =========================================================
     REG-koll + metadatahämtning
     ======================================================= */

  async function checkPlateExists(plate: string) {
    const p = plate.trim().toUpperCase();
    if (!p) {
      setRegOk(null);
      return;
    }
    // Kolla mot allowed_plates (”Skador aktiva bilar…”-listan du laddade in)
    const { data, error } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .eq('regnr', p)
      .maybeSingle();

    if (error) {
      // Vid fel beter vi oss försiktigt och låter användaren gå vidare
      setRegOk(null);
      return;
    }
    setRegOk(!!data);
  }

  async function lookupVehicle(plateRaw: string) {
    const plate = (plateRaw || '').trim().toUpperCase();
    if (!plate) {
      setVehicleModel(null);
      setTireStorage(null);
      setExistingDamages([]);
      return;
    }

    // Modell + befintliga skador via sammanställnings-vy, fallback till active_damages
    let model: string | null = null;
    let damagesList: string[] = [];

    try {
      const { data: vds, error: vdsErr } = await supabase
        .from('vehicle_damage_summary') // din vy (Unrestricted)
        .select('*')
        .eq('regnr', plate)
        .maybeSingle();

      const pick = (o: any, keys: string[]) =>
        keys.find((k) => o && o[k] != null) &&
        (o[keys.find((k) => o[k] != null)!] as any);

      if (!vdsErr && vds) {
        model =
          pick(vds, ['model', 'car_model', 'vehicle_model']) ?? null;

        if (Array.isArray((vds as any).damages)) {
          damagesList = ((vds as any).damages as string[]).filter(Boolean);
        } else if ((vds as any).damage_list) {
          damagesList = String((vds as any).damage_list)
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

      if ((!vds || damagesList.length === 0) && !model) {
        const { data: act, error: actErr } = await supabase
          .from('active_damages')
          .select('text')
          .eq('regnr', plate);

        if (!actErr && act?.length) {
          damagesList = act.map((r: any) => r.text).filter(Boolean);
        }
      }
    } catch {
      /* svälj */
    }

    // Hjulförvaring via sammanställnings-vy, fallback till tabell
    let storage: string | null = null;
    try {
      const { data: tss, error: tssErr } = await supabase
        .from('tire_storage_summary') // vy (Unrestricted)
        .select('*')
        .eq('regnr', plate)
        .maybeSingle();

      const pick = (o: any, keys: string[]) =>
        keys.find((k) => o && o[k] != null) &&
        (o[keys.find((k) => o[k] != null)!] as any);

      if (!tssErr && tss) {
        const place = pick(tss, ['place', 'location', 'site', 'city']);
        const shelf = pick(tss, ['shelf', 'hylla', 'slot', 'label']);
        storage = [place, shelf].filter(Boolean).join(' / ') || null;
      } else {
        const { data: ts, error: tsErr } = await supabase
          .from('tire_storage')
          .select('*')
          .eq('regnr', plate)
          .maybeSingle();

        if (!tsErr && ts) {
          const place = pick(ts, ['place', 'location', 'site', 'city']);
          const shelf = pick(ts, ['shelf', 'hylla', 'slot', 'label']);
          storage = [place, shelf].filter(Boolean).join(' / ') || null;
        }
      }
    } catch {
      /* svälj */
    }

    setVehicleModel(model);
    setExistingDamages(damagesList);
    setTireStorage(storage);
  }

  /* =========================================================
     Damage-hantering (bilder + text)
     ======================================================= */
  function ensureOneDamageIfNeeded() {
    if (hasNewDamage && damages.length === 0) {
      setDamages([{ text: '', files: [], previews: [] }]);
    }
    if (hasNewDamage === false) {
      setDamages([]);
    }
  }

  useEffect(() => {
    ensureOneDamageIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNewDamage]);

  function updateDamageText(i: number, value: string) {
    setDamages((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, text: value } : d))
    );
  }

  function addDamage() {
    setDamages((prev) => [...prev, { text: '', files: [], previews: [] }]);
  }

  function removeDamage(i: number) {
    setDamages((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleDamageFiles(i: number, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (!files.length) return;

    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setDamages((prev) =>
      prev.map((d, idx) =>
        idx === i
          ? {
              ...d,
              files: [...d.files, ...files],
              previews: [...d.previews, ...newPreviews],
            }
          : d
      )
    );
    // töm input så man kan välja samma fil igen om man vill
    e.target.value = '';
  }

  function removeDamagePhoto(i: number, previewUrl: string) {
    setDamages((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        const pIndex = d.previews.findIndex((p) => p === previewUrl);
        if (pIndex === -1) return d;
        const nextPreviews = [...d.previews];
        nextPreviews.splice(pIndex, 1);
        const nextFiles = [...d.files];
        nextFiles.splice(pIndex, 1);
        return { ...d, files: nextFiles, previews: nextPreviews };
      })
    );
  }

  /* =========================================================
     Submit
     ======================================================= */
  async function uploadDamagePhotos(plate: string) {
    const out: string[] = [];
    for (let i = 0; i < damages.length; i++) {
      for (const f of damages[i].files) {
        const path = `${plate}/${stamp()}-${cleanFileName(f.name || 'bild.jpg')}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, {
            contentType: f.type || 'image/jpeg',
            upsert: false,
          });
        if (upErr) continue;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) out.push(data.publicUrl);
      }
    }
    return out;
  }

  function onlyDigits(s: string) {
    return s.replace(/\D+/g, '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    const plate = regnr.trim().toUpperCase();
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
    if (!stationId) {
      setStatus('error');
      setMessage('Välj station / depå.');
      return;
    }
    if (!onlyDigits(odometer)) {
      setStatus('error');
      setMessage('Ange giltig mätarställning.');
      return;
    }

    try {
      const photoUrls = await uploadDamagePhotos(plate);

      // Minimalt och robust insert-objekt (endast kolumner som garanterat finns)
      const insertObj: Record<string, any> = {
        regnr: plate,
        regnr_valid: regOk === true, // true/false eller null om okänt
        odometer_km: Number(onlyDigits(odometer)),
        photo_urls: photoUrls, // text[] i DB
        station_id: stationId || null,
        station_other: stationOther || null,
        notes: notes || null,
      };

      // Dessa fält finns i din tabell i tidigare skärm­dump – lägg bara med om de är satta
      if (fuelFull !== null) insertObj.fuel_full = fuelFull;
      if (adblueOk !== null) insertObj.adblue_ok = adblueOk;
      if (washerOk !== null) insertObj.washer_ok = washerOk;
      if (privacyOk !== null) insertObj.privacy_cover_ok = privacyOk;

      // Önskas: antal laddsladdar o hjultyp – ta bara med om kolumnerna finns i din DB:
      // if (cableCount !== null) insertObj.charge_cable_count = cableCount;
      // if (wheelsOn) insertObj.wheel_type = wheelsOn;

      // ”nya skador?”-flagga – frivillig
      if (hasNewDamage !== null) insertObj.no_new_damage = !hasNewDamage;

      const { error } = await supabase.from('checkins').insert(insertObj);

      if (error) {
        setStatus('error');
        setMessage(
          error.message || 'Misslyckades att spara. Kontrollera fält och försök igen.'
        );
        return;
      }

      setStatus('done');
      setMessage(`Tack ${username}! Incheckningen sparades.`);
      // lämna värdena kvar – knappen nedan gör Ny incheckning
    } catch {
      setStatus('error');
      setMessage('Något gick fel vid uppladdning/sparande.');
    }
  }

  /* =========================================================
     Render
     ======================================================= */
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-xl px-4 pb-24 pt-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-zinc-600 mt-1">Inloggad: <span className="font-medium">Bob</span></div>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
        >
          {/* Reg.nr */}
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => {
              const v = e.target.value;
              checkPlateExists(v);
              lookupVehicle(v);
            }}
            className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
            inputMode="latin"
            autoCapitalize="characters"
            autoCorrect="off"
          />

          {/* Okänt reg.nr-varning */}
          {regOk === false && (
            <div className="mt-1 text-sm text-red-600">Okänt reg.nr</div>
          )}

          {/* Info om bilen (modell, hjulförvaring, befintliga skador) */}
          {(vehicleModel || tireStorage || existingDamages.length > 0) && (
            <div className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm">
              {vehicleModel && (
                <div>
                  <span className="font-medium">Bil:</span> {vehicleModel}
                </div>
              )}
              {tireStorage && (
                <div className="mt-1">
                  <span className="font-medium">Hjulförvaring:</span> {tireStorage}
                </div>
              )}
              {existingDamages.length > 0 && (
                <div className="mt-2">
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

          {/* Ort */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Ort *</label>
            <select
              className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setStationId('');
              }}
            >
              <option value="">— Välj ort —</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Station */}
          <div className="mt-4">
            <label className="block text-sm font-medium">Station / Depå *</label>
            <select
              className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              disabled={!city}
            >
              <option value="">— Välj station / depå —</option>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="mt-2 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
              placeholder="Ev. annan inlämningsplats"
              value={stationOther}
              onChange={(e) => setStationOther(e.target.value)}
            />
          </div>

          {/* Mätarställning */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Mätarställning *</label>
            <input
              value={odometer}
              onChange={(e) => setOdometer(onlyDigits(e.target.value))}
              className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
              placeholder="ex. 42 180"
              inputMode="numeric"
            />
          </div>

          {/* Tanknivå */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Tanknivå *</label>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setFuelFull(true)}
                className={`rounded-md px-4 py-2 ${
                  fuelFull === true
                    ? 'bg-green-100 ring-1 ring-green-400'
                    : 'bg-white border border-zinc-300'
                }`}
              >
                Fulltankad
              </button>
              <button
                type="button"
                onClick={() => setFuelFull(false)}
                className={`rounded-md px-4 py-2 ${
                  fuelFull === false
                    ? 'bg-red-100 ring-1 ring-red-400'
                    : 'bg-white border border-zinc-300'
                }`}
              >
                Ej fulltankad
              </button>
            </div>
          </div>

          {/* Ja/Nej-grupper */}
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* AdBlue */}
            <div>
              <label className="block text-sm font-medium">AdBlue OK? *</label>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setAdblueOk(true)}
                  className={`rounded-md px-4 py-2 ${
                    adblueOk === true
                      ? 'bg-green-100 ring-1 ring-green-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setAdblueOk(false)}
                  className={`rounded-md px-4 py-2 ${
                    adblueOk === false
                      ? 'bg-red-100 ring-1 ring-red-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  Nej
                </button>
              </div>
            </div>

            {/* Spolarvätska */}
            <div>
              <label className="block text-sm font-medium">Spolarvätska OK? *</label>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setWasherOk(true)}
                  className={`rounded-md px-4 py-2 ${
                    washerOk === true
                      ? 'bg-green-100 ring-1 ring-green-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setWasherOk(false)}
                  className={`rounded-md px-4 py-2 ${
                    washerOk === false
                      ? 'bg-red-100 ring-1 ring-red-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  Nej
                </button>
              </div>
            </div>

            {/* Insynsskydd */}
            <div>
              <label className="block text-sm font-medium">Insynsskydd OK? *</label>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPrivacyOk(true)}
                  className={`rounded-md px-4 py-2 ${
                    privacyOk === true
                      ? 'bg-green-100 ring-1 ring-green-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacyOk(false)}
                  className={`rounded-md px-4 py-2 ${
                    privacyOk === false
                      ? 'bg-red-100 ring-1 ring-red-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  Nej
                </button>
              </div>
            </div>
          </div>

          {/* Laddsladdar 0/1/2 */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Antal laddsladdar *</label>
            <div className="mt-2 flex gap-3">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCableCount(n as 0 | 1 | 2)}
                  className={`rounded-md px-4 py-2 ${
                    cableCount === n
                      ? 'bg-blue-100 ring-1 ring-blue-400'
                      : 'bg-white border border-zinc-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Hjul som sitter på */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Hjul som sitter på *</label>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setWheelsOn('sommar')}
                className={`rounded-md px-4 py-2 ${
                  wheelsOn === 'sommar'
                    ? 'bg-indigo-100 ring-1 ring-indigo-400'
                    : 'bg-white border border-zinc-300'
                }`}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                onClick={() => setWheelsOn('vinter')}
                className={`rounded-md px-4 py-2 ${
                  wheelsOn === 'vinter'
                    ? 'bg-indigo-100 ring-1 ring-indigo-400'
                    : 'bg-white border border-zinc-300'
                }`}
              >
                Vinterhjul
              </button>
            </div>
          </div>

          {/* Nya skador? */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Nya skador på bilen? *</label>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setHasNewDamage(true)}
                className={`rounded-md px-4 py-2 ${
                  hasNewDamage === true
                    ? 'bg-green-100 ring-1 ring-green-400'
                    : 'bg-white border border-zinc-300'
                }`}
              >
                Ja
              </button>
              <button
                type="button"
                onClick={() => setHasNewDamage(false)}
                className={`rounded-md px-4 py-2 ${
                  hasNewDamage === false
                    ? 'bg-red-100 ring-1 ring-red-400'
                    : 'bg-white border border-zinc-300'
                }`}
              >
                Nej
              </button>
            </div>
          </div>

          {/* Skadebox */}
          {hasNewDamage === true && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
              {damages.map((dmg, i) => (
                <div
                  key={i}
                  className="mb-4 rounded-md border border-amber-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Skada {i + 1}</div>
                    <button
                      type="button"
                      className="text-sm text-zinc-600 underline"
                      onClick={() => removeDamage(i)}
                    >
                      Ta bort
                    </button>
                  </div>

                  <label className="mt-2 block text-sm">Text (obligatorisk)</label>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
                    placeholder="Beskriv skadan kort..."
                  />

                  <div className="mt-3">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleDamageFiles(i, e)}
                      className="hidden"
                      id={`dmg-input-${i}`}
                    />
                    <label
                      htmlFor={`dmg-input-${i}`}
                      className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm"
                    >
                      {dmg.files.length ? 'Lägg till fler bilder' : 'Lägg till bilder'}
                    </label>

                    {dmg.previews.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src) => (
                          <div key={src} className="relative">
                            <img
                              src={src}
                              alt="Förhandsvisning"
                              className="h-24 w-full rounded-md object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeDamagePhoto(i, src)}
                              className="absolute right-1 top-1 rounded bg-black/60 px-1 text-xs text-white"
                              title="Ta bort bild"
                            >
                              Ta bort
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addDamage}
                className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
              >
                Lägg till ytterligare skada
              </button>
            </div>
          )}

          {/* Övriga anteckningar */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Övriga anteckningar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg bg-zinc-100 border border-zinc-300 px-3 py-2"
              placeholder="Övrig info..."
            />
          </div>

          {/* Status-meddelanden */}
          {status === 'error' && message && (
            <div className="mt-3 text-sm text-red-600">{message}</div>
          )}
          {status === 'done' && message && (
            <div className="mt-3 text-sm text-green-600">{message}</div>
          )}

          {/* Knappar */}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={status === 'saving'}
              className={`flex-1 rounded-lg px-4 py-3 text-white ${
                status === 'saving'
                  ? 'bg-blue-400'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Spara incheckning
            </button>
            {status === 'done' && (
              <button
                type="button"
                onClick={() => {
                  // Återställ för ny incheckning
                  setRegnr('');
                  setRegOk(null);
                  setCity('');
                  setStationId('');
                  setStationOther('');
                  setOdometer('');
                  setFuelFull(null);
                  setAdblueOk(null);
                  setWasherOk(null);
                  setPrivacyOk(null);
                  setCableCount(null);
                  setWheelsOn(null);
                  setHasNewDamage(null);
                  setDamages([]);
                  setNotes('');
                  setVehicleModel(null);
                  setTireStorage(null);
                  setExistingDamages([]);
                  setStatus('idle');
                  setMessage('');
                }}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-3"
              >
                Ny incheckning
              </button>
            )}
          </div>
        </form>

        <footer className="mt-10 text-center text-sm text-zinc-500">
          © Albarone AB {year}
        </footer>
      </div>
    </div>
  );
}
