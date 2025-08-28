'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../lib/supabase';
import { STATIONS, Station } from '../../lib/stations';

/* ============ Typer ============ */
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';
type DamageEntry = { text: string; files: File[]; previews: string[] };

/* ============ Färger (inline, oberoende av tema) ============ */
type BtnCSS = React.CSSProperties;
const BASE_RESET: BtnCSS = { appearance: 'none', WebkitAppearance: 'none' };

const COLORS = {
  neutral: { bg: '#FFFFFF', text: '#111827', border: '#52525B' },
  yes: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  no: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  chipOn: { bg: '#DBEAFE', text: '#1E3A8A', border: '#93C5FD' },
  primary: { bg: '#2563EB', text: '#FFFFFF', border: '#2563EB' },
  primaryOff: { bg: '#FFFFFF', text: '#111827', border: '#52525B' },
};

const style = (c: { bg: string; text: string; border: string }): BtnCSS => ({
  ...BASE_RESET,
  backgroundColor: c.bg,
  color: c.text,
  borderColor: c.border,
});

const yesStyle = (sel: boolean): BtnCSS => (sel ? style(COLORS.yes) : style(COLORS.neutral));
const noStyle = (sel: boolean): BtnCSS => (sel ? style(COLORS.no) : style(COLORS.neutral));
const chipStyle = (sel: boolean): BtnCSS => (sel ? style(COLORS.chipOn) : style(COLORS.neutral));
const primaryStyle = (sel: boolean): BtnCSS => (sel ? style(COLORS.primary) : style(COLORS.primaryOff));

const yesNoBase = 'w-full rounded-lg border px-4 py-3 text-center select-none';
const chipBase = 'rounded-md border px-4 py-2 select-none';

/* ============ Utils ============ */
const cleanFileName = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/g, '').slice(0, 100);

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(
    d.getMinutes(),
  ).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
};

function extractModel(row: any): string | null {
  if (!row) return null;
  const candidates = [
    row.model,
    row.modell,
    row.vehicle,
    row.car_model,
    row.name,
    [row.make, row.model].filter(Boolean).join(' '),
  ].filter(Boolean);
  return (candidates[0] ? String(candidates[0]) : null) || null;
}

/* ============ Komponent ============ */
export default function CheckinFormClient() {
  const [username] = useState('Bob');

  // reg.nr + lookup
  const [regnr, setRegnr] = useState('');
  const [regnrValid, setRegnrValid] = useState<boolean | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorage, setTireStorage] = useState<string | null>(null); // placeholder

  // station (två-steg)
  const [city, setCity] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');

  // mätarställning
  const [odometer, setOdometer] = useState('');

  // ja/nej
  const [fuelFull, setFuelFull] = useState<boolean | null>(null);
  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyOk, setPrivacyOk] = useState<boolean | null>(null);

  // sladdar
  const [cableCount, setCableCount] = useState<number | null>(null);

  // hjul
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);

  // skador
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const fileInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // övrigt
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  // Lookup model/skador vid regnr
  useEffect(() => {
    if (!regnr || regnr.trim().length < 5) {
      setRegnrValid(null);
      setVehicleInfo(null);
      setExistingDamages([]);
      setTireStorage(null);
      return;
    }
    const plate = regnr.trim().toUpperCase();
    const t = setTimeout(async () => {
      try {
        const ap = await supabase
          .from('allowed_plates')
          .select('*')
          .eq('regnr', plate)
          .maybeSingle();

        if (ap?.data) {
          setRegnrValid(true);
          setVehicleInfo(extractModel(ap.data) || '—');
          setTireStorage('—'); // tills Excel-källa kopplas
        } else {
          setRegnrValid(false);
          setVehicleInfo(null);
          setTireStorage(null);
        }

        const ad = await supabase.from('active_damages').select('text').eq('regnr', plate);
        setExistingDamages(ad?.data ? ad.data.map((r: any) => String(r.text)).filter(Boolean) : []);
      } catch {
        setRegnrValid(false);
        setVehicleInfo(null);
        setExistingDamages([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [regnr]);

  // Skade-hjälpare
  const addDamage = () => setDamages((d) => [...d, { text: '', files: [], previews: [] }]);
  const removeDamage = (i: number) => setDamages((d) => d.filter((_, idx) => idx !== i));
  const updateDamageText = (i: number, text: string) =>
    setDamages((d) => {
      const c = [...d];
      c[i] = { ...c[i], text };
      return c;
    });
  const handleDamageFiles = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const previews = files.map((f) => URL.createObjectURL(f));
    setDamages((d) => {
      const c = [...d];
      c[i] = { ...c[i], files: [...c[i].files, ...files], previews: [...c[i].previews, ...previews] };
      return c;
    });
  };

  async function uploadDamagePhotos(): Promise<string[][]> {
    const out: string[][] = [];
    const plate = (regnr || 'NO-PLATE').trim().toUpperCase();
    for (let i = 0; i < damages.length; i++) {
      const urls: string[] = [];
      for (const f of damages[i].files) {
        const path = `${plate}/${stamp()}-${cleanFileName(f.name || 'bild.jpg')}`;
        const { error } = await supabase.storage.from('damage-photos').upload(path, f, {
          upsert: false,
          contentType: f.type || 'image/jpeg',
        });
        if (error) throw error;
        const { data } = supabase.storage.from('damage-photos').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
      out.push(urls);
    }
    return out;
  }

  // Submit – OBS: tillåter "Fel reg.nr"
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');

    if (!regnr.trim()) return setStatus('error'), setMessage('Ange registreringsnummer.');
    if (!city) return setStatus('error'), setMessage('Välj ort.');
    if (!stationId) return setStatus('error'), setMessage('Välj station / depå.');
    if (!odometer.trim() || Number.isNaN(Number(odometer.replace(/\s/g, ''))))
      return setStatus('error'), setMessage('Ange giltig mätarställning.');
    if (fuelFull === null) return setStatus('error'), setMessage('Välj tanknivå.');
    if (adblueOk === null) return setStatus('error'), setMessage('Välj AdBlue OK?.');
    if (washerOk === null) return setStatus('error'), setMessage('Välj Spolarvätska OK?.');
    if (privacyOk === null) return setStatus('error'), setMessage('Välj Insynsskydd OK?.');
    if (cableCount === null) return setStatus('error'), setMessage('Välj antal laddsladdar.');
    if (!wheelsOn) return setStatus('error'), setMessage('Välj hjul som sitter på.');
    if (hasNewDamage === null) return setStatus('error'), setMessage('Svara om nya skador.');

    try {
      const uploaded = hasNewDamage ? await uploadDamagePhotos() : [];
      const allPhotoUrls = uploaded.flat();

      const insertObj: any = {
        regnr: regnr.trim().toUpperCase(),
        regnr_valid: regnrValid,
        station_id: stationId || null,
        station_other: stationOther || null,
        odometer_km: Number(odometer.replace(/\s/g, '')),
        fuel_full: fuelFull,
        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyOk,
        charge_cable_count: cableCount,
        wheels_on: wheelsOn,
        notes: notes || null,
        photo_urls: allPhotoUrls.length ? allPhotoUrls : null,
      };

      const { data: checkinsIns, error: checkinsErr } = await supabase
        .from('checkins')
        .insert(insertObj)
        .select('id')
        .single();
      if (checkinsErr) throw checkinsErr;

      if (hasNewDamage && damages.length && checkinsIns?.id) {
        try {
          const rows = damages.map((d, idx) => ({
            checkin_id: checkinsIns.id,
            order: idx + 1,
            text: d.text || '(ej text)',
          }));
          await supabase.from('checkin_damages').insert(rows);

          for (let i = 0; i < uploaded.length; i++) {
            const urls = uploaded[i];
            if (!urls.length) continue;
            try {
              await supabase.from('checkin_damage_photos').insert(
                urls.map((u, j) => ({
                  checkin_id: checkinsIns.id,
                  damage_order: i + 1,
                  url: u,
                  order: j + 1,
                })),
              );
            } catch {/* fototabell saknas – ignorera */}
          }
        } catch {/* skadetabell saknas – ignorera */}
      }

      setStatus('done');
      setMessage(`Tack ${username}! Incheckningen är sparad.`);
      setDamages([]);
      setHasNewDamage(null);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Kunde inte spara – försök igen.');
    }
  }

  const cityList = useMemo(() => Object.keys(STATIONS), []);
  const stationsInCity = useMemo<Station[]>(() => (city ? STATIONS[city] ?? [] : []), [city]);

  /* ============ UI ============ */
  return (
    <form className="max-w-2xl mx-auto px-4 py-6 space-y-6" onSubmit={onSubmit}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ny incheckning</h1>
        <div className="text-sm">Inloggad: <span className="font-medium">Bob</span></div>
      </div>

      {/* Reg.nr */}
      <div>
        <label className="block text-sm font-medium">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value.toUpperCase())}
          onBlur={(e) => setRegnr(e.target.value.toUpperCase())}
          className="mt-1 w-full rounded-lg border px-3 py-2 tracking-widest"
          placeholder="ABC123"
        />
        {regnrValid === false && (
          <div className="text-red-500 text-sm mt-1">Fel reg.nr</div>
        )}
      </div>

      {/* Ort / Station */}
      <div>
        <label className="block text-sm font-medium">Station / Depå *</label>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={city}
            onChange={(e) => { setCity(e.target.value); setStationId(''); }}
            className="w-full rounded-lg border px-3 py-2"
          >
            <option value="">— Välj ort —</option>
            {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!city}
            className="w-full rounded-lg border px-3 py-2 disabled:opacity-50"
          >
            <option value="">{city ? '— Välj station / depå —' : 'Välj ort först'}</option>
            {stationsInCity.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <input
          value={stationOther}
          onChange={(e) => setStationOther(e.target.value)}
          className="mt-2 w-full rounded-lg border px-3 py-2"
          placeholder="Ev. annan inlämningsplats"
        />
      </div>

      {/* Bilinfo */}
      {(vehicleInfo || existingDamages.length > 0 || tireStorage) && (
        <div className="rounded-lg border px-4 py-3 bg-white">
          {vehicleInfo && <div className="text-sm"><span className="font-medium">Bil:</span> {vehicleInfo}</div>}
          {tireStorage && <div className="text-sm"><span className="font-medium">Hjulförvaring:</span> {tireStorage}</div>}
          {existingDamages.length > 0 && (
            <div className="text-sm mt-2">
              <div className="font-medium">Befintliga skador:</div>
              <ul className="list-disc pl-5">
                {existingDamages.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Mätarställning */}
      <div>
        <label className="block text-sm font-medium">Mätarställning *</label>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="ex. 42 180"
          />
          <span className="text-sm">km</span>
        </div>
      </div>

      {/* Tanknivå */}
      <div>
        <div className="text-sm font-medium">Tanknivå *</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" className={yesNoBase} style={primaryStyle(fuelFull === true)} onClick={() => setFuelFull(true)}>Fulltankad</button>
          <button type="button" className={yesNoBase} style={primaryStyle(fuelFull === false)} onClick={() => setFuelFull(false)}>Ej fulltankad</button>
        </div>
      </div>

      {/* AdBlue */}
      <div>
        <div className="text-sm font-medium">AdBlue OK? *</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" className={yesNoBase} style={yesStyle(adblueOk === true)} onClick={() => setAdblueOk(true)}>Ja</button>
          <button type="button" className={yesNoBase} style={noStyle(adblueOk === false)} onClick={() => setAdblueOk(false)}>Nej</button>
        </div>
      </div>

      {/* Spolarvätska */}
      <div>
        <div className="text-sm font-medium">Spolarvätska OK? *</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" className={yesNoBase} style={yesStyle(washerOk === true)} onClick={() => setWasherOk(true)}>Ja</button>
          <button type="button" className={yesNoBase} style={noStyle(washerOk === false)} onClick={() => setWasherOk(false)}>Nej</button>
        </div>
      </div>

      {/* Insynsskydd */}
      <div>
        <div className="text-sm font-medium">Insynsskydd OK? *</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" className={yesNoBase} style={yesStyle(privacyOk === true)} onClick={() => setPrivacyOk(true)}>Ja</button>
          <button type="button" className={yesNoBase} style={noStyle(privacyOk === false)} onClick={() => setPrivacyOk(false)}>Nej</button>
        </div>
      </div>

      {/* Laddsladdar */}
      <div>
        <div className="text-sm font-medium">Antal laddsladdar *</div>
        <div className="mt-2 flex gap-2">
          {[0, 1, 2].map((n) => (
            <button key={n} type="button" className={chipBase} style={chipStyle(cableCount === n)} onClick={() => setCableCount(n)}>{n}</button>
          ))}
        </div>
      </div>

      {/* Hjul */}
      <div>
        <div className="text-sm font-medium">Hjul som sitter på *</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" className={yesNoBase} style={primaryStyle(wheelsOn === 'sommar')} onClick={() => setWheelsOn('sommar')}>Sommarhjul</button>
          <button type="button" className={yesNoBase} style={primaryStyle(wheelsOn === 'vinter')} onClick={() => setWheelsOn('vinter')}>Vinterhjul</button>
        </div>
      </div>

      {/* Nya skador */}
      <div>
        <div className="text-sm font-medium">Nya skador på bilen? *</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" className={yesNoBase} style={yesStyle(hasNewDamage === true)} onClick={() => { setHasNewDamage(true); if (!damages.length) addDamage(); }}>Ja</button>
          <button type="button" className={yesNoBase} style={noStyle(hasNewDamage === false)} onClick={() => { setHasNewDamage(false); setDamages([]); }}>Nej</button>
        </div>
      </div>

      {/* Skadeområde med avvikande bakgrund */}
      {hasNewDamage === true && (
        <div className="rounded-xl border px-4 py-4"
             style={{ backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }}>
          {damages.map((dmg, i) => (
            <div key={i} className="mb-6 last:mb-0">
              <div className="flex items-center justify-between">
                <div className="font-medium">Skada {i + 1}</div>
                <button type="button" className="text-sm underline" onClick={() => removeDamage(i)}>Ta bort</button>
              </div>

              {/* Text först */}
              <div className="mt-2">
                <div className="text-xs text-gray-600 mb-1">Text (obligatorisk)</div>
                <input
                  value={dmg.text}
                  onChange={(e) => updateDamageText(i, e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Beskriv skadan kort…"
                />
              </div>

              {/* Bilduppladdning (öppnar filväljare, inte kamera direkt) */}
              <div className="mt-3">
                <input
                  ref={(el) => (fileInputsRef.current[i] = el)}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleDamageFiles(i, e)}
                />
                <button type="button" className="w-full rounded-lg border px-4 py-2 bg-white"
                        onClick={() => fileInputsRef.current[i]?.click()}>
                  {dmg.files.length ? 'Lägg till fler foton' : 'Lägg till foto'}
                </button>

                {dmg.previews?.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {dmg.previews.map((src, k) => (
                      <img key={k} src={src} alt={`Skadefoto ${k + 1}`}
                           className="h-20 w-full object-cover rounded-md border" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <button type="button" className="mt-1 w-full rounded-lg border px-4 py-2 bg-white" onClick={addDamage}>
            {damages.length ? 'Lägg till ytterligare skada' : 'Lägg till skada'}
          </button>
        </div>
      )}

      {/* Övrigt */}
      <div>
        <label className="block text-sm font-medium">Övriga anteckningar</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2"
          rows={4}
          placeholder="Övrig info…"
        />
      </div>

      {/* Status */}
      {status === 'error' && <div className="text-red-500 text-sm">{message || 'Dubbelkolla reg.nr och fälten ovan.'}</div>}
      {status === 'done' && <div className="text-green-600 text-sm">{message}</div>}

      {/* Spara */}
      <button type="submit"
              className="w-full rounded-xl px-6 py-3 text-white font-medium"
              style={{ ...BASE_RESET, backgroundColor: '#1D4ED8' }}
              disabled={status === 'saving'}>
        {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
      </button>

      <div className="text-center text-xs text-gray-500 pt-4">© Albarone AB 2025</div>
    </form>
  );
}
