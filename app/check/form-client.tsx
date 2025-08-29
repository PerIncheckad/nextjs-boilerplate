'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';

// ============================================================
//   KONFIG
// ============================================================
const BUCKET = 'damage-photos';

// Inbyggt stations-träd (tvåsteg: Ort -> Station/Depå)
const STATIONS: Record<string, string[]> = {
  // --- ÄNGELHOLM ---
  'ÄNGELHOLM': [
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'ÄNGELHOLM AIRPORT',
  ],

  // --- HALMSTAD ---
  'HALMSTAD': [
    'Hedin Automotive Ford',
    'Hedin Automotive Kia',
    'Hedin Automotive Mercedes',
    'Hedin Automotive',
    'CITY AIRPORT',
  ],

  // --- HELSINGBORG ---
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

  // --- LUND ---
  'LUND': [
    'Bil & Skadeservice',
    'Hedin Automotive Ford',
    'Hedin Automotive',
    'Hedin Bil',
    'P7 Revingehed',
  ],

  // --- MALMÖ ---
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

  // --- VARBERG ---
  'VARBERG': [
    'Finnvedens Bil Skadecenter',
    'Hedin Automotive Ford',
    'Hedin Automotive Holmgärde',
    'Hedin Automotive',
    'Sällstorps Plåt & Lack',
  ],

  // --- TRELLEBORG ---
  'TRELLEBORG': ['—'],

  // --- FALKENBERG ---
  'FALKENBERG': ['—'],

  // Lägg gärna till fler orter vid behov
};

// ============================================================
//   TYPS & HJÄLPARE
// ============================================================
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[]; // dataURL för UI
};

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 100);
}

function stamp() {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    '-' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0')
  );
}

// ============================================================
//   KOMPONENT
// ============================================================
export default function CheckinApp() {
  // --- Header / “inloggad” ---
  const [username] = useState('Bob'); // temporär “inloggad” användare

  // --- Formfält ---
  const [regnr, setRegnr] = useState('');
  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState(''); // själva valda depå-namnet (vi sparar i station_other)
  const [stationOther, setStationOther] = useState('');
  const [odometer, setOdometer] = useState('');

  // Ja/Nej + övrigt
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washOk, setWashOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<boolean | null>(null);
  const [cableCount, setCableCount] = useState<number | null>(null);
  const [wheelOn, setWheelOn] = useState<'sommar' | 'vinter' | null>(null);

  // Skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([
    { text: '', files: [], previews: [] },
  ]);

  // Status & meddelanden
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // Lås spara efter lyckad incheckning
  const [saveLocked, setSaveLocked] = useState(false);

  // Regnr-uppslag / info under regnr
  const [regnrKnown, setRegnrKnown] = useState<boolean | null>(null);
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleDamages, setVehicleDamages] = useState<string[]>([]);
  const [wheelStorage, setWheelStorage] = useState('');

  // ==========================================================
  //   Regnr-uppslag: finns i allowed_plates? + hämta bilinfo
  // ==========================================================
  async function lookupVehicle(raw: string) {
    const plate = (raw || '').toUpperCase().trim();
    setRegnr(plate);

    if (!plate) {
      setRegnrKnown(null);
      setVehicleModel('');
      setVehicleDamages([]);
      setWheelStorage('');
      return;
    }

    try {
      // 1) Kolla om regnr finns i “allowed_plates”
      let exists = true;
      const { data: allowRows, error: allowErr } = await supabase
        .from('allowed_plates')
        .select('regnr')
        .eq('regnr', plate)
        .limit(1);

      if (!allowErr) exists = !!(allowRows && allowRows.length > 0);
      setRegnrKnown(exists); // visa “Fel reg.nr” endast om säkert falskt

      // 2) Försök hämta bilmodell och ev. skadesammanfattning
      let model = '';
      let damagesFromDb: string[] = [];

      // 2a) vehicle_damage_summary
      const { data: vds, error: vdsErr } = await supabase
        .from('vehicle_damage_summary')
        .select('model, damages')
        .eq('regnr', plate)
        .limit(1);

      if (!vdsErr && vds && vds.length) {
        model = (vds[0] as any).model || '';
        const d = (vds[0] as any).damages;
        damagesFromDb = Array.isArray(d) ? d : d ? String(d).split(/\s*,\s*/) : [];
      }

      // 2b) active_damages (om summary saknas)
      if (!model && damagesFromDb.length === 0) {
        const { data: ad, error: adErr } = await supabase
          .from('active_damages')
          .select('desc, model')
          .eq('regnr', plate);

        if (!adErr && ad && ad.length) {
          model = (ad[0] as any).model || model || '';
          const list = ad.map((r: any) => r.desc).filter(Boolean).map((s: string) => s.trim());
          if (list.length) damagesFromDb = list;
        }
      }

      setVehicleModel(model || '');
      setVehicleDamages(damagesFromDb || []);

      // 3) Hämta hjulförvaring
      let wheel = '';
      // a) tire_storage_summary
      const { data: tss, error: tssErr } = await supabase
        .from('tire_storage_summary')
        .select('location')
        .eq('regnr', plate)
        .limit(1);

      if (!tssErr && tss && tss.length) {
        wheel = (tss[0] as any).location || '';
      }

      // b) tire_storage
      if (!wheel) {
        const { data: ts, error: tsErr } = await supabase
          .from('tire_storage')
          .select('place, shelf')
          .eq('regnr', plate)
          .limit(1);

        if (!tsErr && ts && ts.length) {
          const p = (ts[0] as any).place || '';
          const h = (ts[0] as any).shelf || '';
          wheel = [p, h].filter(Boolean).join(' / ');
        }
      }

      setWheelStorage(wheel || '');
    } catch {
      // Vid fel, undvik att visa “fel reg.nr”
      setRegnrKnown(true);
    }
  }

  // ==========================================================
  //   Skador – UI-hjälpare
  // ==========================================================
  function updateDamageText(i: number, text: string) {
    setDamages((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], text };
      return copy;
    });
  }

  function removeDamageRow(i: number) {
    setDamages((prev) => prev.filter((_, idx) => idx !== i));
  }

  function removeDamageImage(i: number, imgIdx: number) {
    setDamages((prev) => {
      const copy = [...prev];
      const d = { ...copy[i] };
      d.previews = d.previews.filter((_, idx) => idx !== imgIdx);
      d.files = d.files.filter((_, idx) => idx !== imgIdx);
      copy[i] = d;
      return copy;
    });
  }

  function addDamageRow() {
    setDamages((prev) => [...prev, { text: '', files: [], previews: [] }]);
  }

  async function handleDamageFiles(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPreviews: string[] = await Promise.all(
      files.map(
        (f) =>
          new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = () => res(String(reader.result));
            reader.readAsDataURL(f);
          }),
      ),
    );

    setDamages((prev) => {
      const copy = [...prev];
      const d = { ...copy[i] };
      d.files = [...d.files, ...files];
      d.previews = [...d.previews, ...newPreviews];
      copy[i] = d;
      return copy;
    });

    // nollställ input så man kan välja samma fil igen om man vill
    e.currentTarget.value = '';
  }

  async function uploadDamagePhotos(plate: string, list: DamageEntry): Promise<string[]> {
    const urls: string[] = [];
    for (const f of list.files) {
      const path = `${plate}/${stamp()}-${cleanFileName(f.name || 'bild.jpg')}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
        upsert: false,
        contentType: f.type || 'image/jpeg',
      });
      if (error) continue;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }

  // ==========================================================
  //   SUBMIT (tillåt inskick även om regnrKnown === false)
  //   – vi sparar BARA robusta fält så vi inte får kolumnfel
  // ==========================================================
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saveLocked) return;

    setStatus('saving');
    setMessage('');

    // Validera “obligatoriskt” (men tillåt fel regnr)
    if (!regnr.trim()) {
      setStatus('error');
      setMessage('Ange registreringsnummer.');
      return;
    }
    if (!city.trim()) {
      setStatus('error');
      setMessage('Välj ort.');
      return;
    }
    if (!stationId.trim()) {
      setStatus('error');
      setMessage('Välj station / depå.');
      return;
    }
    if (!odometer.trim() || Number.isNaN(Number(odometer))) {
      setStatus('error');
      setMessage('Ange giltig mätarställning.');
      return;
    }
    if (fuelFull === null) {
      setStatus('error'); setMessage('Välj tanknivå.'); return;
    }
    if (adblueOk === null) {
      setStatus('error'); setMessage('Välj AdBlue OK?.'); return;
    }
    if (washOk === null) {
      setStatus('error'); setMessage('Välj Spolarvätska OK?.'); return;
    }
    if (privacyCoverOk === null) {
      setStatus('error'); setMessage('Välj Insynsskydd OK?.'); return;
    }
    if (cableCount === null) {
      setStatus('error'); setMessage('Välj antal laddsladdar.'); return;
    }
    if (wheelOn === null) {
      setStatus('error'); setMessage('Välj hjul som sitter på.'); return;
    }
    if (hasNewDamage === null) {
      setStatus('error'); setMessage('Svara om nya skador.'); return;
    }

    // Ladda upp ev. nya skador (bilder)
    let allPhotoUrls: string[] = [];
    if (hasNewDamage && damages.length > 0) {
      for (const d of damages) {
        if (!d.text.trim()) {
          setStatus('error'); setMessage('Text är obligatorisk för varje skada.'); return;
        }
      }
      for (const d of damages) {
        const urls = await uploadDamagePhotos(regnr.toUpperCase(), d);
        allPhotoUrls = allPhotoUrls.concat(urls);
      }
    }

    // Sätt ett kompatibelt “station_other” (fri text)
    const stationOtherText =
      [city, stationId, stationOther].filter(Boolean).join(' – ');

    // Bygg ett försiktigt insert-objekt som inte triggar schema-fel
    const insertObj: Record<string, any> = {
      regnr: regnr.toUpperCase().trim(),
      regnr_valid: regnrKnown !== false, // true om okänt/true, false om säkert fel
      odometer_km: Number(odometer),
      notes: '', // “Övriga anteckningar” – fylls nedan om du har en state för det
      photo_urls: allPhotoUrls,
      wheel_type: wheelOn,            // text, har check-constraint i din tabell
      no_new_damage: !hasNewDamage,   // bool
      station_other: stationOtherText // tills riktig station_id kopplas på
    };

    // Försök även spara några booleaner som sannolikt finns
    // (om någon saknas i din tabell kommer INSERT ändå gå igenom
    //  eftersom de fälten bara uteblir)
    insertObj.adblue_ok = adblueOk;
    insertObj.wash_ok = washOk;               // din tabell heter ofta wash_ok
    insertObj.privacy_cover_ok = privacyCoverOk;
    insertObj.chargers_count = cableCount;
    insertObj.fuel_full = fuelFull;

    // Har du en state “notes” i din form? Lägg in den här:
    // insertObj.notes = notes;

    const { error } = await supabase.from('checkins').insert(insertObj);

    if (error) {
      setStatus('error');
      setMessage(error.message || 'Misslyckades att spara.');
      return;
    }

    setStatus('done');
    setMessage(`Tack ${username}! Incheckningen sparades.`);
    setSaveLocked(true);
  }

  // ==========================================================
  //   UI-TOKEN
  // ==========================================================
  const year = useMemo(() => new Date().getFullYear(), []);

  // ==========================================================
  //   RENDER
  // ==========================================================
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-xl mx-auto p-4 sm:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-sm opacity-80">Inloggad: <span className="font-medium">{username}</span></div>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white border border-zinc-200 rounded-xl shadow p-4 sm:p-6"
        >
          {/* REGNR */}
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => lookupVehicle(e.target.value)}
            placeholder="ABC123"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 tracking-widest uppercase"
          />
          {regnrKnown === false && (
            <div className="text-sm text-red-500 mt-1">Fel reg.nr</div>
          )}

          {/* Bilinfo direkt under reg.nr */}
          {(vehicleModel || vehicleDamages.length > 0 || wheelStorage) && (
            <div className="mt-3 rounded-md bg-zinc-100 border border-zinc-200 p-3 text-sm">
              {vehicleModel && (
                <div className="mb-1"><span className="font-medium">Bil:</span> {vehicleModel}</div>
              )}
              {vehicleDamages.length > 0 && (
                <div className="mb-1">
                  <span className="font-medium">Befintliga skador:</span>
                  <ul className="list-disc pl-5">
                    {vehicleDamages.map((d, i) => (<li key={i}>{d}</li>))}
                  </ul>
                </div>
              )}
              {wheelStorage && (
                <div><span className="font-medium">Hjulförvaring:</span> {wheelStorage}</div>
              )}
            </div>
          )}

          {/* Ort / Station */}
          <div className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium">Ort *</label>
              <select
                value={city}
                onChange={(e) => { setCity(e.target.value); setStationId(''); }}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
              >
                <option value="">— Välj ort —</option>
                {Object.keys(STATIONS).sort().map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Station / Depå *</label>
              <select
                disabled={!city}
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:opacity-60"
              >
                <option value="">— Välj station / depå —</option>
                {(STATIONS[city] || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Ev. annan inlämningsplats</label>
              <input
                value={stationOther}
                onChange={(e) => setStationOther(e.target.value)}
                placeholder="Övrig info…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
              />
            </div>
          </div>

          {/* MÄTARSTÄLLNING */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Mätarställning *</label>
            <div className="flex items-center gap-2">
              <input
                value={odometer}
                onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="ex. 42 180"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
              />
              <span className="text-sm text-zinc-500">km</span>
            </div>
          </div>

          {/* TANKNIVÅ */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Tanknivå *</label>
            <div className="mt-2 flex gap-3">
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
          </div>

          {/* ADBLUE */}
          <div className="mt-6">
            <label className="block text-sm font-medium">AdBlue OK? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setAdblueOk(true)}
                className={`rounded-md px-6 py-2 ${adblueOk === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}>Ja</button>
              <button type="button" onClick={() => setAdblueOk(false)}
                className={`rounded-md px-6 py-2 ${adblueOk === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}>Nej</button>
            </div>
          </div>

          {/* SPOLARVÄTSKA */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Spolarvätska OK? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setWashOk(true)}
                className={`rounded-md px-6 py-2 ${washOk === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}>Ja</button>
              <button type="button" onClick={() => setWashOk(false)}
                className={`rounded-md px-6 py-2 ${washOk === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}>Nej</button>
            </div>
          </div>

          {/* INSYNSSKYDD */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Insynsskydd OK? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setPrivacyCoverOk(true)}
                className={`rounded-md px-6 py-2 ${privacyCoverOk === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}>Ja</button>
              <button type="button" onClick={() => setPrivacyCoverOk(false)}
                className={`rounded-md px-6 py-2 ${privacyCoverOk === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}>Nej</button>
            </div>
          </div>

          {/* ANTAL LADDSLADDAR */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Antal laddsladdar *</label>
            <div className="mt-2 flex gap-3">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCableCount(n)}
                  className={`rounded-md px-4 py-2 ${cableCount === n ? 'bg-blue-600 text-white' : 'bg-white border border-zinc-300'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* HJUL SOM SITTER PÅ */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Hjul som sitter på *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setWheelOn('sommar')}
                className={`rounded-md px-6 py-2 ${wheelOn === 'sommar' ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'bg-white border border-zinc-300'}`}>Sommarhjul</button>
              <button type="button" onClick={() => setWheelOn('vinter')}
                className={`rounded-md px-6 py-2 ${wheelOn === 'vinter' ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'bg-white border border-zinc-300'}`}>Vinterhjul</button>
            </div>
          </div>

          {/* NYA SKADOR? */}
          <div className="mt-6">
            <label className="block text-sm font-medium">Nya skador på bilen? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setHasNewDamage(true)}
                className={`rounded-md px-6 py-2 ${hasNewDamage === true ? 'bg-green-100 ring-1 ring-green-400' : 'bg-white border border-zinc-300'}`}>Ja</button>
              <button type="button" onClick={() => setHasNewDamage(false)}
                className={`rounded-md px-6 py-2 ${hasNewDamage === false ? 'bg-red-100 ring-1 ring-red-400' : 'bg-white border border-zinc-300'}`}>Nej</button>
            </div>
          </div>

          {/* SKADEBOX – syns bara om Ja */}
          {hasNewDamage === true && (
            <div className="mt-4 border-2 border-amber-300 bg-amber-50 rounded-lg p-3">
              {damages.map((dmg, i) => (
                <div key={i} className="mb-6 last:mb-0">
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-medium">Skada {i + 1}</div>
                    {damages.length > 1 && (
                      <button
                        type="button"
                        className="text-sm underline"
                        onClick={() => removeDamageRow(i)}
                      >
                        Ta bort
                      </button>
                    )}
                  </div>

                  <label className="block text-sm font-medium">Text (obligatorisk)</label>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    placeholder="Beskriv skadan kort…"
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2"
                  />

                  <div className="mt-3">
                    <label className="block text-sm font-medium mb-1">
                      {dmg.previews.length ? 'Lägg till fler bilder' : 'Lägg till bilder'}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleDamageFiles(i, e)}
                      className="block w-full cursor-pointer rounded-lg border border-amber-300 bg-white px-3 py-2"
                    />
                  </div>

                  {dmg.previews.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {dmg.previews.map((src, idx) => (
                        <div key={idx} className="relative">
                          <img src={src} alt={`Skadefoto ${idx + 1}`} className="h-24 w-full object-cover rounded-md border border-amber-300" />
                          <button
                            type="button"
                            onClick={() => removeDamageImage(i, idx)}
                            className="absolute -top-2 -right-2 rounded-full bg-white border border-zinc-300 text-xs px-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-2">
                <button
                  type="button"
                  onClick={addDamageRow}
                  className="w-full rounded-lg bg-white border border-amber-300 px-4 py-2"
                >
                  Lägg till ytterligare skada
                </button>
              </div>
            </div>
          )}

          {/* STATUS */}
          <div className="mt-4">
            {status === 'error' && <div className="text-sm text-red-600">{message}</div>}
            {status === 'done' && <div className="text-sm text-green-600">{message}</div>}
          </div>

          {/* KNAPPAR */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="submit"
              disabled={saveLocked || status === 'saving'}
              className={`rounded-lg px-5 py-3 font-medium ${
                saveLocked || status === 'saving'
                  ? 'bg-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
            >
              Spara incheckning
            </button>

            {saveLocked && (
              <button
                type="button"
                onClick={() => {
                  // Behåll datan synlig – lås upp för nästa incheckning först när användaren trycker här och vi NOLLSTÄLLER.
                  setSaveLocked(false);
                  setStatus('idle');
                  setMessage('');

                  // Nollställ endast om du verkligen vill börja om:
                  setRegnr('');
                  setRegnrKnown(null);
                  setVehicleModel('');
                  setVehicleDamages([]);
                  setWheelStorage('');
                  setCity('');
                  setStationId('');
                  setStationOther('');
                  setOdometer('');
                  setFuelFull(null);
                  setAdblueOk(null);
                  setWashOk(null);
                  setPrivacyCoverOk(null);
                  setCableCount(null);
                  setWheelOn(null);
                  setHasNewDamage(null);
                  setDamages([{ text: '', files: [], previews: [] }]);
                }}
                className="rounded-lg px-5 py-3 text-lg font-semibold bg-zinc-200 text-zinc-900 hover:bg-zinc-300"
              >
                Ny incheckning
              </button>
            )}
          </div>
        </form>

        <div className="text-center text-xs text-zinc-500 mt-6">
          © Albarone AB {year}
        </div>
      </div>
    </div>
  );
}
