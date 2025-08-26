'use client';

import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';

// ------ Typer ------
type VehicleLookup = {
  brand_model: string | null;
  damages: string[] | null;
  storage?: string | null; // framtida: Hjulförvaring
};

type YesNo = true | false | null;
type WheelsOn = 'sommar' | 'vinter' | null;

// ------ Hjälp ------
const upper = (s: string) => (s || '').toUpperCase().trim();
const onlyDigits = (s: string) => s.replace(/[^\d]/g, '');

export default function FormClient() {
  // UI – tvinga ljus läge för iOS läsbarhet
  const rootClass =
    'min-h-screen bg-white text-gray-900 [color-scheme:light] antialiased';

  // ---- Header / “inloggad” (dummy) ----
  const [username] = useState('Bob');

  // ---- Fält ----
  const [regnr, setRegnr] = useState('');
  const [stationId, setStationId] = useState<string>(''); // krävs
  const [stationOther, setStationOther] = useState('');

  const [odometerKm, setOdometerKm] = useState('');
  const [fuelFull, setFuelFull] = useState<YesNo>(true);
  const [adblueOk, setAdblueOk] = useState<YesNo>(null);
  const [washerOk, setWasherOk] = useState<YesNo>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<YesNo>(null);

  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(null);
  const [wheelsOn, setWheelsOn] = useState<WheelsOn>(null);

  const [notes, setNotes] = useState('');

  // ---- Nya skador (foto) – enkel variant ----
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const addPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const list = Array.from(e.target.files);
    setPhotos((prev) => [...prev, ...list].slice(0, 12));
    e.target.value = '';
  };
  const removePhoto = (i: number) =>
    setPhotos((prev) => prev.filter((_, ix) => ix !== i));

  // ---- Auto-hämtning (debounce) ----
  const [veh, setVeh] = useState<VehicleLookup | null>(null);
  const debounceRef = useRef<number | null>(null);

  const canLookup = useMemo(() => upper(regnr).length >= 3, [regnr]);

  const doLookup = async (force = false) => {
    const key = upper(regnr);
    if (!key) return;
    if (!force && key.length < 3) return;

    const { data, error } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .eq('regnr', key)
      .maybeSingle();

    if (error) {
      console.error('Lookup error:', error);
      setVeh(null);
      return;
    }
    setVeh({
      brand_model: data?.brand_model ?? null,
      damages: Array.isArray(data?.damages) ? data!.damages : [],
    });
  };

  // Debounce varje gång regnr ändras
  useEffect(() => {
    if (!canLookup) {
      setVeh(null);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => doLookup(false), 450);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [regnr, canLookup]);

  // ---- “Är du säker?” vid hjultyp-avvikelse (när vi får datakälla) ----
  const expectedWheels: WheelsOn = null; // TODO: fyll från rätt källa senare
  const setWheelsSafely = (val: WheelsOn) => {
    if (
      expectedWheels &&
      val &&
      expectedWheels !== val &&
      !window.confirm(
        `Systemet indikerar “${expectedWheels}hjul”, du valde “${val}hjul”. Är du säker?`
      )
    ) {
      return;
    }
    setWheelsOn(val);
  };

  // ---- Validering för submit ----
  const valid =
    !!upper(regnr) &&
    !!stationId &&
    onlyDigits(odometerKm).length > 0 &&
    fuelFull !== null &&
    adblueOk !== null &&
    washerOk !== null &&
    privacyCoverOk !== null &&
    chargeCableCount !== null &&
    wheelsOn !== null;

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thanksTo, setThanksTo] = useState<string>('');

  // ---- Submit ----
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!valid) {
      setErrorMsg('Fyll i alla obligatoriska fält.');
      return;
    }

    setSaving(true);
    try {
      // 1) (Frivilligt) ladda upp foton till storage – lämnar vi tills vidare
      // 2) Spara checkin – använder bara fält som tillåter NULL
      const insertObj = {
        regnr: upper(regnr),
        station_id: stationId || null,
        station_other: stationOther || null,

        odometer_km: Number(onlyDigits(odometerKm)) || null,
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyCoverOk,

        charge_cable_count: chargeCableCount,
        wheels_on: wheelsOn, // text i din tabell
        notes: notes || null,

        // Bekräfta att regnr fanns i vår vy (om brand_model finns)
        regnr_valid: !!veh?.brand_model || false,

        // foto_urls: [] – hoppar över tills vi kopplar storage helt
      };

      const { error } = await supabase.from('checkins').insert(insertObj);
      if (error) throw error;

      setThanksTo(username);
      // Rensa formulär
      setRegnr('');
      setStationId('');
      setStationOther('');
      setOdometerKm('');
      setFuelFull(true);
      setAdblueOk(null);
      setWasherOk(null);
      setPrivacyCoverOk(null);
      setChargeCableCount(null);
      setWheelsOn(null);
      setNotes('');
      setPhotos([]);
      setVeh(null);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err?.message || 'Kunde inte spara just nu. Försök igen om en liten stund.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- Stationslista (temporär statisk) ----
  const stations = [
    { id: 'malmo', name: 'Malmö', email: 'malmo@mabi.se' },
    { id: 'helsingborg', name: 'Helsingborg', email: 'helsingborg@mabi.se' },
    { id: 'halmstad', name: 'Halmstad', email: 'halmstad@mabi.se' },
    { id: 'varberg', name: 'Varberg', email: 'varberg@mabi.se' },
    { id: 'trelleborg', name: 'Trelleborg', email: 'trelleborg@mabi.se' },
    { id: 'lund', name: 'Lund', email: 'lund@mabi.se' },
  ];

  return (
    <main className={rootClass}>
      <div className="mx-auto max-w-xl px-4 py-6">
        {/* Top */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Ny incheckning</h1>
          <div className="text-sm text-gray-600">Inloggad: {username}</div>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {/* REG.NR */}
          <div>
            <label className="block text-sm font-medium">Registreringsnummer *</label>
            <div className="mt-1 flex gap-2">
              <input
                value={regnr}
                onChange={(e) => setRegnr(upper(e.target.value))}
                inputMode="text"
                autoCapitalize="characters"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base tracking-widest uppercase placeholder:text-gray-500"
                placeholder="ABC123"
              />
              <button
                type="button"
                onClick={() => doLookup(true)}
                className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium"
              >
                Hämta
              </button>
            </div>

            {/* Bilinfo + Hjulförvaring + befintliga skador */}
            {veh?.brand_model && (
              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm">
                <div className="font-medium">Bil: {veh.brand_model}</div>
                <div className="text-gray-600">
                  Hjulförvaring: {/* TODO datakälla */}
                  <span className="italic"> saknas (kommer)</span>
                </div>
              </div>
            )}
            {!!veh?.damages?.length && (
              <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-medium">Befintliga skador:</div>
                <ul className="mt-1 list-disc pl-5">
                  {veh.damages!.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* STATION */}
          <div>
            <label className="block text-sm font-medium">Station / Depå *</label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="mt-1 h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-base"
              required
            >
              <option value="">Välj station …</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <input
              value={stationOther}
              onChange={(e) => setStationOther(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base placeholder:text-gray-500"
              placeholder="Ev. annan inlämningsplats"
            />
          </div>

          {/* MÄTARSTÄLLNING */}
          <div>
            <label className="block text-sm font-medium">Mätarställning *</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={odometerKm}
                onChange={(e) => setOdometerKm(onlyDigits(e.target.value))}
                inputMode="numeric"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base placeholder:text-gray-500"
                placeholder="t.ex. 42180"
              />
              <span className="text-sm text-gray-600">km</span>
            </div>
          </div>

          {/* Tanknivå */}
          <div>
            <label className="block text-sm font-medium">Tanknivå *</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFuelFull(true)}
                className={`rounded-lg border px-3 py-2 ${
                  fuelFull === true ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
                }`}
                aria-pressed={fuelFull === true}
              >
                Fulltankad
              </button>
              <button
                type="button"
                onClick={() => setFuelFull(false)}
                className={`rounded-lg border px-3 py-2 ${
                  fuelFull === false ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                }`}
                aria-pressed={fuelFull === false}
              >
                Ej fulltankad
              </button>
            </div>
          </div>

          {/* AdBlue / Spolarvätska / Insynsskydd */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <YesNoField label="AdBlue OK? *" value={adblueOk} onChange={setAdblueOk} />
            <YesNoField label="Spolarvätska OK? *" value={washerOk} onChange={setWasherOk} />
            <YesNoField label="Insynsskydd OK? *" value={privacyCoverOk} onChange={setPrivacyCoverOk} />
          </div>

          {/* Antal laddsladdar – tre knappar */}
          <div>
            <label className="block text-sm font-medium">Antal laddsladdar *</label>
            <div className="mt-2 flex gap-2">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
                  className={`rounded-lg border px-4 py-2 text-base ${
                    chargeCableCount === (n as 0 | 1 | 2)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 bg-white'
                  }`}
                  aria-pressed={chargeCableCount === (n as 0 | 1 | 2)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Hjul som sitter på */}
          <div>
            <label className="block text-sm font-medium">Hjul som sitter på *</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setWheelsSafely('sommar')}
                className={`rounded-lg border px-4 py-2 ${
                  wheelsOn === 'sommar' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
                }`}
                aria-pressed={wheelsOn === 'sommar'}
              >
                Sommarhjul
              </button>
              <button
                type="button"
                onClick={() => setWheelsSafely('vinter')}
                className={`rounded-lg border px-4 py-2 ${
                  wheelsOn === 'vinter' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
                }`}
                aria-pressed={wheelsOn === 'vinter'}
              >
                Vinterhjul
              </button>
            </div>
          </div>

          {/* Nya skador – foto */}
          <div>
            <label className="block text-sm font-medium">Skador – bifoga foton (valfritt)</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2"
                onClick={() => fileInputRef.current?.click()}
              >
                Ta bilder / Välj från galleri
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={addPhotos}
              />
            </div>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-3">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img
                      src={URL.createObjectURL(f)}
                      alt={`Skadefoto ${i + 1}`}
                      className="h-20 w-full rounded-lg border object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 rounded-full border bg-white px-2 text-xs"
                      onClick={() => removePhoto(i)}
                      aria-label="Ta bort"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Övriga anteckningar */}
          <div>
            <label className="block text-sm font-medium">Övriga anteckningar</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base placeholder:text-gray-500"
              placeholder="Övrig info…"
            />
          </div>

          {/* Status / fel / tack */}
          {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
          {thanksTo && (
            <div className="text-sm text-green-600">
              Tack {thanksTo}! Incheckningen sparades.
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!valid || saving}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Sparar…' : 'Spara incheckning'}
          </button>

          <p className="pt-1 text-center text-[11px] text-gray-500">
            © Albarone AB {new Date().getFullYear()}
          </p>
        </form>
      </div>
    </main>
  );
}

/** Liten helper-komponent för Ja/Nej */
function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-lg border px-3 py-2 ${
            value === true ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'
          }`}
          aria-pressed={value === true}
        >
          Ja
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-lg border px-3 py-2 ${
            value === false ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
          }`}
          aria-pressed={value === false}
        >
          Nej
        </button>
      </div>
    </div>
  );
}
