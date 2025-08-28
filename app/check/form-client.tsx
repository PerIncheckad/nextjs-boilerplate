'use client';

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../../lib/supabase';

// ---------- Typer ----------
type Station = { id: string; name: string; email?: string | null };
type DamageEntry = { text: string; files: File[]; previews: string[] };
type VehicleInfo = {
  brand_model?: string | null;
  damages?: string[] | null;
  tire_storage?: string | null;
};

// ---------- UI helpers (färger/knappar) ----------
const yesBtn = (active: boolean) =>
  `${active ? 'bg-green-200 border-green-400' : 'bg-white border-zinc-300'} 
   text-zinc-900 rounded-md border px-4 py-2 transition-colors`;

const noBtn = (active: boolean) =>
  `${active ? 'bg-red-200 border-red-400' : 'bg-white border-zinc-300'}
   text-zinc-900 rounded-md border px-4 py-2 transition-colors`;

const countBtn = (active: boolean) =>
  `${active ? 'bg-blue-200 border-blue-400' : 'bg-white border-zinc-300'}
   text-zinc-900 rounded-md border px-4 py-2 min-w-[3rem] justify-center transition-colors`;

const pill = 'rounded-md border px-4 py-2 transition-colors';
const inputBase =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400';

// ---------- Komponent ----------
export default function IncheckadForm() {
  // “inloggad” visning tills auth är på plats
  const [username] = useState('Bob');

  // Fält
  const [regnr, setRegnr] = useState('');
  const regnrUpper = useMemo(() => regnr.trim().toUpperCase(), [regnr]);

  // Stationer & ort/plats
  const [stations, setStations] = useState<Station[]>([]);
  const [city, setCity] = useState(''); // första steg
  const [stationId, setStationId] = useState(''); // andra steg
  const [stationOther, setStationOther] = useState('');

  // Övrigt
  const [odometer, setOdometer] = useState('');

  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);
  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  const [newDamage, setNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const [notes, setNotes] = useState('');

  // UI-status
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Bilinfo & validering
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);

  // ---- Hämta stationer (platt lista från DB) ----
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stations').select('id,name,email').order('name', { ascending: true });
      setStations((data || []) as Station[]);
    })();
  }, []);

  // ---- Här bildar vi “Ort” av stationens namn (för tvåstegsväljare) ----
  const { cities, byCity } = useMemo(() => {
    const norm = stations.map((s) => {
      const n = s.name.trim();
      // Ort = första ordet (MALMÖ, LUND, HALMSTAD, …)
      const c = n.split(' ')[0].replace(/[\(\)]/g, '');
      return { ...s, city: c };
    });
    const cs = Array.from(new Set(norm.map((s: any) => s.city))).filter((c) => c && c !== 'X');
    const map: Record<string, Station[]> = {};
    cs.forEach((c) => (map[c] = norm.filter((s: any) => s.city === c)));
    return { cities: cs, byCity: map };
  }, [stations]);

  const filteredStations = city ? byCity[city] || [] : [];

  // ---- Slå upp bilinfo när regnr fylldes ----
  async function lookupVehicle() {
    const plate = regnrUpper;
    if (plate.length < 3) {
      setVehicle(null);
      setRegnrValid(null);
      return;
    }
    const { data: allowed } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .ilike('regnr', plate)
      .limit(1);
    setRegnrValid(!!allowed && allowed.length > 0);

    const { data: vds } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model,damages')
      .ilike('regnr', plate)
      .maybeSingle();

    const { data: tire } = await supabase
      .from('tire_storage_summary')
      .select('location')
      .ilike('regnr', plate)
      .maybeSingle();

    setVehicle({
      brand_model: (vds as any)?.brand_model ?? null,
      damages: ((vds as any)?.damages as string[]) ?? null,
      tire_storage: (tire as any)?.location ?? null,
    });
  }

  // ---- Skador (lägga till/ta bort) ----
  const addDamage = () => setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  const removeDamage = (i: number) => setDamages((d) => d.filter((_, idx) => idx !== i));
  const updateDamageText = (i: number, value: string) =>
    setDamages((d) => {
      const copy = [...d];
      copy[i].text = value;
      return copy;
    });
  const handleDamageFiles = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) => {
      const copy = [...d];
      copy[i].files = files;
      copy[i].previews = previews;
      return copy;
    });
  };

  // ---- Validering ----
  const isFormValid = useMemo(() => {
    if (!regnrUpper || !stationId || !odometer) return false;
    if (fuelFull === null || adblueOk === null || washerOk === null || privacyOk === null) return false;
    if (chargeCableCount === null || wheelsOn === null) return false;
    if (newDamage === true) {
      if (damages.length === 0) return false;
      if (damages.some((d) => !d.text.trim())) return false;
    }
    return true;
  }, [
    regnrUpper,
    stationId,
    odometer,
    fuelFull,
    adblueOk,
    washerOk,
    privacyOk,
    chargeCableCount,
    wheelsOn,
    newDamage,
    damages,
  ]);

  // ---- Spara ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus('saving');
    setMessage('');

    try {
      // 1) Ladda upp ev. skadebilder
      const photoUrls: string[] = [];
      if (newDamage && damages.length > 0) {
        const folder = `${regnrUpper}/${Date.now()}`;
        for (let i = 0; i < damages.length; i++) {
          for (const file of damages[i].files) {
            const safe = file.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '');
            const path = `${folder}/${i}-${safe}`;
            const { error: upErr } = await supabase.storage.from('damage-photos').upload(path, file, {
              cacheControl: '3600',
              upsert: false,
            });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from('damage-photos').getPublicUrl(path);
            if (pub?.publicUrl) photoUrls.push(pub.publicUrl);
          }
        }
      }

      // 2) Objektet som sparas (nycklar = kolumnnamn i checkins)
      const insertObj: Record<string, any> = {
        regnr: regnrUpper,
        regnr_valid: regnrValid ?? null,
        station_id: stationId || null,
        station_other: stationOther || null,
        employee_id: null, // kommer med riktig auth sen
        odometer_km: odometer ? Number(odometer) : null,
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk, // om kolumnen heter annat byter vi namnet här
        charge_cable_count: chargeCableCount,
        tires_type: wheelsOn,
        wheel_type: wheelsOn,
        no_new_damage: newDamage === false ? true : newDamage === true ? false : null,
        notes: notes || null,
        photo_urls: photoUrls.length ? photoUrls : null,
      };

      const { error: insErr } = await supabase.from('checkins').insert(insertObj);
      if (insErr) throw insErr;

      setStatus('done');
      setMessage(`Tack ${username}! Incheckning sparad.`);
      setDamages([]);
      setNewDamage(null);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  }

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-sm text-zinc-500">
            Inloggad: <span className="text-zinc-700">{username}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Reg.nr */}
          <div>
            <label className="block text-sm font-medium">Registreringsnummer *</label>
            <input
              value={regnr}
              onChange={(e) => setRegnr(e.target.value.toUpperCase())}
              onBlur={lookupVehicle}
              className={`${inputBase} tracking-widest uppercase`}
              placeholder="ABC123"
            />
            {regnrValid === false && <p className="mt-1 text-sm text-red-500">Fel reg.nr</p>}
          </div>

          {/* Bilinfo precis under reg.nr */}
          {(vehicle?.brand_model || vehicle?.damages || vehicle?.tire_storage) && (
            <div className="rounded-lg border border-zinc-300 bg-white p-4">
              {vehicle?.brand_model && (
                <p>
                  <span className="font-semibold">Bil:</span> {vehicle.brand_model}
                </p>
              )}
              {vehicle?.tire_storage && (
                <p className="mt-1">
                  <span className="font-semibold">Hjulförvaring:</span> {vehicle.tire_storage}
                </p>
              )}
              {vehicle?.damages && vehicle.damages.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold">Befintliga skador:</p>
                  <ul className="ml-5 list-disc">
                    {vehicle.damages.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Ort & Station i två steg */}
          <div>
            <label className="block text-sm font-medium">Ort *</label>
            <select
              className={inputBase}
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setStationId('');
              }}
            >
              <option value="">— Välj ort —</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-sm font-medium">Station / Depå *</label>
            <select
              className={inputBase}
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              disabled={!city}
            >
              <option value="">{city ? '— Välj station / depå —' : 'Välj ort först'}</option>
              {filteredStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <input
              className={`${inputBase} mt-2`}
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
                className={inputBase}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="ex. 42 180"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value.replace(/\D+/g, ''))}
              />
              <span className="text-sm text-zinc-500">km</span>
            </div>
          </div>

          {/* Tanknivå */}
          <div>
            <label className="block text-sm font-medium">Tanknivå *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" className={yesBtn(fuelFull === true)} onClick={() => setFuelFull(true)}>
                Fulltankad
              </button>
              <button type="button" className={noBtn(fuelFull === false)} onClick={() => setFuelFull(false)}>
                Ej fulltankad
              </button>
            </div>
          </div>

          {/* AdBlue/Spolarvätska/Insynsskydd */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">AdBlue OK? *</label>
              <div className="mt-2 flex gap-3">
                <button type="button" className={yesBtn(adblueOk === true)} onClick={() => setAdblueOk(true)}>
                  Ja
                </button>
                <button type="button" className={noBtn(adblueOk === false)} onClick={() => setAdblueOk(false)}>
                  Nej
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">Spolarvätska OK? *</label>
              <div className="mt-2 flex gap-3">
                <button type="button" className={yesBtn(washerOk === true)} onClick={() => setWasherOk(true)}>
                  Ja
                </button>
                <button type="button" className={noBtn(washerOk === false)} onClick={() => setWasherOk(false)}>
                  Nej
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">Insynsskydd OK? *</label>
              <div className="mt-2 flex gap-3">
                <button type="button" className={yesBtn(privacyOk === true)} onClick={() => setPrivacyOk(true)}>
                  Ja
                </button>
                <button type="button" className={noBtn(privacyOk === false)} onClick={() => setPrivacyOk(false)}>
                  Nej
                </button>
              </div>
            </div>
          </div>

          {/* Laddsladdar */}
          <div>
            <label className="block text-sm font-medium">Antal laddsladdar *</label>
            <div className="mt-2 flex gap-3">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={countBtn(chargeCableCount === n)}
                  onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Hjul */}
          <div>
            <label className="block text-sm font-medium">Hjul som sitter på *</label>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={yesBtn(wheelsOn === 'sommar')}
                onClick={() => setWheelsOn('sommar')}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                className={yesBtn(wheelsOn === 'vinter')}
                onClick={() => setWheelsOn('vinter')}
              >
                Vinterhjul
              </button>
            </div>
          </div>

          {/* Nya skador */}
          <div>
            <label className="block text-sm font-medium">Nya skador på bilen? *</label>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={yesBtn(newDamage === true)}
                onClick={() => {
                  setNewDamage(true);
                  if (damages.length === 0) addDamage();
                }}
              >
                Ja
              </button>
              <button
                type="button"
                className={noBtn(newDamage === false)}
                onClick={() => {
                  setNewDamage(false);
                  setDamages([]);
                }}
              >
                Nej
              </button>
            </div>
          </div>

          {newDamage === true && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              {damages.map((dmg, i) => (
                <div key={i} className="mb-6 rounded-lg border border-amber-300 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-semibold">Skada {i + 1}</h4>
                    <button type="button" className="text-sm text-zinc-500 underline" onClick={() => removeDamage(i)}>
                      Ta bort
                    </button>
                  </div>

                  <label className="mb-1 block text-sm font-medium">Text (obligatorisk)</label>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    placeholder="Beskriv skadan kort…"
                    className={inputBase}
                  />

                  <div className="mt-3">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleDamageFiles(i, e)}
                      className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
                    />
                    {dmg.previews?.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt={`Skadefoto ${i + 1}.${idx + 1}`}
                            className="h-20 w-full rounded-md object-cover border border-zinc-300"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addDamage}
                className="w-full rounded-md border border-amber-300 bg-white py-2 font-medium"
              >
                {damages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
              </button>
            </div>
          )}

          {/* Övriga anteckningar */}
          <div>
            <label className="block text-sm font-medium">Övriga anteckningar</label>
            <textarea
              className={`${inputBase} min-h-[110px]`}
              placeholder="Övrig info…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Status */}
          {status === 'error' && <div className="text-sm text-red-600">{message}</div>}
          {status === 'done' && <div className="text-sm text-green-600">{message}</div>}

          {/* Spara */}
          <button
            disabled={!isFormValid || saving}
            className={`w-full rounded-lg px-4 py-3 font-semibold text-white ${
              !isFormValid || saving ? 'bg-zinc-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? 'Sparar…' : 'Spara incheckning'}
          </button>

          <div className="pt-2 text-center text-sm text-zinc-500">© Albarone AB {new Date().getFullYear()}</div>
        </form>
      </div>
    </div>
  );
}
