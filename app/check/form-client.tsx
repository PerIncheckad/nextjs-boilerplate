'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';

// ---------- Typer ----------
type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[];
};

type VehicleInfo = {
  brand_model?: string | null;
  damages?: string[] | null;
  tire_storage?: string | null; // Plats/hylla om vi hittar den
};

// Hjälpklass för aktiva/toggle-knappar
const btn = (active: boolean, extra = '') =>
  `${active ? 'bg-green-200 border-green-400 text-zinc-900' : 'bg-white border-zinc-300 text-zinc-900'} 
   rounded-md border px-4 py-2 transition-colors ${extra}`;

// Välj/markera-knappar (Nej)
const btnNo = (active: boolean, extra = '') =>
  `${active ? 'bg-red-200 border-red-400 text-zinc-900' : 'bg-white border-zinc-300 text-zinc-900'} 
   rounded-md border px-4 py-2 transition-colors ${extra}`;

// Inputfält – tvinga ljus bakgrund för läsbarhet även i dark mode
const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400';

export default function IncheckadForm() {
  // “inloggad” användare för UI (tills auth finns)
  const [username] = useState('Bob');

  // ------- Formfält -------
  const [regnr, setRegnr] = useState('');
  const regnrUpper = useMemo(() => regnr.trim().toUpperCase(), [regnr]);

  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<string>('');
  const [stationOther, setStationOther] = useState('');

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

  // ------- UI-status -------
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  // ------- Bil-info / validering -------
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null); // “Fel reg.nr”

  // -------- Hämta stationer ----------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('id,name,email')
        .order('name', { ascending: true });
      if (!error && data) setStations(data as Station[]);
    })();
  }, []);

  // -------- Slå upp bilinfo när regnr skrivs in ----------
  async function lookupVehicle(current: string) {
    const plate = current.trim().toUpperCase();
    if (plate.length < 3) {
      setVehicle(null);
      setRegnrValid(null);
      return;
    }

    // 1) Finns i “total-listan”?
    // Vi antar tabellen heter allowed_plates med kolumn regnr
    const { data: allowed, error: allowedErr } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .ilike('regnr', plate)
      .limit(1);

    setRegnrValid(!allowedErr && allowed && allowed.length > 0);

    // 2) Hämta modell + befintliga skador
    const { data: veh, error: vehErr } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .ilike('regnr', plate)
      .maybeSingle();

    // 3) Försök hämta hjulförvaring (om vi får tag i sådan vy/kolumn)
    const { data: tireRow } = await supabase
      .from('tire_storage_summary')
      .select('location')
      .ilike('regnr', plate)
      .maybeSingle();

    const v: VehicleInfo = {
      brand_model: vehErr ? null : veh?.brand_model ?? null,
      damages: vehErr ? null : (veh?.damages as string[] | null) ?? null,
      tire_storage: (tireRow as any)?.location ?? null,
    };
    setVehicle(v);
  }

  // --------- Skadehantering ----------
  function addDamage() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }
  function removeDamage(index: number) {
    setDamages((d) => d.filter((_, i) => i !== index));
  }
  function updateDamageText(index: number, value: string) {
    setDamages((d) => {
      const copy = [...d];
      copy[index].text = value;
      return copy;
    });
  }
  function handleDamageFiles(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) => {
      const copy = [...d];
      copy[index].files = files;
      copy[index].previews = previews;
      return copy;
    });
  }

  // --------- Validering ----------
  const isFormValid = useMemo(() => {
    // Basfält
    if (!regnrUpper || !stationId || !odometer) return false;
    if (fuelFull === null || adblueOk === null || washerOk === null || privacyOk === null) return false;
    if (chargeCableCount === null || wheelsOn === null) return false;

    // Nya skador
    if (newDamage === true) {
      if (damages.length === 0) return false;
      for (const d of damages) {
        if (!d.text.trim()) return false; // kräver text
      }
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

  // ---------- Spara ----------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    setSaving(true);

    try {
      // 1) Ladda upp skadebilder (om några)
      const uploadedUrls: string[] = [];
      if (newDamage && damages.length > 0) {
        const folder = `${regnrUpper}/${Date.now()}`;
        for (let i = 0; i < damages.length; i++) {
          for (const file of damages[i].files) {
            const safeName = file.name
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9_.-]/g, '');
            const path = `${folder}/${i}-${safeName}`;
            const { error: upErr } = await supabase.storage.from('damage-photos').upload(path, file, {
              cacheControl: '3600',
              upsert: false,
            });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from('damage-photos').getPublicUrl(path);
            if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl);
          }
        }
      }

      // 2) Sätt insert-objekt (kolumnnamn enligt vår checkins-tabell)
      const insertObj: Record<string, any> = {
        regnr: regnrUpper,
        regnr_valid: regnrValid ?? null,
        station_id: stationId || null,
        station_other: stationOther || null,
        employee_id: null, // kommer sen med “riktig” auth
        odometer_km: odometer ? Number(odometer) : null,
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk, // (i vissa scheman heter den parcel_shelf_ok/cargo_cover_ok)
        charge_cable_count: chargeCableCount, // kan heta charge_cables_count i vissa migreringar
        tires_type: wheelsOn, // om kolumnen heter wheels_on / wheel_type – ändra här vid behov
        wheel_type: wheelsOn,
        no_new_damage: newDamage === false ? true : newDamage === true ? false : null,
        notes: notes || null,
        photo_urls: uploadedUrls.length ? uploadedUrls : null,
      };

      const { error: insErr } = await supabase.from('checkins').insert(insertObj);
      if (insErr) throw insErr;

      // 3) Klart
      setStatus('done');
      setMessage(`Tack ${username}! Incheckning sparad.`);
      // Nollställ (lagom mycket)
      setDamages([]);
      setNewDamage(null);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Något gick fel.');
    } finally {
      setSaving(false);
    }
  }

  // -------- Render --------
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <div className="text-sm text-zinc-400">Inloggad: <span className="text-zinc-200">{username}</span></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Reg.nr */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={() => lookupVehicle(regnr)}
            className={`${inputClass} tracking-widest uppercase`}
            placeholder="ABC123"
          />
          {regnrValid === false && (
            <p className="mt-1 text-sm text-red-400">Fel reg.nr</p>
          )}
        </div>

        {/* Bilinfo (direkt under regnr) */}
        {(vehicle?.brand_model || vehicle?.damages || vehicle?.tire_storage) && (
          <div className="rounded-lg border border-zinc-300 bg-white p-4 text-zinc-900">
            {vehicle?.brand_model && (
              <p><span className="font-semibold">Bil:</span> {vehicle.brand_model}</p>
            )}
            {vehicle?.tire_storage && (
              <p className="mt-1"><span className="font-semibold">Hjulförvaring:</span> {vehicle.tire_storage}</p>
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

        {/* Station */}
        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            className={inputClass}
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            <option value="">— Välj station / depå —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <input
            className={`${inputClass} mt-2`}
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
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="ex. 42 180"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/\D+/g, ''))}
            />
            <span className="text-sm text-zinc-400">km</span>
          </div>
        </div>

        {/* Tanknivå */}
        <div>
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-2 flex gap-3">
            <button type="button" className={btn(fuelFull === true)} onClick={() => setFuelFull(true)}>
              Fulltankad
            </button>
            <button type="button" className={btnNo(fuelFull === false)} onClick={() => setFuelFull(false)}>
              Ej fulltankad
            </button>
          </div>
        </div>

        {/* AdBlue / Spolarvätska / Insynsskydd */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">AdBlue OK? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" className={btn(adblueOk === true)} onClick={() => setAdblueOk(true)}>Ja</button>
              <button type="button" className={btnNo(adblueOk === false)} onClick={() => setAdblueOk(false)}>Nej</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Spolarvätska OK? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" className={btn(washerOk === true)} onClick={() => setWasherOk(true)}>Ja</button>
              <button type="button" className={btnNo(washerOk === false)} onClick={() => setWasherOk(false)}>Nej</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Insynsskydd OK? *</label>
            <div className="mt-2 flex gap-3">
              <button type="button" className={btn(privacyOk === true)} onClick={() => setPrivacyOk(true)}>Ja</button>
              <button type="button" className={btnNo(privacyOk === false)} onClick={() => setPrivacyOk(false)}>Nej</button>
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
                className={btn(chargeCableCount === n as any, 'min-w-[3rem] justify-center')}
                onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på */}
        <div>
          <label className="block text-sm font-medium">Hjul som sitter på *</label>
          <div className="mt-2 flex gap-3">
            <button type="button" className={btn(wheelsOn === 'sommar')} onClick={() => setWheelsOn('sommar')}>
              Sommarhjul
            </button>
            <button type="button" className={btn(wheelsOn === 'vinter')} onClick={() => setWheelsOn('vinter')}>
              Vinterhjul
            </button>
          </div>
        </div>

        {/* Nya skador? */}
        <div>
          <label className="block text-sm font-medium">Nya skador på bilen? *</label>
          <div className="mt-2 flex gap-3">
            <button type="button" className={btn(newDamage === true)} onClick={() => { setNewDamage(true); if (damages.length === 0) addDamage(); }}>
              Ja
            </button>
            <button type="button" className={btnNo(newDamage === false)} onClick={() => { setNewDamage(false); setDamages([]); }}>
              Nej
            </button>
          </div>
        </div>

        {/* Sektion för skador – visas bara om Ja */}
        {newDamage === true && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-zinc-900">
            {damages.map((dmg, i) => (
              <div key={i} className="mb-6 rounded-lg border border-amber-300 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold">Skada {i + 1}</h4>
                  <button type="button" className="text-sm text-zinc-500 underline" onClick={() => removeDamage(i)}>
                    Ta bort
                  </button>
                </div>

                {/* Text först, som vi bestämde */}
                <label className="mb-1 block text-sm font-medium">Text (obligatorisk)</label>
                <input
                  value={dmg.text}
                  onChange={(e) => updateDamageText(i, e.target.value)}
                  placeholder="Beskriv skadan kort…"
                  className={inputClass}
                />

                {/* Bilder */}
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

            <button type="button" onClick={addDamage} className="w-full rounded-md border border-amber-300 bg-white py-2 font-medium">
              {damages.length === 0 ? 'Lägg till skada' : 'Lägg till ytterligare skada'}
            </button>
          </div>
        )}

        {/* Övriga anteckningar */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            className={`${inputClass} min-h-[110px]`}
            placeholder="Övrig info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Status / fel */}
        {status === 'error' && <div className="text-sm text-red-400">{message}</div>}
        {status === 'done' && <div className="text-sm text-green-400">{message}</div>}

        {/* Spara */}
        <button
          disabled={!isFormValid || saving}
          className={`w-full rounded-lg px-4 py-3 font-semibold
            ${!isFormValid || saving ? 'bg-zinc-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
            text-white`}
        >
          {saving ? 'Sparar…' : 'Spara incheckning'}
        </button>

        {/* Copyright */}
        <div className="pt-2 text-center text-sm text-zinc-500">© Albarone AB {new Date().getFullYear()}</div>
      </form>
    </div>
  );
}
