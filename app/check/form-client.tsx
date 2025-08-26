'use client';

import React, { useEffect, useMemo, useRef, useState, ChangeEvent, FormEvent } from 'react';
import supabase from '../../lib/supabase';

// === Typer ===
type SaveStatus = 'idle' | 'saving' | 'done' | 'error';
type Station = { id: string; name: string; email?: string | null };
type Employee = { id: string; name: string; email?: string | null };

type DamageEntry = {
  text: string;              // måste fyllas i
  files: File[];             // ett eller flera foton
  previews: string[];        // lokala previews
};

// === Konstanter ===
const BUCKET = 'damage-photos';

// Extra stationer att visa i listan (läggs ovanpå ev. databasinnehåll)
const EXTRA_STATIONS = ['Sturup', 'Ängelholm', 'Mechanum', 'Falkenberg', 'Hedbergs Malmö'];

// Säker filnamn
function cleanFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 100);
}

// === Komponent ===
export default function FormClient() {
  // header / “inloggad”
  const [username] = useState('Bob'); // temporärt visningsnamn
  const [thanksTo, setThanksTo] = useState('');

  // fält
  const [regnr, setRegnr] = useState('');
  const [stationId, setStationId] = useState('');
  const [stationOther, setStationOther] = useState('');
  const [notes, setNotes] = useState('');

  // bilinfo + auto-hämt
  const [brandModel, setBrandModel] = useState<string | null>(null);
  const [existingDamages, setExistingDamages] = useState<string[]>([]);
  const [tireStorage, setTireStorage] = useState<string | null>(null);

  // mätare + kontroller
  const [odometer, setOdometer] = useState('');
  const [fuelFull, setFuelFull] = useState<boolean | null>(true);

  const [adblueOk, setAdblueOk] = useState<boolean | null>(null);
  const [washerOk, setWasherOk] = useState<boolean | null>(null);
  const [privacyCoverOk, setPrivacyCoverOk] = useState<boolean | null>(null);

  const [chargeCableCount, setChargeCableCount] = useState<0 | 1 | 2 | null>(null);

  // hjul (som sitter på nu) + typ
  const [wheelsOn, setWheelsOn] = useState<'sommar' | 'vinter' | null>(null);
  const [wheelTypeReported, setWheelTypeReported] = useState<'sommar' | 'vinter' | null>(null);

  // nya skador?
  const [hasNewDamage, setHasNewDamage] = useState<boolean | null>(null);
  const [damages, setDamages] = useState<DamageEntry[]>([]);

  // UI / data
  const [stations, setStations] = useState<Station[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState('');

  const filePickerRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // === Hjälp: färgsäkra inputs på iOS / dark mode ===
  const inputBase =
    'mt-1 w-full rounded-lg border border-zinc-300 bg-white text-black placeholder:text-zinc-400 px-3 py-2 outline-none';

  // === 1) Ladda stationer + medarbetare ===
  useEffect(() => {
    (async () => {
      // Försök hämta från DB
      const { data: dbStations } = await supabase
        .from('stations')
        .select('id, name, email')
        .order('name', { ascending: true });

      let merged: Station[] = (dbStations ?? []).map(s => ({
        id: s.id,
        name: s.name,
        email: s.email ?? null,
      }));

      // Lägg till extra stationer om de inte redan finns
      const existingNames = new Set(merged.map(s => s.name.toLowerCase()));
      EXTRA_STATIONS.forEach(n => {
        if (!existingNames.has(n.toLowerCase())) {
          merged.push({ id: `extra:${n}`, name: n, email: null });
        }
      });

      // Lägg in en "Välj station..."-dummy överst
      merged = [{ id: '', name: '— Välj station / depå —', email: null }, ...merged];

      setStations(merged);

      // (valfritt) hämta användare/”Utförd av” om du använder det fältet
      const { data: dbEmployees } = await supabase
        .from('employees')
        .select('id, name, email')
        .order('name', { ascending: true });

      setEmployees(dbEmployees ?? []);
    })();
  }, []);

  // === 2) Hämta bilmodell + befintliga skador när regnr finns ===
  async function lookupVehicle(reg: string) {
    const r = (reg || '').trim().toUpperCase();
    if (r.length < 3) return;

    // View skapad tidigare: vehicle_damage_summary (regnr, brand_model, damages[])
    const { data, error } = await supabase
      .from('vehicle_damage_summary')
      .select('brand_model, damages')
      .eq('regnr', r)
      .maybeSingle();

    if (!error && data) {
      setBrandModel(data.brand_model ?? null);
      setExistingDamages(Array.isArray(data.damages) ? data.damages : []);
    } else {
      setBrandModel(null);
      setExistingDamages([]);
    }

    // (placeholder) “Hjulförvaring” – fylls när vi får källfilen
    setTireStorage(null);
  }

  // === 3) Hantera “Lägg till skada” ===
  function addDamage() {
    setDamages(d => [...d, { text: '', files: [], previews: [] }]);
  }
  function updateDamageText(idx: number, text: string) {
    setDamages(d => d.map((it, i) => (i === idx ? { ...it, text } : it)));
  }
  function pickDamageFiles(idx: number, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const previews = files.map(f => URL.createObjectURL(f));
    setDamages(d =>
      d.map((it, i) =>
        i === idx ? { ...it, files: [...it.files, ...files], previews: [...it.previews, ...previews] } : it,
      ),
    );
  }
  function removeDamagePhoto(dIdx: number, pIdx: number) {
    setDamages(d =>
      d.map((it, i) => {
        if (i !== dIdx) return it;
        const newFiles = it.files.filter((_, j) => j !== pIdx);
        const newPrev = it.previews.filter((_, j) => j !== pIdx);
        return { ...it, files: newFiles, previews: newPrev };
      }),
    );
  }
  function removeDamageRow(dIdx: number) {
    setDamages(d => d.filter((_, i) => i !== dIdx));
  }

  // === 4) Spara ===
  const canSave =
    regnr.trim().length >= 3 &&
    stationId !== '' &&
    odometer.trim().length > 0 &&
    fuelFull !== null &&
    adblueOk !== null &&
    washerOk !== null &&
    privacyCoverOk !== null &&
    chargeCableCount !== null &&
    wheelsOn !== null &&
    wheelTypeReported !== null &&
    (hasNewDamage === false ||
      (hasNewDamage === true && damages.length > 0 && damages.every(d => d.text.trim().length > 0)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    try {
      setStatus('saving');
      setMessage('');

      // 1) Ladda upp foton om nya skador finns
      const photoUrls: string[] = [];
      if (hasNewDamage) {
        for (let di = 0; di < damages.length; di++) {
          const d = damages[di];
          for (let fi = 0; fi < d.files.length; fi++) {
            const f = d.files[fi];
            const filename = `${cleanFileName(regnr)}-${Date.now()}-${fi}-${cleanFileName(f.name)}`;
            const path = `${cleanFileName(regnr)}/${filename}`;

            const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
              upsert: false,
              cacheControl: '3600',
              contentType: f.type || 'image/jpeg',
            });
            if (upErr) throw upErr;

            const {
              data: { publicUrl },
            } = supabase.storage.from(BUCKET).getPublicUrl(path);

            photoUrls.push(publicUrl);
          }
        }
      }

      // 2) Sätt upp insert-objekt till checkins
      const insertObj: Record<string, any> = {
        regnr: regnr.trim().toUpperCase(),
        brand_model: brandModel,
        notes: notes.trim() || null,
        photo_urls: photoUrls.length ? photoUrls : null,

        station_id: stationId || null,
        station_other: stationOther.trim() || null,

        odometer_km: odometer ? parseInt(odometer, 10) : null,
        fuel_full: fuelFull,

        adblue_ok: adblueOk,
        washer_ok: washerOk,
        privacy_cover_ok: privacyCoverOk,

        charge_cable_count: chargeCableCount,
        no_new_damage: hasNewDamage === false,

        wheels_on: wheelsOn,               // 'sommar' | 'vinter'
        wheel_type: wheelTypeReported,     // vad incheckaren anger
      };

      // 3) Insert
      const { error: insErr } = await supabase.from('checkins').insert(insertObj);
      if (insErr) throw insErr;

      // 4) Klart
      setStatus('done');
      setThanksTo(username);
      setMessage('Sparat!');

      // Nollställ
      setRegnr('');
      setBrandModel(null);
      setExistingDamages([]);
      setTireStorage(null);
      setStationId('');
      setStationOther('');
      setOdometer('');
      setFuelFull(true);
      setAdblueOk(null);
      setWasherOk(null);
      setPrivacyCoverOk(null);
      setChargeCableCount(null);
      setWheelsOn(null);
      setWheelTypeReported(null);
      setHasNewDamage(null);
      setDamages([]);
      setNotes('');
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message ?? 'Kunde inte spara.');
    }
  }

  // Warn om hjul-typ mismatch
  const showWheelsConfirm =
    wheelsOn && wheelTypeReported && wheelsOn !== wheelTypeReported ? true : false;

  // ====================== UI ======================
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b">
        <div className="mx-auto max-w-xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ny incheckning</h1>
          <span className="text-sm text-zinc-600">Inloggad: <b>{username}</b></span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mx-auto max-w-xl px-4 py-5">
        {/* Registreringsnummer */}
        <label className="block text-sm font-medium">Registreringsnummer *</label>
        <input
          value={regnr}
          onChange={(e) => setRegnr(e.target.value.toUpperCase())}
          onBlur={(e) => lookupVehicle(e.target.value)}
          className={`${inputBase} tracking-widest uppercase`}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />

        {/* Station / Depå */}
        <div className="mt-4">
          <label className="block text-sm font-medium">Station / Depå *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className={`${inputBase}`}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            value={stationOther}
            onChange={(e) => setStationOther(e.target.value)}
            className={`${inputBase} mt-2`}
            placeholder="Ev. annan inlämningsplats"
          />
        </div>

        {/* Bilinfo (automatisk) */}
        {(brandModel || existingDamages.length > 0 || tireStorage) && (
          <div className="mt-4 rounded-lg border p-3 text-sm">
            {brandModel && (
              <div className="mb-1">
                <span className="font-medium">Bil:</span> {brandModel}
              </div>
            )}
            {tireStorage && (
              <div className="mb-1">
                <span className="font-medium">Hjulförvaring:</span> {tireStorage}
              </div>
            )}
            {existingDamages.length > 0 && (
              <div className="mt-1">
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

        {/* Mätarställning */}
        <div className="mt-4">
          <label className="block text-sm font-medium">Mätarställning *</label>
          <div className="flex items-center gap-2">
            <input
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/\D+/g, ''))}
              className={`${inputBase}`}
              inputMode="numeric"
              placeholder="ex. 42 180"
            />
            <span className="text-sm text-zinc-600">km</span>
          </div>
        </div>

        {/* Tanknivå */}
        <div className="mt-5">
          <div className="text-sm font-medium">Tanknivå *</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 ${fuelFull === true ? 'bg-green-100 border-green-400' : ''}`}
              onClick={() => setFuelFull(true)}
            >
              Fulltankad
            </button>
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 ${fuelFull === false ? 'bg-red-100 border-red-400' : ''}`}
              onClick={() => setFuelFull(false)}
            >
              Ej fulltankad
            </button>
          </div>
        </div>

        {/* AdBlue / Spolarvätska / Insynsskydd */}
        <div className="mt-5 space-y-4">
          <YesNo label="AdBlue OK? *" value={adblueOk} onYes={() => setAdblueOk(true)} onNo={() => setAdblueOk(false)} />
          <YesNo label="Spolarvätska OK? *" value={washerOk} onYes={() => setWasherOk(true)} onNo={() => setWasherOk(false)} />
          <YesNo label="Insynsskydd OK? *" value={privacyCoverOk} onYes={() => setPrivacyCoverOk(true)} onNo={() => setPrivacyCoverOk(false)} />
        </div>

        {/* Antal laddsladdar (0/1/2-knappar) */}
        <div className="mt-6">
          <div className="text-sm font-medium">Antal laddsladdar *</div>
          <div className="mt-2 flex gap-2">
            {[0, 1, 2].map((n) => (
              <button
                type="button"
                key={n}
                className={`rounded-lg border px-4 py-2 ${chargeCableCount === n ? 'bg-blue-600 text-white' : ''}`}
                onClick={() => setChargeCableCount(n as 0 | 1 | 2)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Hjul som sitter på + typ som uppges */}
        <div className="mt-6">
          <div className="text-sm font-medium">Hjul som sitter på *</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 ${wheelsOn === 'sommar' ? 'bg-blue-600 text-white' : ''}`}
              onClick={() => setWheelsOn('sommar')}
            >
              Sommarhjul
            </button>
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 ${wheelsOn === 'vinter' ? 'bg-blue-600 text-white' : ''}`}
              onClick={() => setWheelsOn('vinter')}
            >
              Vinterhjul
            </button>
          </div>

          <div className="mt-4 text-sm font-medium">Uppfattad hjultyp av incheckaren *</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 ${wheelTypeReported === 'sommar' ? 'bg-blue-600 text-white' : ''}`}
              onClick={() => setWheelTypeReported('sommar')}
            >
              Sommarhjul
            </button>
            <button
              type="button"
              className={`rounded-lg border px-4 py-2 ${wheelTypeReported === 'vinter' ? 'bg-blue-600 text-white' : ''}`}
              onClick={() => setWheelTypeReported('vinter')}
            >
              Vinterhjul
            </button>
          </div>

          {showWheelsConfirm && (
            <div className="mt-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
              <b>Är du säker?</b> Systemet tycker “{wheelsOn}”, men du angav “{wheelTypeReported}”.
            </div>
          )}
        </div>

        {/* Nya skador? (gater fotosektionen) */}
        <div className="mt-6">
          <YesNo
            label="Nya skador på bilen? *"
            value={hasNewDamage}
            onYes={() => setHasNewDamage(true)}
            onNo={() => setHasNewDamage(false)}
          />
        </div>

        {/* Fotosektion — visas bara vid “Ja” */}
        {hasNewDamage && (
          <div className="mt-4 rounded-lg border p-3">
            <div className="text-sm font-medium">Beskriv nya skador</div>

            {damages.length === 0 ? (
              <button type="button" className="mt-3 rounded-lg border px-4 py-2" onClick={addDamage}>
                Lägg till skada
              </button>
            ) : (
              <button type="button" className="mt-3 rounded-lg border px-4 py-2" onClick={addDamage}>
                Lägg till ytterligare skada
              </button>
            )}

            <div className="mt-3 space-y-6">
              {damages.map((dmg, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Skada {i + 1}</div>
                    <button type="button" className="text-sm text-zinc-600 underline" onClick={() => removeDamageRow(i)}>
                      Ta bort
                    </button>
                  </div>

                  <label className="mt-2 block text-sm">Text (obligatorisk)</label>
                  <input
                    value={dmg.text}
                    onChange={(e) => updateDamageText(i, e.target.value)}
                    className={`${inputBase}`}
                    placeholder="t.ex. Buckla vänster framdörr"
                  />

                  <div className="mt-3">
                    <input
                      ref={(el) => (filePickerRefs.current[i] = el)}
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      className="hidden"
                      onChange={(e) => pickDamageFiles(i, e)}
                    />
                    <button
                      type="button"
                      className="rounded-lg border px-4 py-2"
                      onClick={() => filePickerRefs.current[i]?.click()}
                    >
                      Välj / Ta bilder
                    </button>

                    {dmg.previews.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {dmg.previews.map((src, pIdx) => (
                          <div key={pIdx} className="relative">
                            <img src={src} className="h-20 w-full rounded-md object-cover border" alt={`Skada ${i + 1}`} />
                            <button
                              type="button"
                              className="absolute -top-2 -right-2 rounded-full bg-white px-2 text-xs shadow"
                              onClick={() => removeDamagePhoto(i, pIdx)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Övriga anteckningar */}
        <div className="mt-6">
          <label className="block text-sm font-medium">Övriga anteckningar</label>
          <textarea
            rows={4}
            className={`${inputBase}`}
            placeholder="Övrig info…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Status */}
        {status === 'error' && <div className="mt-3 text-sm text-red-600">{message}</div>}
        {status === 'done' && <div className="mt-3 text-sm text-green-600">Tack {thanksTo}!</div>}

        {/* Spara */}
        <button
            type="submit"
            disabled={!canSave || status === 'saving'}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Sparar…' : 'Spara incheckning'}
        </button>

        <div className="mt-4 text-center text-[11px] text-zinc-500">© Albarone AB 2025</div>
      </form>
    </div>
  );
}

// === Små UI-hjälpare ===
function YesNo({
  label,
  value,
  onYes,
  onNo,
}: {
  label: string;
  value: boolean | null;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-lg border px-3 py-2 ${value === true ? 'bg-green-100 border-green-400' : ''}`}
          onClick={onYes}
        >
          Ja
        </button>
        <button
          type="button"
          className={`rounded-lg border px-3 py-2 ${value === false ? 'bg-red-100 border-red-400' : ''}`}
          onClick={onNo}
        >
          Nej
        </button>
      </div>
    </div>
  );
}
