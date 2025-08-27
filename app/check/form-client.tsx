'use client';

import React, { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';

type SaveStatus = 'idle' | 'saving' | 'done' | 'error';

type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

type DamageEntry = {
  text: string;
  files: File[];
  previews: string[]; // for UI only
};

const BUCKET = 'damage-photos';

// ---- Hjälp ----
const btnBase =
  'rounded-xl border px-4 py-2 text-base transition-colors select-none';
const btnYes = (on: boolean) =>
  `${btnBase} ${on ? 'bg-green-100 border-green-400' : 'bg-white border-zinc-300'}`;
const btnNo = (on: boolean) =>
  `${btnBase} ${on ? 'bg-red-100 border-red-400' : 'bg-white border-zinc-300'}`;
const btnPick = `${btnBase} bg-white border-zinc-300`;

function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

// ---- Hierarkiskt stations-träd (Ort → Plats) ----
// Fyll gärna på listorna – strukturen är “ORT”: [“Plats 1”, “Plats 2”, …]
const STATION_TREE: Record<string, string[]> = {
  'ÄNGELHOLM': ['(Hedin Automotive Ford)', '(Hedin Automotive)', 'AIRPORT'],
  FALKENBERG: [],
  HALMSTAD: [
    '(Hedin Automotive Ford)',
    '(Hedin Automotive Kia)',
    '(Hedin Automotive Mercedes)',
    '(Hedin Automotive)',
    'CITY AIRPORT',
  ],
  HELSINGBORG: [
    '(Bil & Skadeservice)',
    '(Floretten)',
    '(Förenade Bil)',
    '(Hedin Automotive Ford)',
    '(Hedin Automotive Kia)',
    '(Hedin Automotive)',
    '(Hedin Bil Transport)',
    '(S.Jönsson Bil)',
    '(Verkstad)',
    'HBSC',
  ],
  LUND: [
    '(Bil & Skadeservice)',
    '(Hedin Automotive Ford)',
    '(Hedin Automotive)',
    '(Hedin Bil)',
    '(P7 Revingehed)',
  ],
  MALMÖ: [
    '(Automera)',
    '(Hedin Automotive Ford)',
    '(Hedin Automotive Jägersro)',
    '(Hedin Automotive Mercedes)',
    '(Mechanum)',
    'AIRPORT',
    'BERNSTORP (Verkstad)',
    'BURLÖV (Hedin Automotive)',
    'FOSIE (Hedbergs Bil)',
    'HAMN (Verkstad)',
    'LÅNGTID',
  ],
  TRELLEBORG: [],
  VARBERG: [
    '(Finnvedens Bil Skadecenter)',
    '(Hedin Automotive Ford)',
    '(Hedin Automotive Holmgråde)',
    '(Hedin Automotive)',
    '(Sällstorps Plåt & Lack)',
  ],
};

// (Enkel mappning till e-post för MVP; komplettera vid behov)
function stationEmail(ort: string, plats: string | null): string | null {
  // ex: alla Malmö -> malmo@mabi.se
  const map: Record<string, string> = {
    MALMÖ: 'malmo@mabi.se',
    LUND: 'lund@mabi.se',
    HALMSTAD: 'halmstad@mabi.se',
    HELSINGBORG: 'helsingborg@mabi.se',
    VARBERG: 'varberg@mabi.se',
    TRELLEBORG: 'trelleborg@mabi.se',
    'ÄNGELHOLM': 'angelholm@mabi.se',
    FALKENBERG: 'falkenberg@mabi.se',
  };
  return map[ort] ?? null;
}

// ---------------------------------------------------

export default function FormClient() {
  // header “inloggad” (placeholder tills auth finns)
  const [username] = useState('Bob');

  // reg.nr
  const [regnr, setRegnr] = useState('');
  const [regInvalid, setRegInvalid] = useState(false);

  // stationer
  const [city, setCity] = useState<string>('');        // Ort (obligatorisk)
  const [place, setPlace] = useState<string>('');      // Plats (obligatorisk om det finns alternativ)
  const hasPlaces = useMemo(() => (city ? STATION_TREE[city]?.length > 0 : false), [city]);

  // bilinfo
  const [brandModel, setBrandModel] = useState<string | null>(null);
  const [wheelStorage, setWheelStorage] = useState<string | null>(null); // “Hjulförvaring: …”
  const [existingDamages, setExistingDamages] = useState<string[]>([]);

  // mätare & ja/nej
  const [odometer, setOdometer] = useState('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<boolean | null>(null);

  // laddsladdar (0/1/2)
  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(null);

  // hjul som sitter på
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  // Nya skador?
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const fileRefs = useRef<HTMLInputElement[]>([]);

  // fritext
  const [notes, setNotes] = useState('');

  // status
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('Tack!');

  // ---------------- Bil-lookup på blur ----------------
  async function lookupVehicle(value: string) {
    const reg = (value || regnr).trim().toUpperCase();
    if (!reg) return;

    // 1) validera mot white-list (allowed_plates)
    const { data: allow } = await supabase
      .from('allowed_plates')
      .select('regnr')
      .eq('regnr', reg)
      .maybeSingle();

    if (!allow) {
      setRegInvalid(true);
      setBrandModel(null);
      setWheelStorage(null);
      setExistingDamages([]);
      return;
    }
    setRegInvalid(false);

    // 2) summerad vy för befintliga skador + modell
    const { data: summary } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .eq('regnr', reg)
      .maybeSingle();

    setBrandModel(summary?.brand_model ?? null);
    setExistingDamages(summary?.damages ?? []);

    // 3) hjulförvaring (placeholder tills fil/databas finns)
    setWheelStorage('--'); // sätt “--” tills vi kopplat på riktigt lager
  }

  // ---------------- Skadehantering ----------------
  function addDamage() {
    setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  }

  function removeDamage(idx: number) {
    setDamages((d) => d.filter((_, i) => i !== idx));
  }

  function setDamageText(idx: number, text: string) {
    setDamages((d) => d.map((it, i) => (i === idx ? { ...it, text } : it)));
  }

  function pickDamageFiles(i: number, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) =>
      d.map((it, idx) =>
        idx === i ? { ...it, files: [...it.files, ...files], previews: [...it.previews, ...previews] } : it
      )
    );
  }

  function removeDamagePhoto(i: number, j: number) {
    setDamages((d) =>
      d.map((it, idx) =>
        idx === i
          ? {
              ...it,
              files: it.files.filter((_, k) => k !== j),
              previews: it.previews.filter((_, k) => k !== j),
            }
          : it
      )
    );
  }

  // ---------------- Submit ----------------
  const stationIsValid =
    city &&
    (!hasPlaces || (hasPlaces && place)); // kräver plats om orten har underplatser

  const formReady =
    !!regnr &&
    !!stationIsValid &&
    !!odometer &&
    fuelFull !== null &&
    adblueOk !== null &&
    washerOk !== null &&
    privacyCoverOk !== null &&
    chargeCableCount !== null &&
    wheelsOn !== null &&
    (hasNewDamage === false ||
      (hasNewDamage === true && damages.length > 0 && damages.every((d) => d.text.trim().length > 0)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formReady) return;

    setStatus('saving');

    // spara grund-checkin
    const insertObj: any = {
      regnr: regnr.toUpperCase(),
      station_id: null, // (om ni kör riktig stations-tabell annars null)
      station_other: place ? `${city} ${place}` : city, // tills vi kopplar mot tabell
      odometer_km: Number(odometer),
      fuel_full: fuelFull,
      adblue_ok: adblueOk,
      washer_ok: washerOk,
      privacy_cover_ok: privacyCoverOk,
      charge_cable_count: chargeCableCount,
      wheels_on: wheelsOn,
      notes,
      no_new_damage: hasNewDamage === false,
    };

    const { data: checkin, error } = await supabase.from('checkins').insert(insertObj).select('id').single();
    if (error || !checkin) {
      setStatus('error');
      setMessage('Kunde inte spara incheckningen.');
      return;
    }

    // skador + bilder
    if (hasNewDamage && damages.length) {
      for (let i = 0; i < damages.length; i++) {
        const d = damages[i];
        // spara rader
        const { data: row, error: derr } = await supabase
          .from('checkin_damages')
          .insert({ checkin_id: checkin.id, text: d.text })
          .select('id')
          .single();
        if (derr || !row) continue;

        // ladda upp foton
        for (const f of d.files) {
          const key = `${checkin.id}/${row.id}/${Date.now()}-${cleanFileName(f.name)}`;
          const { error: uerr } = await supabase.storage.from(BUCKET).upload(key, f);
          if (!uerr) {
            await supabase.from('checkin_damage_photos').insert({
              checkin_id: checkin.id,
              damage_id: row.id,
              key,
            });
          }
        }
      }
    }

    setStatus('done');
    setMessage(`Tack ${username}!`);
    // reset
    setHasNewDamage(null);
    setDamages([]);
    setNotes('');
    setFuelFull(null);
    setAdblueOk(null);
    setWasherOk(null);
    setPrivacyCoverOk(null);
    setChargeCableCount(null);
    setWheelsOn(null);
    setOdometer('');
  }

  // ---------------- UI ----------------
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold">Ny incheckning</h1>
      <p className="mt-1 text-sm text-zinc-500">Inloggad: <span className="font-medium">{username}</span></p>

      <form className="mt-6 space-y-6" onSubmit={onSubmit}>
        {/* REGNR */}
        <div>
          <label className="block text-sm font-medium">Registreringsnummer *</label>
          <input
            value={regnr}
            onChange={(e) => setRegnr(e.target.value.toUpperCase())}
            onBlur={(e) => lookupVehicle(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white border border-zinc-300 px-3 py-2 tracking-widest uppercase"
            placeholder="ABC123"
            inputMode="text"
            autoCapitalize="characters"
          />
          {regInvalid && <div className="text-red-500 text-sm mt-1">Fel reg.nr</div>}
        </div>

        {/* Bilinfo – visas direkt under reg.nr */}
        {(brandModel || existingDamages.length || wheelStorage) && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            {brandModel && <div><span className="font-medium">Bil: </span>{brandModel}</div>}
            <div className="mt-1"><span className="font-medium">Hjulförvaring: </span>{wheelStorage ?? '--'}</div>
            {!!existingDamages.length && (
              <div className="mt-2">
                <div className="font-medium">Befintliga skador:</div>
                <ul className="list-disc pl-6">
                  {existingDamages.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* STATION – tvåstegs-val */}
        <div>
          <label className="block text-sm font-medium">Station / Depå *</label>

          <select
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPlace(''); // nollställ plats när ort byts
            }}
            required
          >
            <option value="" disabled>— Välj ort —</option>
            {Object.keys(STATION_TREE).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {hasPlaces && (
            <select
              className="mt-2 w-full rounded-lg border px-3 py-2"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              required
            >
              <option value="" disabled>— Välj plats i {city} —</option>
              {STATION_TREE[city].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <input
            className="mt-2 w-full rounded-lg border px-3 py-2"
            placeholder="Ev. annan inlämningsplats"
          />
        </div>

        {/* MÄTARE */}
        <div>
          <label className="block text-sm font-medium">Mätarställning *</label>
          <input
            value={odometer}
            onChange={(e) => setOdometer(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="ex. 42 180"
          />
        </div>

        {/* TANK */}
        <div>
          <label className="block text-sm font-medium">Tanknivå *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setFuelFull(true)} className={btnYes(fuelFull === true)}>Fulltankad</button>
            <button type="button" onClick={() => setFuelFull(false)} className={btnNo(fuelFull === false)}>Ej fulltankad</button>
          </div>
        </div>

        {/* ADBLUE */}
        <div>
          <label className="block text-sm font-medium">AdBlue OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAdblueOk(true)} className={btnYes(adblueOk === true)}>Ja</button>
            <button type="button" onClick={() => setAdblueOk(false)} className={btnNo(adblueOk === false)}>Nej</button>
          </div>
        </div>

        {/* SPOLARVÄTSKA */}
        <div>
          <label className="block text-sm font-medium">Spolarvätska OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setWasherOk(true)} className={btnYes(washerOk === true)}>Ja</button>
            <button type="button" onClick={() => setWasherOk(false)} className={btnNo(washerOk === false)}>Nej</button>
          </div>
        </div>

        {/* INSYNSSKYDD */}
        <div>
          <label className="block text-sm font-medium">Insynsskydd OK? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPrivacyCoverOk(true)} className={btnYes(privacyCoverOk === true)}>Ja</button>
            <button type="button" onClick={() => setPrivacyCoverOk(false)} className={btnNo(privacyCoverOk === false)}>Nej</button>
          </div>
        </div>

        {/* LADD-SLADDAR 0/1/2 */}
        <div>
          <label className="block text-sm font-medium">Antal laddsladdar *</label>
          <div className="mt-2 flex gap-2">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
                className={`${btnBase} ${chargeCableCount === n ? 'bg-blue-100 border-blue-400' : 'bg-white border-zinc-300'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* HJUL TYP */}
        <div>
          <label className="block text-sm font-medium">Hjul som sitter på *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setWheelsOn('sommar')} className={`${btnBase} ${wheelsOn === 'sommar' ? 'bg-blue-100 border-blue-400' : 'bg-white border-zinc-300'}`}>Sommarhjul</button>
            <button type="button" onClick={() => setWheelsOn('vinter')} className={`${btnBase} ${wheelsOn === 'vinter' ? 'bg-blue-100 border-blue-400' : 'bg-white border-zinc-300'}`}>Vinterhjul</button>
          </div>
        </div>

        {/* NYA SKADOR JA/NEJ */}
        <div>
          <label className="block text-sm font-medium">Nya skador på bilen? *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setHasNewDamage(true); if (damages.length === 0) addDamage(); }} className={btnYes(hasNewDamage === true)}>Ja</button>
            <button type="button" onClick={() => { setHasNewDamage(false); setDamages([]); }} className={btnNo(hasNewDamage === false)}>Nej</button>
          </div>
        </div>

        {/* SKADEBLOCK – visas bara om JA */}
        {hasNewDamage && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 space-y-4">
            {damages.map((d, i) => (
              <div key={i} className="rounded-lg border bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Skada {i + 1}</div>
                  <button type="button" className="text-sm text-zinc-600 underline" onClick={() => removeDamage(i)}>Ta bort</button>
                </div>

                <label className="block text-sm mt-2">Text (obligatorisk)</label>
                <input
                  value={d.text}
                  onChange={(e) => setDamageText(i, e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder="Beskriv skadan kort…"
                />

                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => fileRefs.current[i]?.click()}
                    className={btnPick}
                  >
                    Välj / Ta bilder
                  </button>
                  <input
                    ref={(el) => (fileRefs.current[i] = el!)}
                    type="file"
                    multiple
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => pickDamageFiles(i, e)}
                  />
                </div>

                {!!d.previews.length && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {d.previews.map((src, j) => (
                      <div key={j} className="relative">
                        <img className="h-20 w-full object-cover rounded-md border" src={src} alt="" />
                        <button
                          type="button"
                          onClick={() => removeDamagePhoto(i, j)}
                          className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* ✳️ Lägg till-knappen ligger ALLRA NEDERST i blocket */}
            <div className="pt-2">
              <button type="button" onClick={addDamage} className="w-full rounded-xl border border-amber-300 bg-white px-4 py-2">
                Lägg till ytterligare skada
              </button>
            </div>
          </div>
        )}

        {/* ÖVRIGT */}
        <div>
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="Övrig info…"
          />
        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={!formReady || status === 'saving'}
          className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
        </button>

        {status === 'done' && <div className="text-green-600">{message}</div>}
        {status === 'error' && <div className="text-red-600">{message}</div>}

        <p className="text-center text-xs text-zinc-500 mt-2">© Albarone AB {new Date().getFullYear()}</p>
      </form>
    </div>
  );
}
